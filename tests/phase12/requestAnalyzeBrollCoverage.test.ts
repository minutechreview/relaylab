import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { captureVideoFramesMock } = vi.hoisted(() => ({
  captureVideoFramesMock: vi.fn(),
}));

vi.mock("@/lib/media/captureVideoFrame", () => ({
  captureVideoFrames: captureVideoFramesMock,
}));

import { requestAnalyzeBroll } from "@/lib/analysis/requestAnalyzeBroll";

describe("requestAnalyzeBroll transport and failure guards", () => {
  beforeEach(() => {
    captureVideoFramesMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("sends captured frames, preserves capture failures, and forwards a human-set cap", async () => {
    captureVideoFramesMock
      .mockResolvedValueOnce(["data:image/jpeg;base64,frame"])
      .mockRejectedValueOnce(new Error("decode failed"));

    const payload = {
      ok: true,
      assetId: "asset_1",
      candidateCount: 2,
      analyzedCount: 1,
      truncated: true,
      results: [],
    };
    const fetchMock = vi.fn(
      async (_input: string | URL | Request, _init?: RequestInit) =>
        new Response(JSON.stringify(payload), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await requestAnalyzeBroll({
      assetId: "asset_1",
      source: "blob:local-reel",
      maxMoments: 2,
      moments: [
        { momentId: "moment_1", sourceStart: 0, sourceEnd: 4 },
        { momentId: "moment_2", sourceStart: 4, sourceEnd: 8 },
      ],
    });

    expect(result).toEqual(payload);
    expect(captureVideoFramesMock).toHaveBeenCalledTimes(2);
    const init = fetchMock.mock.calls[0][1];
    if (!init) throw new Error("Expected requestAnalyzeBroll to pass fetch options.");
    expect(init.headers).toMatchObject({
      "x-relaylab-human-action": "analyze-broll",
    });
    expect(JSON.parse(String(init.body))).toMatchObject({
      assetId: "asset_1",
      candidateCount: 2,
      maxMoments: 2,
      moments: [
        expect.objectContaining({
          momentId: "moment_1",
          frameImages: ["data:image/jpeg;base64,frame"],
        }),
        {
          momentId: "moment_2",
          sourceStart: 4,
          sourceEnd: 8,
        },
      ],
    });
  });

  it("caps client-side frame capture before doing expensive browser work", async () => {
    captureVideoFramesMock.mockResolvedValue(["data:image/jpeg;base64,frame"]);
    const fetchMock = vi.fn(
      async (_input: string | URL | Request, _init?: RequestInit) =>
        new Response(
          JSON.stringify({
            ok: true,
            assetId: "asset_1",
            candidateCount: 25,
            analyzedCount: 20,
            truncated: true,
            results: [],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const moments = Array.from({ length: 25 }, (_, index) => ({
      momentId: `moment_${index}`,
      sourceStart: index * 4,
      sourceEnd: index * 4 + 3,
    }));

    await requestAnalyzeBroll({ assetId: "asset_1", source: "blob:reel", moments });

    expect(captureVideoFramesMock).toHaveBeenCalledTimes(20);
    const init = fetchMock.mock.calls[0][1];
    if (!init) throw new Error("Expected requestAnalyzeBroll to pass fetch options.");
    const body = JSON.parse(String(init.body));
    expect(body.candidateCount).toBe(25);
    expect(body.maxMoments).toBe(20);
    expect(body.moments).toHaveLength(20);
  });

  it("surfaces a structured provider error without replacing its code or message", async () => {
    captureVideoFramesMock.mockResolvedValue([]);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({ ok: false, code: "RATE_LIMITED", message: "Try later." }),
          { status: 429, headers: { "content-type": "application/json" } },
        ),
      ),
    );

    await expect(
      requestAnalyzeBroll({
        assetId: "asset_1",
        source: "blob:local-reel",
        moments: [],
      }),
    ).rejects.toMatchObject({
      name: "AnalyzeBrollRequestError",
      code: "RATE_LIMITED",
      status: 429,
      message: "Try later.",
    });
  });

  it("uses safe defaults when a successful HTTP response carries a failed payload", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ ok: false }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    await expect(
      requestAnalyzeBroll({
        assetId: "asset_1",
        source: "blob:local-reel",
        moments: [],
      }),
    ).rejects.toMatchObject({
      code: "ANALYSIS_FAILED",
      status: 200,
      message: "B-roll visual analysis failed.",
    });
  });

  it("handles a non-JSON error response without leaking parser failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("not-json", { status: 502 })),
    );

    await expect(
      requestAnalyzeBroll({
        assetId: "asset_1",
        source: "blob:local-reel",
        moments: [],
      }),
    ).rejects.toMatchObject({
      code: "ANALYSIS_FAILED",
      status: 502,
      message: "B-roll visual analysis failed.",
    });
  });
});
