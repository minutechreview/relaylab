import { describe, expect, it } from "vitest";

import { createDemoProject } from "@/lib/demo/project";
import { createRelayLabStore } from "@/lib/editor/store";
import { registerRelayLabTools } from "@/lib/webmcp/registerRelayLabTools";
import type { RegistrationSnapshot } from "@/lib/webmcp/registerRelayLabTools";
import {
  FakeModelContext,
  unwrapToolResult,
} from "@/tests/helpers/fakeModelContext";

interface ToolResult {
  ok?: boolean;
  code?: string;
  projectStatus?: string;
  committedCount?: number;
}

describe("Phase 2 approval-gated WebMCP lifecycle", () => {
  it("never exposes human approval or lock controls as agent tools", async () => {
    const store = createRelayLabStore(createDemoProject());
    const modelContext = new FakeModelContext();
    const registration = registerRelayLabTools(modelContext, store);
    await registration.ready;

    expect(registration.getActiveNames().slice().sort()).toEqual([
      "find_overlay_opportunities",
      "get_edit_plan",
      "get_project_summary",
      "get_timeline",
      "get_transcript",
      "propose_generated_broll",
      "propose_overlay",
      "remove_generated_broll_suggestion",
      "remove_overlay_proposal",
      "replan_unlocked_sections",
      "search_broll",
      "set_caption_style",
      "set_pacing_preference",
      "update_generated_broll_suggestion",
      "update_overlay_proposal",
    ]);
    [
      "approve_plan",
      "lock_overlay",
      "unlock_overlay",
      "set_broll_volume",
      "enable_broll_audio",
      "mix_audio",
      "commit_approved_plan",
    ].forEach((forbidden) => {
      expect(registration.getActiveNames()).not.toContain(forbidden);
      expect(modelContext.registeredToolNames).not.toContain(forbidden);
    });

    registration.abort();
  });

  it("adds commit only after human approval, then removes it after commit", async () => {
    const store = createRelayLabStore(createDemoProject());
    const modelContext = new FakeModelContext();
    const registration = registerRelayLabTools(modelContext, store);
    await registration.ready;
    const before = store.getState().getTimeline().overlays.map((overlay) => ({
      ...overlay,
    }));

    expect(modelContext.registeredToolNames).not.toContain("commit_approved_plan");
    store.getState().setOverlayLocked(before[0].id, true);
    store.getState().approvePlan();
    await registration.whenIdle();

    expect(store.getState().project.status).toBe("approved");
    expect(registration.getActiveNames()).toContain("commit_approved_plan");
    expect(modelContext.registeredToolNames).toContain("commit_approved_plan");

    const rawCommit = await modelContext.invoke("commit_approved_plan");
    const commit = unwrapToolResult<ToolResult>(rawCommit);
    await registration.whenIdle();

    expect(commit).toMatchObject({ ok: true });
    expect(store.getState().project.status).toBe("committed");
    expect(registration.getActiveNames()).not.toContain("commit_approved_plan");
    expect(modelContext.registeredToolNames).not.toContain("commit_approved_plan");

    const after = store.getState().getTimeline();
    expect(after.brollTrack.audioPolicy).toBe("muted");
    expect(after.overlays).toHaveLength(before.length);
    after.overlays.forEach((overlay) => {
      const original = before.find(({ id }) => id === overlay.id);
      expect(overlay).toMatchObject({
        id: original?.id,
        sourceStart: original?.sourceStart,
        sourceEnd: original?.sourceEnd,
        timelineStart: original?.timelineStart,
        timelineEnd: original?.timelineEnd,
        lockedByHuman:
          overlay.id === before[0].id ? true : original?.lockedByHuman,
        status: "committed",
      });
    });

    registration.abort();
  });

  it("keeps planning mutation tools from changing an approved plan", async () => {
    const project = createDemoProject();
    const store = createRelayLabStore(project);
    const modelContext = new FakeModelContext();
    const registration = registerRelayLabTools(modelContext, store);
    await registration.ready;
    const overlay = store.getState().getTimeline().overlays[0];
    const planningTools = new Map(
      (await modelContext.getTools()).map((tool) => [tool.name, tool]),
    );
    expect([...planningTools.keys()]).toEqual(
      expect.arrayContaining([
        "propose_overlay",
        "update_overlay_proposal",
        "remove_overlay_proposal",
      ]),
    );

    store.getState().approvePlan();
    await registration.whenIdle();
    const approved = store.getState().getTimeline();

    [
      "propose_overlay",
      "update_overlay_proposal",
      "remove_overlay_proposal",
    ].forEach((toolName) => {
      expect(registration.getActiveNames()).not.toContain(toolName);
      expect(modelContext.registeredToolNames).not.toContain(toolName);
    });

    const propose = unwrapToolResult<ToolResult>(
      await planningTools.get("propose_overlay")?.execute(
        {
          momentId: project.brollAssets[0].moments[1].id,
          timelineStart: 36,
          duration: 3,
          reason: "Stale invocation after approval.",
        },
        { signal: new AbortController().signal },
      ),
    );
    const update = unwrapToolResult<ToolResult>(
      await planningTools.get("update_overlay_proposal")?.execute(
        {
          overlayId: overlay.id,
          timelineStart: overlay.timelineStart + 5,
          duration: 2,
          reason: "Stale invocation after approval.",
        },
        { signal: new AbortController().signal },
      ),
    );
    const remove = unwrapToolResult<ToolResult>(
      await planningTools.get("remove_overlay_proposal")?.execute(
        { overlayId: overlay.id },
        { signal: new AbortController().signal },
      ),
    );

    expect(propose).toMatchObject({ ok: false });
    expect(update).toMatchObject({ ok: false });
    expect(remove).toMatchObject({ ok: false });
    expect(propose.code).toEqual(expect.any(String));
    expect(update.code).toEqual(expect.any(String));
    expect(remove.code).toEqual(expect.any(String));
    expect(store.getState().getTimeline()).toEqual(approved);

    registration.abort();
  });

  it("returns HUMAN_LOCKED from update and remove proposal tools", async () => {
    const store = createRelayLabStore(createDemoProject());
    const modelContext = new FakeModelContext();
    const registration = registerRelayLabTools(modelContext, store);
    await registration.ready;
    const overlay = store.getState().getTimeline().overlays[0];
    store.getState().setOverlayLocked(overlay.id, true);
    const lockedOverlay = store
      .getState()
      .getTimeline()
      .overlays.find(({ id }) => id === overlay.id);

    const update = unwrapToolResult<ToolResult>(
      await modelContext.invoke("update_overlay_proposal", {
        overlayId: overlay.id,
        timelineStart: overlay.timelineStart + 1,
        duration: 2,
        reason: "Must respect lock.",
      }),
    );
    const remove = unwrapToolResult<ToolResult>(
      await modelContext.invoke("remove_overlay_proposal", {
        overlayId: overlay.id,
      }),
    );

    expect(update).toMatchObject({ ok: false, code: "HUMAN_LOCKED" });
    expect(remove).toMatchObject({ ok: false, code: "HUMAN_LOCKED" });
    expect(
      store.getState().getTimeline().overlays.find(({ id }) => id === overlay.id),
    ).toEqual(lockedOverlay);

    registration.abort();
  });

  it("reports a late approval-tool registration failure to the debug bridge", async () => {
    const store = createRelayLabStore(createDemoProject());
    const registered = new Map<string, WebMCP.ModelContextTool>();
    const snapshots: RegistrationSnapshot[] = [];
    const context = {
      async registerTool(
        tool: WebMCP.ModelContextTool,
        options?: WebMCP.ModelContextRegisterToolOptions,
      ) {
        if (tool.name === "commit_approved_plan") {
          throw new Error("approval registration failed");
        }
        registered.set(tool.name, tool);
        options?.signal?.addEventListener(
          "abort",
          () => registered.delete(tool.name),
          { once: true },
        );
      },
    };
    const registration = registerRelayLabTools(context, store, {
      onChange: (snapshot) => snapshots.push(snapshot),
    });
    await registration.ready;

    store.getState().approvePlan();
    await registration.whenIdle();

    expect(registration.getActiveNames()).toEqual([
      "find_overlay_opportunities",
      "get_edit_plan",
      "get_project_summary",
      "get_timeline",
      "get_transcript",
      "search_broll",
    ]);
    expect(snapshots.at(-1)).toMatchObject({
      activeNames: [
        "find_overlay_opportunities",
        "get_edit_plan",
        "get_project_summary",
        "get_timeline",
        "get_transcript",
        "search_broll",
      ],
      failedNames: ["commit_approved_plan"],
      projectStatus: "approved",
    });
    registration.abort();
  });
});
