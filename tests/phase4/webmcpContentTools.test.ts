import { describe, expect, it } from "vitest";

import { createDemoProject } from "@/lib/demo/project";
import { createRelayLabStore } from "@/lib/editor/store";
import { registerRelayLabTools } from "@/lib/webmcp/registerRelayLabTools";
import {
  FakeModelContext,
  unwrapToolResult,
} from "@/tests/helpers/fakeModelContext";

interface FailureResult {
  ok: false;
  code: string;
}

describe("Phase 4 WebMCP content-understanding tools", () => {
  it("registers get_project_summary, get_transcript, find_overlay_opportunities, search_broll, and set_pacing_preference while planning", async () => {
    const store = createRelayLabStore(createDemoProject());
    const modelContext = new FakeModelContext();
    const registration = registerRelayLabTools(modelContext, store);
    await registration.ready;

    [
      "get_project_summary",
      "get_transcript",
      "find_overlay_opportunities",
      "search_broll",
      "set_pacing_preference",
    ].forEach((name) => {
      expect(registration.getActiveNames()).toContain(name);
      expect(modelContext.registeredToolNames).toContain(name);
    });

    registration.abort();
  });

  it("get_project_summary reports counts and immutable audio policy", async () => {
    const store = createRelayLabStore(createDemoProject());
    const modelContext = new FakeModelContext();
    const registration = registerRelayLabTools(modelContext, store);
    await registration.ready;

    const summary = unwrapToolResult<{
      status: string;
      transcriptSegmentCount: number;
      overlayCount: number;
      audioPolicy: { base: string; broll: string };
    }>(await modelContext.invoke("get_project_summary"));

    expect(summary.status).toBe("planning");
    expect(summary.transcriptSegmentCount).toBeGreaterThan(0);
    expect(summary.overlayCount).toBeGreaterThan(0);
    expect(summary.audioPolicy).toEqual({ base: "master", broll: "muted" });

    registration.abort();
  });

  it("get_transcript is bounded by default and by an explicit time range", async () => {
    const store = createRelayLabStore(createDemoProject());
    const modelContext = new FakeModelContext();
    const registration = registerRelayLabTools(modelContext, store);
    await registration.ready;

    const full = unwrapToolResult<{ segments: { id: string }[] }>(
      await modelContext.invoke("get_transcript", {}),
    );
    expect(full.segments.length).toBeLessThanOrEqual(20);

    const bounded = unwrapToolResult<{ segments: { start: number; end: number }[] }>(
      await modelContext.invoke("get_transcript", { startTime: 0, endTime: 10 }),
    );
    expect(bounded.segments.length).toBeGreaterThan(0);
    bounded.segments.forEach((segment) => {
      expect(segment.start).toBeLessThan(10);
      expect(segment.end).toBeGreaterThan(0);
    });

    const capped = unwrapToolResult<{ segments: unknown[] }>(
      await modelContext.invoke("get_transcript", { maxSegments: 1 }),
    );
    expect(capped.segments).toHaveLength(1);

    registration.abort();
  });

  it("get_transcript rejects an invalid range with INVALID_ARGUMENTS", async () => {
    const store = createRelayLabStore(createDemoProject());
    const modelContext = new FakeModelContext();
    const registration = registerRelayLabTools(modelContext, store);
    await registration.ready;

    const result = unwrapToolResult<FailureResult>(
      await modelContext.invoke("get_transcript", { startTime: 10, endTime: 5 }),
    );
    expect(result).toMatchObject({ ok: false, code: "INVALID_ARGUMENTS" });

    registration.abort();
  });

  it("find_overlay_opportunities is read-only and returns pacing/semantic candidates", async () => {
    const store = createRelayLabStore(createDemoProject());
    const modelContext = new FakeModelContext();
    const registration = registerRelayLabTools(modelContext, store);
    await registration.ready;
    const before = store.getState().getTimeline();

    const result = unwrapToolResult<{ opportunities: { kind: string }[] }>(
      await modelContext.invoke("find_overlay_opportunities"),
    );

    expect(result.opportunities.length).toBeGreaterThan(0);
    expect(store.getState().getTimeline()).toEqual(before);

    registration.abort();
  });

  it("search_broll ranks moments and rejects an empty query", async () => {
    const store = createRelayLabStore(createDemoProject());
    const modelContext = new FakeModelContext();
    const registration = registerRelayLabTools(modelContext, store);
    await registration.ready;

    const result = unwrapToolResult<{ results: { momentId: string; score: number }[] }>(
      await modelContext.invoke("search_broll", { query: "dashboard progress" }),
    );
    expect(result.results.length).toBeGreaterThan(0);
    expect(result.results[0].momentId).toBe("moment_product_result");

    const invalid = unwrapToolResult<FailureResult>(
      await modelContext.invoke("search_broll", { query: "" }),
    );
    expect(invalid).toMatchObject({ ok: false, code: "INVALID_ARGUMENTS" });

    registration.abort();
  });

  it("set_pacing_preference clamps to the 5-30 second range and rejects invalid input", async () => {
    const store = createRelayLabStore(createDemoProject());
    const modelContext = new FakeModelContext();
    const registration = registerRelayLabTools(modelContext, store);
    await registration.ready;

    const tooLow = unwrapToolResult<FailureResult>(
      await modelContext.invoke("set_pacing_preference", { maxTalkingHeadSeconds: 1 }),
    );
    expect(tooLow).toMatchObject({ ok: false, code: "INVALID_ARGUMENTS" });

    const tooHigh = unwrapToolResult<FailureResult>(
      await modelContext.invoke("set_pacing_preference", { maxTalkingHeadSeconds: 90 }),
    );
    expect(tooHigh).toMatchObject({ ok: false, code: "INVALID_ARGUMENTS" });

    const valid = unwrapToolResult<{ ok: true; maxTalkingHeadSeconds: number }>(
      await modelContext.invoke("set_pacing_preference", { maxTalkingHeadSeconds: 20 }),
    );
    expect(valid).toMatchObject({ ok: true, maxTalkingHeadSeconds: 20 });
    expect(store.getState().project.pacingPreference.maxTalkingHeadSeconds).toBe(20);

    registration.abort();
  });

  it("set_pacing_preference is unavailable outside planning and cannot mutate an approved/committed project", async () => {
    const project = createDemoProject();
    project.status = "approved";
    const store = createRelayLabStore(project);
    const modelContext = new FakeModelContext();
    const registration = registerRelayLabTools(modelContext, store);
    await registration.ready;

    expect(registration.getActiveNames()).not.toContain("set_pacing_preference");
    expect(modelContext.registeredToolNames).not.toContain("set_pacing_preference");

    // Direct store call (simulating a stale reference) must still be rejected.
    const result = store.getState().setPacingPreference(20);
    expect(result).toMatchObject({ ok: false, code: "INVALID_PROJECT_STATE" });

    registration.abort();
  });

  it("read-only content tools never mutate locked overlays or the project state", async () => {
    const project = createDemoProject();
    const store = createRelayLabStore(project);
    const overlayId = store.getState().getTimeline().overlays[0].id;
    store.getState().setOverlayLocked(overlayId, true);
    const before = store.getState().getTimeline();

    const modelContext = new FakeModelContext();
    const registration = registerRelayLabTools(modelContext, store);
    await registration.ready;

    await modelContext.invoke("get_project_summary");
    await modelContext.invoke("get_transcript", {});
    await modelContext.invoke("find_overlay_opportunities");
    await modelContext.invoke("search_broll", { query: "product" });

    expect(store.getState().getTimeline()).toEqual(before);
    const overlay = store
      .getState()
      .getTimeline()
      .overlays.find(({ id }) => id === overlayId);
    expect(overlay?.lockedByHuman).toBe(true);

    registration.abort();
  });

  it("remains absent from the tool surface once the project is committed", async () => {
    const project = createDemoProject();
    project.status = "committed";
    project.overlays = project.overlays.map((overlay) => ({
      ...overlay,
      status: "committed" as const,
    }));
    const store = createRelayLabStore(project);
    const modelContext = new FakeModelContext();
    const registration = registerRelayLabTools(modelContext, store);
    await registration.ready;

    [
      "propose_overlay",
      "update_overlay_proposal",
      "remove_overlay_proposal",
      "set_pacing_preference",
      "commit_approved_plan",
    ].forEach((name) => {
      expect(registration.getActiveNames()).not.toContain(name);
    });
    [
      "get_timeline",
      "get_project_summary",
      "get_transcript",
      "find_overlay_opportunities",
      "search_broll",
    ].forEach((name) => {
      expect(registration.getActiveNames()).toContain(name);
    });

    registration.abort();
  });
});
