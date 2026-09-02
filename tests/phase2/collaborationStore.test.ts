import { describe, expect, it } from "vitest";

import { createDemoProject } from "@/lib/demo/project";
import { createRelayLabStore } from "@/lib/editor/store";

function expectFailureCode(result: unknown, code: string) {
  expect(result).toMatchObject({ ok: false, code });
}

describe("Phase 2 human collaboration state", () => {
  it("lets the human lock and unlock an overlay and exposes that state", () => {
    const store = createRelayLabStore(createDemoProject());
    const overlayId = store.getState().getTimeline().overlays[0].id;

    store.getState().setOverlayLocked(overlayId, true);
    expect(
      store
        .getState()
        .getTimeline()
        .overlays.find(({ id }) => id === overlayId),
    ).toMatchObject({ id: overlayId, lockedByHuman: true });

    store.getState().setOverlayLocked(overlayId, false);
    expect(
      store
        .getState()
        .getTimeline()
        .overlays.find(({ id }) => id === overlayId),
    ).toMatchObject({ id: overlayId, lockedByHuman: false });
  });

  it("rejects agent update and removal of a human-locked proposal", () => {
    const store = createRelayLabStore(createDemoProject());
    const overlay = store.getState().getTimeline().overlays[0];
    store.getState().setOverlayLocked(overlay.id, true);
    const before = store.getState().getTimeline();

    const updateResult = store.getState().updateOverlay(overlay.id, {
      timelineStart: overlay.timelineStart + 3,
      duration: 2,
      reason: "Agent attempted to override a human lock.",
    });
    const removeResult = store.getState().removeOverlayProposal(overlay.id);

    expectFailureCode(updateResult, "HUMAN_LOCKED");
    expectFailureCode(removeResult, "HUMAN_LOCKED");
    expect(store.getState().getTimeline()).toEqual(before);
  });

  it("allows an unlocked proposal to be swapped and removed by the human", () => {
    const project = createDemoProject();
    const store = createRelayLabStore(project);
    const overlay = store.getState().getTimeline().overlays[0];
    const replacement = project.brollAssets
      .flatMap((asset) => asset.moments)
      .find(({ id }) => id !== overlay.momentId);

    expect(replacement).toBeDefined();
    if (!replacement) return;

    store.getState().setOverlayLocked(overlay.id, true);
    store.getState().setOverlayLocked(overlay.id, false);
    const swapResult = store
      .getState()
      .swapOverlayMoment(overlay.id, replacement.id);
    const swapped = store
      .getState()
      .getTimeline()
      .overlays.find(({ id }) => id === overlay.id);

    expect(swapResult).toMatchObject({ ok: true, overlayId: overlay.id });
    expect(swapped).toMatchObject({
      id: overlay.id,
      assetId: replacement.assetId,
      momentId: replacement.id,
      sourceStart: replacement.sourceStart,
      timelineStart: overlay.timelineStart,
      lockedByHuman: false,
      status: "ghost",
    });
    expect(store.getState().getTimeline().brollTrack.audioPolicy).toBe("muted");

    expect(store.getState().removeOverlayProposal(overlay.id)).toMatchObject({
      ok: true,
      overlayId: overlay.id,
    });
    expect(
      store.getState().getTimeline().overlays.some(({ id }) => id === overlay.id),
    ).toBe(false);
  });

  it("requires human approval before commit and freezes plan mutations afterward", () => {
    const project = createDemoProject();
    const store = createRelayLabStore(project);
    const initialOverlay = store.getState().getTimeline().overlays[0];
    const moment = project.brollAssets[0].moments[1];

    expectFailureCode(
      store.getState().commitApprovedPlan(),
      "INVALID_PROJECT_STATE",
    );
    expect(store.getState().project.status).toBe("planning");

    store.getState().approvePlan();
    expect(store.getState().project.status).toBe("approved");
    const approvedSnapshot = store.getState().getTimeline();

    const proposalResult = store.getState().proposeOverlay({
      momentId: moment.id,
      timelineStart: 35,
      duration: 3,
      reason: "Must be rejected after approval.",
    });
    const updateResult = store
      .getState()
      .updateOverlay(initialOverlay.id, { timelineStart: 4 });
    const removeResult = store
      .getState()
      .removeOverlayProposal(initialOverlay.id);

    expect(proposalResult).toMatchObject({ ok: false });
    expect(updateResult).toMatchObject({ ok: false });
    expect(removeResult).toMatchObject({ ok: false });
    expect(store.getState().getTimeline()).toEqual(approvedSnapshot);
  });

  it("commits every approved ghost without losing human edits or locks", () => {
    const project = createDemoProject();
    const store = createRelayLabStore(project);
    const firstId = store.getState().getTimeline().overlays[0].id;
    const secondMoment = project.brollAssets[0].moments[1];

    store.getState().updateOverlay(firstId, {
      timelineStart: 16.5,
      duration: 4.25,
      reason: "Human-adjusted first proposal.",
    });
    store.getState().setOverlayLocked(firstId, true);
    const secondProposal = store.getState().proposeOverlay({
      momentId: secondMoment.id,
      timelineStart: 42.25,
      duration: 3.5,
      reason: "Second approved proposal.",
    });
    expect(secondProposal).toMatchObject({ ok: true });

    const beforeApproval = store.getState().getTimeline().overlays.map((overlay) => ({
      ...overlay,
    }));
    store.getState().approvePlan();
    const commitResult = store.getState().commitApprovedPlan();
    const committed = store.getState().getTimeline();

    expect(commitResult).toMatchObject({ ok: true });
    expect(committed.projectStatus).toBe("committed");
    expect(committed.brollTrack.audioPolicy).toBe("muted");
    expect(committed.overlays).toHaveLength(beforeApproval.length);

    committed.overlays.forEach((overlay) => {
      const before = beforeApproval.find(({ id }) => id === overlay.id);
      expect(before).toBeDefined();
      expect(overlay).toMatchObject({
        id: before?.id,
        assetId: before?.assetId,
        momentId: before?.momentId,
        sourceStart: before?.sourceStart,
        sourceEnd: before?.sourceEnd,
        timelineStart: before?.timelineStart,
        timelineEnd: before?.timelineEnd,
        lockedByHuman: before?.lockedByHuman,
        reason: before?.reason,
        createdBy: before?.createdBy,
        status: "committed",
      });
    });
  });
});
