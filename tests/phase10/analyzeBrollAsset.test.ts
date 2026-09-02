import { describe, expect, it, vi } from "vitest";

import {
  analyzeBrollAsset,
  clampMaxMoments,
  DEFAULT_MAX_MOMENTS_PER_ASSET,
} from "@/lib/analysis/analyzeBrollAsset";
import type { VisionMetadataProvider } from "@/lib/analysis/describeMoment";

function fakeProvider(
  behavior: (momentIndex: number) => { description: string; tags: string[] } | Error,
): VisionMetadataProvider {
  let index = 0;
  return {
    name: "fake",
    describe: vi.fn(async () => {
      const result = behavior(index);
      index += 1;
      if (result instanceof Error) throw result;
      return result;
    }),
  };
}

describe("clampMaxMoments", () => {
  it("defaults to the standard cap when unset", () => {
    expect(clampMaxMoments(undefined)).toBe(DEFAULT_MAX_MOMENTS_PER_ASSET);
  });
  it("clamps an oversized request to the ceiling", () => {
    expect(clampMaxMoments(9999)).toBeLessThanOrEqual(50);
  });
  it("falls back to the default for invalid input", () => {
    expect(clampMaxMoments(0)).toBe(DEFAULT_MAX_MOMENTS_PER_ASSET);
    expect(clampMaxMoments(Number.NaN)).toBe(DEFAULT_MAX_MOMENTS_PER_ASSET);
  });
});

describe("analyzeBrollAsset", () => {
  const moments = Array.from({ length: 5 }, (_, index) => ({
    momentId: `m_${index}`,
    sourceStart: index * 4,
    sourceEnd: index * 4 + 3,
    frameImages: ["data:image/jpeg;base64,AA=="],
  }));

  it("analyzes every candidate moment when under the cap", async () => {
    const provider = fakeProvider(() => ({ description: "A person at a desk.", tags: ["desk"] }));
    const result = await analyzeBrollAsset(provider, { source: "blob:x", moments, maxMoments: 20 });

    expect(result.analyzedCount).toBe(5);
    expect(result.candidateCount).toBe(5);
    expect(result.truncated).toBe(false);
    expect(result.results.every((entry) => entry.ok)).toBe(true);
  });

  it("caps analysis and reports truncation honestly when candidates exceed the limit", async () => {
    const manyMoments = Array.from({ length: 30 }, (_, index) => ({
      momentId: `m_${index}`,
      sourceStart: index * 4,
      sourceEnd: index * 4 + 3,
      frameImages: ["data:image/jpeg;base64,AA=="],
    }));
    const provider = fakeProvider(() => ({ description: "desk", tags: [] }));
    const result = await analyzeBrollAsset(provider, {
      source: "blob:x",
      moments: manyMoments,
      maxMoments: 20,
    });

    expect(result.candidateCount).toBe(30);
    expect(result.analyzedCount).toBe(20);
    expect(result.truncated).toBe(true);
    expect(result.results).toHaveLength(20);
  });

  it("keeps other moments' results when one moment's vision call fails", async () => {
    const provider = fakeProvider((index) =>
      index === 2 ? new Error("provider hiccup") : { description: "ok", tags: [] },
    );
    const result = await analyzeBrollAsset(provider, { source: "blob:x", moments, maxMoments: 20 });

    expect(result.results).toHaveLength(5);
    const failed = result.results.find((entry) => !entry.ok);
    expect(failed).toMatchObject({
      ok: false,
      momentId: "m_2",
      error: "Vision analysis failed for this moment.",
    });
    expect(result.analyzedCount).toBe(4);
    expect(result.results.filter((entry) => entry.ok)).toHaveLength(4);
  });

  it("never sends more than one provider call per analyzed moment (no duplicate vision calls)", async () => {
    const provider = fakeProvider(() => ({ description: "ok", tags: [] }));
    await analyzeBrollAsset(provider, { source: "blob:x", moments, maxMoments: 20 });
    expect(provider.describe).toHaveBeenCalledTimes(5);
  });

  it("does not call the provider or claim indexing when frame capture failed", async () => {
    const provider = fakeProvider(() => ({ description: "hallucinated", tags: [] }));
    const result = await analyzeBrollAsset(provider, {
      source: "blob:x",
      moments: [{ momentId: "missing", sourceStart: 0, sourceEnd: 3 }],
    });

    expect(provider.describe).not.toHaveBeenCalled();
    expect(result.analyzedCount).toBe(0);
    expect(result.results).toEqual([
      {
        ok: false,
        momentId: "missing",
        error: "No captured frames were available for this moment.",
      },
    ]);
  });
});
