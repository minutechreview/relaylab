import { describe, expect, it } from "vitest";

import { createBlankProject } from "@/lib/editor/blankProject";
import { createRelayLabStore } from "@/lib/editor/store";
import { createLocalBrollIndex } from "@/lib/media/indexBroll";
import {
  applyBrollAnalysisResult,
  getAssetVisionAnalysis,
  markAssetAnalysisProcessing,
  markAssetAnalysisRequestFailed,
} from "@/lib/providers/applyBrollAnalysis";

function storeWithUploadedAsset() {
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
        {
          id: "asset_1",
          name: "reel.mp4",
          duration: 20,
          objectUrl: "blob:reel",
          origin: "uploaded" as const,
          moments,
        },
      ],
    },
  }));
  return { store, moments };
}

describe("applyBrollAnalysisResult (store extension)", () => {
  it("marks an asset as processing without touching other assets", () => {
    const { store } = storeWithUploadedAsset();
    markAssetAnalysisProcessing(store, "asset_1");
    expect(getAssetVisionAnalysis(store, "asset_1")).toMatchObject({ status: "processing" });
  });

  it("rewrites successfully analyzed moments' description/tags and marks them indexed", () => {
    const { store, moments } = storeWithUploadedAsset();
    applyBrollAnalysisResult(store, "asset_1", {
      analyzedCount: 1,
      candidateCount: moments.length,
      truncated: false,
      results: [
        { ok: true, momentId: moments[0].id, description: "A barista steams milk.", tags: ["coffee"] },
      ],
    });

    const asset = store.getState().project.brollAssets.find((candidate) => candidate.id === "asset_1")!;
    const analyzedMoment = asset.moments.find((moment) => moment.id === moments[0].id)!;
    expect(analyzedMoment.description).toBe("A barista steams milk.");
    expect(analyzedMoment.tags).toEqual(["coffee"]);
    expect(analyzedMoment.analysisStatus).toBe("indexed");
  });

  it("leaves unanalyzed moments' description untouched (no fabricated content)", () => {
    const { store, moments } = storeWithUploadedAsset();
    const originalOtherDescription = moments[1].description;
    applyBrollAnalysisResult(store, "asset_1", {
      analyzedCount: 1,
      candidateCount: moments.length,
      truncated: false,
      results: [{ ok: true, momentId: moments[0].id, description: "Real.", tags: [] }],
    });

    const asset = store.getState().project.brollAssets.find((candidate) => candidate.id === "asset_1")!;
    const untouched = asset.moments.find((moment) => moment.id === moments[1].id)!;
    expect(untouched.description).toBe(originalOtherDescription);
  });

  it("records per-moment failures without discarding successful moments in the same batch", () => {
    const { store, moments } = storeWithUploadedAsset();
    applyBrollAnalysisResult(store, "asset_1", {
      analyzedCount: 2,
      candidateCount: moments.length,
      truncated: false,
      results: [
        { ok: true, momentId: moments[0].id, description: "Good.", tags: [] },
        { ok: false, momentId: moments[1].id, error: "provider timeout" },
      ],
    });

    const analysis = getAssetVisionAnalysis(store, "asset_1")!;
    expect(analysis.analyzedMomentCount).toBe(1);
    expect(analysis.failures).toEqual([{ momentId: moments[1].id, error: "provider timeout" }]);
    expect(analysis.status).toBe("ready");
  });

  it("a failed request on one asset never touches another asset's analysis state", () => {
    const { store } = storeWithUploadedAsset();
    store.setState((current) => ({
      project: {
        ...current.project,
        brollAssets: [
          ...current.project.brollAssets,
          { id: "asset_2", name: "other.mp4", duration: 10, objectUrl: "blob:other", origin: "uploaded" as const, moments: [] },
        ],
      },
    }));
    applyBrollAnalysisResult(store, "asset_2", { analyzedCount: 0, candidateCount: 0, truncated: false, results: [] });
    markAssetAnalysisRequestFailed(store, "asset_1", "OpenAI API key not configured");

    expect(getAssetVisionAnalysis(store, "asset_1")).toMatchObject({ status: "failed" });
    expect(getAssetVisionAnalysis(store, "asset_2")).toMatchObject({ status: "ready" });
  });
});
