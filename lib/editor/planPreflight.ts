import type { PlanPreflight, PlanPreflightIssue, Project } from "./types";

const RANGE_EPSILON_SECONDS = 0.002;

function invalidOverlayIssue(
  overlayId: string,
  message: string,
): PlanPreflightIssue {
  return {
    code: "INVALID_OVERLAY",
    severity: "blocking",
    message,
    overlayIds: [overlayId],
  };
}

export function getPlanPreflight(project: Project): PlanPreflight {
  const issues: PlanPreflightIssue[] = [];

  if (project.duration <= 0 || project.baseVideo.duration <= 0) {
    issues.push({
      code: "MISSING_BASE",
      severity: "blocking",
      message: "Upload a base video before approving the plan.",
    });
  }

  const assetsById = new Map(project.brollAssets.map((asset) => [asset.id, asset]));
  const sortedOverlays = [...project.overlays].sort(
    (left, right) => left.timelineStart - right.timelineStart || left.timelineEnd - right.timelineEnd,
  );

  for (const overlay of sortedOverlays) {
    const asset = assetsById.get(overlay.assetId);
    if (!asset) {
      issues.push(
        invalidOverlayIssue(
          overlay.id,
          `Overlay ${overlay.id} references a missing B-roll source.`,
        ),
      );
      continue;
    }

    const times = [
      overlay.sourceStart,
      overlay.sourceEnd,
      overlay.timelineStart,
      overlay.timelineEnd,
    ];
    const invalidRange =
      times.some((time) => !Number.isFinite(time)) ||
      overlay.sourceStart < 0 ||
      overlay.sourceEnd <= overlay.sourceStart ||
      overlay.sourceEnd - asset.duration > RANGE_EPSILON_SECONDS ||
      overlay.timelineStart < 0 ||
      overlay.timelineEnd <= overlay.timelineStart ||
      overlay.timelineEnd - project.duration > RANGE_EPSILON_SECONDS ||
      Math.abs(
        overlay.sourceEnd -
          overlay.sourceStart -
          (overlay.timelineEnd - overlay.timelineStart),
      ) > RANGE_EPSILON_SECONDS;

    if (invalidRange) {
      issues.push(
        invalidOverlayIssue(
          overlay.id,
          `Overlay ${overlay.id} has an invalid source or timeline range.`,
        ),
      );
    }
  }

  for (let leftIndex = 0; leftIndex < sortedOverlays.length; leftIndex += 1) {
    const left = sortedOverlays[leftIndex];
    for (let rightIndex = leftIndex + 1; rightIndex < sortedOverlays.length; rightIndex += 1) {
      const right = sortedOverlays[rightIndex];
      if (right.timelineStart >= left.timelineEnd - RANGE_EPSILON_SECONDS) break;
      issues.push({
        code: "OVERLAPPING_OVERLAYS",
        severity: "warning",
        message: "Two B-roll blocks overlap on the single overlay track.",
        overlayIds: [left.id, right.id],
      });
    }
  }

  if (project.transcript.length === 0 && project.duration > 0) {
    issues.push({
      code: "MISSING_TRANSCRIPT",
      severity: "info",
      message: "This base video has no transcript metadata yet.",
    });
  }

  const unresolvedSuggestionIds = project.generationSuggestions
    .filter((suggestion) => suggestion.status === "suggested")
    .map((suggestion) => suggestion.id);
  if (unresolvedSuggestionIds.length > 0) {
    issues.push({
      code: "UNRESOLVED_GENERATION",
      severity: "info",
      message: `${unresolvedSuggestionIds.length} generation suggestion${unresolvedSuggestionIds.length === 1 ? " remains" : "s remain"} unresolved and will not generate during approval.`,
      suggestionIds: unresolvedSuggestionIds,
    });
  }

  const failedSuggestionIds = project.generationSuggestions
    .filter((suggestion) => suggestion.status === "failed")
    .map((suggestion) => suggestion.id);
  if (failedSuggestionIds.length > 0) {
    issues.push({
      code: "FAILED_GENERATION",
      severity: "warning",
      message: `${failedSuggestionIds.length} generation suggestion${failedSuggestionIds.length === 1 ? " has" : "s have"} failed and needs attention.`,
      suggestionIds: failedSuggestionIds,
    });
  }

  const generatingSuggestionIds = project.generationSuggestions
    .filter((suggestion) => suggestion.status === "generating")
    .map((suggestion) => suggestion.id);
  if (generatingSuggestionIds.length > 0) {
    issues.push({
      code: "GENERATION_IN_FLIGHT",
      severity: "blocking",
      message: "Wait for the human-started generation request to finish or fail.",
      suggestionIds: generatingSuggestionIds,
    });
  }

  const blockingCount = issues.filter((issue) => issue.severity === "blocking").length;
  const warningCount = issues.filter((issue) => issue.severity === "warning").length;
  const infoCount = issues.filter((issue) => issue.severity === "info").length;

  return {
    status: blockingCount > 0 ? "blocked" : warningCount > 0 ? "warnings" : "ready",
    blockingCount,
    warningCount,
    infoCount,
    issues,
  };
}
