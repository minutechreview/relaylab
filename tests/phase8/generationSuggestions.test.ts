import { describe, expect, it } from "vitest";

import { createDemoProject } from "@/lib/demo/project";
import { createRelayLabStore } from "@/lib/editor/store";
import { timelineTimeToSourceTime } from "@/lib/editor/timeline";
import { createEditSpec } from "@/lib/export/editSpec";
import { createFfmpegExport } from "@/lib/export/ffmpeg";

const proposedInput = {
  timelineStart: 34.2,
  duration: 5,
  prompt: "Close-up of a manager reviewing a live operations dashboard on a tablet.",
  reason: "No uploaded source moment communicates the abstract operations concept.",
};

describe("human-gated generated B-roll state", () => {
  it("creates only a suggestion and does not start paid generation", () => {
    const store = createRelayLabStore(createDemoProject());
    const beforeAssets = store.getState().project.brollAssets.length;
    const result = store.getState().proposeGeneratedBroll(proposedInput);

    expect(result).toMatchObject({
      ok: true,
      status: "awaiting-human-generation",
      paidGenerationStarted: false,
    });
    expect(store.getState().project.brollAssets).toHaveLength(beforeAssets);
    if (!result.ok) return;
    expect(
      store
        .getState()
        .getTimeline()
        .generationSuggestions.find(({ id }) => id === result.suggestionId),
    ).toMatchObject({
      timelineStart: 34.2,
      timelineEnd: 39.2,
      status: "suggested",
    });
  });

  it("preserves an unresolved suggestion through approval and commit", () => {
    const store = createRelayLabStore(createDemoProject());
    const suggestion = store.getState().project.generationSuggestions[0];

    expect(store.getState().approvePlan()).toMatchObject({ ok: true, status: "approved" });
    expect(store.getState().commitApprovedPlan()).toMatchObject({ ok: true, status: "committed" });
    expect(store.getState().project.generationSuggestions).toContainEqual(suggestion);
    expect(store.getState().project.brollAssets.some((asset) => asset.origin === "generated")).toBe(false);
  });

  it("keeps the suggestion and a useful error after generation fails", () => {
    const store = createRelayLabStore(createDemoProject());
    const suggestionId = store.getState().project.generationSuggestions[0].id;

    expect(store.getState().beginGeneratedBroll(suggestionId)).toMatchObject({ ok: true });
    expect(store.getState().failGeneratedBroll(suggestionId, "Provider queue timed out.")).toBe(true);
    expect(
      store.getState().project.generationSuggestions.find(({ id }) => id === suggestionId),
    ).toMatchObject({ status: "failed", error: "Provider queue timed out." });
  });

  it("turns a human-generated result into a normal muted ghost overlay", () => {
    const store = createRelayLabStore(createDemoProject());
    const suggestion = store.getState().project.generationSuggestions[0];
    store.getState().beginGeneratedBroll(suggestion.id);

    const result = store.getState().completeGeneratedBroll({
      suggestionId: suggestion.id,
      sourceUrl: "https://cdn.example.com/generated-manager.mp4",
      provider: "fal.ai",
      model: "configured-model",
      duration: 5,
    });

    expect(result).toMatchObject({ ok: true, brollAudio: "muted" });
    if (!result.ok) return;
    const asset = store.getState().project.brollAssets.find(({ id }) => id === result.assetId);
    const overlay = store.getState().project.overlays.find(({ id }) => id === result.overlayId);
    expect(asset).toMatchObject({
      origin: "generated",
      objectUrl: "https://cdn.example.com/generated-manager.mp4",
      generation: { provider: "fal.ai", model: "configured-model" },
    });
    expect(overlay).toMatchObject({
      assetId: result.assetId,
      momentId: result.momentId,
      timelineStart: suggestion.timelineStart,
      timelineEnd: suggestion.timelineEnd,
      sourceStart: 0,
      sourceEnd: 5,
      status: "ghost",
      lockedByHuman: false,
    });
    expect(timelineTimeToSourceTime(overlay!, suggestion.timelineStart + 2)).toBe(2);
    expect(store.getState().getTimeline().brollTrack.audioPolicy).toBe("muted");
  });

  it("does not allow approval while a paid generation request is in flight", () => {
    const store = createRelayLabStore(createDemoProject());
    const suggestionId = store.getState().project.generationSuggestions[0].id;
    store.getState().beginGeneratedBroll(suggestionId);

    expect(store.getState().approvePlan()).toMatchObject({
      ok: false,
      code: "SUGGESTION_BUSY",
    });
    expect(
      store.getState().replaceBaseMedia({
        name: "replacement.mp4",
        duration: 10,
        objectUrl: "blob:replacement",
      }),
    ).toMatchObject({ ok: false, code: "SUGGESTION_BUSY" });
    expect(store.getState().project.status).toBe("planning");
  });

  it("makes another paid attempt impossible without another explicit begin action", () => {
    const store = createRelayLabStore(createDemoProject());
    const suggestionId = store.getState().project.generationSuggestions[0].id;
    store.getState().beginGeneratedBroll(suggestionId);
    store.getState().failGeneratedBroll(suggestionId, "First attempt failed.");

    expect(
      store.getState().completeGeneratedBroll({
        suggestionId,
        sourceUrl: "https://cdn.example.com/should-not-be-used.mp4",
        provider: "fal.ai",
        model: "configured-model",
        duration: 5,
      }),
    ).toMatchObject({ ok: false, code: "INVALID_GENERATION_RESULT" });
    expect(store.getState().beginGeneratedBroll(suggestionId)).toMatchObject({
      ok: true,
      status: "generating",
    });
  });

  it("treats a generated clip as normal locked B-roll and rejects agent mutation", () => {
    const store = createRelayLabStore(createDemoProject());
    const suggestion = store.getState().project.generationSuggestions[0];
    store.getState().beginGeneratedBroll(suggestion.id);
    const completed = store.getState().completeGeneratedBroll({
      suggestionId: suggestion.id,
      sourceUrl: "https://cdn.example.com/generated-manager.mp4",
      provider: "fal.ai",
      model: "configured-model",
      duration: 5,
    });
    expect(completed.ok).toBe(true);
    if (!completed.ok) return;
    store.getState().setOverlayLocked(completed.overlayId, true);

    expect(
      store.getState().updateOverlay(completed.overlayId, { timelineStart: 20 }),
    ).toMatchObject({ ok: false, code: "HUMAN_LOCKED" });
    expect(
      store.getState().replaceGeneratedBroll({
        assetId: completed.assetId,
        operationId: "not-started",
        sourceUrl: "https://cdn.example.com/regenerated.mp4",
        provider: "fal.ai",
        model: "configured-model",
        duration: 5,
        prompt: "A different generated clip.",
      }),
    ).toMatchObject({ ok: false, code: "HUMAN_LOCKED" });
  });

  it("keeps generated B-roll muted in the portable export contract", () => {
    const store = createRelayLabStore(createDemoProject());
    const suggestion = store.getState().project.generationSuggestions[0];
    store.getState().beginGeneratedBroll(suggestion.id);
    const completed = store.getState().completeGeneratedBroll({
      suggestionId: suggestion.id,
      sourceUrl: "https://cdn.example.com/generated-manager.mp4",
      provider: "fal.ai",
      model: "configured-model",
      duration: 5,
    });
    expect(completed.ok).toBe(true);
    if (!completed.ok) return;

    const spec = createEditSpec(store.getState().project);
    expect(spec.audioPolicy).toMatchObject({
      masterSource: "base",
      brollAudio: "muted",
      includeBrollAudio: false,
    });
    expect(
      spec.timeline.overlays.find(({ id }) => id === completed.overlayId)?.audioPolicy,
    ).toBe("muted");
    expect(
      spec.sources.broll.find(({ id }) => id === completed.assetId),
    ).toMatchObject({
      origin: "generated",
      referenceKind: "provider-url-requires-download",
      generation: {
        provider: "fal.ai",
        model: "configured-model",
        prompt: suggestion.prompt,
      },
      retrieval: {
        url: "https://cdn.example.com/generated-manager.mp4",
        downloadAs: expect.stringMatching(/generated\.mp4$/u),
      },
      audioPolicy: "muted",
    });

    store.getState().approvePlan();
    store.getState().commitApprovedPlan();
    const rendered = createFfmpegExport(store.getState().project, {
      burnCaptions: false,
    });
    expect(rendered.ok).toBe(true);
    if (!rendered.ok) return;
    expect(rendered.script).toContain(
      "REQUIRED GENERATED SOURCE: download https://cdn.example.com/generated-manager.mp4",
    );
    expect(rendered.script).toContain("as gen_demo_manager-generated.mp4");
  });

  it("clamps direct suggestion geometry and validates required editorial text", () => {
    const store = createRelayLabStore(createDemoProject());
    const result = store.getState().proposeGeneratedBroll({
      ...proposedInput,
      timelineStart: -30,
      duration: 99,
    });
    expect(result).toMatchObject({
      ok: true,
      timelineStart: 0,
      timelineEnd: 10,
      paidGenerationStarted: false,
    });
    expect(
      store.getState().proposeGeneratedBroll({ ...proposedInput, prompt: "   " }),
    ).toMatchObject({ ok: false, code: "INVALID_ARGUMENTS" });
    expect(
      store.getState().proposeGeneratedBroll({ ...proposedInput, reason: "   " }),
    ).toMatchObject({ ok: false, code: "INVALID_ARGUMENTS" });
  });

  it("defends every suggestion mutation against missing, busy, and stale state", () => {
    const store = createRelayLabStore(createDemoProject());
    const suggestionId = store.getState().project.generationSuggestions[0].id;
    expect(store.getState().updateGeneratedBrollSuggestion("missing", { duration: 4 })).toMatchObject({
      ok: false,
      code: "SUGGESTION_NOT_FOUND",
    });
    expect(store.getState().removeGeneratedBrollSuggestion("missing")).toMatchObject({
      ok: false,
      code: "SUGGESTION_NOT_FOUND",
    });
    expect(store.getState().beginGeneratedBroll("missing")).toMatchObject({
      ok: false,
      code: "SUGGESTION_NOT_FOUND",
    });

    expect(
      store.getState().updateGeneratedBrollSuggestion(suggestionId, {
        timelineStart: 200,
        duration: 4,
        prompt: "A revised manager dashboard shot.",
        reason: "A revised editorial reason.",
      }),
    ).toMatchObject({ ok: true, timelineStart: 80.4, timelineEnd: 84.4 });
    expect(
      store.getState().updateGeneratedBrollSuggestion(suggestionId, { prompt: " " }),
    ).toMatchObject({ ok: false, code: "INVALID_ARGUMENTS" });

    store.getState().beginGeneratedBroll(suggestionId);
    expect(store.getState().beginGeneratedBroll(suggestionId)).toMatchObject({
      ok: false,
      code: "SUGGESTION_BUSY",
    });
    expect(
      store.getState().updateGeneratedBrollSuggestion(suggestionId, { duration: 3 }),
    ).toMatchObject({ ok: false, code: "SUGGESTION_BUSY" });
    expect(store.getState().removeGeneratedBrollSuggestion(suggestionId)).toMatchObject({
      ok: false,
      code: "SUGGESTION_BUSY",
    });

    store.getState().failGeneratedBroll(suggestionId, "");
    expect(
      store.getState().project.generationSuggestions.find(({ id }) => id === suggestionId),
    ).toMatchObject({
      status: "failed",
      error: "Video generation failed. Please try again.",
    });
    expect(store.getState().failGeneratedBroll(suggestionId, "again")).toBe(false);

    store.getState().approvePlan();
    expect(store.getState().updateGeneratedBrollSuggestion(suggestionId, { duration: 3 })).toMatchObject({
      ok: false,
      code: "INVALID_PROJECT_STATE",
    });
    expect(store.getState().removeGeneratedBrollSuggestion(suggestionId)).toMatchObject({
      ok: false,
      code: "INVALID_PROJECT_STATE",
    });
    expect(store.getState().beginGeneratedBroll(suggestionId)).toMatchObject({
      ok: false,
      code: "INVALID_PROJECT_STATE",
    });
  });

  it("rejects malformed or out-of-sequence generated results", () => {
    const store = createRelayLabStore(createDemoProject());
    const suggestionId = store.getState().project.generationSuggestions[0].id;
    expect(
      store.getState().completeGeneratedBroll({
        suggestionId: "missing",
        sourceUrl: "https://cdn.example.com/video.mp4",
        provider: "fal.ai",
        model: "model",
        duration: 5,
      }),
    ).toMatchObject({ ok: false, code: "SUGGESTION_NOT_FOUND" });
    expect(
      store.getState().completeGeneratedBroll({
        suggestionId,
        sourceUrl: "https://cdn.example.com/video.mp4",
        provider: "fal.ai",
        model: "model",
        duration: 5,
      }),
    ).toMatchObject({ ok: false, code: "INVALID_GENERATION_RESULT" });

    store.getState().beginGeneratedBroll(suggestionId);
    for (const malformed of [
      { sourceUrl: "http://insecure.example/video.mp4", provider: "fal.ai", model: "model", duration: 5 },
      { sourceUrl: "https://cdn.example/video.mp4", provider: "", model: "model", duration: 5 },
      { sourceUrl: "https://cdn.example/video.mp4", provider: "fal.ai", model: "", duration: 5 },
      { sourceUrl: "https://cdn.example/video.mp4", provider: "fal.ai", model: "model", duration: 0 },
    ]) {
      expect(
        store.getState().completeGeneratedBroll({ suggestionId, ...malformed }),
      ).toMatchObject({ ok: false, code: "INVALID_GENERATION_RESULT" });
    }
  });

  it("replaces an unlocked generated source only after a new human result", () => {
    const store = createRelayLabStore(createDemoProject());
    const suggestion = store.getState().project.generationSuggestions[0];
    store.getState().beginGeneratedBroll(suggestion.id);
    const completed = store.getState().completeGeneratedBroll({
      suggestionId: suggestion.id,
      sourceUrl: "https://cdn.example.com/first.mp4",
      provider: "fal.ai",
      model: "first-model",
      duration: 5,
    });
    expect(completed.ok).toBe(true);
    if (!completed.ok) return;

    expect(
      store.getState().beginGeneratedBrollReplacement("missing"),
    ).toMatchObject({ ok: false, code: "ASSET_NOT_FOUND" });
    const started = store.getState().beginGeneratedBrollReplacement(completed.assetId);
    expect(started).toMatchObject({ ok: true, status: "regenerating" });
    if (!started.ok) return;
    expect(
      store.getState().replaceGeneratedBroll({
        assetId: completed.assetId,
        operationId: started.operationId,
        sourceUrl: "javascript:alert(1)",
        provider: "fal.ai",
        model: "second-model",
        duration: 3,
        prompt: "A new dashboard angle.",
      }),
    ).toMatchObject({ ok: false, code: "INVALID_GENERATION_RESULT" });

    const replaced = store.getState().replaceGeneratedBroll({
      assetId: completed.assetId,
      operationId: started.operationId,
      sourceUrl: "https://cdn.example.com/second.mp4",
      provider: "fal.ai",
      model: "second-model",
      duration: 3,
      prompt: "A new dashboard angle.",
    });
    expect(replaced).toMatchObject({ ok: true, brollAudio: "muted" });
    expect(
      store.getState().project.brollAssets.find(({ id }) => id === completed.assetId),
    ).toMatchObject({
      duration: 3,
      objectUrl: "https://cdn.example.com/second.mp4",
      generation: { model: "second-model", prompt: "A new dashboard angle." },
    });
    expect(
      store.getState().project.overlays.find(({ id }) => id === completed.overlayId),
    ).toMatchObject({ sourceStart: 0, sourceEnd: 3, timelineEnd: suggestion.timelineStart + 3 });
  });

  it("guards regeneration before spending and blocks approval or base replacement in flight", () => {
    const store = createRelayLabStore(createDemoProject());
    const suggestion = store.getState().project.generationSuggestions[0];
    store.getState().beginGeneratedBroll(suggestion.id);
    const completed = store.getState().completeGeneratedBroll({
      suggestionId: suggestion.id,
      sourceUrl: "https://cdn.example.com/first.mp4",
      provider: "fal.ai",
      model: "first-model",
      duration: 5,
    });
    expect(completed.ok).toBe(true);
    if (!completed.ok) return;

    const started = store.getState().beginGeneratedBrollReplacement(completed.assetId);
    expect(started).toMatchObject({ ok: true, status: "regenerating" });
    if (!started.ok) return;
    expect(store.getState().beginGeneratedBrollReplacement(completed.assetId)).toMatchObject({
      ok: false,
      code: "GENERATION_BUSY",
    });
    expect(
      store.getState().updateOverlay(completed.overlayId, { timelineStart: 12 }),
    ).toMatchObject({ ok: false, code: "GENERATION_BUSY" });
    expect(store.getState().removeOverlayProposal(completed.overlayId)).toMatchObject({
      ok: false,
      code: "GENERATION_BUSY",
    });
    const uploadedMomentId = store
      .getState()
      .project.brollAssets.flatMap((asset) => asset.moments)
      .find((moment) => moment.assetId !== completed.assetId)?.id;
    expect(uploadedMomentId).toBeDefined();
    if (!uploadedMomentId) return;
    expect(
      store.getState().swapOverlayMoment(completed.overlayId, uploadedMomentId),
    ).toMatchObject({ ok: false, code: "GENERATION_BUSY" });
    expect(store.getState().setOverlayLocked(completed.overlayId, true)).toMatchObject({
      ok: false,
      code: "GENERATION_BUSY",
    });
    expect(store.getState().moveOverlay(completed.overlayId, 12)).toBe(false);
    expect(store.getState().resizeOverlayStart(completed.overlayId, 11)).toBe(false);
    expect(store.getState().resizeOverlayEnd(completed.overlayId, 18)).toBe(false);
    expect(store.getState().approvePlan()).toMatchObject({
      ok: false,
      code: "GENERATION_BUSY",
    });
    expect(
      store.getState().replaceBaseMedia({
        name: "replacement.mp4",
        duration: 10,
        objectUrl: "blob:replacement",
      }),
    ).toMatchObject({ ok: false, code: "GENERATION_BUSY" });

    expect(
      store.getState().replaceGeneratedBroll({
        assetId: completed.assetId,
        operationId: "stale-operation",
        sourceUrl: "https://cdn.example.com/stale.mp4",
        provider: "fal.ai",
        model: "second-model",
        duration: 4,
        prompt: "A stale dashboard angle.",
      }),
    ).toMatchObject({ ok: false, code: "INVALID_GENERATION_RESULT" });
    expect(
      store
        .getState()
        .failGeneratedBrollReplacement(completed.assetId, "stale-operation", "stale"),
    ).toBe(false);
    expect(
      store
        .getState()
        .failGeneratedBrollReplacement(completed.assetId, started.operationId, "cancelled"),
    ).toBe(true);
    expect(store.getState().approvePlan()).toMatchObject({ ok: true });
  });

  it("never reuses overlay or generation-suggestion IDs after deletion", () => {
    const store = createRelayLabStore(createDemoProject());
    const firstOverlay = store.getState().proposeOverlay({
      momentId: "moment_workspace_overhead",
      timelineStart: 2,
      duration: 3,
      reason: "First proposal.",
    });
    expect(firstOverlay.ok).toBe(true);
    if (!firstOverlay.ok) return;
    store.getState().removeOverlayProposal(firstOverlay.overlayId);
    const secondOverlay = store.getState().proposeOverlay({
      momentId: "moment_workspace_overhead",
      timelineStart: 6,
      duration: 3,
      reason: "Second proposal.",
    });
    expect(secondOverlay.ok).toBe(true);
    if (!secondOverlay.ok) return;
    expect(secondOverlay.overlayId).not.toBe(firstOverlay.overlayId);

    const firstSuggestion = store.getState().proposeGeneratedBroll(proposedInput);
    expect(firstSuggestion.ok).toBe(true);
    if (!firstSuggestion.ok) return;
    store.getState().removeGeneratedBrollSuggestion(firstSuggestion.suggestionId);
    const secondSuggestion = store.getState().proposeGeneratedBroll(proposedInput);
    expect(secondSuggestion.ok).toBe(true);
    if (!secondSuggestion.ok) return;
    expect(secondSuggestion.suggestionId).not.toBe(firstSuggestion.suggestionId);
  });
});
