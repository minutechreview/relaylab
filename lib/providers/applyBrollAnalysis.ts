import type { RelayLabStoreApi } from "@/lib/editor/store";
import type { BrollAsset } from "@/lib/editor/types";

import type {
  AssetVisionAnalysis,
  MomentAnalysisFailureRecord,
} from "./types";
import type { AnalyzeBrollAssetResult } from "@/lib/analysis/analyzeBrollAsset";

/**
 * `lib/editor/store.ts` is owned by another workstream in this build, so this
 * module mutates the shared store from the outside through the public
 * `StoreApi.setState()` surface (the same mechanism Zustand exposes to any
 * consumer) instead of adding new actions inside `store.ts`. All updates are
 * immutable copies, matching the store's own conventions.
 */
export interface BrollAssetWithVisionAnalysis extends BrollAsset {
  visionAnalysis?: AssetVisionAnalysis;
}

function getAsset(
  store: RelayLabStoreApi,
  assetId: string,
): BrollAssetWithVisionAnalysis | undefined {
  return store.getState().project.brollAssets.find(
    (asset) => asset.id === assetId,
  ) as BrollAssetWithVisionAnalysis | undefined;
}

function updateAsset(
  store: RelayLabStoreApi,
  assetId: string,
  update: (asset: BrollAssetWithVisionAnalysis) => BrollAssetWithVisionAnalysis,
): void {
  store.setState((current) => ({
    project: {
      ...current.project,
      brollAssets: current.project.brollAssets.map((asset) =>
        asset.id === assetId ? update(asset as BrollAssetWithVisionAnalysis) : asset,
      ),
    },
  }));
}

/** Mark an asset's analysis as in progress (shown as "Analyzing…" in the library). */
export function markAssetAnalysisProcessing(store: RelayLabStoreApi, assetId: string): void {
  updateAsset(store, assetId, (asset) => ({
    ...asset,
    visionAnalysis: {
      status: "processing",
      analyzedMomentCount: asset.visionAnalysis?.analyzedMomentCount ?? 0,
      totalMomentCount: asset.moments.length,
      truncated: asset.visionAnalysis?.truncated ?? false,
      failures: [],
    },
  }));
}

/** Record a whole-request failure (e.g. no key configured) without touching moment data. */
export function markAssetAnalysisRequestFailed(
  store: RelayLabStoreApi,
  assetId: string,
  requestError: string,
): void {
  updateAsset(store, assetId, (asset) => ({
    ...asset,
    visionAnalysis: {
      status: "failed",
      analyzedMomentCount: asset.visionAnalysis?.analyzedMomentCount ?? 0,
      totalMomentCount: asset.moments.length,
      truncated: asset.visionAnalysis?.truncated ?? false,
      failures: [],
      requestError,
    },
  }));
}

/**
 * Apply a completed `analyzeBrollAsset` batch result: successful moments get
 * their `description`/`tags` replaced with real vision output and
 * `analysisStatus: "indexed"`; failed moments keep their existing
 * (unindexed-candidate) description so search still degrades gracefully, and
 * are recorded so the UI can offer Retry. One asset's failures never touch
 * other assets or overlays — this only ever rewrites `brollAssets`.
 */
export function applyBrollAnalysisResult(
  store: RelayLabStoreApi,
  assetId: string,
  result: AnalyzeBrollAssetResult,
): void {
  const successByMoment = new Map(
    result.results.filter((entry) => entry.ok).map((entry) => [entry.momentId, entry]),
  );
  const failures: MomentAnalysisFailureRecord[] = result.results
    .filter((entry): entry is Extract<typeof entry, { ok: false }> => !entry.ok)
    .map((entry) => ({ momentId: entry.momentId, error: entry.error }));

  updateAsset(store, assetId, (asset) => ({
    ...asset,
    moments: asset.moments.map((moment) => {
      const success = successByMoment.get(moment.id);
      if (!success) return moment;
      return {
        ...moment,
        description: success.description,
        tags: success.tags,
        analysisStatus: "indexed" as const,
      };
    }),
    visionAnalysis: {
      status: failures.length > 0 && successByMoment.size === 0 ? "failed" : "ready",
      analyzedMomentCount: successByMoment.size,
      totalMomentCount: asset.moments.length,
      truncated: result.truncated,
      failures,
      analyzedAt: new Date().toISOString(),
    },
  }));
}

export function getAssetVisionAnalysis(
  store: RelayLabStoreApi,
  assetId: string,
): AssetVisionAnalysis | undefined {
  return getAsset(store, assetId)?.visionAnalysis;
}
