import { describe, expect, it } from "vitest";

import { sampleFrameTimestamps } from "@/lib/media/sampleFrames";

describe("Phase 4 representative frame sampling", () => {
  it("samples approximately start/middle/end timestamps", () => {
    const timestamps = sampleFrameTimestamps(74.2, 80.1);
    expect(timestamps).toHaveLength(3);
    const [start, middle, end] = timestamps;
    expect(start).toBeGreaterThan(74.2);
    expect(start).toBeLessThan(middle);
    expect(middle).toBeCloseTo((74.2 + 80.1) / 2, 1);
    expect(middle).toBeLessThan(end);
    expect(end).toBeLessThan(80.1);
  });

  it("keeps sampled timestamps within the source range", () => {
    const sourceStart = 12.4;
    const sourceEnd = 20.2;
    const timestamps = sampleFrameTimestamps(sourceStart, sourceEnd);
    timestamps.forEach((timestamp) => {
      expect(timestamp).toBeGreaterThanOrEqual(sourceStart);
      expect(timestamp).toBeLessThanOrEqual(sourceEnd);
    });
  });

  it("collapses to fewer unique timestamps for a very short range", () => {
    const timestamps = sampleFrameTimestamps(10, 10.2);
    expect(timestamps.length).toBeGreaterThan(0);
    expect(new Set(timestamps).size).toBe(timestamps.length);
  });

  it("returns no timestamps for an invalid or zero-length range", () => {
    expect(sampleFrameTimestamps(5, 5)).toEqual([]);
    expect(sampleFrameTimestamps(8, 3)).toEqual([]);
    expect(sampleFrameTimestamps(Number.NaN, 10)).toEqual([]);
  });
});
