/**
 * Pragmatic cut-candidate segmentation for an uploaded B-roll reel. This is
 * not scene detection — it produces evenly sized candidate windows within
 * min/max duration bounds so a long, uninterrupted reel yields several
 * indexable moments instead of one unwieldy full-reel range.
 */

export interface SegmentBrollOptions {
  minDurationSeconds?: number;
  maxDurationSeconds?: number;
}

export interface BrollSegment {
  sourceStart: number;
  sourceEnd: number;
}

const DEFAULT_MIN_DURATION = 3;
const DEFAULT_MAX_DURATION = 8;

/**
 * Split `[0, reelDuration]` into candidate segments of at most
 * `maxDurationSeconds`, each at least `minDurationSeconds` (except when the
 * whole reel is shorter than the minimum, in which case one segment covers
 * the full reel). Segments never exceed the reel's actual duration.
 */
export function segmentBroll(
  reelDuration: number,
  options: SegmentBrollOptions = {},
): BrollSegment[] {
  const minDuration = Math.max(0.1, options.minDurationSeconds ?? DEFAULT_MIN_DURATION);
  const maxDuration = Math.max(minDuration, options.maxDurationSeconds ?? DEFAULT_MAX_DURATION);

  if (!Number.isFinite(reelDuration) || reelDuration <= 0) {
    return [];
  }

  if (reelDuration <= minDuration) {
    return [{ sourceStart: 0, sourceEnd: reelDuration }];
  }

  // Choose the largest even split of the reel that keeps each segment
  // within [minDuration, maxDuration] so a long uncut stretch is subdivided
  // rather than left as one oversized candidate.
  const segmentCount = Math.max(1, Math.ceil(reelDuration / maxDuration));
  const segmentLength = reelDuration / segmentCount;

  if (segmentLength < minDuration) {
    // Falling below the minimum means maxDuration and minDuration are close
    // relative to reelDuration; fall back to as many minDuration-sized
    // segments as fit, merging any remainder into the final segment.
    const count = Math.max(1, Math.floor(reelDuration / minDuration));
    const segments: BrollSegment[] = [];
    for (let index = 0; index < count; index += 1) {
      const start = index * minDuration;
      const end = index === count - 1 ? reelDuration : start + minDuration;
      segments.push({ sourceStart: round(start), sourceEnd: round(end) });
    }
    return segments;
  }

  const segments: BrollSegment[] = [];
  for (let index = 0; index < segmentCount; index += 1) {
    const start = index * segmentLength;
    const end = index === segmentCount - 1 ? reelDuration : start + segmentLength;
    segments.push({ sourceStart: round(start), sourceEnd: round(end) });
  }
  return segments;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
