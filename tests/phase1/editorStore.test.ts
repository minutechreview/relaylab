import { describe, expect, it } from "vitest";

import { createDemoProject } from "@/lib/demo/project";
import { createRelayLabStore } from "@/lib/editor/store";
import { timelineTimeToSourceTime } from "@/lib/editor/timeline";

const EPSILON = 0.000_001;

function firstMoment(project: ReturnType<typeof createDemoProject>) {
  const asset = project.brollAssets.find((candidate) => candidate.moments.length > 0);
  const moment = asset?.moments[0];

  if (!asset || !moment) {
    throw new Error("The deterministic demo project must contain a B-roll moment.");
  }

  return { asset, moment };
}

describe("Phase 1 editor state", () => {
  it("creates an agent-authored ghost overlay from a source-reel moment", () => {
    const project = createDemoProject();
    const { asset, moment } = firstMoment(project);
    const store = createRelayLabStore(project);
    const requestedDuration = Math.min(4, moment.sourceEnd - moment.sourceStart);
    const initialIds = new Set(
      store.getState().getTimeline().overlays.map(({ id }) => id),
    );

    store.getState().proposeOverlay({
      momentId: moment.id,
      timelineStart: 8,
      duration: requestedDuration,
      reason: "Show the concrete example being discussed.",
    });

    const timeline = store.getState().getTimeline();
    const added = timeline.overlays.find(({ id }) => !initialIds.has(id));

    expect(timeline.overlays).toHaveLength(initialIds.size + 1);
    expect(added).toMatchObject({
      assetId: asset.id,
      momentId: moment.id,
      sourceStart: moment.sourceStart,
      sourceEnd: moment.sourceStart + requestedDuration,
      timelineStart: 8,
      timelineEnd: 8 + requestedDuration,
      status: "ghost",
      lockedByHuman: false,
      createdBy: "agent",
      reason: "Show the concrete example being discussed.",
    });
  });

  it("persists a human move and resize in the next timeline read", () => {
    const project = createDemoProject();
    const { moment } = firstMoment(project);
    const store = createRelayLabStore(project);
    const sourceDuration = moment.sourceEnd - moment.sourceStart;
    const initialDuration = Math.min(5, sourceDuration);
    const initialIds = new Set(
      store.getState().getTimeline().overlays.map(({ id }) => id),
    );

    store.getState().proposeOverlay({
      momentId: moment.id,
      timelineStart: 10,
      duration: initialDuration,
      reason: "Pacing support.",
    });

    const proposed = store
      .getState()
      .getTimeline()
      .overlays.find(({ id }) => !initialIds.has(id));

    expect(proposed).toBeDefined();
    if (!proposed) return;

    const resizedDuration = Math.min(3, sourceDuration);
    const humanTimelineStart = Math.min(18, project.duration - resizedDuration);
    const humanTimelineEnd = humanTimelineStart + resizedDuration;

    store.getState().updateOverlay(proposed.id, {
      timelineStart: humanTimelineStart,
      duration: resizedDuration,
    });

    const reread = store.getState().getTimeline();
    expect(reread.overlays).toHaveLength(initialIds.size + 1);
    expect(reread.overlays.find(({ id }) => id === proposed.id)).toMatchObject({
      id: proposed.id,
      timelineStart: humanTimelineStart,
      timelineEnd: humanTimelineEnd,
      sourceStart: moment.sourceStart,
      sourceEnd: moment.sourceStart + resizedDuration,
      status: "ghost",
      createdBy: "agent",
    });
  });

  it("clamps a proposal to both project time and the selected source moment", () => {
    const project = createDemoProject();
    const { moment } = firstMoment(project);
    const store = createRelayLabStore(project);
    const momentDuration = moment.sourceEnd - moment.sourceStart;
    const requestedDuration = momentDuration + project.duration + 10;
    const initialIds = new Set(
      store.getState().getTimeline().overlays.map(({ id }) => id),
    );

    store.getState().proposeOverlay({
      momentId: moment.id,
      timelineStart: project.duration - 1,
      duration: requestedDuration,
      reason: "Boundary test.",
    });

    const overlay = store
      .getState()
      .getTimeline()
      .overlays.find(({ id }) => !initialIds.has(id));

    expect(overlay).toBeDefined();
    if (!overlay) return;

    const timelineDuration = overlay.timelineEnd - overlay.timelineStart;
    const resultingSourceDuration = overlay.sourceEnd - overlay.sourceStart;

    expect(overlay.timelineStart).toBeGreaterThanOrEqual(0);
    expect(overlay.timelineEnd).toBeLessThanOrEqual(project.duration);
    expect(overlay.timelineEnd).toBeGreaterThan(overlay.timelineStart);
    expect(overlay.sourceStart).toBeGreaterThanOrEqual(moment.sourceStart);
    expect(overlay.sourceEnd).toBeLessThanOrEqual(moment.sourceEnd);
    expect(overlay.sourceEnd).toBeGreaterThan(overlay.sourceStart);
    expect(timelineDuration).toBeLessThanOrEqual(requestedDuration);
    expect(resultingSourceDuration).toBeLessThanOrEqual(momentDuration);
    expect(Math.abs(timelineDuration - resultingSourceDuration)).toBeLessThan(
      EPSILON,
    );
  });

  it("clamps a negative timeline start to the beginning of the base video", () => {
    const project = createDemoProject();
    const { moment } = firstMoment(project);
    const store = createRelayLabStore(project);
    const initialIds = new Set(
      store.getState().getTimeline().overlays.map(({ id }) => id),
    );
    const duration = Math.min(2, moment.sourceEnd - moment.sourceStart);

    store.getState().proposeOverlay({
      momentId: moment.id,
      timelineStart: -20,
      duration,
      reason: "Lower boundary test.",
    });

    const overlay = store
      .getState()
      .getTimeline()
      .overlays.find(({ id }) => !initialIds.has(id));

    expect(overlay).toMatchObject({
      timelineStart: 0,
      timelineEnd: duration,
      sourceStart: moment.sourceStart,
      sourceEnd: moment.sourceStart + duration,
    });
  });

  it("keeps source and timeline coordinates independent when a block moves", () => {
    const project = createDemoProject();
    const { moment } = firstMoment(project);
    const store = createRelayLabStore(project);
    const duration = Math.min(3, moment.sourceEnd - moment.sourceStart);
    const initialIds = new Set(
      store.getState().getTimeline().overlays.map(({ id }) => id),
    );

    store.getState().proposeOverlay({
      momentId: moment.id,
      timelineStart: 4,
      duration,
      reason: "Coordinate separation test.",
    });

    const before = store
      .getState()
      .getTimeline()
      .overlays.find(({ id }) => !initialIds.has(id));

    expect(before).toBeDefined();
    if (!before) return;

    const movedStart = Math.min(24, project.duration - duration);

    store.getState().updateOverlay(before.id, { timelineStart: movedStart });

    const after = store
      .getState()
      .getTimeline()
      .overlays.find(({ id }) => id === before.id);

    expect(after).toBeDefined();
    if (!after) return;

    expect(after.timelineStart).toBe(movedStart);
    expect(after.timelineEnd).toBe(movedStart + duration);
    expect(after.sourceStart).toBe(before.sourceStart);
    expect(after.sourceEnd).toBe(before.sourceEnd);
  });

  it("maps base-timeline time to the corresponding source-reel time", () => {
    const project = createDemoProject();
    const { moment } = firstMoment(project);
    const store = createRelayLabStore(project);
    const initialIds = new Set(
      store.getState().getTimeline().overlays.map(({ id }) => id),
    );
    const duration = Math.min(4, moment.sourceEnd - moment.sourceStart);

    store.getState().proposeOverlay({
      momentId: moment.id,
      timelineStart: 22,
      duration,
      reason: "Source mapping test.",
    });

    const overlay = store
      .getState()
      .getTimeline()
      .overlays.find(({ id }) => !initialIds.has(id));

    expect(overlay).toBeDefined();
    if (!overlay) return;

    expect(timelineTimeToSourceTime(overlay, 22)).toBe(moment.sourceStart);
    expect(timelineTimeToSourceTime(overlay, 23.5)).toBe(
      moment.sourceStart + 1.5,
    );
    expect(timelineTimeToSourceTime(overlay, 21.999)).toBeNull();
    expect(timelineTimeToSourceTime(overlay, 22 + duration + 0.001)).toBeNull();
  });
});
