import { describe, expect, it } from "vitest";

import { createDemoProject } from "@/lib/demo/project";
import { createRelayLabStore } from "@/lib/editor/store";
import { registerRelayLabTools } from "@/lib/webmcp/registerRelayLabTools";
import {
  FakeModelContext,
  unwrapToolResult,
} from "@/tests/helpers/fakeModelContext";

interface EditPlanResult {
  id: string;
  revision: number;
  status: string;
  decisions: Array<{
    id: string;
    type: string;
    status: string;
    timelineStart: number;
    timelineEnd: number;
    reason: string;
    createdBy: string;
  }>;
  timelineRevisionUsed: number;
}

describe("Phase 10 EditPlan", () => {
  it("registers get_edit_plan as an always-available read tool", async () => {
    const store = createRelayLabStore(createDemoProject());
    const modelContext = new FakeModelContext();
    const registration = registerRelayLabTools(modelContext, store);
    await registration.ready;

    expect(registration.getActiveNames()).toContain("get_edit_plan");
    expect(modelContext.registeredToolNames).toContain("get_edit_plan");

    registration.abort();
  });

  it("derives one decision per overlay and generation suggestion, sorted by timeline order", () => {
    const store = createRelayLabStore(createDemoProject());
    const plan = store.getState().getEditPlan();

    const project = store.getState().project;
    expect(plan.decisions).toHaveLength(
      project.overlays.length + project.generationSuggestions.length,
    );
    for (let index = 1; index < plan.decisions.length; index += 1) {
      expect(plan.decisions[index].timelineStart).toBeGreaterThanOrEqual(
        plan.decisions[index - 1].timelineStart,
      );
    }
  });

  it("reflects overlay lock/human-authorship as decision status", async () => {
    const store = createRelayLabStore(createDemoProject());
    const overlay = store.getState().project.overlays[0];
    store.getState().setOverlayLocked(overlay.id, true);

    const plan = store.getState().getEditPlan();
    const decision = plan.decisions.find((candidate) => candidate.id === overlay.id);
    expect(decision?.status).toBe("locked");
  });

  it("marks a generation suggestion decision as proposed and includes its reason", () => {
    const store = createRelayLabStore(createDemoProject());
    const suggestion = store.getState().project.generationSuggestions[0];
    const plan = store.getState().getEditPlan();
    const decision = plan.decisions.find((candidate) => candidate.id === suggestion.id);

    expect(decision?.type).toBe("generated-broll-suggestion");
    expect(decision?.status).toBe("proposed");
    expect(decision?.reason).toBe(suggestion.reason);
  });

  it("timelineRevisionUsed matches the live project revision and updates after a mutation", async () => {
    const store = createRelayLabStore(createDemoProject());
    const before = store.getState().getEditPlan();
    expect(before.timelineRevisionUsed).toBe(store.getState().project.timelineRevision);

    const moment = store.getState().project.brollAssets[0].moments[0];
    store.getState().proposeOverlay({
      momentId: moment.id,
      timelineStart: 60,
      duration: 3,
      reason: "New agent proposal.",
    });

    const after = store.getState().getEditPlan();
    expect(after.timelineRevisionUsed).toBeGreaterThan(before.timelineRevisionUsed);
  });

  it("get_edit_plan tool returns a JSON-serializable snapshot matching the store's live plan", async () => {
    const store = createRelayLabStore(createDemoProject());
    const modelContext = new FakeModelContext();
    const registration = registerRelayLabTools(modelContext, store);
    await registration.ready;

    const raw = await modelContext.invoke("get_edit_plan");
    const plan = unwrapToolResult<EditPlanResult>(raw);

    expect(plan.decisions.length).toBe(store.getState().getEditPlan().decisions.length);
    expect(plan.status).toBe("needs-review");

    registration.abort();
  });
});
