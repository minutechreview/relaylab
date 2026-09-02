import { searchBroll, type SearchBrollResult } from "./brollSearch";
import type { Project } from "./types";

export const DEFAULT_BROLL_MATCH_THRESHOLD = 0.65;
export const MIN_BROLL_MATCH_THRESHOLD = 0;
export const MAX_BROLL_MATCH_THRESHOLD = 1;

export interface VisualSupportDecisionInput {
  query: string;
  duration: number;
  visualNeeded?: boolean;
  threshold?: number;
}

export type VisualSupportDecision =
  | {
      kind: "uploaded_match";
      threshold: number;
      bestScore: number;
      match: SearchBrollResult;
    }
  | {
      kind: "generate_suggestion";
      threshold: number;
      bestScore: number | null;
      bestUploadedCandidate: SearchBrollResult | null;
    }
  | {
      kind: "no_visual_needed";
      threshold: number;
      bestScore: null;
    };

export function clampBrollMatchThreshold(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) {
    return DEFAULT_BROLL_MATCH_THRESHOLD;
  }
  return Math.min(MAX_BROLL_MATCH_THRESHOLD, Math.max(MIN_BROLL_MATCH_THRESHOLD, value));
}

/**
 * Deterministic uploaded-footage-first decision. It never generates media and
 * never creates timeline state; a low score merely gives the agent permission
 * to propose a human-reviewable generation suggestion.
 */
export function decideVisualSupport(
  project: Project,
  input: VisualSupportDecisionInput,
): VisualSupportDecision {
  const threshold = clampBrollMatchThreshold(input.threshold);
  if (input.visualNeeded === false || !input.query.trim()) {
    return { kind: "no_visual_needed", threshold, bestScore: null };
  }

  const [bestUploadedCandidate] = searchBroll(project, {
    query: input.query,
    targetDuration: input.duration,
    minDuration: Math.min(input.duration, 0.5),
    limit: 1,
  });
  if (bestUploadedCandidate && bestUploadedCandidate.score >= threshold) {
    return {
      kind: "uploaded_match",
      threshold,
      bestScore: bestUploadedCandidate.score,
      match: bestUploadedCandidate,
    };
  }

  return {
    kind: "generate_suggestion",
    threshold,
    bestScore: bestUploadedCandidate?.score ?? null,
    bestUploadedCandidate: bestUploadedCandidate ?? null,
  };
}

