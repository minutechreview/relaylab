/**
 * Extracts just the audio track from a local video file as a compressed
 * Blob, using only browser-native APIs (`HTMLMediaElement.captureStream()`
 * + `MediaRecorder`) — no ffmpeg, no wasm, no new dependency.
 *
 * Exists so automatic transcription can upload a small audio-only payload
 * instead of the full video: video is the overwhelming majority of most
 * talking-head recordings' size, and both OpenAI's Whisper endpoint (25 MB)
 * and this app's hosted-deployment limit (see app/api/transcribe/route.ts)
 * cap the request body. A few-minutes-long talking-head video's compressed
 * audio is typically a few MB; the full video routinely is not.
 *
 * Real limitation, stated honestly: extraction happens by actually playing
 * the video back at 1x speed while recording its audio output — there is no
 * browser API to decode+re-encode audio faster than real time without a
 * wasm/ffmpeg dependency. A 10-minute video takes ~10 minutes to extract.
 * Speeding up playback was considered and rejected: it would alter the
 * captured audio's tempo/pitch, degrading transcription accuracy and
 * requiring every word timestamp to be rescaled back down — a correctness
 * risk not worth the UX gain here.
 */

export interface ExtractAudioTrackOptions {
  signal?: AbortSignal;
  /** Called with a 0–1 fraction as extraction progresses. */
  onProgress?: (fraction: number) => void;
  createVideo?: () => HTMLVideoElement;
}

/** `captureStream()` is a real, widely-supported API missing from TS's DOM lib types. */
type CaptureStreamCapable = HTMLVideoElement & { captureStream?: () => MediaStream };

const CANDIDATE_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
];

export function isAudioExtractionSupported(): boolean {
  if (typeof window === "undefined") return false;
  if (typeof MediaRecorder === "undefined") return false;
  const video = document.createElement("video") as CaptureStreamCapable;
  if (typeof video.captureStream !== "function") return false;
  return CANDIDATE_MIME_TYPES.some((type) => MediaRecorder.isTypeSupported(type));
}

function pickMimeType(): string | null {
  return CANDIDATE_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type)) ?? null;
}

export async function extractAudioTrack(
  file: File,
  options: ExtractAudioTrackOptions = {},
): Promise<File> {
  const { signal, onProgress, createVideo = () => document.createElement("video") } = options;

  if (!isAudioExtractionSupported()) {
    throw new Error("This browser cannot extract audio locally (missing MediaRecorder/captureStream support).");
  }
  if (signal?.aborted) {
    throw signal.reason ?? new DOMException("Audio extraction cancelled.", "AbortError");
  }

  const mimeType = pickMimeType();
  if (!mimeType) {
    throw new Error("No supported audio recording format is available in this browser.");
  }

  const objectUrl = URL.createObjectURL(file);
  const video = createVideo() as CaptureStreamCapable;
  video.muted = true; // silences speaker output only; captureStream() still carries real audio.
  video.playsInline = true;
  video.preload = "auto";

  return new Promise<File>((resolve, reject) => {
    let settled = false;
    let recorder: MediaRecorder | null = null;
    let stream: MediaStream | null = null;
    let progressFrame: number | null = null;

    const cleanup = () => {
      if (progressFrame !== null) cancelAnimationFrame(progressFrame);
      signal?.removeEventListener("abort", onAbort);
      video.removeEventListener("loadedmetadata", onLoadedMetadata);
      video.removeEventListener("ended", onEnded);
      video.removeEventListener("error", onError);
      video.pause();
      video.removeAttribute("src");
      stream?.getTracks().forEach((track) => track.stop());
      URL.revokeObjectURL(objectUrl);
    };

    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };

    const onError = () =>
      finish(() => reject(new Error("The video could not be read for audio extraction.")));

    const onAbort = () => {
      if (recorder?.state === "recording") recorder.stop();
      finish(() => reject(signal?.reason ?? new DOMException("Audio extraction cancelled.", "AbortError")));
    };

    const reportProgress = () => {
      if (onProgress && video.duration > 0) {
        onProgress(Math.min(1, video.currentTime / video.duration));
      }
      if (!settled) progressFrame = requestAnimationFrame(reportProgress);
    };

    const onEnded = () => {
      if (recorder && recorder.state === "recording") recorder.stop();
    };

    const onLoadedMetadata = () => {
      try {
        const captured = video.captureStream?.();
        if (!captured) {
          finish(() => reject(new Error("captureStream() is unavailable for this video.")));
          return;
        }
        const audioTracks = captured.getAudioTracks();
        if (audioTracks.length === 0) {
          finish(() => reject(new Error("This video has no audio track to transcribe.")));
          return;
        }
        stream = new MediaStream(audioTracks);
        const chunks: BlobPart[] = [];
        recorder = new MediaRecorder(stream, { mimeType });
        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) chunks.push(event.data);
        };
        recorder.onerror = () => finish(() => reject(new Error("Audio recording failed during extraction.")));
        recorder.onstop = () => {
          const blob = new Blob(chunks, { type: mimeType });
          const extension = mimeType.startsWith("audio/mp4") ? "m4a" : "webm";
          finish(() =>
            resolve(new File([blob], `${file.name.replace(/\.[^.]+$/, "")}.audio.${extension}`, { type: mimeType })),
          );
        };
        recorder.start();
        void video.play();
        progressFrame = requestAnimationFrame(reportProgress);
      } catch (error) {
        finish(() => reject(error instanceof Error ? error : new Error("Audio extraction failed.")));
      }
    };

    video.addEventListener("loadedmetadata", onLoadedMetadata, { once: true });
    video.addEventListener("ended", onEnded, { once: true });
    video.addEventListener("error", onError, { once: true });
    signal?.addEventListener("abort", onAbort, { once: true });
    video.src = objectUrl;
    video.load();
  });
}
