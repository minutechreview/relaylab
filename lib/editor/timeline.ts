import type {
  BrollAsset,
  BrollMoment,
  Overlay,
  Project,
  ProposeOverlayInput,
  UpdateOverlayPatch,
} from "./types";

export const MIN_OVERLAY_DURATION = 0.5;
const PRECISION = 1000;

export function roundTime(value: number): number {
  return Math.round(value * PRECISION) / PRECISION;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function findMoment(
  project: Project,
  momentId: string,
): { asset: BrollAsset; moment: BrollMoment } | null {
  for (const asset of project.brollAssets) {
    const moment = asset.moments.find((candidate) => candidate.id === momentId);
    if (moment) {
      return { asset, moment };
    }
  }

  return null;
}

export function createOverlayFromProposal(
  project: Project,
  input: ProposeOverlayInput,
  id: string,
  createdBy: Overlay["createdBy"] = "agent",
): Overlay | null {
  const match = findMoment(project, input.momentId);
  if (!match) {
    return null;
  }

  const momentDuration = match.moment.sourceEnd - match.moment.sourceStart;
  const availableDuration = Math.min(momentDuration, project.duration);
  const duration = roundTime(
    clamp(input.duration, Math.min(MIN_OVERLAY_DURATION, availableDuration), availableDuration),
  );
  const timelineStart = roundTime(
    clamp(input.timelineStart, 0, Math.max(0, project.duration - duration)),
  );
  const sourceStart = roundTime(match.moment.sourceStart);

  return {
    id,
    assetId: match.asset.id,
    momentId: match.moment.id,
    sourceStart,
    sourceEnd: roundTime(sourceStart + duration),
    timelineStart,
    timelineEnd: roundTime(timelineStart + duration),
    status: "ghost",
    lockedByHuman: false,
    reason: input.reason.trim(),
    createdBy,
  };
}

export function moveOverlayGeometry(
  overlay: Overlay,
  requestedStart: number,
  projectDuration: number,
): Overlay {
  const duration = overlay.timelineEnd - overlay.timelineStart;
  const timelineStart = roundTime(
    clamp(requestedStart, 0, Math.max(0, projectDuration - duration)),
  );

  return {
    ...overlay,
    timelineStart,
    timelineEnd: roundTime(timelineStart + duration),
  };
}

export function resizeOverlayStartGeometry(
  overlay: Overlay,
  requestedStart: number,
): Overlay {
  const earliestFromSource = overlay.timelineStart - overlay.sourceStart;
  const minStart = Math.max(0, earliestFromSource);
  const maxStart = overlay.timelineEnd - MIN_OVERLAY_DURATION;
  const timelineStart = roundTime(clamp(requestedStart, minStart, maxStart));
  const delta = timelineStart - overlay.timelineStart;

  return {
    ...overlay,
    timelineStart,
    sourceStart: roundTime(overlay.sourceStart + delta),
  };
}

export function resizeOverlayEndGeometry(
  overlay: Overlay,
  requestedEnd: number,
  projectDuration: number,
  sourceDuration: number,
): Overlay {
  const availableSourceTail = sourceDuration - overlay.sourceEnd;
  const maxEnd = Math.min(
    projectDuration,
    overlay.timelineEnd + Math.max(0, availableSourceTail),
  );
  const minEnd = overlay.timelineStart + MIN_OVERLAY_DURATION;
  const timelineEnd = roundTime(clamp(requestedEnd, minEnd, Math.max(minEnd, maxEnd)));
  const delta = timelineEnd - overlay.timelineEnd;

  return {
    ...overlay,
    timelineEnd,
    sourceEnd: roundTime(overlay.sourceEnd + delta),
  };
}

export function updateOverlaySourceGeometry(
  overlay: Overlay,
  patch: Pick<UpdateOverlayPatch, "duration" | "sourceStart" | "sourceEnd">,
  projectDuration: number,
  sourceDuration: number,
): Overlay {
  const currentDuration = overlay.sourceEnd - overlay.sourceStart;
  let sourceStart = patch.sourceStart ?? overlay.sourceStart;
  let sourceEnd = patch.sourceEnd ?? overlay.sourceEnd;

  if (patch.sourceStart !== undefined && patch.sourceEnd === undefined) {
    sourceEnd = sourceStart + (patch.duration ?? currentDuration);
  } else if (patch.sourceEnd !== undefined && patch.sourceStart === undefined) {
    sourceStart = sourceEnd - (patch.duration ?? currentDuration);
  } else if (
    patch.sourceStart === undefined &&
    patch.sourceEnd === undefined &&
    patch.duration !== undefined
  ) {
    sourceEnd = sourceStart + patch.duration;
  }

  const maximumSourceStart = Math.max(0, sourceDuration - MIN_OVERLAY_DURATION);
  sourceStart = roundTime(clamp(sourceStart, 0, maximumSourceStart));
  sourceEnd = roundTime(
    clamp(
      sourceEnd,
      sourceStart + MIN_OVERLAY_DURATION,
      Math.max(sourceStart + MIN_OVERLAY_DURATION, sourceDuration),
    ),
  );

  const sourceRangeDuration = sourceEnd - sourceStart;
  const availableTimeline = projectDuration - overlay.timelineStart;
  const duration = roundTime(
    clamp(
      sourceRangeDuration,
      Math.min(MIN_OVERLAY_DURATION, availableTimeline),
      availableTimeline,
    ),
  );

  return {
    ...overlay,
    sourceStart,
    sourceEnd: roundTime(sourceStart + duration),
    timelineEnd: roundTime(overlay.timelineStart + duration),
  };
}

export function swapOverlayMomentGeometry(
  overlay: Overlay,
  asset: BrollAsset,
  moment: BrollMoment,
  projectDuration: number,
): Overlay {
  const currentDuration = overlay.timelineEnd - overlay.timelineStart;
  const momentDuration = moment.sourceEnd - moment.sourceStart;
  const availableTimeline = projectDuration - overlay.timelineStart;
  const duration = roundTime(
    Math.min(currentDuration, momentDuration, availableTimeline),
  );

  return {
    ...overlay,
    assetId: asset.id,
    momentId: moment.id,
    sourceStart: roundTime(moment.sourceStart),
    sourceEnd: roundTime(moment.sourceStart + duration),
    timelineEnd: roundTime(overlay.timelineStart + duration),
  };
}

export function timelineTimeToSourceTime(
  overlay: Overlay,
  timelineTime: number,
): number | null {
  if (timelineTime < overlay.timelineStart || timelineTime > overlay.timelineEnd) {
    return null;
  }

  return roundTime(overlay.sourceStart + (timelineTime - overlay.timelineStart));
}
