import type { Overlay, Project, TranscriptSegment } from "./types";

/**
 * Deterministic semantic + pacing heuristics for candidate B-roll slots.
 * These functions only read stored project metadata; they never create or
 * mutate overlays.
 */

export type OpportunityKind = "pacing_gap" | "semantic_cue";
export type OverlayOpportunityReason =
  | "product-mentioned"
  | "list"
  | "concept-needs-visual"
  | "pacing-gap";

export interface OverlayOpportunity {
  /** Compatibility discriminator retained for existing UI/test callers. */
  kind: OpportunityKind;
  start: number;
  end: number;
  /** Stable machine-readable reason for agent planning. */
  reason: OverlayOpportunityReason;
  /** Transcript text overlapping this candidate range. */
  transcript: string;
  /** Optional concise explanation of the matched heuristic. */
  detail?: string;
  /** Present for semantic opportunities; the matched cue phrase. */
  cue?: string;
}

export interface FindOverlayOpportunitiesInput {
  maxTalkingHeadSeconds?: number;
  startSeconds?: number;
  endSeconds?: number;
}

export const DEFAULT_PACING_GAP_SECONDS = 15;
export const MIN_PACING_GAP_SECONDS = 5;
export const MAX_PACING_GAP_SECONDS = 30;

interface SemanticCuePattern {
  pattern: RegExp;
  reason: Exclude<OverlayOpportunityReason, "pacing-gap">;
  detail: string;
}

const SEMANTIC_CUE_PATTERNS: SemanticCuePattern[] = [
  { pattern: /\bfirst\b/i, reason: "list", detail: "Ordered-list cue: first." },
  { pattern: /\bsecond\b/i, reason: "list", detail: "Ordered-list cue: second." },
  { pattern: /\bthird\b/i, reason: "list", detail: "Ordered-list cue: third." },
  {
    pattern: /\b(one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:things|steps|ways|tips|reasons|ideas)\b/i,
    reason: "list",
    detail: "Enumerated-list phrase.",
  },
  {
    pattern:
      /\b(?:ChatGPT|OpenAI|Figma|Notion|Slack|Canva|Photoshop|Premiere|CapCut|Final Cut Pro|DaVinci Resolve)\b/i,
    reason: "product-mentioned",
    detail: "Named product or software mention.",
  },
  {
    pattern: /\b(?:app|application|software|dashboard|interface|website|product|platform)\b/i,
    reason: "product-mentioned",
    detail: "Product or application concept mentioned.",
  },
  {
    pattern: /\b(?:for example|such as|like\s+(?:a|an|the))\b/i,
    reason: "concept-needs-visual",
    detail: "Explicit example cue.",
  },
  {
    pattern:
      /\b(?:phone|laptop|camera|cup|coffee|car|book|screen|office|studio|cafe|city|street|store|kitchen|workspace)\b/i,
    reason: "concept-needs-visual",
    detail: "Concrete object or place mentioned.",
  },
];

function coveredRanges(overlays: Overlay[]): { start: number; end: number }[] {
  return overlays
    .map((overlay) => ({ start: overlay.timelineStart, end: overlay.timelineEnd }))
    .sort((a, b) => a.start - b.start);
}

/**
 * Find full-project stretches with no B-roll longer than the requested
 * threshold. Existing ghost proposals count as visual coverage, because the
 * agent is planning against the same timeline the human currently sees.
 */
export function findPacingGaps(
  project: Project,
  maxTalkingHeadSeconds: number = project.pacingPreference?.maxTalkingHeadSeconds ??
    DEFAULT_PACING_GAP_SECONDS,
): OverlayOpportunity[] {
  const threshold = clampPacingThreshold(maxTalkingHeadSeconds);
  const covered = coveredRanges(project.overlays);
  const gaps: OverlayOpportunity[] = [];
  let cursor = 0;

  for (const range of covered) {
    if (range.start > cursor) {
      pushGapIfLongEnough(project, gaps, cursor, range.start, threshold);
    }
    cursor = Math.max(cursor, range.end);
  }
  if (cursor < project.duration) {
    pushGapIfLongEnough(project, gaps, cursor, project.duration, threshold);
  }

  return gaps;
}

function pushGapIfLongEnough(
  project: Project,
  gaps: OverlayOpportunity[],
  start: number,
  end: number,
  maxTalkingHeadSeconds: number,
): void {
  const length = end - start;
  if (length <= maxTalkingHeadSeconds) return;
  gaps.push({
    kind: "pacing_gap",
    start: round(start),
    end: round(end),
    reason: "pacing-gap",
    transcript: transcriptForRange(project.transcript, start, end),
    detail: `Uninterrupted talking-head stretch of ${round(length)}s exceeds the ${maxTalkingHeadSeconds}s pacing threshold.`,
  });
}

/** Find stored transcript ranges with lightweight editorial cues. */
export function findSemanticOpportunities(
  transcript: TranscriptSegment[],
): OverlayOpportunity[] {
  const opportunities: OverlayOpportunity[] = [];

  for (const segment of transcript) {
    for (const { pattern, reason, detail } of SEMANTIC_CUE_PATTERNS) {
      const match = segment.text.match(pattern);
      if (!match) continue;

      opportunities.push({
        kind: "semantic_cue",
        start: segment.start,
        end: segment.end,
        reason,
        transcript: segment.text,
        detail,
        cue: match[0],
      });
    }
  }

  return opportunities;
}

export function findOverlayOpportunities(
  project: Project,
  input: FindOverlayOpportunitiesInput = {},
): OverlayOpportunity[] {
  const window = normalizeWindow(project.duration, input);
  if (!window) return [];

  const threshold = clampPacingThreshold(
    input.maxTalkingHeadSeconds ??
      project.pacingPreference?.maxTalkingHeadSeconds ??
      DEFAULT_PACING_GAP_SECONDS,
  );

  return [...findPacingGaps(project, threshold), ...findSemanticOpportunities(project.transcript)]
    .map((opportunity) => clipOpportunity(opportunity, project.transcript, window))
    .filter((opportunity): opportunity is OverlayOpportunity => opportunity !== null)
    .sort((a, b) => a.start - b.start || a.end - b.end || a.reason.localeCompare(b.reason));
}

function normalizeWindow(
  duration: number,
  input: Pick<FindOverlayOpportunitiesInput, "startSeconds" | "endSeconds">,
): { start: number; end: number } | null {
  const start = clamp(input.startSeconds ?? 0, 0, duration);
  const end = clamp(input.endSeconds ?? duration, 0, duration);
  return end > start ? { start, end } : null;
}

function clipOpportunity(
  opportunity: OverlayOpportunity,
  transcript: TranscriptSegment[],
  window: { start: number; end: number },
): OverlayOpportunity | null {
  if (opportunity.end <= window.start || opportunity.start >= window.end) return null;

  const start = round(Math.max(opportunity.start, window.start));
  const end = round(Math.min(opportunity.end, window.end));
  if (end <= start) return null;

  return {
    ...opportunity,
    start,
    end,
    transcript: transcriptForRange(transcript, start, end),
  };
}

function transcriptForRange(
  transcript: TranscriptSegment[],
  start: number,
  end: number,
): string {
  return transcript
    .filter((segment) => segment.end > start && segment.start < end)
    .map((segment) => segment.text.trim())
    .filter(Boolean)
    .join(" ");
}

function clampPacingThreshold(value: number): number {
  const safe = Number.isFinite(value) ? value : DEFAULT_PACING_GAP_SECONDS;
  return clamp(safe, MIN_PACING_GAP_SECONDS, MAX_PACING_GAP_SECONDS);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
