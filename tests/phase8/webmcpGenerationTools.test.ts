import { afterEach, describe, expect, it, vi } from "vitest";

import { createDemoProject } from "@/lib/demo/project";
import { createRelayLabStore } from "@/lib/editor/store";
import { registerRelayLabTools } from "@/lib/webmcp/registerRelayLabTools";
import { FakeModelContext, unwrapToolResult } from "@/tests/helpers/fakeModelContext";

afterEach(() => vi.restoreAllMocks());

describe("WebMCP generation-suggestion trust boundary", () => {
  it("lets the agent propose metadata without invoking a paid provider", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const store = createRelayLabStore(createDemoProject());
    const context = new FakeModelContext();
    const registration = registerRelayLabTools(context, store);
    await registration.ready;

    const rawResult = await context.invoke("propose_generated_broll", {
      searchQuery: "restaurant manager monitors live inventory across stores on tablet",
      timelineStart: 33,
      duration: 5,
      prompt: "A restaurant manager reviews a live operations dashboard on a tablet.",
      reason: "No strong uploaded B-roll match exists for this abstract concept.",
    });
    const result = unwrapToolResult<{
      ok: boolean;
      suggestionId: string;
      paidGenerationStarted: boolean;
    }>(rawResult);

    expect(result).toMatchObject({ ok: true, paidGenerationStarted: false });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(
      store.getState().project.generationSuggestions.find(({ id }) => id === result.suggestionId),
    ).toBeDefined();
    registration.abort();
  });

  it("never exposes a tool that executes paid generation", async () => {
    const store = createRelayLabStore(createDemoProject());
    const context = new FakeModelContext();
    const registration = registerRelayLabTools(context, store);
    await registration.ready;

    expect(context.registeredToolNames).toEqual(
      expect.arrayContaining([
        "propose_generated_broll",
        "update_generated_broll_suggestion",
        "remove_generated_broll_suggestion",
      ]),
    );
    ["generate_video", "generate_broll", "regenerate_video", "approve_generation"].forEach(
      (forbidden) => expect(context.registeredToolNames).not.toContain(forbidden),
    );
    registration.abort();
  });

  it("removes suggestion tools after human approval while preserving the suggestion", async () => {
    const store = createRelayLabStore(createDemoProject());
    const context = new FakeModelContext();
    const registration = registerRelayLabTools(context, store);
    await registration.ready;
    const suggestion = store.getState().project.generationSuggestions[0];

    expect(store.getState().approvePlan()).toMatchObject({ ok: true });
    await registration.whenIdle();

    expect(context.registeredToolNames).not.toContain("propose_generated_broll");
    expect(context.registeredToolNames).not.toContain("update_generated_broll_suggestion");
    expect(context.registeredToolNames).not.toContain("remove_generated_broll_suggestion");
    expect(store.getState().project.generationSuggestions).toContainEqual(suggestion);
    expect(context.registeredToolNames).toContain("commit_approved_plan");
    registration.abort();
  });

  it("reports whether search should prefer uploaded footage or allow a fallback suggestion", async () => {
    const store = createRelayLabStore(createDemoProject());
    const context = new FakeModelContext();
    const registration = registerRelayLabTools(context, store);
    await registration.ready;

    const strong = unwrapToolResult<{
      recommendation: { kind: string; threshold: number; bestScore: number | null };
    }>(
      await context.invoke("search_broll", {
        query: "overhead designer arranging interface sketches laptop workspace planning",
        targetDuration: 5,
      }),
    );
    const weak = unwrapToolResult<{
      recommendation: { kind: string; threshold: number; bestScore: number | null };
    }>(
      await context.invoke("search_broll", {
        query: "restaurant manager monitors live inventory across stores on tablet",
        targetDuration: 5,
      }),
    );

    expect(strong.recommendation).toMatchObject({ kind: "uploaded_match", threshold: 0.65 });
    expect(weak.recommendation).toMatchObject({
      kind: "generation_suggestion_available",
      threshold: 0.65,
    });
    registration.abort();
  });

  it("validates suggestion schemas and supports metadata-only update and removal", async () => {
    const store = createRelayLabStore(createDemoProject());
    const context = new FakeModelContext();
    const registration = registerRelayLabTools(context, store);
    await registration.ready;

    expect(
      unwrapToolResult<{ ok: false; code: string }>(
        await context.invoke("propose_generated_broll", {
          searchQuery: "manager dashboard",
          timelineStart: 2,
          duration: 20,
          prompt: "short",
          reason: "reason",
        }),
      ),
    ).toMatchObject({ ok: false, code: "INVALID_ARGUMENTS" });
    expect(
      unwrapToolResult<{ ok: false; code: string }>(
        await context.invoke("update_generated_broll_suggestion", {
          suggestionId: "gen_demo_manager",
        }),
      ),
    ).toMatchObject({ ok: false, code: "INVALID_ARGUMENTS" });
    expect(
      unwrapToolResult<{ ok: false; code: string }>(
        await context.invoke("remove_generated_broll_suggestion", {}),
      ),
    ).toMatchObject({ ok: false, code: "INVALID_ARGUMENTS" });

    const updated = unwrapToolResult<{ ok: boolean; prompt: string }>(
      await context.invoke("update_generated_broll_suggestion", {
        suggestionId: "gen_demo_manager",
        prompt: "A revised restaurant operations dashboard shot with subtle camera motion.",
        duration: 4,
      }),
    );
    expect(updated).toMatchObject({ ok: true, prompt: expect.stringContaining("revised") });
    expect(
      unwrapToolResult<{ ok: boolean; removed: boolean }>(
        await context.invoke("remove_generated_broll_suggestion", {
          suggestionId: "gen_demo_manager",
        }),
      ),
    ).toMatchObject({ ok: true, removed: true });
    registration.abort();
  });

  it("enforces uploaded footage first and rejects unknown tool fields", async () => {
    const store = createRelayLabStore(createDemoProject());
    const context = new FakeModelContext();
    const registration = registerRelayLabTools(context, store);
    await registration.ready;

    expect(
      unwrapToolResult<{ ok: false; code: string }>(
        await context.invoke("propose_generated_broll", {
          searchQuery: "overhead designer arranging interface sketches laptop workspace planning",
          timelineStart: 20,
          duration: 5,
          prompt: "An overhead designer arranges interface sketches beside a laptop.",
          reason: "Support the design-process explanation.",
        }),
      ),
    ).toMatchObject({ ok: false, code: "UPLOADED_MATCH_AVAILABLE" });

    expect(
      unwrapToolResult<{ ok: false; code: string }>(
        await context.invoke("propose_generated_broll", {
          searchQuery: "restaurant manager dashboard",
          timelineStart: 33,
          duration: 5,
          prompt: "A restaurant manager reviews a live dashboard on a tablet.",
          reason: "No uploaded source communicates the operations concept.",
          unexpectedProviderOption: "must-not-be-silently-stripped",
        }),
      ),
    ).toMatchObject({ ok: false, code: "INVALID_ARGUMENTS" });
    registration.abort();
  });

  it("accepts an explicit search threshold without changing project state", async () => {
    const store = createRelayLabStore(createDemoProject());
    const before = store.getState().getTimeline();
    const context = new FakeModelContext();
    const registration = registerRelayLabTools(context, store);
    await registration.ready;

    const result = unwrapToolResult<{
      recommendation: { kind: string; threshold: number };
    }>(
      await context.invoke("search_broll", {
        query: "restaurant manager dashboard",
        targetDuration: 5,
        matchThreshold: 0,
      }),
    );
    expect(result.recommendation).toMatchObject({ kind: "uploaded_match", threshold: 0 });
    expect(store.getState().getTimeline()).toEqual(before);
    registration.abort();
  });
});
