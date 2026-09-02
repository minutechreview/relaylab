import { describe, expect, it, vi } from "vitest";

import {
  createConfiguredVideoGenerator,
  createFalVideoGenerator,
  type FalSubscriptionClient,
} from "@/lib/generation/videoGenerator";

describe("server-side fal.ai video provider", () => {
  it("requires both credentials and a configurable model", () => {
    expect(createConfiguredVideoGenerator({})).toBeNull();
    expect(createConfiguredVideoGenerator({ FAL_KEY: "secret" })).toBeNull();
    expect(createConfiguredVideoGenerator({ FAL_VIDEO_MODEL: "selected/model" })).toBeNull();
  });

  it("uses the configured model and a fixed small input surface", async () => {
    const subscribe = vi.fn(async () => ({
      data: { video: { url: "https://cdn.example.com/output.mp4" } },
    }));
    const generator = createFalVideoGenerator(
      { apiKey: "server-secret", model: "owner/configured-video-model" },
      { subscribe } as FalSubscriptionClient,
    );

    await expect(
      generator.generate({
        prompt: "A manager reviews a dashboard.",
        duration: 5,
        aspectRatio: "16:9",
      }),
    ).resolves.toEqual({
      url: "https://cdn.example.com/output.mp4",
      provider: "fal.ai",
      model: "owner/configured-video-model",
    });
    expect(subscribe).toHaveBeenCalledWith("owner/configured-video-model", {
      input: {
        prompt: "A manager reviews a dashboard.",
        duration: 5,
        aspect_ratio: "16:9",
      },
      abortSignal: undefined,
      logs: false,
    });
  });

  it("rejects malformed provider output instead of fabricating success", async () => {
    const generator = createFalVideoGenerator(
      { apiKey: "server-secret", model: "owner/configured-video-model" },
      { subscribe: vi.fn(async () => ({ data: { status: "complete" } })) },
    );

    await expect(generator.generate({ prompt: "A clear visual scene." })).rejects.toThrow(
      "without returning a video URL",
    );
  });

  it("accepts supported nested provider result shapes and forwards cancellation", async () => {
    const signal = new AbortController().signal;
    for (const data of [
      { url: "https://cdn.example.com/direct.mp4" },
      { output: { file: { url: "https://cdn.example.com/nested.mp4" } } },
      { videos: [{ url: "https://cdn.example.com/list.mp4" }] },
    ]) {
      const subscribe = vi.fn(async () => ({ data }));
      const generator = createFalVideoGenerator(
        { apiKey: "secret", model: "configured/model" },
        { subscribe },
      );
      await expect(
        generator.generate({ prompt: "A simple visual scene." }, { signal }),
      ).resolves.toMatchObject({ provider: "fal.ai", model: "configured/model" });
      expect(subscribe).toHaveBeenCalledWith(
        "configured/model",
        expect.objectContaining({
          input: { prompt: "A simple visual scene." },
          abortSignal: signal,
        }),
      );
    }
  });

  it("rejects empty configuration and non-HTTPS provider URLs", async () => {
    expect(() => createFalVideoGenerator({ apiKey: "", model: "model" })).toThrow(
      /must both be configured/i,
    );
    expect(() => createFalVideoGenerator({ apiKey: "secret", model: "" })).toThrow(
      /must both be configured/i,
    );
    const generator = createFalVideoGenerator(
      { apiKey: "secret", model: "configured/model" },
      { subscribe: vi.fn(async () => ({ data: { video: { url: "http://unsafe/video.mp4" } } })) },
    );
    await expect(generator.generate({ prompt: "A simple visual scene." })).rejects.toThrow(
      /non-HTTPS/i,
    );
  });
});
