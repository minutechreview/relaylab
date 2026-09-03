// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

import { extractAudioTrack, isAudioExtractionSupported } from "@/lib/media/extractAudioTrack";

describe("extractAudioTrack: unsupported-environment fallback", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reports unsupported when the Web Audio API is unavailable (e.g. jsdom, older browsers)", () => {
    // jsdom does not implement AudioContext/OfflineAudioContext; this must
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
    vi.stubGlobal("AudioContext", class {
      decodeAudioData = vi.fn();
      close = vi.fn();
    } as unknown as typeof AudioContext);
    vi.stubGlobal("OfflineAudioContext", class {} as unknown as typeof OfflineAudioContext);

    const controller = new AbortController();
    controller.abort(new DOMException("cancelled by test", "AbortError"));

    await expect(
      extractAudioTrack(new File(["x"], "clip.mp4", { type: "video/mp4" }), { signal: controller.signal }),
    ).rejects.toThrow(/cancelled/i);
  });
});
