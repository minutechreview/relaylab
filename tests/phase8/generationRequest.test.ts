import { afterEach, describe, expect, it, vi } from "vitest";

import {
  requestAndMeasureGeneratedBroll,
  requestGeneratedBroll,
} from "@/lib/generation/requestGeneratedBroll";
import { GenerationRequestError } from "@/lib/generation/requestGeneratedBroll";

afterEach(() => vi.restoreAllMocks());

describe("human generation request client", () => {
  it("makes no request until the human action explicitly calls it", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          result: {
            url: "https://cdn.example.com/generated.mp4",
            provider: "fal.ai",
            model: "configured-model",
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    expect(fetchSpy).not.toHaveBeenCalled();
    await requestGeneratedBroll({ prompt: "A manager reviews a dashboard.", duration: 5 });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/generate-broll",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "x-relaylab-human-action": "generate" }),
      }),
    );
  });

  it("measures the returned video instead of trusting the requested duration", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          result: {
            url: "https://cdn.example.com/generated.mp4",
            provider: "fal.ai",
            model: "configured-model",
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const readMetadata = vi.fn(async () => ({ duration: 4.64 }));

    await expect(
      requestAndMeasureGeneratedBroll(
        { prompt: "A manager reviews a dashboard.", duration: 5 },
        { readMetadata },
      ),
    ).resolves.toMatchObject({ duration: 4.64 });
    expect(readMetadata).toHaveBeenCalledWith(
      "https://cdn.example.com/generated.mp4",
      { signal: undefined },
    );
  });

  it("returns structured provider errors without fabricating a result", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: false,
          code: "GENERATION_UNAVAILABLE",
          message: "Video generation is unavailable in demo mode.",
        }),
        { status: 503, headers: { "content-type": "application/json" } },
      ),
    );

    const error = await requestGeneratedBroll({ prompt: "A manager checks a dashboard." }).catch(
      (caught) => caught,
    );
    expect(error).toBeInstanceOf(GenerationRequestError);
    expect(error).toMatchObject({
      code: "GENERATION_UNAVAILABLE",
      status: 503,
      message: "Video generation is unavailable in demo mode.",
    });
  });

  it("uses a safe generic error when the server response is not JSON", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("upstream proxy error", { status: 502 }),
    );

    await expect(
      requestGeneratedBroll({ prompt: "A manager checks a dashboard." }),
    ).rejects.toMatchObject({
      code: "GENERATION_FAILED",
      status: 502,
      message: "Video generation failed.",
    });
  });
});
