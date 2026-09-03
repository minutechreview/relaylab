import { decideVisualSupport, type VisualSupportDecision } from "./brollRecommendation";
import { findOverlayOpportunities, type OverlayOpportunity } from "./overlayOpportunities";
import type { Project } from "./types";

/**
 * Local, deterministic first pass over the timeline: the same decision an
 * external WebMCP agent would make by calling find_overlay_opportunities,
 * then propose_overlay or propose_generated_broll for each open slot — run
 * once, locally, without an agent connected. Every candidate here becomes a
 * plain ghost overlay or a generation suggestion once the caller feeds it
 * through the existing store actions; nothing here spends money, commits,
 * or bypasses human review.
 */

export interface SuggestPlacementsInput {
  /** Uploaded-match score threshold; passed through to decideVisualSupport. */
  threshold?: number;
  /** Target clip length for each accepted opportunity, seconds. */
  clipDuration?: number;
}

export interface SuggestPlacementCandidate {
  opportunity: OverlayOpportunity;
  timelineStart: number;
  duration: number;
  decision: VisualSupportDecision;
}

const DEFAULT_CLIP_DURATION = 5;
const MAX_GENERATION_CLIP_DURATION = 10; // matches propose_generated_broll's own cap
const MIN_CLIP_DURATION = 1;
/** Minimum gap kept between adjacent auto-suggested clips so they don't crowd the timeline. */
const SPACING_SECONDS = 1;

function overlapsAny(
  start: number,
  end: number,
  ranges: { start: number; end: number }[],
): boolean {
  return ranges.some((range) => start < range.end + SPACING_SECONDS && end > range.start - SPACING_SECONDS);
}

export function planSuggestedPlacements(
  project: Project,
  input: SuggestPlacementsInput = {},
): SuggestPlacementCandidate[] {
  const clipDuration = Math.max(MIN_CLIP_DURATION, input.clipDuration ?? DEFAULT_CLIP_DURATION);
  const opportunities = findOverlayOpportunities(project);

  const covered: { start: number; end: number }[] = [
    ...project.overlays.map((overlay) => ({ start: overlay.timelineStart, end: overlay.timelineEnd })),
    ...project.generationSuggestions.map((suggestion) => ({
      start: suggestion.timelineStart,
      end: suggestion.timelineEnd,
    })),
  ];

  const candidates: SuggestPlacementCandidate[] = [];

  for (const opportunity of opportunities) {
    const start = opportunity.start;
    const end = Math.min(project.duration, start + clipDuration);
    if (end - start < MIN_CLIP_DURATION) continue;
    if (overlapsAny(start, end, covered)) continue;

    const query = opportunity.transcript || opportunity.cue || opportunity.detail || "";
    const decision = decideVisualSupport(project, {
      query,
      duration: end - start,
      threshold: input.threshold,
    });
    if (decision.kind === "no_visual_needed") continue;

    candidates.push({ opportunity, timelineStart: start, duration: end - start, decision });
    covered.push({ start, end });
  }

  return candidates;
}

/** Builds a propose_generated_broll-ready prompt/reason from an opportunity. Deterministic, not an LLM call. */
export function buildGenerationSuggestionCopy(
  opportunity: OverlayOpportunity,
  duration: number,
): { prompt: string; reason: string } {
  const clampedDuration = Math.min(MAX_GENERATION_CLIP_DURATION, Math.max(MIN_CLIP_DURATION, duration));
  const context = opportunity.transcript.trim() || opportunity.cue?.trim() || "this moment";
  return {
    prompt: `A clear, realistic visual supporting: "${context}". Natural motion, no dialogue, no on-screen text, roughly ${Math.round(clampedDuration)}s.`,
    reason: opportunity.detail ?? `${opportunity.reason} cue with no strong uploaded match.`,
  };
}

export { MAX_GENERATION_CLIP_DURATION };
