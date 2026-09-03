import { createStore, type StoreApi } from "zustand/vanilla";

import { BASE_AUDIO_POLICY, BROLL_AUDIO_POLICY } from "./audioPolicy";
import { buildGenerationSuggestionCopy, planSuggestedPlacements, type SuggestPlacementsInput } from "./autoSuggest";
import { generateCaptionsFromTranscript } from "./captions";
import { getPlanPreflight } from "./planPreflight";
import { getEditPlan as deriveEditPlan } from "./editPlan";
import { replanUnlockedSections as replanUnlockedSectionsImpl } from "./replan";
import { searchBroll as searchBrollMoments, type SearchBrollQuery, type SearchBrollResult } from "./brollSearch";
import {
  findOverlayOpportunities as findOverlayOpportunitiesHeuristic,
  type FindOverlayOpportunitiesInput,
  type OverlayOpportunity,
} from "./overlayOpportunities";
import {
  createOverlayFromProposal,
  findMoment,
  moveOverlayGeometry,
  resizeOverlayEndGeometry,
  resizeOverlayStartGeometry,
  swapOverlayMomentGeometry,
  updateOverlaySourceGeometry,
} from "./timeline";
import { createLocalBrollIndex } from "@/lib/media/indexBroll";
import type {
  AddCaptionInput,
  AddBrollMediaResult,
  ApprovalResult,
  BeginGeneratedBrollResult,
  BeginGeneratedBrollReplacementResult,
  CommitResult,
  CompleteGeneratedBrollInput,
  CompleteGeneratedBrollResult,
  EditPlan,
  GeneratedBrollSuggestion,
  GeneratedBrollSuggestionResult,
  GetTranscriptInput,
  LocalMediaInput,
  Overlay,
  OverlayLockResult,
  Project,
  ProjectSummary,
  ProposalResult,
  ProposeGeneratedBrollInput,
  ProposeOverlayInput,
  RemoveGeneratedBrollSuggestionResult,
  RemoveOverlayResult,
  ReplaceGeneratedBrollInput,
  ReplaceGeneratedBrollResult,
  ReplaceBaseMediaResult,
  ReplanUnlockedSectionsInput,
  ReplanUnlockedSectionsResult,
  SetPacingPreferenceResult,
  SplitOverlayResult,
  StaleTimelineFailure,
  TimelineSnapshot,
  ToolFailure,
  TranscriptSegment,
  UpdateGeneratedBrollPatch,
  UpdateCaptionPatch,
  UpdateOverlayPatch,
  CaptionPosition,
} from "./types";

const MIN_PACING_PREFERENCE_SECONDS = 5;
const MAX_PACING_PREFERENCE_SECONDS = 30;
const DEFAULT_TRANSCRIPT_SEGMENT_LIMIT = 20;
const MAX_TRANSCRIPT_SEGMENT_LIMIT = 100;
const DEFAULT_BROLL_SEARCH_LIMIT = 10;
const MIN_GENERATION_DURATION_SECONDS = 1;
const MAX_GENERATION_DURATION_SECONDS = 10;

export interface RelayLabState {
  project: Project;
  selectedOverlayId: string | null;
  selectedSuggestionId: string | null;
  setSelectedOverlay: (overlayId: string | null) => void;
  setSelectedSuggestion: (suggestionId: string | null) => void;
  proposeOverlay: (input: ProposeOverlayInput) => ProposalResult;
  placeBrollMoment: (input: ProposeOverlayInput) => ProposalResult;
  splitOverlay: (overlayId: string, splitTime: number) => SplitOverlayResult;
  updateOverlay: (overlayId: string, patch: UpdateOverlayPatch) => ProposalResult;
  removeOverlayProposal: (overlayId: string) => RemoveOverlayResult;
  swapOverlayMoment: (overlayId: string, momentId: string) => ProposalResult;
  setOverlayLocked: (overlayId: string, locked: boolean) => OverlayLockResult;
  approvePlan: () => ApprovalResult;
  commitApprovedPlan: () => CommitResult;
  replaceBaseMedia: (media: LocalMediaInput) => ReplaceBaseMediaResult;
  addBrollMedia: (media: LocalMediaInput[]) => AddBrollMediaResult;
  replaceTranscript: (segments: TranscriptSegment[]) => number;
  generateCaptions: () => number;
  addCaption: (input: AddCaptionInput) => string | null;
  updateCaption: (captionId: string, patch: UpdateCaptionPatch) => boolean;
  removeCaption: (captionId: string) => boolean;
  setCaptionPosition: (position: CaptionPosition) => boolean;
  moveOverlay: (overlayId: string, timelineStart: number) => boolean;
  resizeOverlayStart: (overlayId: string, timelineStart: number) => boolean;
  resizeOverlayEnd: (overlayId: string, timelineEnd: number) => boolean;
  getTimeline: () => TimelineSnapshot;
  getEditPlan: () => EditPlan;
  getProjectSummary: () => ProjectSummary;
  getTranscript: (input: GetTranscriptInput) => TranscriptSegment[];
  findOverlayOpportunities: (input?: FindOverlayOpportunitiesInput) => OverlayOpportunity[];
  searchBroll: (query: SearchBrollQuery) => SearchBrollResult[];
  setPacingPreference: (maxTalkingHeadSeconds: number) => SetPacingPreferenceResult;
  proposeGeneratedBroll: (
    input: ProposeGeneratedBrollInput,
  ) => GeneratedBrollSuggestionResult;
  updateGeneratedBrollSuggestion: (
    suggestionId: string,
    patch: UpdateGeneratedBrollPatch,
  ) => GeneratedBrollSuggestionResult;
  removeGeneratedBrollSuggestion: (
    suggestionId: string,
  ) => RemoveGeneratedBrollSuggestionResult;
  beginGeneratedBroll: (suggestionId: string) => BeginGeneratedBrollResult;
  failGeneratedBroll: (suggestionId: string, message: string) => boolean;
  completeGeneratedBroll: (
    input: CompleteGeneratedBrollInput,
  ) => CompleteGeneratedBrollResult;
  replaceGeneratedBroll: (
    input: ReplaceGeneratedBrollInput,
  ) => ReplaceGeneratedBrollResult;
  beginGeneratedBrollReplacement: (
    assetId: string,
  ) => BeginGeneratedBrollReplacementResult;
  failGeneratedBrollReplacement: (
    assetId: string,
    operationId: string,
    message: string,
  ) => boolean;
  replanUnlockedSections: (
    input: ReplanUnlockedSectionsInput,
  ) => ReplanUnlockedSectionsResult;
  suggestPlacements: (input?: SuggestPlacementsInput) => SuggestPlacementsResult;
}

export interface SuggestPlacementsSuccess {
  ok: true;
  createdOverlayIds: string[];
  createdSuggestionIds: string[];
  /** Candidates whose proposal was rejected by the underlying store action (e.g. a race with a human edit). */
  skipped: number;
}

export type SuggestPlacementsResult = SuggestPlacementsSuccess | ToolFailure;

export type RelayLabStoreApi = StoreApi<RelayLabState>;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

/**
 * `timelineRevision` is incremented on every material human or agent
 * timeline mutation (overlay add/update/remove/swap/lock, generation
 * suggestion add/update/remove, and generated-B-roll completion). It is not
 * bumped by read-only actions, selection state, captions, or pacing
 * preference, since those do not change what "the timeline" means to a
 * caller replanning around it.
 */
function bumpRevision(project: Project): number {
  return project.timelineRevision + 1;
}

function normalizeSuggestionGeometry(
  projectDuration: number,
  timelineStart: number,
  duration: number,
): { timelineStart: number; timelineEnd: number; duration: number } {
  const safeProjectDuration = Math.max(0, projectDuration);
  const maximumDuration = Math.min(MAX_GENERATION_DURATION_SECONDS, safeProjectDuration);
  const minimumDuration = Math.min(MIN_GENERATION_DURATION_SECONDS, maximumDuration);
  const safeDuration = Number.isFinite(duration) ? duration : minimumDuration;
  const clampedDuration = clamp(safeDuration, minimumDuration, maximumDuration);
  const safeStart = Number.isFinite(timelineStart) ? timelineStart : 0;
  const clampedStart = clamp(safeStart, 0, Math.max(0, safeProjectDuration - clampedDuration));

  return {
    timelineStart: clampedStart,
    timelineEnd: clampedStart + clampedDuration,
    duration: clampedDuration,
  };
}

function suggestionFailure(suggestionId: string): ToolFailure {
  return {
    ok: false,
    code: "SUGGESTION_NOT_FOUND",
    message: `Generation suggestion ${suggestionId} does not exist.`,
  };
}

function suggestionBusyFailure(suggestionId: string): ToolFailure {
  return {
    ok: false,
    code: "SUGGESTION_BUSY",
    message: `Generation suggestion ${suggestionId} is currently generating and cannot be changed.`,
  };
}

function generationBusyFailure(assetId: string): ToolFailure {
  return {
    ok: false,
    code: "GENERATION_BUSY",
    message: `Generated B-roll asset ${assetId} has a paid regeneration request in flight.`,
  };
}

function regeneratingAssetIdForOverlay(project: Project, overlay: Overlay): string | null {
  const asset = project.brollAssets.find((candidate) => candidate.id === overlay.assetId);
  return asset?.generation?.status === "regenerating" ? asset.id : null;
}

function validGeneratedMediaUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:";
  } catch {
    return value.startsWith("/demo/") && !value.includes("..") && !value.includes("\\");
  }
}

function overlayFailure(overlayId: string): ToolFailure {
  return {
    ok: false,
    code: "OVERLAY_NOT_FOUND",
    message: `Overlay ${overlayId} does not exist.`,
  };
}

function invalidProjectState(expected: "planning" | "approved", actual: string): ToolFailure {
  return {
    ok: false,
    code: "INVALID_PROJECT_STATE",
    message: `This action requires project status ${expected}; current status is ${actual}.`,
  };
}

function missingBaseTimelineFailure(): ToolFailure {
  return {
    ok: false,
    code: "INVALID_ARGUMENTS",
    message: "Upload a base talking-head video before editing or approving the timeline.",
  };
}

function humanLockedFailure(overlayId: string): ToolFailure {
  return {
    ok: false,
    code: "HUMAN_LOCKED",
    message: `Overlay ${overlayId} is locked by the user and cannot be modified.`,
  };
}

function staleTimelineFailure(
  expectedRevision: number,
  currentRevision: number,
): StaleTimelineFailure {
  return {
    ok: false,
    code: "STALE_TIMELINE",
    expectedRevision,
    currentRevision,
    message:
      "The human changed the timeline after this plan was created. Read the current timeline and replan.",
  };
}

function invalidMediaFailure(message: string): ToolFailure {
  return { ok: false, code: "INVALID_MEDIA", message };
}

function isValidLocalMedia(media: LocalMediaInput): boolean {
  return (
    media.name.trim().length > 0 &&
    Number.isFinite(media.duration) &&
    media.duration > 0 &&
    media.objectUrl.trim().length > 0
  );
}

function mediaIdStem(name: string): string {
  return (
    name
      .replace(/\.[^.]+$/, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40) || "video"
  );
}

function nextMediaId(used: Set<string>, prefix: string, name: string): string {
  const base = `${prefix}_${mediaIdStem(name)}`;
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate)) {
    candidate = `${base}_${suffix}`;
    suffix += 1;
  }
  used.add(candidate);
  return candidate;
}

export function createRelayLabStore(initialProject: Project): RelayLabStoreApi {
  const issuedOverlayIds = new Set(initialProject.overlays.map((overlay) => overlay.id));
  const issuedSuggestionIds = new Set(
    initialProject.generationSuggestions.map((suggestion) => suggestion.id),
  );
  let overlaySequence = initialProject.overlays.length;
  let suggestionSequence = initialProject.generationSuggestions.length;
  let captionSequence = initialProject.captions.length;

  const issueOverlayId = () => {
    let candidate: string;
    do {
      overlaySequence += 1;
      candidate = `ov_agent_${overlaySequence}`;
    } while (issuedOverlayIds.has(candidate));
    issuedOverlayIds.add(candidate);
    return candidate;
  };

  const issueSuggestionId = () => {
    let candidate: string;
    do {
      suggestionSequence += 1;
      candidate = `gen_agent_${suggestionSequence}`;
    } while (issuedSuggestionIds.has(candidate));
    issuedSuggestionIds.add(candidate);
    return candidate;
  };

  const issueCaptionId = () => {
    captionSequence += 1;
    return `cap_human_${captionSequence}`;
  };

  return createStore<RelayLabState>((set, get) => ({
    project: structuredClone(initialProject),
    selectedOverlayId: initialProject.overlays.at(0)?.id ?? null,
    selectedSuggestionId: null,

    setSelectedOverlay: (selectedOverlayId) =>
      set({ selectedOverlayId, selectedSuggestionId: null }),
    setSelectedSuggestion: (selectedSuggestionId) =>
      set({ selectedSuggestionId, selectedOverlayId: null }),

    proposeOverlay: (input) => {
      const state = get();
      if (state.project.status !== "planning") {
        return invalidProjectState("planning", state.project.status);
      }
      if (state.project.duration <= 0) return missingBaseTimelineFailure();
      if (
        input.expectedTimelineRevision !== undefined &&
        input.expectedTimelineRevision !== state.project.timelineRevision
      ) {
        return staleTimelineFailure(
          input.expectedTimelineRevision,
          state.project.timelineRevision,
        );
      }
      const overlay = createOverlayFromProposal(
        state.project,
        input,
        issueOverlayId(),
      );

      if (!overlay) {
        return {
          ok: false,
          code: "MOMENT_NOT_FOUND",
          message: `B-roll moment ${input.momentId} does not exist.`,
        };
      }

      set((current) => ({
        project: {
          ...current.project,
          overlays: [...current.project.overlays, overlay],
          timelineRevision: bumpRevision(current.project),
        },
        selectedOverlayId: overlay.id,
        selectedSuggestionId: null,
      }));

      return {
        ok: true,
        overlayId: overlay.id,
        status: "ghost",
        timelineStart: overlay.timelineStart,
        timelineEnd: overlay.timelineEnd,
        sourceStart: overlay.sourceStart,
        sourceEnd: overlay.sourceEnd,
        brollAudio: BROLL_AUDIO_POLICY,
      };
    },

    placeBrollMoment: (input) => {
      const state = get();
      if (state.project.status !== "planning") {
        return invalidProjectState("planning", state.project.status);
      }
      if (state.project.duration <= 0) return missingBaseTimelineFailure();
      const overlay = createOverlayFromProposal(
        state.project,
        input,
        issueOverlayId(),
        "human",
      );
      if (!overlay) {
        return {
          ok: false,
          code: "MOMENT_NOT_FOUND",
          message: `B-roll moment ${input.momentId} does not exist.`,
        };
      }

      set((current) => ({
        project: {
          ...current.project,
          overlays: [...current.project.overlays, overlay],
          timelineRevision: bumpRevision(current.project),
        },
        selectedOverlayId: overlay.id,
        selectedSuggestionId: null,
      }));

      return {
        ok: true,
        overlayId: overlay.id,
        status: "ghost",
        timelineStart: overlay.timelineStart,
        timelineEnd: overlay.timelineEnd,
        sourceStart: overlay.sourceStart,
        sourceEnd: overlay.sourceEnd,
        brollAudio: BROLL_AUDIO_POLICY,
      };
    },

    splitOverlay: (overlayId, splitTime) => {
      const state = get();
      if (state.project.status !== "planning") {
        return invalidProjectState("planning", state.project.status);
      }
      const overlay = state.project.overlays.find((candidate) => candidate.id === overlayId);
      if (!overlay) return overlayFailure(overlayId);
      if (overlay.status !== "ghost") {
        return {
          ok: false,
          code: "OVERLAY_NOT_GHOST",
          message: `Overlay ${overlayId} is committed and cannot be split as a proposal.`,
        };
      }
      if (overlay.lockedByHuman) return humanLockedFailure(overlayId);
      const regeneratingAssetId = regeneratingAssetIdForOverlay(state.project, overlay);
      if (regeneratingAssetId) return generationBusyFailure(regeneratingAssetId);
      if (
        !Number.isFinite(splitTime) ||
        splitTime < overlay.timelineStart + 0.5 ||
        splitTime > overlay.timelineEnd - 0.5
      ) {
        return {
          ok: false,
          code: "INVALID_ARGUMENTS",
          message: "Split time must leave at least 0.5 seconds on both sides of the cut.",
        };
      }

      const sourceSplit = overlay.sourceStart + (splitTime - overlay.timelineStart);
      const rightOverlayId = issueOverlayId();
      const left: Overlay = {
        ...overlay,
        sourceEnd: sourceSplit,
        timelineEnd: splitTime,
      };
      const right: Overlay = {
        ...overlay,
        id: rightOverlayId,
        sourceStart: sourceSplit,
        timelineStart: splitTime,
      };
      set((current) => ({
        project: {
          ...current.project,
          overlays: current.project.overlays.flatMap((candidate) =>
            candidate.id === overlayId ? [left, right] : [candidate],
          ),
          timelineRevision: bumpRevision(current.project),
        },
        selectedOverlayId: rightOverlayId,
        selectedSuggestionId: null,
      }));
      return {
        ok: true,
        leftOverlayId: overlayId,
        rightOverlayId,
        splitTime,
        brollAudio: BROLL_AUDIO_POLICY,
      };
    },

    updateOverlay: (overlayId, patch) => {
      const state = get();
      if (state.project.status !== "planning") {
        return invalidProjectState("planning", state.project.status);
      }
      if (
        patch.expectedTimelineRevision !== undefined &&
        patch.expectedTimelineRevision !== state.project.timelineRevision
      ) {
        return staleTimelineFailure(
          patch.expectedTimelineRevision,
          state.project.timelineRevision,
        );
      }
      const current = state.project.overlays.find((overlay) => overlay.id === overlayId);
      if (!current) {
        return overlayFailure(overlayId);
      }
      const regeneratingAssetId = regeneratingAssetIdForOverlay(state.project, current);
      if (regeneratingAssetId) return generationBusyFailure(regeneratingAssetId);
      if (current.status !== "ghost") {
        return {
          ok: false,
          code: "OVERLAY_NOT_GHOST",
          message: `Overlay ${overlayId} is committed and cannot be changed as a proposal.`,
        };
      }
      if (current.lockedByHuman) {
        return humanLockedFailure(overlayId);
      }

      let next = current;
      if (
        patch.duration !== undefined ||
        patch.sourceStart !== undefined ||
        patch.sourceEnd !== undefined
      ) {
        const asset = state.project.brollAssets.find((candidate) => candidate.id === next.assetId);
        next = updateOverlaySourceGeometry(
          next,
          patch,
          state.project.duration,
          asset?.duration ?? next.sourceEnd,
        );
      }
      if (patch.timelineStart !== undefined) {
        // Apply a requested duration first so a combined update near the end
        // of the project clamps the start against the new, not old, length.
        next = moveOverlayGeometry(next, patch.timelineStart, state.project.duration);
      }
      if (patch.reason !== undefined) {
        next = { ...next, reason: patch.reason.trim() };
      }

      set((currentState) => ({
        project: {
          ...currentState.project,
          overlays: currentState.project.overlays.map((overlay) =>
            overlay.id === overlayId ? next : overlay,
          ),
          timelineRevision: bumpRevision(currentState.project),
        },
      }));

      return {
        ok: true,
        overlayId: next.id,
        status: "ghost",
        timelineStart: next.timelineStart,
        timelineEnd: next.timelineEnd,
        sourceStart: next.sourceStart,
        sourceEnd: next.sourceEnd,
        brollAudio: BROLL_AUDIO_POLICY,
      };
    },

    removeOverlayProposal: (overlayId) => {
      const state = get();
      if (state.project.status !== "planning") {
        return invalidProjectState("planning", state.project.status);
      }
      const overlay = state.project.overlays.find((candidate) => candidate.id === overlayId);
      if (!overlay) return overlayFailure(overlayId);
      const regeneratingAssetId = regeneratingAssetIdForOverlay(state.project, overlay);
      if (regeneratingAssetId) return generationBusyFailure(regeneratingAssetId);
      if (overlay.status !== "ghost") {
        return {
          ok: false,
          code: "OVERLAY_NOT_GHOST",
          message: `Overlay ${overlayId} is committed and cannot be removed as a proposal.`,
        };
      }
      if (overlay.lockedByHuman) return humanLockedFailure(overlayId);

      set((current) => ({
        project: {
          ...current.project,
          overlays: current.project.overlays.filter((candidate) => candidate.id !== overlayId),
          timelineRevision: bumpRevision(current.project),
          // Remember a rejected agent moment so replan_unlocked_sections does
          // not immediately re-propose the same source moment for the same
          // slot. Removing a human-authored overlay is not a "rejection" of
          // agent work, so it is not recorded.
          humanPreferences:
            overlay.createdBy === "agent" && overlay.momentId
              ? [
                  ...current.project.humanPreferences,
                  {
                    type: "rejected-moment" as const,
                    momentId: overlay.momentId,
                    createdAt: Date.now(),
                  },
                ]
              : current.project.humanPreferences,
        },
        selectedOverlayId:
          current.selectedOverlayId === overlayId
            ? current.project.overlays.find((candidate) => candidate.id !== overlayId)?.id ?? null
            : current.selectedOverlayId,
      }));

      return { ok: true, overlayId, removed: true };
    },

    swapOverlayMoment: (overlayId, momentId) => {
      const state = get();
      if (state.project.status !== "planning") {
        return invalidProjectState("planning", state.project.status);
      }
      const overlay = state.project.overlays.find((candidate) => candidate.id === overlayId);
      if (!overlay) return overlayFailure(overlayId);
      const regeneratingAssetId = regeneratingAssetIdForOverlay(state.project, overlay);
      if (regeneratingAssetId) return generationBusyFailure(regeneratingAssetId);
      if (overlay.status !== "ghost") {
        return {
          ok: false,
          code: "OVERLAY_NOT_GHOST",
          message: `Overlay ${overlayId} is committed and cannot be swapped as a proposal.`,
        };
      }
      if (overlay.lockedByHuman) return humanLockedFailure(overlayId);
      const match = findMoment(state.project, momentId);
      if (!match) {
        return {
          ok: false,
          code: "MOMENT_NOT_FOUND",
          message: `B-roll moment ${momentId} does not exist.`,
        };
      }

      const next = swapOverlayMomentGeometry(
        overlay,
        match.asset,
        match.moment,
        state.project.duration,
      );
      set((current) => ({
        project: {
          ...current.project,
          overlays: current.project.overlays.map((candidate) =>
            candidate.id === overlayId ? next : candidate,
          ),
          timelineRevision: bumpRevision(current.project),
        },
      }));

      return {
        ok: true,
        overlayId: next.id,
        status: "ghost",
        timelineStart: next.timelineStart,
        timelineEnd: next.timelineEnd,
        sourceStart: next.sourceStart,
        sourceEnd: next.sourceEnd,
        brollAudio: BROLL_AUDIO_POLICY,
      };
    },

    setOverlayLocked: (overlayId, lockedByHuman) => {
      const state = get();
      if (state.project.status !== "planning") {
        return invalidProjectState("planning", state.project.status);
      }
      const overlay = state.project.overlays.find((candidate) => candidate.id === overlayId);
      if (!overlay) return overlayFailure(overlayId);
      const regeneratingAssetId = regeneratingAssetIdForOverlay(state.project, overlay);
      if (regeneratingAssetId) return generationBusyFailure(regeneratingAssetId);
      if (overlay.status !== "ghost") {
        return {
          ok: false,
          code: "OVERLAY_NOT_GHOST",
          message: `Overlay ${overlayId} is committed; its lock state is frozen.`,
        };
      }

      set((current) => ({
        project: {
          ...current.project,
          overlays: current.project.overlays.map((candidate) =>
            candidate.id === overlayId
              ? { ...candidate, lockedByHuman }
              : candidate,
          ),
          timelineRevision: bumpRevision(current.project),
        },
      }));
      return { ok: true, overlayId, lockedByHuman };
    },

    proposeGeneratedBroll: (input) => {
      const state = get();
      if (state.project.status !== "planning") {
        return invalidProjectState("planning", state.project.status);
      }
      if (state.project.duration <= 0) return missingBaseTimelineFailure();

      const geometry = normalizeSuggestionGeometry(
        state.project.duration,
        input.timelineStart,
        input.duration,
      );
      const suggestion: GeneratedBrollSuggestion = {
        id: issueSuggestionId(),
        ...geometry,
        prompt: input.prompt.trim(),
        reason: input.reason.trim(),
        status: "suggested",
        createdBy: "agent",
      };

      if (!suggestion.prompt || !suggestion.reason) {
        return {
          ok: false,
          code: "INVALID_ARGUMENTS",
          message: "A generation suggestion requires a prompt and editorial reason.",
        };
      }

      set((current) => ({
        project: {
          ...current.project,
          generationSuggestions: [...current.project.generationSuggestions, suggestion],
          timelineRevision: bumpRevision(current.project),
        },
        selectedOverlayId: null,
        selectedSuggestionId: suggestion.id,
      }));

      return {
        ok: true,
        suggestionId: suggestion.id,
        timelineStart: suggestion.timelineStart,
        timelineEnd: suggestion.timelineEnd,
        prompt: suggestion.prompt,
        status: "awaiting-human-generation",
        paidGenerationStarted: false,
      };
    },

    updateGeneratedBrollSuggestion: (suggestionId, patch) => {
      const state = get();
      if (state.project.status !== "planning") {
        return invalidProjectState("planning", state.project.status);
      }
      const current = state.project.generationSuggestions.find(
        (suggestion) => suggestion.id === suggestionId,
      );
      if (!current) return suggestionFailure(suggestionId);
      if (current.status === "generating") return suggestionBusyFailure(suggestionId);

      const geometry = normalizeSuggestionGeometry(
        state.project.duration,
        patch.timelineStart ?? current.timelineStart,
        patch.duration ?? current.duration,
      );
      const prompt = patch.prompt?.trim() ?? current.prompt;
      const reason = patch.reason?.trim() ?? current.reason;
      if (!prompt || !reason) {
        return {
          ok: false,
          code: "INVALID_ARGUMENTS",
          message: "A generation suggestion requires a prompt and editorial reason.",
        };
      }

      const next: GeneratedBrollSuggestion = {
        ...current,
        ...geometry,
        prompt,
        reason,
        status: "suggested",
        error: undefined,
      };
      set((currentState) => ({
        project: {
          ...currentState.project,
          generationSuggestions: currentState.project.generationSuggestions.map((suggestion) =>
            suggestion.id === suggestionId ? next : suggestion,
          ),
          timelineRevision: bumpRevision(currentState.project),
        },
      }));

      return {
        ok: true,
        suggestionId,
        timelineStart: next.timelineStart,
        timelineEnd: next.timelineEnd,
        prompt: next.prompt,
        status: "awaiting-human-generation",
        paidGenerationStarted: false,
      };
    },

    removeGeneratedBrollSuggestion: (suggestionId) => {
      const state = get();
      if (state.project.status !== "planning") {
        return invalidProjectState("planning", state.project.status);
      }
      const suggestion = state.project.generationSuggestions.find(
        (candidate) => candidate.id === suggestionId,
      );
      if (!suggestion) return suggestionFailure(suggestionId);
      if (suggestion.status === "generating") return suggestionBusyFailure(suggestionId);

      set((current) => ({
        project: {
          ...current.project,
          generationSuggestions: current.project.generationSuggestions.filter(
            (candidate) => candidate.id !== suggestionId,
          ),
          timelineRevision: bumpRevision(current.project),
        },
        selectedSuggestionId:
          current.selectedSuggestionId === suggestionId ? null : current.selectedSuggestionId,
      }));
      return { ok: true, suggestionId, removed: true };
    },

    beginGeneratedBroll: (suggestionId) => {
      const state = get();
      if (state.project.status !== "planning") {
        return invalidProjectState("planning", state.project.status);
      }
      const suggestion = state.project.generationSuggestions.find(
        (candidate) => candidate.id === suggestionId,
      );
      if (!suggestion) return suggestionFailure(suggestionId);
      if (suggestion.status === "generating") return suggestionBusyFailure(suggestionId);

      set((current) => ({
        project: {
          ...current.project,
          generationSuggestions: current.project.generationSuggestions.map((candidate) =>
            candidate.id === suggestionId
              ? { ...candidate, status: "generating" as const, error: undefined }
              : candidate,
          ),
        },
      }));
      return { ok: true, suggestionId, status: "generating" };
    },

    failGeneratedBroll: (suggestionId, message) => {
      const state = get();
      const suggestion = state.project.generationSuggestions.find(
        (candidate) => candidate.id === suggestionId,
      );
      if (!suggestion || suggestion.status !== "generating") return false;
      const error = message.trim().slice(0, 500) || "Video generation failed. Please try again.";
      set((current) => ({
        project: {
          ...current.project,
          generationSuggestions: current.project.generationSuggestions.map((candidate) =>
            candidate.id === suggestionId
              ? { ...candidate, status: "failed" as const, error }
              : candidate,
          ),
        },
      }));
      return true;
    },

    completeGeneratedBroll: (input) => {
      const state = get();
      if (state.project.status !== "planning") {
        return invalidProjectState("planning", state.project.status);
      }
      const suggestion = state.project.generationSuggestions.find(
        (candidate) => candidate.id === input.suggestionId,
      );
      if (!suggestion) return suggestionFailure(input.suggestionId);
      if (suggestion.status !== "generating") {
        return {
          ok: false,
          code: "INVALID_GENERATION_RESULT",
          message: `Generation suggestion ${input.suggestionId} is not awaiting a result.`,
        };
      }
      if (
        !validGeneratedMediaUrl(input.sourceUrl) ||
        !input.provider.trim() ||
        !input.model.trim() ||
        !Number.isFinite(input.duration) ||
        input.duration <= 0
      ) {
        return {
          ok: false,
          code: "INVALID_GENERATION_RESULT",
          message: "Generated media requires a safe HTTPS/demo URL, provider, model, and duration.",
        };
      }

      const usedAssetIds = new Set(state.project.brollAssets.map((asset) => asset.id));
      const assetId = nextMediaId(usedAssetIds, "generated", suggestion.id);
      const momentId = `${assetId}_moment`;
      const overlayId = issueOverlayId();
      const sourceDuration = Math.min(input.duration, suggestion.duration);
      const timelineEnd = Math.min(
        state.project.duration,
        suggestion.timelineStart + sourceDuration,
      );
      const overlayDuration = timelineEnd - suggestion.timelineStart;

      if (overlayDuration <= 0) {
        return {
          ok: false,
          code: "INVALID_GENERATION_RESULT",
          message: "Generated media cannot fit inside the requested timeline range.",
        };
      }

      const asset = {
        id: assetId,
        name: `${suggestion.id}-generated.mp4`,
        duration: input.duration,
        objectUrl: input.sourceUrl,
        origin: "generated" as const,
        generation: {
          provider: input.provider.trim(),
          model: input.model.trim(),
          prompt: suggestion.prompt,
          sourceUrl: input.sourceUrl,
          status: "ready" as const,
          attempt: 0,
        },
        moments: [
          {
            id: momentId,
            assetId,
            sourceStart: 0,
            sourceEnd: input.duration,
            description: `AI-generated B-roll: ${suggestion.prompt}`,
            tags: ["generated", "ai b-roll"],
            analysisStatus: "indexed" as const,
          },
        ],
      };
      const overlay: Overlay = {
        id: overlayId,
        assetId,
        momentId,
        sourceStart: 0,
        sourceEnd: overlayDuration,
        timelineStart: suggestion.timelineStart,
        timelineEnd,
        status: "ghost",
        lockedByHuman: false,
        reason: suggestion.reason,
        createdBy: suggestion.createdBy,
      };

      set((current) => ({
        project: {
          ...current.project,
          brollAssets: [...current.project.brollAssets, asset],
          overlays: [...current.project.overlays, overlay],
          generationSuggestions: current.project.generationSuggestions.filter(
            (candidate) => candidate.id !== input.suggestionId,
          ),
          timelineRevision: bumpRevision(current.project),
        },
        selectedOverlayId: overlayId,
        selectedSuggestionId: null,
      }));

      return {
        ok: true,
        suggestionId: input.suggestionId,
        assetId,
        momentId,
        overlayId,
        brollAudio: BROLL_AUDIO_POLICY,
      };
    },

    beginGeneratedBrollReplacement: (assetId) => {
      const state = get();
      if (state.project.status !== "planning") {
        return invalidProjectState("planning", state.project.status);
      }
      const asset = state.project.brollAssets.find((candidate) => candidate.id === assetId);
      if (!asset || asset.origin !== "generated" || !asset.generation) {
        return {
          ok: false,
          code: "ASSET_NOT_FOUND",
          message: `Generated B-roll asset ${assetId} does not exist.`,
        };
      }
      const lockedOverlay = state.project.overlays.find(
        (overlay) => overlay.assetId === assetId && overlay.lockedByHuman,
      );
      if (lockedOverlay) return humanLockedFailure(lockedOverlay.id);
      if (asset.generation.status === "regenerating") {
        return generationBusyFailure(assetId);
      }

      const attempt = asset.generation.attempt + 1;
      const operationId = `regen_${assetId}_${attempt}`;
      set((current) => ({
        project: {
          ...current.project,
          brollAssets: current.project.brollAssets.map((candidate) =>
            candidate.id === assetId && candidate.generation
              ? {
                  ...candidate,
                  generation: {
                    ...candidate.generation,
                    status: "regenerating" as const,
                    attempt,
                    operationId,
                    error: undefined,
                  },
                }
              : candidate,
          ),
        },
      }));
      return { ok: true, assetId, operationId, status: "regenerating" };
    },

    failGeneratedBrollReplacement: (assetId, operationId, message) => {
      const state = get();
      const asset = state.project.brollAssets.find((candidate) => candidate.id === assetId);
      if (
        !asset?.generation ||
        asset.generation.status !== "regenerating" ||
        asset.generation.operationId !== operationId
      ) {
        return false;
      }
      const error = message.trim().slice(0, 500) || "Video regeneration failed. Please try again.";
      set((current) => ({
        project: {
          ...current.project,
          brollAssets: current.project.brollAssets.map((candidate) => {
            if (candidate.id !== assetId || !candidate.generation) return candidate;
            const { operationId: _operationId, ...generation } = candidate.generation;
            return {
              ...candidate,
              generation: { ...generation, status: "ready" as const, error },
            };
          }),
        },
      }));
      return true;
    },

    replaceGeneratedBroll: (input) => {
      const state = get();
      if (state.project.status !== "planning") {
        return invalidProjectState("planning", state.project.status);
      }
      const asset = state.project.brollAssets.find((candidate) => candidate.id === input.assetId);
      if (!asset || asset.origin !== "generated" || !asset.generation) {
        return {
          ok: false,
          code: "ASSET_NOT_FOUND",
          message: `Generated B-roll asset ${input.assetId} does not exist.`,
        };
      }
      const lockedOverlay = state.project.overlays.find(
        (overlay) => overlay.assetId === input.assetId && overlay.lockedByHuman,
      );
      if (lockedOverlay) return humanLockedFailure(lockedOverlay.id);
      if (
        asset.generation.status !== "regenerating" ||
        asset.generation.operationId !== input.operationId
      ) {
        return {
          ok: false,
          code: "INVALID_GENERATION_RESULT",
          message: `Generated B-roll asset ${input.assetId} is not awaiting this regeneration result.`,
        };
      }
      if (
        !validGeneratedMediaUrl(input.sourceUrl) ||
        !input.provider.trim() ||
        !input.model.trim() ||
        !input.prompt.trim() ||
        !Number.isFinite(input.duration) ||
        input.duration <= 0
      ) {
        return {
          ok: false,
          code: "INVALID_GENERATION_RESULT",
          message: "Replacement media requires a safe URL, provider, model, prompt, and duration.",
        };
      }

      const overlayIds = state.project.overlays
        .filter((overlay) => overlay.assetId === input.assetId)
        .map((overlay) => overlay.id);
      set((current) => ({
        project: {
          ...current.project,
          brollAssets: current.project.brollAssets.map((candidate) =>
            candidate.id === input.assetId
              ? {
                  ...candidate,
                  duration: input.duration,
                  objectUrl: input.sourceUrl,
                  generation: {
                    provider: input.provider.trim(),
                    model: input.model.trim(),
                    prompt: input.prompt.trim(),
                    sourceUrl: input.sourceUrl,
                    status: "ready" as const,
                    attempt: candidate.generation?.attempt ?? 0,
                  },
                  moments: candidate.moments.map((moment) => ({
                    ...moment,
                    sourceStart: 0,
                    sourceEnd: input.duration,
                    description: `AI-generated B-roll: ${input.prompt.trim()}`,
                  })),
                }
              : candidate,
          ),
          overlays: current.project.overlays.map((overlay) => {
            if (overlay.assetId !== input.assetId) return overlay;
            const duration = Math.min(
              overlay.timelineEnd - overlay.timelineStart,
              input.duration,
              current.project.duration - overlay.timelineStart,
            );
            return {
              ...overlay,
              sourceStart: 0,
              sourceEnd: duration,
              timelineEnd: overlay.timelineStart + duration,
            };
          }),
          timelineRevision: bumpRevision(current.project),
        },
      }));
      return { ok: true, assetId: input.assetId, overlayIds, brollAudio: BROLL_AUDIO_POLICY };
    },

    approvePlan: () => {
      const state = get();
      if (state.project.status !== "planning") {
        return invalidProjectState("planning", state.project.status);
      }
      if (state.project.duration <= 0) return missingBaseTimelineFailure();
      const generating = state.project.generationSuggestions.find(
        (suggestion) => suggestion.status === "generating",
      );
      if (generating) return suggestionBusyFailure(generating.id);
      const regenerating = state.project.brollAssets.find(
        (asset) => asset.generation?.status === "regenerating",
      );
      if (regenerating) return generationBusyFailure(regenerating.id);
      const blockingIssue = getPlanPreflight(state.project).issues.find(
        (issue) => issue.severity === "blocking",
      );
      if (blockingIssue) {
        return {
          ok: false,
          code: "INVALID_ARGUMENTS",
          message: blockingIssue.message,
        };
      }
      const approvedOverlayIds = state.project.overlays
        .filter((overlay) => overlay.status === "ghost")
        .map((overlay) => overlay.id);
      set((current) => ({
        project: { ...current.project, status: "approved" },
      }));
      return { ok: true, status: "approved", approvedOverlayIds };
    },

    commitApprovedPlan: () => {
      const state = get();
      if (state.project.status !== "approved") {
        return invalidProjectState("approved", state.project.status);
      }
      const committedOverlayIds = state.project.overlays
        .filter((overlay) => overlay.status === "ghost")
        .map((overlay) => overlay.id);
      set((current) => ({
        project: {
          ...current.project,
          status: "committed",
          overlays: current.project.overlays.map((overlay) =>
            overlay.status === "ghost" ? { ...overlay, status: "committed" as const } : overlay,
          ),
        },
      }));
      return {
        ok: true,
        status: "committed",
        committedOverlayIds,
        brollAudio: BROLL_AUDIO_POLICY,
      };
    },

    replaceBaseMedia: (media) => {
      const state = get();
      if (state.project.status !== "planning") {
        return invalidProjectState("planning", state.project.status);
      }
      const regenerating = state.project.brollAssets.find(
        (asset) => asset.generation?.status === "regenerating",
      );
      if (regenerating) return generationBusyFailure(regenerating.id);
      const generating = state.project.generationSuggestions.find(
        (suggestion) => suggestion.status === "generating",
      );
      if (generating) return suggestionBusyFailure(generating.id);
      if (!isValidLocalMedia(media)) {
        return invalidMediaFailure(
          "Base media requires a filename, a readable positive duration, and a local object URL.",
        );
      }

      const baseVideoId = `base_${mediaIdStem(media.name)}`;
      const previousObjectUrl = state.project.baseVideo.objectUrl;
      set((current) => ({
        project: {
          ...current.project,
          title: media.name.replace(/\.[^.]+$/, ""),
          duration: media.duration,
          baseVideo: {
            id: baseVideoId,
            name: media.name,
            duration: media.duration,
            objectUrl: media.objectUrl,
          },
          transcript: [],
          overlays: [],
          generationSuggestions: [],
          captions: [],
          // A new base video is a new timeline; reset rather than bump so a
          // stale expectedTimelineRevision from the old project cannot be
          // mistaken for current state.
          timelineRevision: 0,
          humanPreferences: [],
        },
        selectedOverlayId: null,
        selectedSuggestionId: null,
      }));

      return { ok: true, baseVideoId, previousObjectUrl };
    },

    addBrollMedia: (mediaItems) => {
      const state = get();
      if (state.project.status !== "planning") {
        return invalidProjectState("planning", state.project.status);
      }
      if (state.project.duration <= 0) return missingBaseTimelineFailure();
      if (
        mediaItems.length === 0 ||
        mediaItems.some((media) => !isValidLocalMedia(media))
      ) {
        return invalidMediaFailure(
          "B-roll import requires at least one video with a filename, readable positive duration, and local object URL.",
        );
      }

      const usedIds = new Set(state.project.brollAssets.map((asset) => asset.id));
      const assets = mediaItems.map((media) => {
        const id = nextMediaId(usedIds, "local_reel", media.name);
        return {
          id,
          name: media.name,
          duration: media.duration,
          objectUrl: media.objectUrl,
          origin: "uploaded" as const,
          moments: createLocalBrollIndex(id, media.name, media.duration),
        };
      });

      set((current) => ({
        project: {
          ...current.project,
          brollAssets: [...current.project.brollAssets, ...assets],
        },
      }));
      return { ok: true, assetIds: assets.map((asset) => asset.id) };
    },

    replaceTranscript: (segments) => {
      const state = get();
      if (state.project.status !== "planning" || state.project.duration <= 0) return 0;
      const normalized = segments
        .filter(
          (segment) =>
            Number.isFinite(segment.start) &&
            Number.isFinite(segment.end) &&
            segment.end > segment.start &&
            segment.text.trim().length > 0,
        )
        .map((segment, index) => ({
          ...segment,
          id: segment.id || `seg_${index + 1}`,
          start: clamp(segment.start, 0, state.project.duration),
          end: clamp(segment.end, 0, state.project.duration),
          text: segment.text.trim(),
        }))
        .filter((segment) => segment.end > segment.start)
        .sort((left, right) => left.start - right.start);
      const captions = generateCaptionsFromTranscript(normalized);
      set((current) => ({
        project: { ...current.project, transcript: normalized, captions },
      }));
      return captions.length;
    },

    generateCaptions: () => {
      const state = get();
      if (state.project.status !== "planning") return 0;
      const captions = generateCaptionsFromTranscript(state.project.transcript);
      set((current) => ({ project: { ...current.project, captions } }));
      return captions.length;
    },

    addCaption: (input) => {
      const state = get();
      if (state.project.status !== "planning" || state.project.duration <= 0) return null;
      const text = input.text.trim();
      if (!text || !Number.isFinite(input.start) || !Number.isFinite(input.end)) return null;
      const start = clamp(input.start, 0, Math.max(0, state.project.duration - 0.25));
      const end = clamp(input.end, start + 0.25, state.project.duration);
      if (end <= start) return null;
      const id = issueCaptionId();
      set((current) => ({
        project: {
          ...current.project,
          captions: [...current.project.captions, { id, start, end, text }].sort(
            (left, right) => left.start - right.start,
          ),
        },
      }));
      return id;
    },

    updateCaption: (captionId, patch) => {
      const state = get();
      if (state.project.status !== "planning") return false;
      const current = state.project.captions.find((caption) => caption.id === captionId);
      if (!current) return false;
      const text = patch.text === undefined ? current.text : patch.text.trim();
      if (!text) return false;
      const requestedStart = patch.start ?? current.start;
      const requestedEnd = patch.end ?? current.end;
      if (!Number.isFinite(requestedStart) || !Number.isFinite(requestedEnd)) return false;
      const start = clamp(requestedStart, 0, Math.max(0, state.project.duration - 0.25));
      const end = clamp(requestedEnd, start + 0.25, state.project.duration);
      if (end <= start) return false;
      set((currentState) => ({
        project: {
          ...currentState.project,
          captions: currentState.project.captions
            .map((caption) =>
              caption.id === captionId ? { ...caption, start, end, text } : caption,
            )
            .sort((left, right) => left.start - right.start),
        },
      }));
      return true;
    },

    removeCaption: (captionId) => {
      const state = get();
      if (
        state.project.status !== "planning" ||
        !state.project.captions.some((caption) => caption.id === captionId)
      ) return false;
      set((current) => ({
        project: {
          ...current.project,
          captions: current.project.captions.filter((caption) => caption.id !== captionId),
        },
      }));
      return true;
    },

    setCaptionPosition: (position) => {
      const state = get();
      if (
        state.project.status !== "planning" ||
        !(["top", "center", "bottom"] as const).includes(position)
      ) return false;
      set((current) => ({
        project: { ...current.project, captionStyle: { position } },
      }));
      return true;
    },

    moveOverlay: (overlayId, timelineStart) => {
      const state = get();
      const overlay = state.project.overlays.find((candidate) => candidate.id === overlayId);
      if (
        state.project.status !== "planning" ||
        !overlay ||
        overlay.status !== "ghost" ||
        overlay.lockedByHuman ||
        regeneratingAssetIdForOverlay(state.project, overlay) !== null
      ) return false;
      const next = moveOverlayGeometry(overlay, timelineStart, state.project.duration);
      set((current) => ({
        project: {
          ...current.project,
          overlays: current.project.overlays.map((candidate) =>
            candidate.id === overlayId ? next : candidate,
          ),
          timelineRevision: bumpRevision(current.project),
        },
      }));
      return true;
    },

    resizeOverlayStart: (overlayId, timelineStart) => {
      const state = get();
      const overlay = state.project.overlays.find((candidate) => candidate.id === overlayId);
      if (
        state.project.status !== "planning" ||
        !overlay ||
        overlay.status !== "ghost" ||
        overlay.lockedByHuman ||
        regeneratingAssetIdForOverlay(state.project, overlay) !== null
      ) return false;
      const next = resizeOverlayStartGeometry(overlay, timelineStart);
      set((current) => ({
        project: {
          ...current.project,
          overlays: current.project.overlays.map((candidate) =>
            candidate.id === overlayId ? next : candidate,
          ),
          timelineRevision: bumpRevision(current.project),
        },
      }));
      return true;
    },

    resizeOverlayEnd: (overlayId, timelineEnd) => {
      const state = get();
      const overlay = state.project.overlays.find((candidate) => candidate.id === overlayId);
      if (
        state.project.status !== "planning" ||
        !overlay ||
        overlay.status !== "ghost" ||
        overlay.lockedByHuman ||
        regeneratingAssetIdForOverlay(state.project, overlay) !== null
      ) return false;
      const asset = state.project.brollAssets.find((candidate) => candidate.id === overlay.assetId);
      const next = resizeOverlayEndGeometry(
        overlay,
        timelineEnd,
        state.project.duration,
        asset?.duration ?? overlay.sourceEnd,
      );
      set((current) => ({
        project: {
          ...current.project,
          overlays: current.project.overlays.map((candidate) =>
            candidate.id === overlayId ? next : candidate,
          ),
          timelineRevision: bumpRevision(current.project),
        },
      }));
      return true;
    },

    getTimeline: () => {
      const project = get().project;
      return {
        projectId: project.id,
        projectStatus: project.status,
        duration: project.duration,
        baseTrack: {
          id: project.baseVideo.id,
          name: project.baseVideo.name,
          locked: true,
          audioPolicy: BASE_AUDIO_POLICY,
        },
        brollTrack: {
          audioPolicy: BROLL_AUDIO_POLICY,
          overlayCount: project.overlays.length,
        },
        overlays: project.overlays
          .map((overlay) => ({ ...overlay }))
          .sort((a, b) => a.timelineStart - b.timelineStart),
        generationSuggestions: project.generationSuggestions
          .map((suggestion) => ({ ...suggestion }))
          .sort((a, b) => a.timelineStart - b.timelineStart),
        preflight: getPlanPreflight(project),
        timelineRevision: project.timelineRevision,
      };
    },

    getEditPlan: () => deriveEditPlan(get().project),

    getProjectSummary: () => {
      const project = get().project;
      const indexedMomentCount = project.brollAssets.reduce(
        (count, asset) =>
          count + asset.moments.filter((moment) => moment.analysisStatus !== "unindexed").length,
        0,
      );
      const unindexedAssetCount = project.brollAssets.filter((asset) =>
        asset.moments.every((moment) => moment.analysisStatus === "unindexed"),
      ).length;

      return {
        projectId: project.id,
        title: project.title,
        duration: project.duration,
        status: project.status,
        transcriptSegmentCount: project.transcript.length,
        brollAssetCount: project.brollAssets.length,
        indexedMomentCount,
        unindexedAssetCount,
        overlayCount: project.overlays.length,
        ghostOverlayCount: project.overlays.filter((overlay) => overlay.status === "ghost").length,
        committedOverlayCount: project.overlays.filter((overlay) => overlay.status === "committed")
          .length,
        generationSuggestionCount: project.generationSuggestions.length,
        generatingSuggestionCount: project.generationSuggestions.filter(
          (suggestion) => suggestion.status === "generating",
        ).length,
        pacingPreference: { ...project.pacingPreference },
        audioPolicy: { base: BASE_AUDIO_POLICY, broll: BROLL_AUDIO_POLICY },
        preflight: getPlanPreflight(project),
        timelineRevision: project.timelineRevision,
      };
    },

    getTranscript: (input) => {
      const project = get().project;
      const startTime = input.startSeconds ?? input.startTime ?? 0;
      const endTime = input.endSeconds ?? input.endTime ?? project.duration;
      const maxSegments = Math.max(
        1,
        Math.min(input.maxSegments ?? DEFAULT_TRANSCRIPT_SEGMENT_LIMIT, MAX_TRANSCRIPT_SEGMENT_LIMIT),
      );

      return project.transcript
        .filter((segment) => segment.end > startTime && segment.start < endTime)
        .slice(0, maxSegments)
        .map((segment) => ({ ...segment }));
    },

    findOverlayOpportunities: (input = {}) => {
      return findOverlayOpportunitiesHeuristic(get().project, input);
    },

    searchBroll: (query) => {
      const project = get().project;
      return searchBrollMoments(project, {
        ...query,
        limit: Math.min(query.limit ?? DEFAULT_BROLL_SEARCH_LIMIT, DEFAULT_BROLL_SEARCH_LIMIT * 5),
      });
    },

    setPacingPreference: (maxTalkingHeadSeconds) => {
      const state = get();
      if (state.project.status !== "planning") {
        return invalidProjectState("planning", state.project.status);
      }
      const clamped = clampPacingPreference(maxTalkingHeadSeconds);
      set((current) => ({
        project: {
          ...current.project,
          pacingPreference: { maxTalkingHeadSeconds: clamped },
        },
      }));
      return { ok: true, maxTalkingHeadSeconds: clamped };
    },

    replanUnlockedSections: (input) => {
      const state = get();
      if (state.project.status !== "planning") {
        return invalidProjectState("planning", state.project.status);
      }
      if (input.timelineRevision !== state.project.timelineRevision) {
        return staleTimelineFailure(input.timelineRevision, state.project.timelineRevision);
      }

      const result = replanUnlockedSectionsImpl(state.project, {
        objective: input.objective,
      });

      if (result.overlays === state.project.overlays) {
        // No unlocked ghost proposal changed; still report success with an
        // empty diff rather than a failure — "nothing to replan" is valid.
        return {
          ok: true,
          preserved: result.preserved,
          changed: [],
          timelineRevision: state.project.timelineRevision,
        };
      }

      set((current) => ({
        project: {
          ...current.project,
          overlays: result.overlays,
          timelineRevision: bumpRevision(current.project),
        },
      }));

      return {
        ok: true,
        preserved: result.preserved,
        changed: result.changed,
        timelineRevision: get().project.timelineRevision,
      };
    },

    suggestPlacements: (input = {}) => {
      const state = get();
      if (state.project.status !== "planning") {
        return invalidProjectState("planning", state.project.status);
      }

      const candidates = planSuggestedPlacements(state.project, input);
      const createdOverlayIds: string[] = [];
      const createdSuggestionIds: string[] = [];
      let skipped = 0;

      for (const candidate of candidates) {
        if (candidate.decision.kind === "uploaded_match") {
          const result = get().proposeOverlay({
            momentId: candidate.decision.match.momentId,
            timelineStart: candidate.timelineStart,
            duration: candidate.duration,
            reason:
              candidate.opportunity.detail ??
              `${candidate.opportunity.reason} cue matched an uploaded clip.`,
          });
          if (result.ok) createdOverlayIds.push(result.overlayId);
          else skipped += 1;
        } else {
          const { prompt, reason } = buildGenerationSuggestionCopy(
            candidate.opportunity,
            candidate.duration,
          );
          const result = get().proposeGeneratedBroll({
            timelineStart: candidate.timelineStart,
            duration: candidate.duration,
            prompt,
            reason,
          });
          if (result.ok) createdSuggestionIds.push(result.suggestionId);
          else skipped += 1;
        }
      }

      return { ok: true, createdOverlayIds, createdSuggestionIds, skipped };
    },
  }));
}

function clampPacingPreference(value: number): number {
  const safe = Number.isFinite(value) ? value : MIN_PACING_PREFERENCE_SECONDS;
  return Math.min(
    MAX_PACING_PREFERENCE_SECONDS,
    Math.max(MIN_PACING_PREFERENCE_SECONDS, safe),
  );
}
