export type ProjectStatus = "planning" | "approved" | "committed";

export interface WordTimestamp {
  word: string;
  start: number;
  end: number;
}

export interface TranscriptSegment {
  id: string;
  start: number;
  end: number;
  text: string;
  words?: WordTimestamp[];
}

export interface BaseVideo {
  id: string;
  name: string;
  duration: number;
  objectUrl: string | null;
}

export interface BrollMoment {
  id: string;
  assetId: string;
  sourceStart: number;
  sourceEnd: number;
  description: string;
  tags: string[];
  thumbnailDataUrl?: string;
  analysisStatus?: "unindexed" | "indexed";
}

export interface BrollAsset {
  id: string;
  name: string;
  duration: number;
  objectUrl: string | null;
  moments: BrollMoment[];
  /** Media kind for preview/export rendering. Absent means "video" (back-compat). */
  kind?: "video" | "image";
  origin?: "demo" | "uploaded" | "generated";
  generation?: {
    provider: string;
    model: string;
    prompt: string;
    sourceUrl: string;
    status: "ready" | "regenerating";
    attempt: number;
    operationId?: string;
    error?: string;
  };
}

export interface Overlay {
  id: string;
  assetId: string;
  momentId?: string;
  sourceStart: number;
  sourceEnd: number;
  timelineStart: number;
  timelineEnd: number;
  status: "ghost" | "committed";
  lockedByHuman: boolean;
  reason?: string;
  createdBy: "human" | "agent";
  /**
   * Ranked B-roll candidates considered but not chosen when this overlay was
   * proposed from search_broll/brollRecommendation results, kept for "why
   * this clip?" UI. Absent for human-placed overlays and overlays proposed
   * before this field existed.
   */
  alternatives?: CandidateReference[];
}

export interface Caption {
  id: string;
  start: number;
  end: number;
  text: string;
}

export type CaptionPosition = "top" | "center" | "bottom";

export interface CaptionStyle {
  position: CaptionPosition;
}

export interface AddCaptionInput {
  start: number;
  end: number;
  text: string;
}

export interface UpdateCaptionPatch {
  start?: number;
  end?: number;
  text?: string;
}

export type GenerationSuggestionStatus = "suggested" | "generating" | "failed";

export interface GeneratedBrollSuggestion {
  id: string;
  timelineStart: number;
  timelineEnd: number;
  duration: number;
  prompt: string;
  reason: string;
  status: GenerationSuggestionStatus;
  createdBy: "human" | "agent";
  error?: string;
}

export type ProjectAspectRatio = "16:9" | "9:16" | "1:1" | "4:5";

export interface Project {
  id: string;
  title: string;
  duration: number;
  status: ProjectStatus;
  /** Explicit output canvas shape, independent of whatever the base video's own dimensions happen to be. */
  aspectRatio: ProjectAspectRatio;
  baseVideo: BaseVideo;
  transcript: TranscriptSegment[];
  brollAssets: BrollAsset[];
  overlays: Overlay[];
  generationSuggestions: GeneratedBrollSuggestion[];
  captions: Caption[];
  captionStyle: CaptionStyle;
  pacingPreference: {
    maxTalkingHeadSeconds: number;
  };
  /**
   * Incremented on every material human or agent timeline mutation (overlay
   * add/update/remove/swap/lock, generation-suggestion add/update/remove,
   * generated B-roll completion). Read by `get_timeline`/`get_edit_plan` and
   * recorded on an `EditPlan` as `timelineRevisionUsed` so a stale replan can
   * be rejected safely instead of silently clobbering human changes.
   */
  timelineRevision: number;
  /**
   * Structured record of human editorial feedback the agent can read back,
   * e.g. a rejected/removed agent proposal for a given opportunity. Kept
   * intentionally small — this is not a preference-learning system, just
   * enough state for `replan_unlocked_sections` to avoid immediately
   * re-proposing something the human just rejected.
   */
  humanPreferences: HumanPreference[];
}

export type HumanPreferenceType = "rejected-moment";

export interface HumanPreference {
  type: HumanPreferenceType;
  /** The B-roll moment the human rejected for this slot. */
  momentId: string;
  /** The opportunity (pacing gap or semantic cue) the moment was proposed for, if known. */
  opportunityId?: string;
  createdAt: number;
}

export interface ProposeOverlayInput {
  momentId: string;
  timelineStart: number;
  duration: number;
  reason: string;
  /**
   * Optional revision the caller last read via get_timeline/get_edit_plan.
   * When provided and stale, the mutation is rejected with STALE_TIMELINE
   * instead of silently applying against a timeline the human already
   * changed. Omitted entirely, no staleness check runs (back-compat).
   */
  expectedTimelineRevision?: number;
}

export interface UpdateOverlayPatch {
  timelineStart?: number;
  duration?: number;
  sourceStart?: number;
  sourceEnd?: number;
  reason?: string;
  expectedTimelineRevision?: number;
}

export interface ProposeGeneratedBrollInput {
  timelineStart: number;
  duration: number;
  prompt: string;
  reason: string;
}

export interface UpdateGeneratedBrollPatch {
  timelineStart?: number;
  duration?: number;
  prompt?: string;
  reason?: string;
}

export interface CompleteGeneratedBrollInput {
  suggestionId: string;
  sourceUrl: string;
  provider: string;
  model: string;
  duration: number;
}

export interface ReplaceGeneratedBrollInput {
  assetId: string;
  operationId: string;
  sourceUrl: string;
  provider: string;
  model: string;
  duration: number;
  prompt: string;
}

export interface LocalMediaInput {
  name: string;
  duration: number;
  objectUrl: string;
  kind?: "video" | "image";
}

export type PlanPreflightStatus = "ready" | "warnings" | "blocked";
export type PlanPreflightSeverity = "info" | "warning" | "blocking";
export type PlanPreflightIssueCode =
  | "MISSING_BASE"
  | "INVALID_OVERLAY"
  | "OVERLAPPING_OVERLAYS"
  | "MISSING_TRANSCRIPT"
  | "UNRESOLVED_GENERATION"
  | "FAILED_GENERATION"
  | "GENERATION_IN_FLIGHT";

export interface PlanPreflightIssue {
  code: PlanPreflightIssueCode;
  severity: PlanPreflightSeverity;
  message: string;
  overlayIds?: string[];
  suggestionIds?: string[];
}

export interface PlanPreflight {
  status: PlanPreflightStatus;
  blockingCount: number;
  warningCount: number;
  infoCount: number;
  issues: PlanPreflightIssue[];
}

export interface TimelineSnapshot {
  projectId: string;
  projectStatus: ProjectStatus;
  duration: number;
  baseTrack: {
    id: string;
    name: string;
    locked: true;
    audioPolicy: "master";
  };
  brollTrack: {
    audioPolicy: "muted";
    overlayCount: number;
  };
  overlays: Overlay[];
  generationSuggestions: GeneratedBrollSuggestion[];
  preflight: PlanPreflight;
  /** Current value to pass back as expectedTimelineRevision on the next mutation. */
  timelineRevision: number;
}

export type ToolFailureCode =
  | "INVALID_ARGUMENTS"
  | "MOMENT_NOT_FOUND"
  | "OVERLAY_NOT_FOUND"
  | "HUMAN_LOCKED"
  | "INVALID_PROJECT_STATE"
  | "OVERLAY_NOT_GHOST"
  | "INVALID_MEDIA"
  | "ASSET_NOT_FOUND"
  | "SUGGESTION_NOT_FOUND"
  | "SUGGESTION_BUSY"
  | "GENERATION_BUSY"
  | "INVALID_GENERATION_RESULT"
  | "STALE_TIMELINE";

export interface ToolFailure {
  ok: false;
  code: ToolFailureCode;
  message: string;
}

export interface StaleTimelineFailure extends ToolFailure {
  code: "STALE_TIMELINE";
  expectedRevision: number;
  currentRevision: number;
}

export interface ProposalSuccess {
  ok: true;
  overlayId: string;
  status: "ghost";
  timelineStart: number;
  timelineEnd: number;
  sourceStart: number;
  sourceEnd: number;
  brollAudio: "muted";
}

export type ProposalResult = ProposalSuccess | ToolFailure;

export interface OverlayLockSuccess {
  ok: true;
  overlayId: string;
  lockedByHuman: boolean;
}

export interface RemoveOverlaySuccess {
  ok: true;
  overlayId: string;
  removed: true;
}

export interface SplitOverlaySuccess {
  ok: true;
  leftOverlayId: string;
  rightOverlayId: string;
  splitTime: number;
  brollAudio: "muted";
}

export type SplitOverlayResult = SplitOverlaySuccess | ToolFailure;

export interface ApprovalSuccess {
  ok: true;
  status: "approved";
  approvedOverlayIds: string[];
}

export interface CommitSuccess {
  ok: true;
  status: "committed";
  committedOverlayIds: string[];
  brollAudio: "muted";
}

export type OverlayLockResult = OverlayLockSuccess | ToolFailure;
export type RemoveOverlayResult = RemoveOverlaySuccess | ToolFailure;
export type ApprovalResult = ApprovalSuccess | ToolFailure;
export type CommitResult = CommitSuccess | ToolFailure;

export interface GeneratedBrollSuggestionSuccess {
  ok: true;
  suggestionId: string;
  timelineStart: number;
  timelineEnd: number;
  prompt: string;
  status: "awaiting-human-generation";
  paidGenerationStarted: false;
}

export interface RemoveGeneratedBrollSuggestionSuccess {
  ok: true;
  suggestionId: string;
  removed: true;
}

export interface BeginGeneratedBrollSuccess {
  ok: true;
  suggestionId: string;
  status: "generating";
}

export interface CompleteGeneratedBrollSuccess {
  ok: true;
  suggestionId: string;
  assetId: string;
  momentId: string;
  overlayId: string;
  brollAudio: "muted";
}

export interface ReplaceGeneratedBrollSuccess {
  ok: true;
  assetId: string;
  overlayIds: string[];
  brollAudio: "muted";
}

export interface BeginGeneratedBrollReplacementSuccess {
  ok: true;
  assetId: string;
  operationId: string;
  status: "regenerating";
}

export type GeneratedBrollSuggestionResult = GeneratedBrollSuggestionSuccess | ToolFailure;
export type RemoveGeneratedBrollSuggestionResult =
  | RemoveGeneratedBrollSuggestionSuccess
  | ToolFailure;
export type BeginGeneratedBrollResult = BeginGeneratedBrollSuccess | ToolFailure;
export type CompleteGeneratedBrollResult = CompleteGeneratedBrollSuccess | ToolFailure;
export type ReplaceGeneratedBrollResult = ReplaceGeneratedBrollSuccess | ToolFailure;
export type BeginGeneratedBrollReplacementResult =
  | BeginGeneratedBrollReplacementSuccess
  | ToolFailure;

export interface ReplaceBaseMediaSuccess {
  ok: true;
  baseVideoId: string;
  previousObjectUrl: string | null;
}

export interface AddBrollMediaSuccess {
  ok: true;
  assetIds: string[];
}

export type ReplaceBaseMediaResult = ReplaceBaseMediaSuccess | ToolFailure;
export type AddBrollMediaResult = AddBrollMediaSuccess | ToolFailure;

export interface ProjectSummary {
  projectId: string;
  title: string;
  duration: number;
  status: ProjectStatus;
  transcriptSegmentCount: number;
  brollAssetCount: number;
  indexedMomentCount: number;
  unindexedAssetCount: number;
  overlayCount: number;
  ghostOverlayCount: number;
  committedOverlayCount: number;
  generationSuggestionCount: number;
  generatingSuggestionCount: number;
  pacingPreference: { maxTalkingHeadSeconds: number };
  audioPolicy: { base: "master"; broll: "muted" };
  preflight: PlanPreflight;
  timelineRevision: number;
}

export interface GetTranscriptInput {
  /** Public WebMCP range name. */
  startSeconds?: number;
  /** Public WebMCP range name. */
  endSeconds?: number;
  /** @deprecated Kept as a small compatibility alias for existing callers. */
  startTime?: number;
  /** @deprecated Kept as a small compatibility alias for existing callers. */
  endTime?: number;
  maxSegments?: number;
}

export interface SetPacingPreferenceSuccess {
  ok: true;
  maxTalkingHeadSeconds: number;
}

export type SetPacingPreferenceResult = SetPacingPreferenceSuccess | ToolFailure;

/**
 * EditPlan is the first-class, structured answer to "what is the agent's
 * current editorial plan" — as opposed to "what clips are on the timeline."
 * It is derived from live overlay/generation-suggestion state, not stored
 * separately, so it can never drift from the timeline it describes.
 */
export type EditPlanStatus = "draft" | "needs-review" | "approved" | "committed";

export type EditDecisionType =
  | "uploaded-broll"
  | "generated-broll-suggestion"
  | "caption"
  | "leave-talking-head";

export type EditDecisionStatus =
  | "proposed"
  | "accepted"
  | "rejected"
  | "modified-by-human"
  | "locked";

export interface CandidateReference {
  momentId: string;
  assetId: string;
  assetName: string;
  score: number;
  description: string;
}

export interface EditDecision {
  id: string;
  type: EditDecisionType;
  timelineStart: number;
  timelineEnd: number;
  transcriptContext: string;
  reason: string;
  confidence?: number;
  status: EditDecisionStatus;
  createdBy: "human" | "agent";
  assetId?: string;
  momentId?: string;
  /** Ranked alternatives considered but not chosen, kept for "why this clip?" UI. */
  alternatives?: CandidateReference[];
}

export interface EditPlan {
  id: string;
  revision: number;
  createdAt: number;
  status: EditPlanStatus;
  objective?: string;
  pacingStyle?: string;
  decisions: EditDecision[];
  timelineRevisionUsed: number;
}

export interface ReplanUnlockedSectionsInput {
  objective?: string;
  preserveHumanChanges: true;
  timelineRevision: number;
}

export interface ReplanChange {
  decisionId: string;
  oldMoment: string | null;
  newMoment: string | null;
  reason: string;
}

export interface ReplanUnlockedSectionsSuccess {
  ok: true;
  preserved: string[];
  changed: ReplanChange[];
  timelineRevision: number;
}

export type ReplanUnlockedSectionsResult = ReplanUnlockedSectionsSuccess | StaleTimelineFailure | ToolFailure;
