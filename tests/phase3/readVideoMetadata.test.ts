// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import { readVideoMetadata } from "@/lib/media/readVideoMetadata";

describe("video metadata probing", () => {
  it("reads finite duration through a detached muted metadata probe", async () => {
    const probe = document.createElement("video");
    vi.spyOn(probe, "load").mockImplementation(() => {
      Object.defineProperty(probe, "duration", { configurable: true, value: 42.75 });
      queueMicrotask(() => probe.dispatchEvent(new Event("loadedmetadata")));
    });

    await expect(
      readVideoMetadata("blob:probe", { createVideo: () => probe }),
    ).resolves.toEqual({ duration: 42.75 });
    expect(probe.preload).toBe("metadata");
    expect(probe.muted).toBe(true);
    expect(probe.getAttribute("src")).toBeNull();
  });

  it("recovers duration from WebM-style initially infinite metadata", async () => {
    const probe = document.createElement("video");
    vi.spyOn(probe, "load").mockImplementation(() => {
      Object.defineProperty(probe, "duration", {
        configurable: true,
        value: Number.POSITIVE_INFINITY,
      });
      queueMicrotask(() => {
        probe.dispatchEvent(new Event("loadedmetadata"));
        Object.defineProperty(probe, "duration", {
          configurable: true,
          value: 3.25,
        });
        probe.dispatchEvent(new Event("durationchange"));
      });
    });

    await expect(
      readVideoMetadata("blob:webm", { createVideo: () => probe }),
    ).resolves.toEqual({ duration: 3.25 });
  });

  it("rejects unreadable duration, media errors, aborts, and timeouts", async () => {
    const invalid = document.createElement("video");
    vi.spyOn(invalid, "load").mockImplementation(() => {
      Object.defineProperty(invalid, "duration", { configurable: true, value: 0 });
      queueMicrotask(() => invalid.dispatchEvent(new Event("loadedmetadata")));
    });
    await expect(
      readVideoMetadata("blob:invalid", { createVideo: () => invalid }),
    ).rejects.toThrow(/readable duration/i);

    const errored = document.createElement("video");
    vi.spyOn(errored, "load").mockImplementation(() => {
      queueMicrotask(() => errored.dispatchEvent(new Event("error")));
    });
    await expect(
      readVideoMetadata("blob:error", { createVideo: () => errored }),
    ).rejects.toThrow(/could not be read/i);

    const controller = new AbortController();
    controller.abort(new DOMException("Cancelled", "AbortError"));
    await expect(
      readVideoMetadata("blob:abort", { signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });

    vi.useFakeTimers();
    const stalled = document.createElement("video");
    vi.spyOn(stalled, "load").mockImplementation(() => {});
    const pending = readVideoMetadata("blob:stalled", {
      createVideo: () => stalled,
      timeoutMs: 5,
    });
    const timedOut = expect(pending).rejects.toThrow(/timed out/i);
    await vi.advanceTimersByTimeAsync(5);
    await timedOut;
    vi.useRealTimers();
  });
});
