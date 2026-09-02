import type { BrollAsset, BrollMoment, Overlay, Project } from "./types";

/**
 * Replaceable token/tag B-roll search. Deterministic and dependency-free —
 * no vector database or embeddings are required for v1. Ranking combines
 * text-token overlap, duration compatibility with the requested slot, and a
 * penalty for moments already used recently on the timeline so the agent
 * does not repeatedly propose the same clip.
 */

export interface SearchBrollQuery {
  query: string;
  /** Exclude source moments shorter than this duration. */
  minDuration?: number;
  /** Exclude source moments longer than this duration. */
  maxDuration?: number;
  /** Optional precise desired duration retained for small-call compatibility. */
  targetDuration?: number;
  limit?: number;
}

export interface SearchBrollResult {
  momentId: string;
  assetId: string;
  assetName: string;
  sourceStart: number;
  sourceEnd: number;
  duration: number;
  description: string;
  tags: string[];
  score: number;
}

const RECENT_REUSE_WINDOW = 5;
const REUSE_PENALTY = 0.35;

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 1);
}

function textScore(queryTokens: Set<string>, moment: BrollMoment): number {
  if (queryTokens.size === 0) return 0;
  const momentTokens = new Set([
    ...tokenize(moment.description),
    ...moment.tags.flatMap((tag) => tokenize(tag)),
  ]);
  if (momentTokens.size === 0) return 0;

  let matches = 0;
  for (const token of queryTokens) {
    if (momentTokens.has(token)) matches += 1;
    // Reward a tag/token that contains the query token as a substring too,
    // e.g. query "design" matching tag "designer".
    else if ([...momentTokens].some((candidate) => candidate.includes(token))) {
      matches += 0.5;
    }
  }
  return matches / queryTokens.size;
}

function durationFitScore(targetDuration: number | undefined, moment: BrollMoment): number {
  if (targetDuration === undefined || targetDuration <= 0) return 1;
  const available = moment.sourceEnd - moment.sourceStart;
  if (available <= 0) return 0;
  if (available >= targetDuration) {
    // Prefer moments close to the requested length over much longer ones.
    const overshoot = (available - targetDuration) / targetDuration;
    return 1 / (1 + overshoot);
  }
  // A moment shorter than the requested duration is a worse fit,
  // proportional to how much it falls short.
  return Math.max(0, available / targetDuration);
}

function recentReusePenalty(momentId: string, overlays: Overlay[]): number {
  const recentUses = overlays
    .slice()
    .sort((a, b) => b.timelineStart - a.timelineStart)
    .slice(0, RECENT_REUSE_WINDOW)
    .filter((overlay) => overlay.momentId === momentId).length;
  return recentUses > 0 ? REUSE_PENALTY * recentUses : 0;
}

/**
 * Rank indexed (non-pending) B-roll moments against a token/tag query.
 * Weighted score = 0.6 * text relevance + 0.4 * duration fit, minus a
 * reuse penalty for moments recently placed on the timeline. Unindexed
 * placeholder moments are excluded since they carry no factual metadata to
 * search against.
 */
export function searchBroll(project: Project, query: SearchBrollQuery): SearchBrollResult[] {
  const queryTokens = new Set(tokenize(query.query));
  const limit = Math.max(1, Math.min(query.limit ?? 10, 50));
  const minimumDuration = query.minDuration ?? 0;
  const maximumDuration = query.maxDuration ?? Number.POSITIVE_INFINITY;
  if (
    !Number.isFinite(minimumDuration) ||
    minimumDuration < 0 ||
    maximumDuration <= 0 ||
    minimumDuration > maximumDuration
  ) {
    return [];
  }
  const targetDuration = effectiveTargetDuration(query);

  const scored: SearchBrollResult[] = [];
  for (const asset of project.brollAssets) {
    for (const moment of asset.moments) {
      if (!isAvailableMoment(asset, moment)) continue;
      const availableDuration = moment.sourceEnd - moment.sourceStart;
      if (availableDuration < minimumDuration || availableDuration > maximumDuration) continue;

      const text = textScore(queryTokens, moment);
      const duration = durationFitScore(targetDuration, moment);
      const penalty = recentReusePenalty(moment.id, project.overlays);
      const score = Math.max(0, text * 0.6 + duration * 0.4 - penalty);

      scored.push({
        momentId: moment.id,
        assetId: asset.id,
        assetName: assetNameFor(asset),
        sourceStart: moment.sourceStart,
        sourceEnd: moment.sourceEnd,
        duration: Math.round(availableDuration * 1000) / 1000,
        description: moment.description,
        tags: moment.tags,
        score: Math.round(score * 1000) / 1000,
      });
    }
  }

  return scored
    .sort((a, b) => b.score - a.score || a.momentId.localeCompare(b.momentId))
    .slice(0, limit);
}

function effectiveTargetDuration(query: SearchBrollQuery): number | undefined {
  if (query.targetDuration !== undefined) return query.targetDuration;
  if (query.minDuration !== undefined && query.maxDuration !== undefined) {
    return (query.minDuration + query.maxDuration) / 2;
  }
  return query.minDuration ?? query.maxDuration;
}

function isAvailableMoment(asset: BrollAsset, moment: BrollMoment): boolean {
  return (
    moment.analysisStatus !== "unindexed" &&
    moment.assetId === asset.id &&
    Number.isFinite(asset.duration) &&
    asset.duration > 0 &&
    Number.isFinite(moment.sourceStart) &&
    Number.isFinite(moment.sourceEnd) &&
    moment.sourceStart >= 0 &&
    moment.sourceEnd > moment.sourceStart &&
    moment.sourceEnd <= asset.duration
  );
}

function assetNameFor(asset: BrollAsset): string {
  return asset.name;
}
