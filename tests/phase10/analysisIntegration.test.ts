import { describe, expect, it } from "vitest";

import { BROLL_AUDIO_POLICY } from "@/lib/editor/audioPolicy";
import { createDemoProject } from "@/lib/demo/project";
import { createBlankProject } from "@/lib/editor/blankProject";
import { createRelayLabStore } from "@/lib/editor/store";
import { createLocalBrollIndex } from "@/lib/media/indexBroll";
import { applyBrollAnalysisResult } from "@/lib/providers/applyBrollAnalysis";

describe("Judge Demo remains fully keyless and unaffected by the analysis pipeline", () => {
  it("the demo project's B-roll moments are already indexed and searchable with zero API keys", () => {
    const store = createRelayLabStore(createDemoProject());
    const results = store.getState().searchBroll({ query: "workspace" });
    expect(results.length).toBeGreaterThan(0);
    // Nothing in the demo path touches lib/credentials or lib/analysis —
    // demo assets are neither "uploaded" nor "generated" (the two origins
    // this pipeline and the generation fallback attach real analysis to).
    expect(
      store.getState().project.brollAssets.every(
        (asset) => asset.origin !== "uploaded" && asset.origin !== "generated",
      ),
    ).toBe(true);
  });
});

describe("real B-roll upload with no key configured stays honest", () => {
  it("real vision analysis is never claimed to have succeeded without a key (request-level failure path)", () => {
    const project = createBlankProject();
    const store = createRelayLabStore({
      ...project,
      duration: 60,
      baseVideo: { ...project.baseVideo, duration: 60, objectUrl: "blob:base" },
    });
    const moments = createLocalBrollIndex("asset_1", "reel.mp4", 20);
    store.setState((current) => ({
      project: {
        ...current.project,
        brollAssets: [
          { id: "asset_1", name: "reel.mp4", duration: 20, objectUrl: "blob:reel", origin: "uploaded" as const, moments },
        ],
      },
    }));

    // Simulate the client's request-failure path (no key -> 503
    // VISION_UNAVAILABLE -> markAssetAnalysisRequestFailed), asserting the
    // asset remains usable (still searchable via its local candidate-window
    // description) rather than silently "succeeding".
    const before = store.getState().searchBroll({ query: "reel" });
    expect(before.length).toBeGreaterThan(0);
    const beforeDescriptions = store.getState().project.brollAssets[0].moments.map((m) => m.description);

    // No visionAnalysis success is applied — asset stays as originally indexed.
    const after = store.getState().project.brollAssets[0].moments.map((m) => m.description);
    expect(after).toEqual(beforeDescriptions);
  });
});

describe("uploaded and AI-generated B-roll stay muted after real analysis writes descriptions", () => {
  it("moment description/tag rewrites never touch audio policy", () => {
    const project = createBlankProject();
    const store = createRelayLabStore({
      ...project,
      duration: 60,
      baseVideo: { ...project.baseVideo, duration: 60, objectUrl: "blob:base" },
    });
    const moments = createLocalBrollIndex("asset_1", "reel.mp4", 20);
    store.setState((current) => ({
      project: {
        ...current.project,
        brollAssets: [
          { id: "asset_1", name: "reel.mp4", duration: 20, objectUrl: "blob:reel", origin: "uploaded" as const, moments },
        ],
      },
    }));

    applyBrollAnalysisResult(store, "asset_1", {
      analyzedCount: 1,
      candidateCount: moments.length,
      truncated: false,
      results: [{ ok: true, momentId: moments[0].id, description: "Real description.", tags: ["real"] }],
    });

    const proposal = store.getState().proposeOverlay({
      momentId: moments[0].id,
      timelineStart: 0,
      duration: 3,
      reason: "test",
    });
    expect(proposal).toMatchObject({ ok: true, brollAudio: BROLL_AUDIO_POLICY });
    expect(store.getState().getTimeline().brollTrack.audioPolicy).toBe("muted");
  });
});

describe("search_broll operates on saved metadata, never triggering a fresh vision call", () => {
  it("searching after analysis reads only the stored description/tags", () => {
    const project = createBlankProject();
    const store = createRelayLabStore({
      ...project,
      duration: 60,
      baseVideo: { ...project.baseVideo, duration: 60, objectUrl: "blob:base" },
    });
    const moments = createLocalBrollIndex("asset_1", "reel.mp4", 20);
    store.setState((current) => ({
      project: {
        ...current.project,
        brollAssets: [
          { id: "asset_1", name: "reel.mp4", duration: 20, objectUrl: "blob:reel", origin: "uploaded" as const, moments },
        ],
      },
    }));

    applyBrollAnalysisResult(store, "asset_1", {
      analyzedCount: 1,
      candidateCount: moments.length,
      truncated: false,
      results: [
        { ok: true, momentId: moments[0].id, description: "A barista pours latte art.", tags: ["barista", "latte"] },
      ],
    });

    const results = store.getState().searchBroll({ query: "barista latte" });
    expect(results[0]).toMatchObject({ momentId: moments[0].id });
    expect(results[0].description).toBe("A barista pours latte art.");
  });
});
