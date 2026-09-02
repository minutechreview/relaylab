import { searchBroll } from "./brollSearch";
import type { Overlay, Project } from "./types";

/**
 * replan_unlocked_sections is the hero WebMCP tool: it re-reads the shared
 * timeline, preserves every human lock and human-authored overlay exactly as
 * the human left it, remembers previously-rejected moments so it does not
 * immediately re-propose them, and updates only unlocked agent ghost
 * overlays whose underlying B-roll moment is no longer the best available
 * match. It never invents new timeline slots beyond what
 * find_overlay_opportunities already reports uncovered, and it never
 * touches locked or committed overlays.
 */

export interface ReplanInput {
  objective?: string;
}

export interface ReplanChangeInternal {
  decisionId: string;
  oldMoment: string | null;
  newMoment: string | null;
  reason: string;
}

export interface ReplanOutcome {
  /** Reference-equal to the input overlays array when nothing changed. */
  overlays: Overlay[];
  preserved: string[];
  changed: ReplanChangeInternal[];
}

const IMPROVEMENT_MARGIN = 0.1;

function isReplannable(overlay: Overlay): boolean {
  return overlay.status === "ghost" && !overlay.lockedByHuman && overlay.createdBy === "agent";
}

function rejectedMomentIds(project: Project): Set<string> {
  return new Set(
    project.humanPreferences
      .filter((preference) => preference.type === "rejected-moment")
      .map((preference) => preference.momentId),
  );
}

export function replanUnlockedSections(project: Project, input: ReplanInput): ReplanOutcome {
  const rejected = rejectedMomentIds(project);
  const preserved: string[] = [];
  const changed: ReplanChangeInternal[] = [];
  let anyChange = false;

  const nextOverlays = project.overlays.map((overlay) => {
    if (!isReplannable(overlay)) {
      preserved.push(overlay.id);
      return overlay;
    }

    const duration = overlay.timelineEnd - overlay.timelineStart;
    const transcriptContext = project.transcript
      .filter((segment) => segment.end > overlay.timelineStart && segment.start < overlay.timelineEnd)
      .map((segment) => segment.text.trim())
      .filter(Boolean)
      .join(" ");
    const query = input.objective?.trim() || overlay.reason || transcriptContext;
    if (!query) {
      preserved.push(overlay.id);
      return overlay;
    }

    const candidates = searchBroll(project, { query, targetDuration: duration, limit: 5 }).filter(
      (candidate) => !rejected.has(candidate.momentId) && candidate.momentId !== overlay.momentId,
    );
    const bestCandidate = candidates.at(0);
    const currentScore =
      searchBroll(project, { query, targetDuration: duration, limit: 50 }).find(
        (candidate) => candidate.momentId === overlay.momentId,
      )?.score ?? 0;

    if (!bestCandidate || bestCandidate.score <= currentScore + IMPROVEMENT_MARGIN) {
      preserved.push(overlay.id);
      return overlay;
    }

    anyChange = true;
    changed.push({
      decisionId: overlay.id,
      oldMoment: overlay.momentId ?? null,
      newMoment: bestCandidate.momentId,
      reason: `Found a stronger uploaded match ("${bestCandidate.description}", score ${bestCandidate.score.toFixed(2)}) than the current source moment (score ${currentScore.toFixed(2)}).`,
    });

    const availableDuration = bestCandidate.sourceEnd - bestCandidate.sourceStart;
    const clampedDuration = Math.min(duration, availableDuration);
    return {
      ...overlay,
      assetId: bestCandidate.assetId,
      momentId: bestCandidate.momentId,
      sourceStart: bestCandidate.sourceStart,
      sourceEnd: bestCandidate.sourceStart + clampedDuration,
      timelineEnd: overlay.timelineStart + clampedDuration,
      alternatives: candidates.slice(0, 3).map((candidate) => ({
        momentId: candidate.momentId,
        assetId: candidate.assetId,
        assetName: candidate.assetName,
        score: candidate.score,
        description: candidate.description,
      })),
    };
  });

  return {
    overlays: anyChange ? nextOverlays : project.overlays,
    preserved,
    changed,
  };
}

/**
 * Remaining uncovered pacing gaps / semantic cues are surfaced separately by
 * find_overlay_opportunities (already read-only and reusable as-is). Filling
 * them remains an explicit propose_overlay/propose_generated_broll call by
 * the agent rather than something replan does implicitly, so a replan can
 * never silently grow the number of overlays on the timeline.
 */
