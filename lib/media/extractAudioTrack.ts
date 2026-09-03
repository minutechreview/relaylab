/**
 * Extracts just the audio track from a local video file as a small WAV
 * Blob, using only browser-native Web Audio API calls (`decodeAudioData` +
 * `OfflineAudioContext`) — no ffmpeg, no wasm, no new dependency.
 *
 * Exists so automatic transcription can upload a small audio-only payload
 * instead of the full video: video is the overwhelming majority of most
 * talking-head recordings' size, and both OpenAI's Whisper endpoint (25 MB)
 * and this app's hosted-deployment limit (see app/api/transcribe/route.ts)
 * cap the request body.
 *
 * An earlier version used `HTMLVideoElement.captureStream()` +
 * `MediaRecorder`, recording audio in real time during playback. Dropped
 * after confirming (via a real WebKit run, not assumption) that Safari —
 * including every iOS browser, which Apple requires to embed WebKit
 * regardless of branding — has never implemented `captureStream()` on
 * media elements, so that approach silently fell back to uploading the
 * full video and hit the same size limit this exists to avoid.
 * `decodeAudioData`/`OfflineAudioContext` are supported in Safari and every
 * other modern browser, and rendering happens as fast as the browser can
 * decode rather than at real-time playback speed — strictly better on both
 * compatibility and speed.
 *
 * Output is downsampled to mono 16 kHz — matching Whisper's own expected
 * input rate — to keep the WAV file compact despite being uncompressed
 * (~1.9 MB per minute of audio, comfortably under both limits above for a
 * realistic single continuous talking-head recording; a very long
 * recording could still exceed them, in which case the caller's existing
 * size check surfaces a clear, honest error rather than a silent failure).
 */

export interface ExtractAudioTrackOptions {
  signal?: AbortSignal;
}

const TARGET_SAMPLE_RATE = 16_000;

type AudioContextConstructor = typeof AudioContext;

function resolveAudioContextConstructor(): AudioContextConstructor | null {
  if (typeof window === "undefined") return null;
  const globalWindow = window as typeof window & { webkitAudioContext?: AudioContextConstructor };
  return globalWindow.AudioContext ?? globalWindow.webkitAudioContext ?? null;
}

export function isAudioExtractionSupported(): boolean {
  return resolveAudioContextConstructor() !== null && typeof OfflineAudioContext !== "undefined";
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw signal.reason ?? new DOMException("Audio extraction cancelled.", "AbortError");
  }
}

function writeAsciiString(view: DataView, offset: number, value: string): void {
  for (let i = 0; i < value.length; i += 1) view.setUint8(offset + i, value.charCodeAt(i));
}

/** Encodes a mono AudioBuffer as a 16-bit PCM WAV Blob. */
function encodeWav(buffer: AudioBuffer): Blob {
  const samples = buffer.getChannelData(0);
  const bytesPerSample = 2;
  const dataSize = samples.length * bytesPerSample;
  const arrayBuffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(arrayBuffer);

  writeAsciiString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeAsciiString(view, 8, "WAVE");
  writeAsciiString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeAsciiString(view, 36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i += 1, offset += 2) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
  }

  return new Blob([new Uint8Array(arrayBuffer)], { type: "audio/wav" });
}

export async function extractAudioTrack(
  file: File,
  options: ExtractAudioTrackOptions = {},
): Promise<File> {
  const { signal } = options;
  const AudioContextCtor = resolveAudioContextConstructor();
  if (!AudioContextCtor || typeof OfflineAudioContext === "undefined") {
    throw new Error("This browser cannot extract audio locally (missing Web Audio API support).");
  }
  throwIfAborted(signal);

  const arrayBuffer = await file.arrayBuffer();
  throwIfAborted(signal);

  const decodingContext = new AudioContextCtor();
  let decoded: AudioBuffer;
  try {
    decoded = await decodingContext.decodeAudioData(arrayBuffer);
  } catch {
    throw new Error("The video's audio could not be decoded for automatic transcription.");
  } finally {
    void decodingContext.close?.();
  }
  throwIfAborted(signal);

  if (decoded.duration <= 0) {
    throw new Error("This video has no audio track to transcribe.");
  }

  const offlineContext = new OfflineAudioContext(
    1,
    Math.max(1, Math.ceil(decoded.duration * TARGET_SAMPLE_RATE)),
    TARGET_SAMPLE_RATE,
  );
  const source = offlineContext.createBufferSource();
  source.buffer = decoded;
  source.connect(offlineContext.destination);
  source.start();
  const rendered = await offlineContext.startRendering();
  throwIfAborted(signal);

  const wavBlob = encodeWav(rendered);
  return new File([wavBlob], `${file.name.replace(/\.[^.]+$/, "")}.audio.wav`, { type: "audio/wav" });
}
