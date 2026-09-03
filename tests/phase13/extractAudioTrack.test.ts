// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

import { extractAudioTrack, isAudioExtractionSupported } from "@/lib/media/extractAudioTrack";

describe("extractAudioTrack: unsupported-environment fallback", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete (HTMLVideoElement.prototype as { captureStream?: unknown }).captureStream;
  });

  it("reports unsupported when MediaRecorder is unavailable (e.g. jsdom, older browsers)", () => {
    // jsdom does not implement MediaRecorder or captureStream(); this must
    // resolve to false rather than throwing, so callers can cleanly fall
    // back to uploading the raw video file.
    expect(isAudioExtractionSupported()).toBe(false);
  });

  it("rejects with a clear error instead of hanging when unsupported", async () => {
    await expect(extractAudioTrack(new File(["x"], "clip.mp4", { type: "video/mp4" }))).rejects.toThrow(
      /cannot extract audio locally/i,
    );
  });

  it("respects an already-aborted signal even when otherwise supported", async () => {
    vi.stubGlobal("MediaRecorder", {
      isTypeSupported: () => true,
    } as unknown as typeof MediaRecorder);
    (HTMLVideoElement.prototype as { captureStream?: () => MediaStream }).captureStream = () => new MediaStream();
    const video = document.createElement("video");
    const controller = new AbortController();
    controller.abort(new DOMException("cancelled by test", "AbortError"));

    await expect(
      extractAudioTrack(new File(["x"], "clip.mp4", { type: "video/mp4" }), {
        signal: controller.signal,
        createVideo: () => video,
      }),
    ).rejects.toThrow(/cancelled/i);
  });
});
