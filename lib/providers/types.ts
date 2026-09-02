/**
 * Types for the real vision-analysis pipeline and BYOK provider status.
 * Defined here (not in `lib/editor/types.ts`, which is owned elsewhere in
 * this workstream) so this feature layers on top of `BrollAsset`/`BrollMoment`
 * without editing that file. `AssetVisionAnalysis` is attached to a
 * `BrollAsset` as an additional `visionAnalysis?:` property via the store
 * extension in `lib/providers/applyBrollAnalysis.ts`; it is optional so
 * existing asset objects (demo project, generated B-roll) remain valid
 * without it.
 */

export type AssetAnalysisStatus = "pending" | "processing" | "ready" | "failed";

export interface MomentAnalysisFailureRecord {
  momentId: string;
  error: string;
}

export interface AssetVisionAnalysis {
  status: AssetAnalysisStatus;
  /** Count of moments with real vision-derived descriptions. */
  analyzedMomentCount: number;
  /** Total candidate moments considered for this asset. */
  totalMomentCount: number;
  /** True if candidateCount exceeded the per-asset analysis cap. */
  truncated: boolean;
  failures: MomentAnalysisFailureRecord[];
  /** Set when the whole request failed (e.g. no key configured, provider down). */
  requestError?: string;
  analyzedAt?: string;
}

export interface AiProviderStatus {
  openai: "available" | "not_configured";
  fal: "available" | "not_configured";
}
