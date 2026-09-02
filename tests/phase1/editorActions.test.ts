import { describe, expect, it } from "vitest";

import { createDemoProject } from "@/lib/demo/project";
import {
  BASE_AUDIO_POLICY,
  BROLL_AUDIO_POLICY,
  isBrollAudioMuted,
} from "@/lib/editor/audioPolicy";
import { createRelayLabStore } from "@/lib/editor/store";

describe("editor action guards", () => {
  it("defines base audio as master and B-roll audio as always muted", () => {
    expect(BASE_AUDIO_POLICY).toBe("master");
    expect(BROLL_AUDIO_POLICY).toBe("muted");
    expect(isBrollAudioMuted()).toBe(true);
  });

  it("rejects an unknown source moment without mutating the project", () => {
    const store = createRelayLabStore(createDemoProject());
    const before = store.getState().getTimeline();

    const result = store.getState().proposeOverlay({
      momentId: "moment_missing",
      timelineStart: 5,
      duration: 3,
      reason: "Should not be created.",
    });

    expect(result).toEqual({
      ok: false,
      code: "MOMENT_NOT_FOUND",
      message: "B-roll moment moment_missing does not exist.",
    });
    expect(store.getState().getTimeline()).toEqual(before);
  });

  it("returns structured failures for missing and human-locked overlays", () => {
    const project = createDemoProject();
    project.overlays[0].lockedByHuman = true;
    const store = createRelayLabStore(project);
    const lockedBefore = store.getState().getTimeline().overlays[0];

    expect(
      store.getState().updateOverlay("ov_missing", { timelineStart: 1 }),
    ).toMatchObject({ ok: false, code: "OVERLAY_NOT_FOUND" });
    expect(
      store
        .getState()
        .updateOverlay(lockedBefore.id, { timelineStart: 1, duration: 2 }),
    ).toEqual({
      ok: false,
      code: "HUMAN_LOCKED",
      message: `Overlay ${lockedBefore.id} is locked by the user and cannot be modified.`,
    });
    expect(store.getState().getTimeline().overlays[0]).toEqual(lockedBefore);
  });

  it("supports direct human move and edge-resize actions with safe geometry", () => {
    const store = createRelayLabStore(createDemoProject());
    const initial = store.getState().getTimeline().overlays[0];
    const initialDuration = initial.timelineEnd - initial.timelineStart;

    expect(store.getState().moveOverlay(initial.id, -10)).toBe(true);
    const moved = store.getState().getTimeline().overlays[0];
    expect(moved).toMatchObject({
      timelineStart: 0,
      sourceStart: initial.sourceStart,
      sourceEnd: initial.sourceEnd,
    });
    expect(moved.timelineEnd).toBeCloseTo(initialDuration);

    expect(store.getState().resizeOverlayStart(initial.id, 1)).toBe(true);
    const startResized = store.getState().getTimeline().overlays[0];
    expect(startResized.timelineStart).toBe(1);
    expect(startResized.timelineEnd).toBeCloseTo(initialDuration);
    expect(startResized.sourceStart).toBe(initial.sourceStart + 1);
    expect(startResized.sourceEnd).toBe(initial.sourceEnd);

    expect(store.getState().resizeOverlayEnd(initial.id, initialDuration + 2)).toBe(
      true,
    );
    const endResized = store.getState().getTimeline().overlays[0];
    expect(endResized.timelineEnd).toBeCloseTo(initialDuration + 2);
    expect(endResized.sourceEnd).toBe(initial.sourceEnd + 2);

    expect(store.getState().moveOverlay("ov_missing", 4)).toBe(false);
    expect(store.getState().resizeOverlayStart("ov_missing", 4)).toBe(false);
    expect(store.getState().resizeOverlayEnd("ov_missing", 4)).toBe(false);
  });

  it("trims a human-edited reason and generates a collision-free stable id", () => {
    const project = createDemoProject();
    project.overlays.push({
      ...project.overlays[0],
      id: "ov_agent_3",
      timelineStart: 30,
      timelineEnd: 35.8,
    });
    const store = createRelayLabStore(project);
    const moment = project.brollAssets[0].moments[0];

    const proposal = store.getState().proposeOverlay({
      momentId: moment.id,
      timelineStart: 40,
      duration: 2,
      reason: " Initial reason. ",
    });

    expect(proposal).toMatchObject({ ok: true, overlayId: "ov_agent_4" });
    if (!proposal.ok) return;

    store
      .getState()
      .updateOverlay(proposal.overlayId, { reason: "  Human wording.  " });
    const overlay = store
      .getState()
      .getTimeline()
      .overlays.find(({ id }) => id === proposal.overlayId);

    expect(overlay?.reason).toBe("Human wording.");
  });

  it("clamps a combined move and resize against the new duration", () => {
    const project = createDemoProject();
    const store = createRelayLabStore(project);
    const overlay = store.getState().getTimeline().overlays[0];

    const result = store.getState().updateOverlay(overlay.id, {
      timelineStart: 82,
      duration: 2,
    });
    const updated = store
      .getState()
      .getTimeline()
      .overlays.find(({ id }) => id === overlay.id);

    expect(result).toMatchObject({ ok: true });
    expect(updated).toMatchObject({
      timelineStart: 82,
      timelineEnd: 84,
      sourceStart: overlay.sourceStart,
      sourceEnd: overlay.sourceStart + 2,
    });
  });
});
