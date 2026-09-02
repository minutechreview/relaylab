export interface ReadVideoMetadataOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  createVideo?: () => HTMLVideoElement;
}

export interface VideoMetadata {
  duration: number;
}

export function readVideoMetadata(
  objectUrl: string,
  options: ReadVideoMetadataOptions = {},
): Promise<VideoMetadata> {
  const {
    signal,
    timeoutMs = 15_000,
    createVideo = () => document.createElement("video"),
  } = options;

  if (signal?.aborted) {
    return Promise.reject(
      signal.reason ?? new DOMException("Media import was cancelled.", "AbortError"),
    );
  }

  return new Promise((resolve, reject) => {
    const video = createVideo();
    let settled = false;

    const cleanup = () => {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
      video.removeEventListener("loadedmetadata", onLoadedMetadata);
      video.removeEventListener("durationchange", onDurationChange);
      video.removeEventListener("timeupdate", onDurationChange);
      video.removeEventListener("error", onError);
      video.removeAttribute("src");
    };

    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };

    const onLoadedMetadata = () => {
      const duration = video.duration;
      if (Number.isFinite(duration) && duration > 0) {
        finish(() => resolve({ duration }));
        return;
      }
      // MediaRecorder and some WebM files expose Infinity until a far seek
      // forces the browser to parse their final cluster timestamp.
      if (duration === Number.POSITIVE_INFINITY) {
        try {
          video.currentTime = Number.MAX_SAFE_INTEGER;
          return;
        } catch {
          // Fall through to the same readable-duration error.
        }
      }
      finish(() => reject(new Error("The selected video has no readable duration.")));
    };

    const onDurationChange = () => {
      const duration = video.duration;
      if (!Number.isFinite(duration) || duration <= 0) {
        return;
      }
      if (settled) return;
      if (video.currentTime > duration) {
        video.currentTime = 0;
      }
      finish(() => resolve({ duration }));
    };

    const onError = () => {
      if (!settled) {
        finish(() => reject(new Error("The selected file could not be read as video.")));
      }
    };

    const onAbort = () =>
      finish(() =>
        reject(
          signal?.reason ??
            new DOMException("Media import was cancelled.", "AbortError"),
        ),
      );

    const timeout = globalThis.setTimeout(
      () => finish(() => reject(new Error("Timed out while reading video metadata."))),
      timeoutMs,
    );

    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.addEventListener("loadedmetadata", onLoadedMetadata, { once: true });
    video.addEventListener("durationchange", onDurationChange);
    video.addEventListener("timeupdate", onDurationChange);
    video.addEventListener("error", onError, { once: true });
    signal?.addEventListener("abort", onAbort, { once: true });
    video.src = objectUrl;
    video.load();
  });
}
