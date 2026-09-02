import { describe, expect, it } from "vitest";

import { createDemoProject } from "@/lib/demo/project";
import { createRelayLabStore } from "@/lib/editor/store";
import { registerRelayLabTools } from "@/lib/webmcp/registerRelayLabTools";
import { FakeModelContext, unwrapToolResult } from "@/tests/helpers/fakeModelContext";

interface ReplanSuccess {
  ok: true;
  preserved: string[];
  changed: Array<{ decisionId: string; oldMoment: string | null; newMoment: string | null }>;
  timelineRevision: number;
}

describe("Phase 10 replan_unlocked_sections", () => {
  it("preserves a human-locked overlay untouched", () => {
    const store = createRelayLabStore(createDemoProject());
    const overlay = store.getState().project.overlays[0];
    store.getState().setOverlayLocked(overlay.id, true);
    const revision = store.getState().project.timelineRevision;

    const result = store.getState().replanUnlockedSections({
      preserveHumanChanges: true,
      timelineRevision: revision,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected success");
    expect(result.preserved).toContain(overlay.id);
    const stillThere = store
      .getState()
      .project.overlays.find((candidate) => candidate.id === overlay.id);
    expect(stillThere).toEqual(
      store.getState().project.overlays.find((candidate) => candidate.id === overlay.id),
    );
    expect(stillThere?.momentId).toBe(overlay.momentId);
    expect(stillThere?.timelineStart).toBe(overlay.timelineStart);
    expect(stillThere?.lockedByHuman).toBe(true);
  });

  it("preserves a human-authored (unlocked) overlay untouched", () => {
    const store = createRelayLabStore(createDemoProject());
    const moment = store.getState().project.brollAssets[0].moments[0];
    store.getState().placeBrollMoment({
      momentId: moment.id,
      timelineStart: 61,
      duration: 2,
      reason: "Placed directly by the human.",
    });
    const humanOverlay = store
      .getState()
      .project.overlays.find((overlay) => overlay.createdBy === "human");
    expect(humanOverlay).toBeDefined();
    const revision = store.getState().project.timelineRevision;

    const result = store.getState().replanUnlockedSections({
      preserveHumanChanges: true,
      timelineRevision: revision,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected success");
    expect(result.preserved).toContain(humanOverlay!.id);
  });

  it("does not re-propose a moment the human just rejected for the same slot", () => {
    const store = createRelayLabStore(createDemoProject());
    const overlay = store.getState().project.overlays[0]; // agent-authored ghost, unlocked
    expect(overlay.createdBy).toBe("agent");
    expect(overlay.lockedByHuman).toBe(false);
    const rejectedMomentId = overlay.momentId;

    // Human rejects (removes) the agent's proposal.
    const removal = store.getState().removeOverlayProposal(overlay.id);
    expect(removal.ok).toBe(true);
    expect(
      store.getState().project.humanPreferences.some(
        (preference) => preference.type === "rejected-moment" && preference.momentId === rejectedMomentId,
      ),
    ).toBe(true);

    // Re-propose an overlay in the same slot from the agent, backed by the
    // same source moment id, so a naive replan would swap right back to it.
    const proposal = store.getState().proposeOverlay({
      momentId: rejectedMomentId!,
      timelineStart: overlay.timelineStart,
      duration: overlay.timelineEnd - overlay.timelineStart,
      reason: "Agent re-proposes into the same slot after human rejection.",
    });
    expect(proposal.ok).toBe(true);
    const revision = store.getState().project.timelineRevision;

    const result = store.getState().replanUnlockedSections({
      preserveHumanChanges: true,
      timelineRevision: revision,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected success");
    // The rejected moment must never appear as a newMoment in any change.
    expect(result.changed.every((change) => change.newMoment !== rejectedMomentId)).toBe(true);
  });

  it("reports a no-op success with an empty diff when nothing is replannable", () => {
    const store = createRelayLabStore(createDemoProject());
    store.getState().project.overlays.forEach((overlay) => {
      store.getState().setOverlayLocked(overlay.id, true);
    });
    const revision = store.getState().project.timelineRevision;

    const result = store.getState().replanUnlockedSections({
      preserveHumanChanges: true,
      timelineRevision: revision,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected success");
    expect(result.changed).toEqual([]);
    expect(result.timelineRevision).toBe(revision);
  });

  it("rejects while the project is not in planning status", () => {
    const store = createRelayLabStore(createDemoProject());
    const revision = store.getState().project.timelineRevision;
    const approval = store.getState().approvePlan();
    expect(approval.ok).toBe(true);

    const result = store.getState().replanUnlockedSections({
      preserveHumanChanges: true,
      timelineRevision: revision,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.code).toBe("INVALID_PROJECT_STATE");
  });

  it("is exposed only as a planning-only WebMCP tool", async () => {
    const store = createRelayLabStore(createDemoProject());
    const modelContext = new FakeModelContext();
    const registration = registerRelayLabTools(modelContext, store);
    await registration.ready;

    expect(registration.getActiveNames()).toContain("replan_unlocked_sections");

    const revision = store.getState().project.timelineRevision;
    store.getState().approvePlan();
    await registration.whenIdle();

    expect(registration.getActiveNames()).not.toContain("replan_unlocked_sections");
    expect(registration.getActiveNames()).toContain("commit_approved_plan");
    void revision;
    registration.abort();
  });

  it("end-to-end through the WebMCP tool: preserves locks and skips rejected moments", async () => {
    const store = createRelayLabStore(createDemoProject());
    const modelContext = new FakeModelContext();
    const registration = registerRelayLabTools(modelContext, store);
    await registration.ready;

    const lockedOverlay = store.getState().project.overlays[0];
    store.getState().setOverlayLocked(lockedOverlay.id, true);

    const timeline = unwrapToolResult<{ timelineRevision: number }>(
      await modelContext.invoke("get_timeline"),
    );

    const raw = await modelContext.invoke("replan_unlocked_sections", {
      preserveHumanChanges: true,
      timelineRevision: timeline.timelineRevision,
    });
    const result = unwrapToolResult<ReplanSuccess>(raw);

    expect(result.ok).toBe(true);
    expect(result.preserved).toContain(lockedOverlay.id);

    registration.abort();
  });
});
