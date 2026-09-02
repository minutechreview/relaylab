import { describe, expect, it } from "vitest";

import { createDemoProject } from "@/lib/demo/project";
import { createRelayLabStore } from "@/lib/editor/store";
import {
  createApprovalTools,
  createRelayLabTools,
  registerRelayLabTools,
} from "@/lib/webmcp/registerRelayLabTools";
import {
  FakeModelContext,
  unwrapToolResult,
} from "@/tests/helpers/fakeModelContext";

interface TimelineResult {
  overlays: Array<{
    id: string;
    assetId: string;
    momentId?: string;
    sourceStart: number;
    sourceEnd: number;
    timelineStart: number;
    timelineEnd: number;
    status: "ghost" | "committed";
    lockedByHuman: boolean;
    createdBy: "human" | "agent";
    reason?: string;
  }>;
}

interface ProposalResult {
  ok?: boolean;
  code?: string;
  message?: string;
  brollAudio?: string;
  id?: string;
  overlayId?: string;
  overlay?: { id: string };
}

function proposalId(result: ProposalResult): string | undefined {
  return result.overlayId ?? result.overlay?.id ?? result.id;
}

function firstMoment(project: ReturnType<typeof createDemoProject>) {
  const moment = project.brollAssets.flatMap((asset) => asset.moments)[0];

  if (!moment) {
    throw new Error("The deterministic demo project must contain a B-roll moment.");
  }

  return moment;
}

describe("Phase 1 WebMCP vertical slice", () => {
  it("retains the two Phase 1 tools with deliberate schemas", () => {
    const store = createRelayLabStore(createDemoProject());
    const tools = createRelayLabTools(store);

    expect(tools.map((tool) => tool.name)).toEqual(
      expect.arrayContaining(["get_timeline", "propose_overlay"]),
    );

    const getTimeline = tools.find((tool) => tool.name === "get_timeline");
    const proposeOverlay = tools.find(
      (tool) => tool.name === "propose_overlay",
    );
    const proposeInputSchema = proposeOverlay?.inputSchema as
      | { required?: unknown }
      | undefined;

    expect(getTimeline?.description).toMatch(/timeline/i);
    expect(getTimeline?.annotations).toMatchObject({ readOnlyHint: true });
    expect(proposeOverlay?.description).toMatch(/ghost|proposal/i);
    expect(proposeOverlay?.inputSchema).toMatchObject({
      type: "object",
      additionalProperties: false,
    });
    expect(proposeInputSchema?.required).toEqual(
      expect.arrayContaining([
        "momentId",
        "timelineStart",
        "duration",
        "reason",
      ]),
    );

    const forbiddenNames = [
      "approve_plan",
      "commit_approved_plan",
      "lock_overlay",
      "unlock_overlay",
      "set_broll_volume",
      "mix_audio",
      "enable_broll_audio",
    ];
    const registeredNames = tools.map((tool) => tool.name);
    forbiddenNames.forEach((name) => {
      expect(registeredNames).not.toContain(name);
    });
  });

  it("registers through the current registerTool(tool, { signal }) lifecycle", async () => {
    const store = createRelayLabStore(createDemoProject());
    const modelContext = new FakeModelContext();
    const registration = registerRelayLabTools(modelContext, store);

    await registration.ready;

    expect(registration.getActiveNames()).toEqual([
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
      "set_pacing_preference",
      "update_generated_broll_suggestion",
      "update_overlay_proposal",
    ]);
    expect(modelContext.registeredToolNames.slice().sort()).toEqual([
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
      "set_pacing_preference",
      "update_generated_broll_suggestion",
      "update_overlay_proposal",
    ]);
    expect(modelContext.registrationCalls).toHaveLength(14);

    const signals = modelContext.registrationCalls.map(
      ({ options }) => options?.signal,
    );
    expect(signals.every((signal) => signal instanceof AbortSignal)).toBe(true);
    expect(signals.every((signal) => signal?.aborted === false)).toBe(true);

    await modelContext.invoke("get_timeline");
    const executionSignal = modelContext.invocationSignals.at(-1);
    expect(executionSignal).toBeInstanceOf(AbortSignal);
    expect(signals).not.toContain(executionSignal);

    registration.abort();

    expect(signals.every((signal) => signal?.aborted === true)).toBe(true);
    expect(modelContext.registeredToolNames).toEqual([]);
  });

  it("supports native Chrome invoking execute without callback options", async () => {
    const store = createRelayLabStore(createDemoProject());
    const tools = [...createRelayLabTools(store), ...createApprovalTools(store)];
    expect(tools).toHaveLength(15);

    // Chrome's native WebMCP bridge currently supplies only the input object,
    // while webmcp-types also models an optional per-invocation signal context.
    const outcomes = await Promise.all(
      tools.map((tool) => {
        const nativeExecute = tool.execute as unknown as (
          input: Record<string, unknown>,
        ) => Promise<unknown>;
        return nativeExecute({});
      }),
    );
    expect(outcomes).toHaveLength(15);
    expect(
      outcomes[
        tools.findIndex(({ name }) => name === "get_project_summary")
      ],
    ).toMatchObject({
      status: "planning",
      audioPolicy: { base: "master", broll: "muted" },
    });
  });

  it("creates a visible-state ghost through propose_overlay", async () => {
    const project = createDemoProject();
    const moment = firstMoment(project);
    const store = createRelayLabStore(project);
    const modelContext = new FakeModelContext();
    const registration = registerRelayLabTools(modelContext, store);
    await registration.ready;
    const initialIds = new Set(
      store.getState().getTimeline().overlays.map(({ id }) => id),
    );

    const duration = Math.min(4, moment.sourceEnd - moment.sourceStart);
    const rawProposal = await modelContext.invoke("propose_overlay", {
      momentId: moment.id,
      timelineStart: 12,
      duration,
      reason: "Show the concrete subject while it is mentioned.",
    });
    const proposal = unwrapToolResult<ProposalResult>(rawProposal);
    const overlay = store
      .getState()
      .getTimeline()
      .overlays.find(({ id }) => !initialIds.has(id));

    expect(proposal.ok).not.toBe(false);
    expect(overlay).toBeDefined();
    if (!overlay) return;
    expect(proposalId(proposal)).toBe(overlay.id);
    expect(proposal.brollAudio).toBe("muted");
    expect(overlay).toMatchObject({
      momentId: moment.id,
      timelineStart: 12,
      timelineEnd: 12 + duration,
      status: "ghost",
      lockedByHuman: false,
      createdBy: "agent",
    });

    registration.abort();
  });

  it("validates arguments at runtime and leaves state unchanged on failure", async () => {
    const store = createRelayLabStore(createDemoProject());
    const modelContext = new FakeModelContext();
    const registration = registerRelayLabTools(modelContext, store);
    await registration.ready;
    const before = store.getState().getTimeline().overlays;

    const rawResult = await modelContext.invoke("propose_overlay", {
      momentId: "missing_moment",
      timelineStart: 6,
      duration: 0,
      reason: "",
    });
    const result = unwrapToolResult<ProposalResult>(rawResult);

    expect(result).toMatchObject({ ok: false });
    expect(result.code).toEqual(expect.any(String));
    expect(result.message).toEqual(expect.any(String));
    expect(store.getState().getTimeline().overlays).toEqual(before);

    registration.abort();
  });

  it("honors the per-invocation AbortSignal independently of registration", async () => {
    const store = createRelayLabStore(createDemoProject());
    const modelContext = new FakeModelContext();
    const registration = registerRelayLabTools(modelContext, store);
    await registration.ready;
    const invocationController = new AbortController();
    invocationController.abort(new DOMException("Cancelled by agent", "AbortError"));

    await expect(
      modelContext.invoke("get_timeline", {}, invocationController.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
    await expect(
      modelContext.invoke(
        "propose_overlay",
        {
          momentId: "moment_workspace_overhead",
          timelineStart: 4,
          duration: 2,
          reason: "Cancelled proposal.",
        },
        invocationController.signal,
      ),
    ).rejects.toMatchObject({ name: "AbortError" });

    expect(modelContext.registeredToolNames.slice().sort()).toEqual([
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
      "set_pacing_preference",
      "update_generated_broll_suggestion",
      "update_overlay_proposal",
    ]);
    registration.abort();
  });

  it("returns the human-edited position on the next get_timeline call", async () => {
    const project = createDemoProject();
    const moment = firstMoment(project);
    const store = createRelayLabStore(project);
    const modelContext = new FakeModelContext();
    const registration = registerRelayLabTools(modelContext, store);
    await registration.ready;
    const initialIds = new Set(
      store.getState().getTimeline().overlays.map(({ id }) => id),
    );

    const duration = Math.min(4, moment.sourceEnd - moment.sourceStart);
    await modelContext.invoke("propose_overlay", {
      momentId: moment.id,
      timelineStart: 8,
      duration,
      reason: "Agent proposal before human review.",
    });

    const proposed = store
      .getState()
      .getTimeline()
      .overlays.find(({ id }) => !initialIds.has(id));

    expect(proposed).toBeDefined();
    if (!proposed) return;

    const resizedDuration = Math.min(2.5, duration);
    const humanStart = Math.min(20, project.duration - resizedDuration);
    const humanEnd = humanStart + resizedDuration;

    store.getState().updateOverlay(proposed.id, {
      timelineStart: humanStart,
      duration: resizedDuration,
    });

    const rawTimeline = await modelContext.invoke("get_timeline");
    const timeline = unwrapToolResult<TimelineResult>(rawTimeline);
    const reread = timeline.overlays.find(({ id }) => id === proposed.id);

    expect(reread).toMatchObject({
      id: proposed.id,
      timelineStart: humanStart,
      timelineEnd: humanEnd,
      sourceStart: moment.sourceStart,
      sourceEnd: moment.sourceStart + resizedDuration,
      status: "ghost",
      createdBy: "agent",
    });
    expect(timeline).toMatchObject({
      brollTrack: { audioPolicy: "muted" },
      baseTrack: { audioPolicy: "master", locked: true },
    });

    registration.abort();
  });

  it("removes successful registrations when a sibling tool fails", async () => {
    const store = createRelayLabStore(createDemoProject());
    const active = new Set<string>();
    const registrationSignals: AbortSignal[] = [];
    const modelContext = {
      async registerTool(
        tool: WebMCP.ModelContextTool,
        options?: WebMCP.ModelContextRegisterToolOptions,
      ): Promise<void> {
        if (options?.signal) registrationSignals.push(options.signal);
        if (tool.name === "get_transcript") {
          throw new DOMException("Synthetic registration failure", "InvalidStateError");
        }
        active.add(tool.name);
        options?.signal?.addEventListener("abort", () => active.delete(tool.name), {
          once: true,
        });
      },
    };

    const registration = registerRelayLabTools(modelContext, store);
    const results = await registration.ready;

    expect(results.some((result) => result.status === "rejected")).toBe(true);
    expect(active).toEqual(new Set());
    expect(registration.getActiveNames()).toEqual([]);
    expect(registrationSignals).toHaveLength(6);
    expect(registrationSignals.filter((signal) => signal.aborted)).toHaveLength(6);

    registration.abort();
    expect(active).toEqual(new Set());
    expect(registrationSignals.every((signal) => signal.aborted)).toBe(true);
  });
});
