import { captureVideoFrames } from "@/lib/media/captureVideoFrame";
import { sampleFrameTimestamps } from "@/lib/media/sampleFrames";

import {
  clampMaxMoments,
  type AnalyzeMomentInput,
  type MomentAnalysisResult,
} from "./analyzeBrollAsset";

export class AnalyzeBrollRequestError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "AnalyzeBrollRequestError";
  }
}

export interface AnalyzeBrollCandidateMoment {
  momentId: string;
  sourceStart: number;
  sourceEnd: number;
}

export interface AnalyzeBrollRequestInput {
  assetId: string;
  /** Local blob: object URL (or any URL) — used only client-side to capture frames, never fetched by the server. */
  source: string;
  moments: AnalyzeBrollCandidateMoment[];
  maxMoments?: number;
  signal?: AbortSignal;
}

export interface AnalyzeBrollRequestResult {
  assetId: string;
  candidateCount: number;
  analyzedCount: number;
  truncated: boolean;
  results: MomentAnalysisResult[];
}

/**
 * Captures real frame images from the local video element for each
 * candidate moment (client-side only — the server cannot reach a `blob:`
 * URL), then posts them to `/api/ai/analyze-broll`. A moment whose frame
 * capture fails is still sent with no `frameImages`, which the provider
 * treats as an honest "unanalyzed" result rather than a fabricated guess.
 */
export async function requestAnalyzeBroll(
  input: AnalyzeBrollRequestInput,
): Promise<AnalyzeBrollRequestResult> {
  const maxMoments = clampMaxMoments(input.maxMoments);
  const cappedCandidates = input.moments.slice(0, maxMoments);
  const momentsWithFrames: AnalyzeMomentInput[] = [];
  for (const moment of cappedCandidates) {
    const timestamps = sampleFrameTimestamps(moment.sourceStart, moment.sourceEnd);
    try {
      const frameImages = await captureVideoFrames(input.source, timestamps, {
        signal: input.signal,
      });
      momentsWithFrames.push({ ...moment, frameImages });
    } catch {
      momentsWithFrames.push({ ...moment });
    }
  }

  const response = await fetch("/api/ai/analyze-broll", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-relaylab-human-action": "analyze-broll",
    },
    body: JSON.stringify({
      assetId: input.assetId,
      source: input.source,
      candidateCount: input.moments.length,
      moments: momentsWithFrames,
      maxMoments,
    }),
    signal: input.signal,
  });
  const payload = (await response.json().catch(() => null)) as
    | (AnalyzeBrollRequestResult & { ok?: boolean; code?: string; message?: string })
    | null;
  if (!response.ok || !payload?.ok) {
    throw new AnalyzeBrollRequestError(
      payload?.message ?? "B-roll visual analysis failed.",
      payload?.code ?? "ANALYSIS_FAILED",
      response.status,
    );
  }
  return payload;
}
