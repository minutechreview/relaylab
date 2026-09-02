import { describe, expect, it } from "vitest";

import { segmentBroll } from "@/lib/media/segmentBroll";

describe("Phase 4 B-roll segmentation", () => {
  it("keeps a short reel as one segment covering the full reel", () => {
    const segments = segmentBroll(2.4, { minDurationSeconds: 3, maxDurationSeconds: 8 });
    expect(segments).toEqual([{ sourceStart: 0, sourceEnd: 2.4 }]);
  });

  it("subdivides a long uncut reel into segments within min/max bounds", () => {
    const reelDuration = 96;
    const segments = segmentBroll(reelDuration, {
      minDurationSeconds: 3,
      maxDurationSeconds: 8,
    });

    expect(segments.length).toBeGreaterThan(1);
    segments.forEach((segment) => {
      const length = segment.sourceEnd - segment.sourceStart;
      expect(length).toBeGreaterThanOrEqual(3 - 0.01);
      expect(length).toBeLessThanOrEqual(8 + 0.01);
    });
  });

  it("keeps source ranges correct and contiguous across a long reel", () => {
    const reelDuration = 110;
    const segments = segmentBroll(reelDuration, {
      minDurationSeconds: 3,
      maxDurationSeconds: 8,
    });

    expect(segments[0].sourceStart).toBe(0);
    expect(segments.at(-1)?.sourceEnd).toBeCloseTo(reelDuration, 3);
    for (let index = 1; index < segments.length; index += 1) {
      expect(segments[index].sourceStart).toBeCloseTo(segments[index - 1].sourceEnd, 3);
    }
  });

  it("preserves correct source ranges for a very long reel with a small max duration", () => {
    const reelDuration = 300;
    const segments = segmentBroll(reelDuration, {
      minDurationSeconds: 2,
      maxDurationSeconds: 5,
    });

    expect(segments.length).toBeGreaterThanOrEqual(60);
    expect(segments[0].sourceStart).toBe(0);
    expect(segments.at(-1)?.sourceEnd).toBeCloseTo(reelDuration, 3);
    segments.forEach((segment) => {
      expect(segment.sourceEnd).toBeGreaterThan(segment.sourceStart);
      expect(segment.sourceEnd).toBeLessThanOrEqual(reelDuration + 0.001);
    });
  });

  it("returns no segments for a non-positive or non-finite duration", () => {
    expect(segmentBroll(0)).toEqual([]);
    expect(segmentBroll(-5)).toEqual([]);
    expect(segmentBroll(Number.NaN)).toEqual([]);
  });

  it("falls back to minDuration-sized segments when maxDuration is close to minDuration", () => {
    const segments = segmentBroll(20, { minDurationSeconds: 6, maxDurationSeconds: 6.5 });
    expect(segments.length).toBeGreaterThan(1);
    expect(segments[0].sourceStart).toBe(0);
    expect(segments.at(-1)?.sourceEnd).toBeCloseTo(20, 3);
  });
});
