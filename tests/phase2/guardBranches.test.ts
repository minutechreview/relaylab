import { describe, expect, it, vi } from "vitest";

import { createDemoProject } from "@/lib/demo/project";
import { createRelayLabStore } from "@/lib/editor/store";
import { registerRelayLabTools } from "@/lib/webmcp/registerRelayLabTools";
import {
  FakeModelContext,
  unwrapToolResult,
} from "@/tests/helpers/fakeModelContext";

describe("Phase 2 guard and boundary paths", () => {
  it("rejects missing, committed, and locked proposal targets", () => {
    const committedProject = createDemoProject();
    committedProject.overlays[0].status = "committed";
    const committedStore = createRelayLabStore(committedProject);
    const committedId = committedProject.overlays[0].id;

    [
      committedStore.getState().updateOverlay(committedId, { reason: "No" }),
      committedStore.getState().removeOverlayProposal(committedId),
      committedStore
        .getState()
        .swapOverlayMoment(committedId, "moment_workspace_overhead"),
      committedStore.getState().setOverlayLocked(committedId, true),
    ].forEach((result) => {
      expect(result).toMatchObject({ ok: false, code: "OVERLAY_NOT_GHOST" });
    });

    const store = createRelayLabStore(createDemoProject());
    expect(store.getState().removeOverlayProposal("ov_missing")).toMatchObject({
      ok: false,
      code: "OVERLAY_NOT_FOUND",
    });
    expect(
      store
        .getState()
        .swapOverlayMoment("ov_missing", "moment_workspace_overhead"),
    ).toMatchObject({ ok: false, code: "OVERLAY_NOT_FOUND" });
    expect(store.getState().setOverlayLocked("ov_missing", true)).toMatchObject({
      ok: false,
      code: "OVERLAY_NOT_FOUND",
    });

    const overlayId = store.getState().getTimeline().overlays[0].id;
    store.getState().setOverlayLocked(overlayId, true);
    expect(
      store
        .getState()
        .swapOverlayMoment(overlayId, "moment_workspace_overhead"),
    ).toMatchObject({ ok: false, code: "HUMAN_LOCKED" });
    store.getState().setOverlayLocked(overlayId, false);
    expect(
      store.getState().swapOverlayMoment(overlayId, "moment_missing"),
    ).toMatchObject({ ok: false, code: "MOMENT_NOT_FOUND" });
  });

  it("keeps selection deterministic when removing first, other, or last proposals", () => {
    const emptyProject = createDemoProject();
    emptyProject.overlays = [];
    expect(createRelayLabStore(emptyProject).getState().selectedOverlayId).toBeNull();

    const project = createDemoProject();
    project.overlays.push({
      ...project.overlays[0],
      id: "ov_second",
      timelineStart: 35,
      timelineEnd: 40.8,
    });

    const removeOtherStore = createRelayLabStore(project);
    removeOtherStore.getState().removeOverlayProposal("ov_second");
    expect(removeOtherStore.getState().selectedOverlayId).toBe("ov_demo_1");

    const removeSelectedStore = createRelayLabStore(project);
    removeSelectedStore.getState().removeOverlayProposal("ov_demo_1");
    expect(removeSelectedStore.getState().selectedOverlayId).toBe("ov_second");
    removeSelectedStore.getState().removeOverlayProposal("ov_second");
    expect(removeSelectedStore.getState().selectedOverlayId).toBeNull();
  });

  it("keeps source and timeline durations aligned for explicit source edits", () => {
    const patches = [
      { sourceStart: 10 },
      { sourceStart: 10, duration: 2 },
      { sourceEnd: 18 },
      { sourceEnd: 18, duration: 2 },
      { sourceStart: 22, sourceEnd: 25 },
    ];

    patches.forEach((patch) => {
      const store = createRelayLabStore(createDemoProject());
      const overlay = store.getState().getTimeline().overlays[0];
      const result = store.getState().updateOverlay(overlay.id, patch);

      expect(result).toMatchObject({ ok: true, brollAudio: "muted" });
      const updated = store.getState().getTimeline().overlays[0];
      expect(updated.timelineEnd - updated.timelineStart).toBeCloseTo(
        updated.sourceEnd - updated.sourceStart,
      );
    });
  });

  it("validates every update/remove tool shape before reaching store state", async () => {
    const store = createRelayLabStore(createDemoProject());
    const context = new FakeModelContext();
    const registration = registerRelayLabTools(context, store);
    await registration.ready;
    const overlayId = store.getState().getTimeline().overlays[0].id;
    const before = store.getState().getTimeline();

    const invalidInputs = [
      ["update_overlay_proposal", { overlayId }],
      [
        "update_overlay_proposal",
        { overlayId, sourceStart: 10, sourceEnd: 8 },
      ],
      [
        "update_overlay_proposal",
        { overlayId, sourceStart: 10, sourceEnd: 14, duration: 2 },
      ],
      ["remove_overlay_proposal", {}],
    ] as const;

    for (const [toolName, input] of invalidInputs) {
      const result = unwrapToolResult<{ ok: boolean; code: string }>(
        await context.invoke(toolName, input),
      );
      expect(result).toMatchObject({ ok: false, code: "INVALID_ARGUMENTS" });
    }
    expect(store.getState().getTimeline()).toEqual(before);
    registration.abort();
  });

  it("registers the correct surface for approved/committed startup and fails core atomically", async () => {
    const onChange = vi.fn();
    const approvedProject = createDemoProject();
    approvedProject.status = "approved";
    const approvedContext = new FakeModelContext();
    const approvedRegistration = registerRelayLabTools(
      approvedContext,
      createRelayLabStore(approvedProject),
      { onChange },
    );
    await approvedRegistration.ready;
    expect(approvedRegistration.getActiveNames()).toEqual([
      "commit_approved_plan",
      "find_overlay_opportunities",
      "get_edit_plan",
      "get_project_summary",
      "get_timeline",
      "get_transcript",
      "search_broll",
    ]);
    expect(onChange).toHaveBeenCalled();
    approvedRegistration.abort();
    approvedRegistration.abort();

    const committedProject = createDemoProject();
    committedProject.status = "committed";
    const committedContext = new FakeModelContext();
    const committedRegistration = registerRelayLabTools(
      committedContext,
      createRelayLabStore(committedProject),
    );
    await committedRegistration.ready;
    expect(committedRegistration.getActiveNames()).toEqual([
      "find_overlay_opportunities",
      "get_edit_plan",
      "get_project_summary",
      "get_timeline",
      "get_transcript",
      "search_broll",
    ]);
    committedRegistration.abort();

    const active = new Set<string>();
    const failingContext = {
      async registerTool(
        tool: WebMCP.ModelContextTool,
        options?: WebMCP.ModelContextRegisterToolOptions,
      ) {
        if (tool.name === "get_timeline") throw new Error("core failed");
        active.add(tool.name);
        options?.signal?.addEventListener("abort", () => active.delete(tool.name), {
          once: true,
        });
      },
    };
    const failedStore = createRelayLabStore(createDemoProject());
    const failedRegistration = registerRelayLabTools(failingContext, failedStore);
    const results = await failedRegistration.ready;
    expect(results.some(({ status }) => status === "rejected")).toBe(true);
    expect(failedRegistration.getActiveNames()).toEqual([]);
    expect(active).toEqual(new Set());

    failedStore.getState().approvePlan();
    await failedRegistration.whenIdle();
    expect(failedRegistration.getActiveNames()).toEqual([]);
    expect(active).toEqual(new Set());
    failedRegistration.abort();
  });
});
