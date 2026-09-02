import { describe, expect, it } from "vitest";

import { createDemoProject } from "@/lib/demo/project";
import { createRelayLabStore } from "@/lib/editor/store";
import { registerRelayLabTools } from "@/lib/webmcp/registerRelayLabTools";
import { FakeModelContext, unwrapToolResult } from "@/tests/helpers/fakeModelContext";

interface StaleTimelineFailure {
  ok: false;
  code: "STALE_TIMELINE";
  expectedRevision: number;
  currentRevision: number;
}

describe("Phase 10 timeline revision safety", () => {
  it("starts at revision 0 and increments on a material overlay mutation", () => {
    const store = createRelayLabStore(createDemoProject());
    const initial = store.getState().project.timelineRevision;
    const moment = store.getState().project.brollAssets[0].moments[0];

    store.getState().proposeOverlay({
      momentId: moment.id,
      timelineStart: 61,
      duration: 3,
      reason: "Test proposal.",
    });

    expect(store.getState().project.timelineRevision).toBe(initial + 1);
  });

  it("does not increment revision for read-only actions or caption/pacing edits", () => {
    const store = createRelayLabStore(createDemoProject());
    const before = store.getState().project.timelineRevision;

    store.getState().getTimeline();
    store.getState().getProjectSummary();
    store.getState().setPacingPreference(20);
    store.getState().addCaption({ start: 1, end: 2, text: "caption" });

    expect(store.getState().project.timelineRevision).toBe(before);
  });

  it("propose_overlay without expectedTimelineRevision is back-compatible and always succeeds", async () => {
    const store = createRelayLabStore(createDemoProject());
    // Bump the revision behind the caller's back.
    const moment = store.getState().project.brollAssets[0].moments[0];
    store.getState().proposeOverlay({
      momentId: moment.id,
      timelineStart: 61,
      duration: 2,
      reason: "First proposal to advance the revision.",
    });

    const result = store.getState().proposeOverlay({
      momentId: moment.id,
      timelineStart: 64,
      duration: 2,
      reason: "Second proposal with no expectedTimelineRevision.",
    });

    expect(result.ok).toBe(true);
  });

  it("propose_overlay rejects a stale expectedTimelineRevision with STALE_TIMELINE", () => {
    const store = createRelayLabStore(createDemoProject());
    const staleRevision = store.getState().project.timelineRevision;

    // Human changes the timeline after the agent read it.
    store.getState().setOverlayLocked(store.getState().project.overlays[0].id, true);

    const moment = store.getState().project.brollAssets[0].moments[0];
    const result = store.getState().proposeOverlay({
      momentId: moment.id,
      timelineStart: 61,
      duration: 2,
      reason: "Stale proposal.",
      expectedTimelineRevision: staleRevision,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.code).toBe("STALE_TIMELINE");
    const failure = result as unknown as StaleTimelineFailure;
    expect(failure.expectedRevision).toBe(staleRevision);
    expect(failure.currentRevision).toBe(store.getState().project.timelineRevision);
  });

  it("update_overlay_proposal rejects a stale expectedTimelineRevision", () => {
    const store = createRelayLabStore(createDemoProject());
    const overlay = store.getState().project.overlays[0];
    const staleRevision = store.getState().project.timelineRevision;

    store.getState().setPacingPreference(10); // does not bump revision
    const moment = store.getState().project.brollAssets[0].moments[0];
    store.getState().proposeOverlay({
      momentId: moment.id,
      timelineStart: 61,
      duration: 2,
      reason: "Bumps the revision.",
    });

    const result = store.getState().updateOverlay(overlay.id, {
      reason: "Attempted stale update.",
      expectedTimelineRevision: staleRevision,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.code).toBe("STALE_TIMELINE");
  });

  it("the WebMCP replan_unlocked_sections tool rejects a stale timelineRevision", async () => {
    const store = createRelayLabStore(createDemoProject());
    const modelContext = new FakeModelContext();
    const registration = registerRelayLabTools(modelContext, store);
    await registration.ready;

    const timeline = unwrapToolResult<{ timelineRevision: number }>(
      await modelContext.invoke("get_timeline"),
    );
    store.getState().setOverlayLocked(store.getState().project.overlays[0].id, true);

    const raw = await modelContext.invoke("replan_unlocked_sections", {
      preserveHumanChanges: true,
      timelineRevision: timeline.timelineRevision,
    });
    const result = unwrapToolResult<StaleTimelineFailure>(raw);

    expect(result.ok).toBe(false);
    expect(result.code).toBe("STALE_TIMELINE");
    expect(result.currentRevision).toBe(store.getState().project.timelineRevision);

    registration.abort();
  });

  it("replaceBaseMedia resets the timeline to revision 0", () => {
    const store = createRelayLabStore(createDemoProject());
    const moment = store.getState().project.brollAssets[0].moments[0];
    store.getState().proposeOverlay({
      momentId: moment.id,
      timelineStart: 61,
      duration: 2,
      reason: "Bump before reset.",
    });
    expect(store.getState().project.timelineRevision).toBeGreaterThan(0);

    store.getState().replaceBaseMedia({
      name: "new-base.mp4",
      duration: 30,
      objectUrl: "blob:new-base",
    });

    expect(store.getState().project.timelineRevision).toBe(0);
  });
});
