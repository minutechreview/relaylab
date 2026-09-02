import type {
  CandidateReference,
  EditDecision,
  EditDecisionStatus,
  EditPlan,
  EditPlanStatus,
  GeneratedBrollSuggestion,
  Overlay,
  Project,
} from "./types";

/**
 * EditPlan is derived, not stored: it is always computed fresh from the live
 * overlay/generation-suggestion state so it can never drift from the
 * timeline it describes. This is the answer to "what is the agent's current
 * editorial plan," as opposed to get_timeline's "what clips are on the
 * timeline."
 */

function transcriptContextFor(project: Project, start: number, end: number): string {
  return project.transcript
    .filter((segment) => segment.end > start && segment.start < end)
    .map((segment) => segment.text.trim())
    .filter(Boolean)
    .join(" ");
}

function overlayDecisionStatus(overlay: Overlay): EditDecisionStatus {
  if (overlay.status === "committed") return "locked";
  if (overlay.lockedByHuman) return "locked";
  if (overlay.createdBy === "human") return "modified-by-human";
  return "accepted";
}

function alternativesFor(overlay: Overlay): CandidateReference[] | undefined {
  return overlay.alternatives?.map((candidate) => ({ ...candidate }));
}

function overlayToDecision(project: Project, overlay: Overlay): EditDecision {
  return {
    id: overlay.id,
    type: "uploaded-broll",
    timelineStart: overlay.timelineStart,
    timelineEnd: overlay.timelineEnd,
    transcriptContext: transcriptContextFor(project, overlay.timelineStart, overlay.timelineEnd),
    reason: overlay.reason ?? "",
    status: overlayDecisionStatus(overlay),
    createdBy: overlay.createdBy,
    assetId: overlay.assetId,
    momentId: overlay.momentId,
    alternatives: alternativesFor(overlay),
  };
}

function suggestionDecisionStatus(suggestion: GeneratedBrollSuggestion): EditDecisionStatus {
  if (suggestion.status === "generating") return "accepted";
  if (suggestion.status === "failed") return "rejected";
  return "proposed";
}

function suggestionToDecision(project: Project, suggestion: GeneratedBrollSuggestion): EditDecision {
  return {
    id: suggestion.id,
    type: "generated-broll-suggestion",
    timelineStart: suggestion.timelineStart,
    timelineEnd: suggestion.timelineEnd,
    transcriptContext: transcriptContextFor(
      project,
      suggestion.timelineStart,
      suggestion.timelineEnd,
    ),
    reason: suggestion.reason,
    status: suggestionDecisionStatus(suggestion),
    createdBy: suggestion.createdBy,
  };
}

function planStatus(project: Project): EditPlanStatus {
  if (project.status === "committed") return "committed";
  if (project.status === "approved") return "approved";
  const hasUnresolvedWork =
    project.overlays.some((overlay) => overlay.status === "ghost") ||
    project.generationSuggestions.length > 0;
  return hasUnresolvedWork ? "needs-review" : "draft";
}

export function getEditPlan(project: Project): EditPlan {
  const decisions: EditDecision[] = [
    ...project.overlays.map((overlay) => overlayToDecision(project, overlay)),
    ...project.generationSuggestions.map((suggestion) => suggestionToDecision(project, suggestion)),
  ].sort((a, b) => a.timelineStart - b.timelineStart || a.timelineEnd - b.timelineEnd);

  return {
    id: `plan_${project.id}`,
    revision: project.timelineRevision,
    createdAt: Date.now(),
    status: planStatus(project),
    pacingStyle: `max ${project.pacingPreference.maxTalkingHeadSeconds}s uninterrupted talking-head`,
    decisions,
    timelineRevisionUsed: project.timelineRevision,
  };
}
