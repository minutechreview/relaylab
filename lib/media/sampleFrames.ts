/**
 * Representative frame timestamp sampling for a source range. Returns
 * approximately start/middle/end timestamps so a vision provider can
 * describe a moment from a small, cheap sample instead of every frame.
 */

export interface SampleFramesOptions {
  /** Fraction inset from each edge to avoid cut/transition frames. Default 0.1 (10%). */
  edgeInset?: number;
}

/**
 * Sample up to three timestamps within `[sourceStart, sourceEnd]`: near the
 * start, the midpoint, and near the end. For very short ranges this
 * collapses to fewer distinct timestamps (never duplicates one timestamp
 * three times) — round to the source's own precision at the call site.
 */
export function sampleFrameTimestamps(
  sourceStart: number,
  sourceEnd: number,
  options: SampleFramesOptions = {},
): number[] {
  if (!Number.isFinite(sourceStart) || !Number.isFinite(sourceEnd) || sourceEnd <= sourceStart) {
    return [];
  }

  const duration = sourceEnd - sourceStart;
  const inset = clamp(options.edgeInset ?? 0.1, 0, 0.49);

  const start = sourceStart + duration * inset;
  const middle = sourceStart + duration * 0.5;
  const end = sourceEnd - duration * inset;

  const candidates = [round(start), round(middle), round(end)];
  const unique = [...new Set(candidates)].sort((a, b) => a - b);
  return unique;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
