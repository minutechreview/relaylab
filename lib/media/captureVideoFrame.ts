/**
 * Captures a single video frame at a given timestamp as a JPEG data URL,
 * using an offscreen `<video>` + `<canvas>`. This runs entirely client-side
 * against the browser-local `blob:` object URL — the server can never reach
 * that URL directly, so real frame bytes must be extracted here and sent to
 * the analysis route as data, not as a fetchable URL.
 */

export interface CaptureVideoFrameOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  quality?: number;
  maxWidth?: number;
  createVideo?: () => HTMLVideoElement;
}

export async function captureVideoFrame(
  objectUrl: string,
  timestampSeconds: number,
  options: CaptureVideoFrameOptions = {},
): Promise<string> {
  const {
    signal,
    timeoutMs = 10_000,
    quality = 0.7,
    maxWidth = 480,
    createVideo = () => document.createElement("video"),
  } = options;

  if (signal?.aborted) {
    throw signal.reason ?? new DOMException("Frame capture cancelled.", "AbortError");
  }

  return new Promise<string>((resolve, reject) => {
    const video = createVideo();
    let settled = false;

    const cleanup = () => {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
      video.removeEventListener("loadedmetadata", onLoadedMetadata);
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
      video.removeAttribute("src");
    };

    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };

    const onError = () => finish(() => reject(new Error("The source reel could not be read for frame capture.")));
    const onAbort = () =>
      finish(() => reject(signal?.reason ?? new DOMException("Frame capture cancelled.", "AbortError")));

    const onSeeked = () => {
      try {
        const scale = video.videoWidth > maxWidth ? maxWidth / video.videoWidth : 1;
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
        canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
        const context = canvas.getContext("2d");
        if (!context) {
          finish(() => reject(new Error("Canvas 2D context is unavailable for frame capture.")));
          return;
        }
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL("image/jpeg", quality);
        finish(() => resolve(dataUrl));
      } catch (error) {
        finish(() =>
          reject(error instanceof Error ? error : new Error("Frame capture failed.")),
        );
      }
    };

    const onLoadedMetadata = () => {
      const clamped = Math.min(Math.max(timestampSeconds, 0), Math.max(0, video.duration - 0.05));
      video.currentTime = clamped;
    };

    const timeout = globalThis.setTimeout(
      () => finish(() => reject(new Error("Timed out capturing a frame from the source reel."))),
      timeoutMs,
    );

    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = "anonymous";
    video.addEventListener("loadedmetadata", onLoadedMetadata, { once: true });
    video.addEventListener("seeked", onSeeked);
    video.addEventListener("error", onError, { once: true });
    signal?.addEventListener("abort", onAbort, { once: true });
    video.src = objectUrl;
    video.load();
  });
}

/** Captures every timestamp in order (sequential, not parallel, to avoid overlapping seeks on one video element). */
export async function captureVideoFrames(
  objectUrl: string,
  timestampsSeconds: number[],
  options: CaptureVideoFrameOptions = {},
): Promise<string[]> {
  const frames: string[] = [];
  for (const timestamp of timestampsSeconds) {
    frames.push(await captureVideoFrame(objectUrl, timestamp, options));
  }
  return frames;
}
