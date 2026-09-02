import { sampleFrameTimestamps } from "@/lib/media/sampleFrames";

import type { VisionMetadataProvider } from "./describeMoment";

/** Hackathon-sane cost/runtime ceiling for one analyze-broll request. */
export const DEFAULT_MAX_MOMENTS_PER_ASSET = 20;
export const MAX_MOMENTS_PER_ASSET_CEILING = 50;

export interface AnalyzeMomentInput {
  momentId: string;
  sourceStart: number;
  sourceEnd: number;
  /**
   * Frame image data URLs captured client-side (see
   * `lib/media/captureVideoFrame.ts`), aligned with
   * `sampleFrameTimestamps(sourceStart, sourceEnd)`. Optional so a caller
   * without captured frames still gets an honest "unanalyzed" result instead
   * of a request failure.
   */
  frameImages?: string[];
}

export interface AnalyzeBrollAssetInput {
  /** Local object URL or remote URL to the source reel; kept for logging/identity only. */
  source: string;
  moments: AnalyzeMomentInput[];
  maxMoments?: number;
  signal?: AbortSignal;
}

export interface MomentAnalysisSuccess {
  ok: true;
  momentId: string;
  description: string;
  tags: string[];
}

export interface MomentAnalysisFailure {
  ok: false;
  momentId: string;
  error: string;
}

export type MomentAnalysisResult = MomentAnalysisSuccess | MomentAnalysisFailure;

export interface AnalyzeBrollAssetResult {
  results: MomentAnalysisResult[];
  analyzedCount: number;
  candidateCount: number;
  truncated: boolean;
}

export function clampMaxMoments(requested: number | undefined): number {
  const value = requested ?? DEFAULT_MAX_MOMENTS_PER_ASSET;
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_MAX_MOMENTS_PER_ASSET;
  return Math.min(Math.floor(value), MAX_MOMENTS_PER_ASSET_CEILING);
}

/**
 * Run vision analysis over a bounded number of candidate moments for one
 * uploaded B-roll asset. One provider call per moment, sampling ~3
 * representative frame timestamps (fewer for short segments) via
 * `sampleFrameTimestamps`. A single moment's failure does not abort the
 * batch — every other moment's result (success or failure) is still
 * returned, so a partial provider outage never wipes previously-succeeded
 * moments in the same request.
 */
export async function analyzeBrollAsset(
  provider: VisionMetadataProvider,
  input: AnalyzeBrollAssetInput,
): Promise<AnalyzeBrollAssetResult> {
  const maxMoments = clampMaxMoments(input.maxMoments);
  const candidateCount = input.moments.length;
  const selected = input.moments.slice(0, maxMoments);
  const truncated = candidateCount > selected.length;

  const results: MomentAnalysisResult[] = [];
  for (const moment of selected) {
    if (input.signal?.aborted) {
      results.push({
        ok: false,
        momentId: moment.momentId,
        error: "Analysis was cancelled.",
      });
      continue;
    }
    if (!moment.frameImages?.length) {
      results.push({
        ok: false,
        momentId: moment.momentId,
        error: "No captured frames were available for this moment.",
      });
      continue;
    }
    const frameTimestamps = sampleFrameTimestamps(moment.sourceStart, moment.sourceEnd);
    try {
      const described = await provider.describe({
        source: input.source,
        frameTimestamps,
        frameImages: moment.frameImages,
        signal: input.signal,
      });
      results.push({
        ok: true,
        momentId: moment.momentId,
        description: described.description,
        tags: described.tags,
      });
    } catch (error) {
      console.error(
        "Vision analysis failed for a B-roll moment",
        error instanceof Error ? error.name : "UnknownError",
      );
      results.push({
        ok: false,
        momentId: moment.momentId,
        error: "Vision analysis failed for this moment.",
      });
    }
  }

  return {
    results,
    analyzedCount: results.filter((entry) => entry.ok).length,
    candidateCount,
    truncated,
  };
}
