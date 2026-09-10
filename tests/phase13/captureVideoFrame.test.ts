// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  captureVideoFrame,
  captureVideoFrames,
} from "@/lib/media/captureVideoFrame";

class FakeVideo extends EventTarget {
  videoWidth = 640;
  videoHeight = 360;
  duration = 10;
  currentTime = 0;
  preload = "";
  muted = false;
  playsInline = false;
  crossOrigin: string | null = null;
  src = "";
  removedAttribute = "";

  load = vi.fn(() => {
    queueMicrotask(() => this.dispatchEvent(new Event("loadedmetadata")));
  });

  removeAttribute(name: string) {
    this.removedAttribute = name;
  }
}

function fakeCanvasContext(
  options: { getContextReturnsNull?: boolean; drawThrows?: unknown } = {},
) {
  const drawImage = vi.fn(() => {
    if (options.drawThrows !== undefined) throw options.drawThrows;
  });
  const toDataURL = vi.fn(() => "data:image/jpeg;base64,fake");
  const canvas = {
    width: 0,
    height: 0,
    getContext: vi.fn(() =>
      options.getContextReturnsNull ? null : { drawImage },
    ),
    toDataURL,
  };
  return { canvas, drawImage, toDataURL };
}

describe("captureVideoFrame", () => {
  const originalCreateElement = document.createElement.bind(document);

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    document.createElement = originalCreateElement;
  });

  function stubCanvasCreation(
    fake: ReturnType<typeof fakeCanvasContext>["canvas"],
  ) {
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      if (tag === "canvas") return fake as unknown as HTMLCanvasElement;
      return originalCreateElement(tag);
    });
  }

  it("rejects immediately when the signal is already aborted before starting", async () => {
    const controller = new AbortController();
    controller.abort(new DOMException("pre-aborted", "AbortError"));

    await expect(
      captureVideoFrame("blob:fake", 1, {
        signal: controller.signal,
        createVideo: () => new FakeVideo() as unknown as HTMLVideoElement,
      }),
    ).rejects.toThrow(/pre-aborted/i);
  });

  it("captures a frame end to end: seeks to the clamped timestamp and resolves a JPEG data URL", async () => {
    const { canvas, drawImage, toDataURL } = fakeCanvasContext();
    stubCanvasCreation(canvas);

    const video = new FakeVideo();
    const promise = captureVideoFrame("blob:fake", 3, {
      createVideo: () => video as unknown as HTMLVideoElement,
      quality: 0.5,
      maxWidth: 320,
    });

    await vi.waitFor(() => expect(video.currentTime).toBe(3));
    video.dispatchEvent(new Event("seeked"));

    const result = await promise;
    expect(result).toBe("data:image/jpeg;base64,fake");
    expect(drawImage).toHaveBeenCalled();
    // 640 wide video scaled down to maxWidth 320 => scale 0.5
    expect(canvas.width).toBe(320);
    expect(canvas.height).toBe(180);
    expect(toDataURL).toHaveBeenCalledWith("image/jpeg", 0.5);
    expect(video.removedAttribute).toBe("src");
  });

  it("does not upscale a video already narrower than maxWidth", async () => {
    const { canvas } = fakeCanvasContext();
    stubCanvasCreation(canvas);

    const video = new FakeVideo();
    video.videoWidth = 200;
    video.videoHeight = 100;
    const promise = captureVideoFrame("blob:fake", 0, {
      createVideo: () => video as unknown as HTMLVideoElement,
      maxWidth: 480,
    });

    await vi.waitFor(() => expect(video.currentTime).toBeGreaterThanOrEqual(0));
    video.dispatchEvent(new Event("seeked"));

    await promise;
    expect(canvas.width).toBe(200);
    expect(canvas.height).toBe(100);
  });

  it("clamps a requested timestamp beyond the clip's duration", async () => {
    const { canvas } = fakeCanvasContext();
    stubCanvasCreation(canvas);

    const video = new FakeVideo();
    video.duration = 5;
    const promise = captureVideoFrame("blob:fake", 999, {
      createVideo: () => video as unknown as HTMLVideoElement,
    });

    await vi.waitFor(() => expect(video.currentTime).toBeCloseTo(4.95));
    video.dispatchEvent(new Event("seeked"));
    await promise;
  });

  it("clamps a negative requested timestamp up to zero", async () => {
    const { canvas } = fakeCanvasContext();
    stubCanvasCreation(canvas);

    const video = new FakeVideo();
    const promise = captureVideoFrame("blob:fake", -5, {
      createVideo: () => video as unknown as HTMLVideoElement,
    });

    await vi.waitFor(() => expect(video.currentTime).toBe(0));
    video.dispatchEvent(new Event("seeked"));
    await promise;
  });

  it("rejects when a 2D canvas context is unavailable", async () => {
    const { canvas } = fakeCanvasContext({ getContextReturnsNull: true });
    stubCanvasCreation(canvas);

    const video = new FakeVideo();
    const promise = captureVideoFrame("blob:fake", 1, {
      createVideo: () => video as unknown as HTMLVideoElement,
    });

    await vi.waitFor(() => expect(video.currentTime).toBe(1));
    video.dispatchEvent(new Event("seeked"));

    await expect(promise).rejects.toThrow(/canvas 2d context is unavailable/i);
  });

  it("wraps a real Error thrown while drawing the frame", async () => {
    const { canvas } = fakeCanvasContext({
      drawThrows: new Error("draw exploded"),
    });
    stubCanvasCreation(canvas);

    const video = new FakeVideo();
    const promise = captureVideoFrame("blob:fake", 1, {
      createVideo: () => video as unknown as HTMLVideoElement,
    });

    await vi.waitFor(() => expect(video.currentTime).toBe(1));
    video.dispatchEvent(new Event("seeked"));

    await expect(promise).rejects.toThrow(/draw exploded/i);
  });

  it("falls back to a generic message when a non-Error value is thrown while drawing", async () => {
    const { canvas } = fakeCanvasContext({
      drawThrows: "not an Error instance",
    });
    stubCanvasCreation(canvas);

    const video = new FakeVideo();
    const promise = captureVideoFrame("blob:fake", 1, {
      createVideo: () => video as unknown as HTMLVideoElement,
    });

    await vi.waitFor(() => expect(video.currentTime).toBe(1));
    video.dispatchEvent(new Event("seeked"));

    await expect(promise).rejects.toThrow(/frame capture failed/i);
  });

  it("rejects when the video element fires an error event", async () => {
    const video = new FakeVideo();
    video.load = vi.fn(); // suppress the default loadedmetadata auto-dispatch
    const promise = captureVideoFrame("blob:fake", 1, {
      createVideo: () => video as unknown as HTMLVideoElement,
    });

    video.dispatchEvent(new Event("error"));
    await expect(promise).rejects.toThrow(/source reel could not be read/i);
  });

  it("rejects when the abort signal fires after capture has started", async () => {
    const video = new FakeVideo();
    video.load = vi.fn();
    const controller = new AbortController();
    const promise = captureVideoFrame("blob:fake", 1, {
      createVideo: () => video as unknown as HTMLVideoElement,
      signal: controller.signal,
    });

    controller.abort(new DOMException("cancelled mid-flight", "AbortError"));
    await expect(promise).rejects.toThrow(/cancelled mid-flight/i);
  });

  it("rejects with a timeout error when no metadata/seek event arrives in time", async () => {
    vi.useFakeTimers();
    try {
      const video = new FakeVideo();
      video.load = vi.fn(); // never fires loadedmetadata
      const promise = captureVideoFrame("blob:fake", 1, {
        createVideo: () => video as unknown as HTMLVideoElement,
        timeoutMs: 1000,
      });

      const assertion = expect(promise).rejects.toThrow(
        /timed out capturing a frame/i,
      );
      await vi.advanceTimersByTimeAsync(1000);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it("ignores a second seeked event once already settled", async () => {
    const { canvas, drawImage } = fakeCanvasContext();
    stubCanvasCreation(canvas);

    const video = new FakeVideo();
    const promise = captureVideoFrame("blob:fake", 1, {
      createVideo: () => video as unknown as HTMLVideoElement,
    });

    await vi.waitFor(() => expect(video.currentTime).toBe(1));
    video.dispatchEvent(new Event("seeked"));
    video.dispatchEvent(new Event("seeked"));

    await promise;
    expect(drawImage).toHaveBeenCalledTimes(1);
  });
});

describe("captureVideoFrames", () => {
  const originalCreateElement = document.createElement.bind(document);

  afterEach(() => {
    vi.restoreAllMocks();
    document.createElement = originalCreateElement;
  });

  it("captures each timestamp in order, sequentially, against fresh video elements", async () => {
    const { canvas } = fakeCanvasContext();
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      if (tag === "canvas") return canvas as unknown as HTMLCanvasElement;
      return originalCreateElement(tag);
    });

    const createdVideos: FakeVideo[] = [];
    const createVideo = () => {
      const v = new FakeVideo();
      createdVideos.push(v);
      return v as unknown as HTMLVideoElement;
    };

    const promise = captureVideoFrames("blob:fake", [1, 2, 3], { createVideo });

    for (let i = 0; i < 3; i += 1) {
      await vi.waitFor(() => expect(createdVideos.length).toBeGreaterThan(i));
      const video = createdVideos[i];
      await vi.waitFor(() => expect(video.currentTime).toBe(i + 1));
      video.dispatchEvent(new Event("seeked"));
    }

    const frames = await promise;
    expect(frames).toHaveLength(3);
    expect(createdVideos).toHaveLength(3);
  });

  it("returns an empty array for an empty timestamp list", async () => {
    const frames = await captureVideoFrames("blob:fake", []);
    expect(frames).toEqual([]);
  });
});
