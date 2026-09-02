/// <reference types="webmcp-types" />

import { z } from "zod";

import { PRODUCT_NAME } from "@/lib/brand";
import {
  clampBrollMatchThreshold,
  decideVisualSupport,
  DEFAULT_BROLL_MATCH_THRESHOLD,
} from "@/lib/editor/brollRecommendation";
import type { RelayLabStoreApi } from "@/lib/editor/store";
import type { ProjectStatus } from "@/lib/editor/types";

const proposeOverlaySchema = z.object({
  momentId: z.string().trim().min(1),
  timelineStart: z.number().finite(),
  duration: z.number().finite().positive(),
  reason: z.string().trim().min(1).max(500),
}).strict();

const updateOverlaySchema = z
  .object({
    overlayId: z.string().trim().min(1),
    timelineStart: z.number().finite().optional(),
    duration: z.number().finite().positive().optional(),
    sourceStart: z.number().finite().nonnegative().optional(),
    sourceEnd: z.number().finite().positive().optional(),
    reason: z.string().trim().min(1).max(500).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    const hasMutation =
      value.timelineStart !== undefined ||
      value.duration !== undefined ||
      value.sourceStart !== undefined ||
      value.sourceEnd !== undefined ||
      value.reason !== undefined;
    if (!hasMutation) {
      context.addIssue({
        code: "custom",
        message: "At least one overlay field must be provided.",
      });
    }
    if (
      value.sourceStart !== undefined &&
      value.sourceEnd !== undefined &&
      value.sourceEnd <= value.sourceStart
    ) {
      context.addIssue({
        code: "custom",
        path: ["sourceEnd"],
        message: "sourceEnd must be greater than sourceStart.",
      });
    }
    if (
      value.duration !== undefined &&
      value.sourceStart !== undefined &&
      value.sourceEnd !== undefined &&
      Math.abs(value.sourceEnd - value.sourceStart - value.duration) > 0.001
    ) {
      context.addIssue({
        code: "custom",
        path: ["duration"],
        message: "duration must match the explicit source range.",
      });
    }
  });

const removeOverlaySchema = z.object({
  overlayId: z.string().trim().min(1),
}).strict();

const proposeGeneratedBrollSchema = z.object({
  searchQuery: z.string().trim().min(1).max(200),
  timelineStart: z.number().finite(),
  duration: z.number().finite().min(1).max(10),
  prompt: z.string().trim().min(10).max(1_000),
  reason: z.string().trim().min(1).max(500),
}).strict();

const updateGeneratedBrollSchema = z
  .object({
    suggestionId: z.string().trim().min(1),
    timelineStart: z.number().finite().optional(),
    duration: z.number().finite().min(1).max(10).optional(),
    prompt: z.string().trim().min(10).max(1_000).optional(),
    reason: z.string().trim().min(1).max(500).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.timelineStart === undefined &&
      value.duration === undefined &&
      value.prompt === undefined &&
      value.reason === undefined
    ) {
      context.addIssue({
        code: "custom",
        message: "At least one generation-suggestion field must be provided.",
      });
    }
  });

const removeGeneratedBrollSchema = z.object({
  suggestionId: z.string().trim().min(1),
}).strict();

const getTranscriptSchema = z
  .object({
    startSeconds: z.number().finite().nonnegative().optional(),
    endSeconds: z.number().finite().positive().optional(),
    // Compatibility aliases for the Phase 4 draft surface.
    startTime: z.number().finite().nonnegative().optional(),
    endTime: z.number().finite().positive().optional(),
    maxSegments: z.number().int().positive().max(100).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.startSeconds !== undefined &&
      value.startTime !== undefined &&
      value.startSeconds !== value.startTime
    ) {
      context.addIssue({
        code: "custom",
        path: ["startSeconds"],
        message: "Provide startSeconds only; the deprecated startTime alias conflicts with it.",
      });
    }
    if (
      value.endSeconds !== undefined &&
      value.endTime !== undefined &&
      value.endSeconds !== value.endTime
    ) {
      context.addIssue({
        code: "custom",
        path: ["endSeconds"],
        message: "Provide endSeconds only; the deprecated endTime alias conflicts with it.",
      });
    }
    const start = value.startSeconds ?? value.startTime;
    const end = value.endSeconds ?? value.endTime;
    if (
      start !== undefined &&
      end !== undefined &&
      end <= start
    ) {
      context.addIssue({
        code: "custom",
        path: ["endSeconds"],
        message: "endSeconds must be greater than startSeconds.",
      });
    }
  });

const findOverlayOpportunitiesSchema = z
  .object({
    maxTalkingHeadSeconds: z.number().finite().optional(),
    startSeconds: z.number().finite().nonnegative().optional(),
    endSeconds: z.number().finite().positive().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.startSeconds !== undefined &&
      value.endSeconds !== undefined &&
      value.endSeconds <= value.startSeconds
    ) {
      context.addIssue({
        code: "custom",
        path: ["endSeconds"],
        message: "endSeconds must be greater than startSeconds.",
      });
    }
  });

const searchBrollSchema = z
  .object({
    query: z.string().trim().min(1).max(200),
    minDuration: z.number().finite().positive().optional(),
    maxDuration: z.number().finite().positive().optional(),
    targetDuration: z.number().finite().positive().optional(),
    matchThreshold: z.number().finite().min(0).max(1).optional(),
    limit: z.number().int().positive().max(50).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.minDuration !== undefined &&
      value.maxDuration !== undefined &&
      value.maxDuration < value.minDuration
    ) {
      context.addIssue({
        code: "custom",
        path: ["maxDuration"],
        message: "maxDuration must be greater than or equal to minDuration.",
      });
    }
  });

const setPacingPreferenceSchema = z.object({
  maxTalkingHeadSeconds: z.number().finite().min(5).max(30),
}).strict();

const replanUnlockedSectionsSchema = z.object({
  objective: z.string().trim().min(1).max(500).optional(),
  preserveHumanChanges: z.literal(true),
  timelineRevision: z.number().int().nonnegative(),
}).strict();

export interface RelayLabModelContext {
  registerTool(
    tool: WebMCP.ModelContextTool,
    options?: WebMCP.ModelContextRegisterToolOptions,
  ): Promise<void>;
}

export const PHASE_1_TOOL_NAMES = ["get_timeline", "propose_overlay"] as const;
export const READ_TOOL_NAMES = [
  "get_timeline",
  "get_edit_plan",
  "get_project_summary",
  "get_transcript",
  "find_overlay_opportunities",
  "search_broll",
] as const;
export const PLANNING_MUTATION_TOOL_NAMES = [
  "propose_overlay",
  "update_overlay_proposal",
  "remove_overlay_proposal",
  "propose_generated_broll",
  "update_generated_broll_suggestion",
  "remove_generated_broll_suggestion",
  "set_pacing_preference",
  "replan_unlocked_sections",
] as const;
export const ALL_RELAYLAB_TOOL_NAMES = [
  ...READ_TOOL_NAMES,
  ...PLANNING_MUTATION_TOOL_NAMES,
  "commit_approved_plan",
] as const;

function invalidArguments(toolName: string, error: z.ZodError) {
  return {
    ok: false,
    code: "INVALID_ARGUMENTS",
    message: `${toolName} received invalid arguments.`,
    issues: error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    })),
  };
}

function throwIfCancelled(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new DOMException("Tool execution was cancelled.", "AbortError");
  }
}

function configuredBrollMatchThreshold(requested?: number): number {
  if (requested !== undefined) return clampBrollMatchThreshold(requested);
  const configured = Number(process.env.NEXT_PUBLIC_BROLL_MATCH_THRESHOLD);
  return Number.isFinite(configured)
    ? clampBrollMatchThreshold(configured)
    : DEFAULT_BROLL_MATCH_THRESHOLD;
}

export function createReadTools(store: RelayLabStoreApi): WebMCP.ModelContextTool[] {
  return [
    {
      name: "get_timeline",
      title: `Get ${PRODUCT_NAME} timeline`,
      description:
        `Read the live ${PRODUCT_NAME} timeline, including ghost and committed B-roll overlays, distinct source-video and main-timeline ranges, human locks, reasons, project approval status, and immutable audio policy. Call this after the human edits or locks an overlay; it always reads current shared state.`,
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      annotations: {
        readOnlyHint: true,
        untrustedContentHint: true,
      },
      execute: async (_input, options) => {
        throwIfCancelled(options?.signal);
        return store.getState().getTimeline();
      },
    },
    {
      name: "get_edit_plan",
      title: `Get ${PRODUCT_NAME} edit plan`,
      description:
        "Read the agent's current structured editorial plan: every decision (uploaded-B-roll placement, generated-B-roll suggestion) with its timeline range, transcript context, reason, status (proposed/accepted/rejected/modified-by-human/locked), and ranked alternatives where known. This is the coherent 'what is the plan' answer, derived live from the same overlays and suggestions get_timeline reports — never a separate or stale copy. Includes timelineRevisionUsed, the timeline revision this snapshot reflects.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: async (_input, options) => {
        throwIfCancelled(options?.signal);
        return store.getState().getEditPlan();
      },
    },
    {
      name: "get_project_summary",
      title: "Get project summary",
      description:
        "Read a compact project summary: title, duration, approval status, transcript/B-roll counts, overlay counts by state, the current pacing preference, and the immutable audio policy. Use this before deeper reads to decide what to look at next.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: async (_input, options) => {
        throwIfCancelled(options?.signal);
        return store.getState().getProjectSummary();
      },
    },
    {
      name: "get_transcript",
      title: "Get transcript range",
      description:
        "Read a bounded slice of timestamped transcript by optional startSeconds/endSeconds and/or segment count. Never returns the full transcript unbounded: defaults to 20 segments and caps at 100.",
      inputSchema: {
        type: "object",
        properties: {
          startSeconds: {
            type: "number",
            minimum: 0,
            description: "Only include segments ending after this time in seconds.",
          },
          endSeconds: {
            type: "number",
            exclusiveMinimum: 0,
            description: "Only include segments starting before this time in seconds.",
          },
          startTime: {
            type: "number",
            minimum: 0,
            description: "Deprecated compatibility alias for startSeconds.",
          },
          endTime: {
            type: "number",
            exclusiveMinimum: 0,
            description: "Deprecated compatibility alias for endSeconds.",
          },
          maxSegments: {
            type: "number",
            minimum: 1,
            maximum: 100,
            description: "Maximum number of segments to return; defaults to 20, capped at 100.",
          },
        },
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: async (rawInput, options) => {
        throwIfCancelled(options?.signal);
        const parsed = getTranscriptSchema.safeParse(rawInput);
        if (!parsed.success) return invalidArguments("get_transcript", parsed.error);
        return { segments: store.getState().getTranscript(parsed.data) };
      },
    },
    {
      name: "find_overlay_opportunities",
      title: "Find overlay opportunities",
      description:
        "Read-only heuristic scan for B-roll candidate slots. Finds pacing gaps plus transcript cues for products/apps, lists, concrete objects/places, and examples. Optional startSeconds/endSeconds bound the scan; maxTalkingHeadSeconds is safely clamped to 5-30. Returns overlapping transcript text and a stable reason enum. Never creates or modifies an overlay.",
      inputSchema: {
        type: "object",
        properties: {
          maxTalkingHeadSeconds: {
            type: "number",
            description: "Pacing threshold in seconds; safely clamped to the 5-30 range.",
          },
          startSeconds: {
            type: "number",
            minimum: 0,
            description: "Optional inclusive start of the timeline range to inspect.",
          },
          endSeconds: {
            type: "number",
            exclusiveMinimum: 0,
            description: "Optional exclusive end of the timeline range to inspect.",
          },
        },
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: async (rawInput, options) => {
        throwIfCancelled(options?.signal);
        const parsed = findOverlayOpportunitiesSchema.safeParse(rawInput);
        if (!parsed.success) {
          return invalidArguments("find_overlay_opportunities", parsed.error);
        }
        return { opportunities: store.getState().findOverlayOpportunities(parsed.data) };
      },
    },
    {
      name: "search_broll",
      title: "Search indexed B-roll",
      description:
        "Search available indexed B-roll source moments by description/tag relevance, optional minDuration/maxDuration, duration fit, and recent-reuse penalty. Returns source ranges and scores. Excludes unindexed or invalid source ranges and never creates a proposal.",
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            minLength: 1,
            maxLength: 200,
            description: "Free-text search terms, matched against moment descriptions and tags.",
          },
          minDuration: {
            type: "number",
            exclusiveMinimum: 0,
            description: "Exclude source moments shorter than this many seconds.",
          },
          maxDuration: {
            type: "number",
            exclusiveMinimum: 0,
            description: "Exclude source moments longer than this many seconds.",
          },
          targetDuration: {
            type: "number",
            exclusiveMinimum: 0,
            description: "Optional precise desired duration for compatibility and fit scoring.",
          },
          matchThreshold: {
            type: "number",
            minimum: 0,
            maximum: 1,
            description:
              "Optional deterministic strong-match threshold; defaults to the configured 0.65 value.",
          },
          limit: {
            type: "number",
            minimum: 1,
            maximum: 50,
            description: "Maximum number of ranked results to return; defaults to 10.",
          },
        },
        required: ["query"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: async (rawInput, options) => {
        throwIfCancelled(options?.signal);
        const parsed = searchBrollSchema.safeParse(rawInput);
        if (!parsed.success) return invalidArguments("search_broll", parsed.error);
        const { matchThreshold, ...query } = parsed.data;
        const results = store.getState().searchBroll(query);
        const threshold = configuredBrollMatchThreshold(matchThreshold);
        const bestScore = results.at(0)?.score ?? null;
        return {
          results,
          recommendation: {
            kind:
              bestScore !== null && bestScore >= threshold
                ? "uploaded_match"
                : "generation_suggestion_available",
            threshold,
            bestScore,
            guidance:
              bestScore !== null && bestScore >= threshold
                ? "Prefer the strong uploaded source moment."
                : "No strong uploaded match was found. A generation suggestion is optional; editorial restraint is also valid.",
          },
        };
      },
    },
  ];
}

export function createPlanningTools(store: RelayLabStoreApi): WebMCP.ModelContextTool[] {
  return [
    {
      name: "propose_overlay",
      title: "Propose B-roll overlay",
      description:
        "Create a non-destructive GHOST B-roll proposal from an indexed moment while the project is planning. This never commits, approves, locks, or changes the base track, and B-roll remains muted. Arguments are validated and clamped to safe source/project bounds.",
      inputSchema: {
        type: "object",
        properties: {
          momentId: {
            type: "string",
            minLength: 1,
            description: "Indexed B-roll moment identifier from the project library.",
          },
          timelineStart: {
            type: "number",
            minimum: 0,
            description: "Desired start in seconds on the locked base-video timeline.",
          },
          duration: {
            type: "number",
            exclusiveMinimum: 0,
            description: "Desired duration in seconds; clamped to source and project bounds.",
          },
          reason: {
            type: "string",
            minLength: 1,
            maxLength: 500,
            description: "Concise editorial reason for this visual support.",
          },
        },
        required: ["momentId", "timelineStart", "duration", "reason"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: async (rawInput, options) => {
        throwIfCancelled(options?.signal);
        const parsed = proposeOverlaySchema.safeParse(rawInput);
        if (!parsed.success) return invalidArguments("propose_overlay", parsed.error);
        return store.getState().proposeOverlay(parsed.data);
      },
    },
    {
      name: "update_overlay_proposal",
      title: "Update B-roll proposal",
      description:
        "Update an existing unlocked GHOST proposal while planning. May change timeline start, duration, validated source in/out, or reason. Rejects human-locked overlays with HUMAN_LOCKED and cannot change approval, base media, locks, or audio.",
      inputSchema: {
        type: "object",
        properties: {
          overlayId: { type: "string", minLength: 1 },
          timelineStart: { type: "number", minimum: 0 },
          duration: { type: "number", exclusiveMinimum: 0 },
          sourceStart: { type: "number", minimum: 0 },
          sourceEnd: { type: "number", exclusiveMinimum: 0 },
          reason: { type: "string", minLength: 1, maxLength: 500 },
        },
        required: ["overlayId"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: async (rawInput, options) => {
        throwIfCancelled(options?.signal);
        const parsed = updateOverlaySchema.safeParse(rawInput);
        if (!parsed.success) {
          return invalidArguments("update_overlay_proposal", parsed.error);
        }
        const { overlayId, ...patch } = parsed.data;
        return store.getState().updateOverlay(overlayId, patch);
      },
    },
    {
      name: "remove_overlay_proposal",
      title: "Remove B-roll proposal",
      description:
        "Remove an unlocked GHOST B-roll proposal while planning. Rejects human-locked overlays with HUMAN_LOCKED. Cannot remove committed edits, approve the plan, change locks, or affect any audio.",
      inputSchema: {
        type: "object",
        properties: {
          overlayId: { type: "string", minLength: 1 },
        },
        required: ["overlayId"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: async (rawInput, options) => {
        throwIfCancelled(options?.signal);
        const parsed = removeOverlaySchema.safeParse(rawInput);
        if (!parsed.success) {
          return invalidArguments("remove_overlay_proposal", parsed.error);
        }
        return store.getState().removeOverlayProposal(parsed.data.overlayId);
      },
    },
    {
      name: "propose_generated_broll",
      title: "Propose generated B-roll fallback",
      description:
        "Create a visually distinct GHOST GENERATION SUGGESTION only after search_broll shows no strong uploaded-footage match. Stores a proposed prompt, timing, and editorial reason for human review. It does not call fal.ai, generate media, approve anything, spend credits, or create an overlay.",
      inputSchema: {
        type: "object",
        properties: {
          timelineStart: {
            type: "number",
            minimum: 0,
            description: "Desired start on the locked base-video timeline.",
          },
          duration: {
            type: "number",
            minimum: 1,
            maximum: 10,
            description: "Suggested clip duration in seconds, limited to 1-10.",
          },
          prompt: {
            type: "string",
            minLength: 10,
            maxLength: 1_000,
            description:
              "Visually grounded generation prompt: one clear action, useful framing, subtle motion, no dialogue or text overlays.",
          },
          reason: {
            type: "string",
            minLength: 1,
            maxLength: 500,
            description:
              "Why visual support helps and why no uploaded source moment is adequate.",
          },
          searchQuery: {
            type: "string",
            minLength: 1,
            maxLength: 200,
            description:
              "Concise visual need used to recheck the uploaded library before allowing this fallback.",
          },
        },
        required: ["searchQuery", "timelineStart", "duration", "prompt", "reason"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: async (rawInput, options) => {
        throwIfCancelled(options?.signal);
        const parsed = proposeGeneratedBrollSchema.safeParse(rawInput);
        if (!parsed.success) {
          return invalidArguments("propose_generated_broll", parsed.error);
        }
        const { searchQuery, ...proposal } = parsed.data;
        const threshold = configuredBrollMatchThreshold();
        const decision = decideVisualSupport(store.getState().project, {
          query: searchQuery,
          duration: proposal.duration,
          threshold,
        });
        if (decision.kind === "uploaded_match") {
          return {
            ok: false,
            code: "UPLOADED_MATCH_AVAILABLE",
            message:
              "An uploaded B-roll moment clears the current match threshold; propose that source before suggesting paid generation.",
            threshold,
            match: decision.match,
          };
        }
        return store.getState().proposeGeneratedBroll(proposal);
      },
    },
    {
      name: "update_generated_broll_suggestion",
      title: "Update generated B-roll suggestion",
      description:
        "Revise the timing, prompt, or reason of an unresolved generation suggestion while planning. This changes metadata only and never invokes a provider or spends credits. A suggestion already being generated by the human is rejected as SUGGESTION_BUSY.",
      inputSchema: {
        type: "object",
        properties: {
          suggestionId: { type: "string", minLength: 1 },
          timelineStart: { type: "number", minimum: 0 },
          duration: { type: "number", minimum: 1, maximum: 10 },
          prompt: { type: "string", minLength: 10, maxLength: 1_000 },
          reason: { type: "string", minLength: 1, maxLength: 500 },
        },
        required: ["suggestionId"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: async (rawInput, options) => {
        throwIfCancelled(options?.signal);
        const parsed = updateGeneratedBrollSchema.safeParse(rawInput);
        if (!parsed.success) {
          return invalidArguments("update_generated_broll_suggestion", parsed.error);
        }
        const { suggestionId, ...suggestionPatch } = parsed.data;
        return store
          .getState()
          .updateGeneratedBrollSuggestion(suggestionId, suggestionPatch);
      },
    },
    {
      name: "remove_generated_broll_suggestion",
      title: "Remove generated B-roll suggestion",
      description:
        "Remove an unresolved generation suggestion while planning. This never cancels or starts paid generation; a suggestion already being generated by the human is rejected as SUGGESTION_BUSY.",
      inputSchema: {
        type: "object",
        properties: {
          suggestionId: { type: "string", minLength: 1 },
        },
        required: ["suggestionId"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: async (rawInput, options) => {
        throwIfCancelled(options?.signal);
        const parsed = removeGeneratedBrollSchema.safeParse(rawInput);
        if (!parsed.success) {
          return invalidArguments("remove_generated_broll_suggestion", parsed.error);
        }
        return store.getState().removeGeneratedBrollSuggestion(parsed.data.suggestionId);
      },
    },
    {
      name: "set_pacing_preference",
      title: "Set pacing preference",
      description:
        "Set the maximum uninterrupted talking-head duration (seconds) used by find_overlay_opportunities pacing-gap detection. Clamped to 5-30 seconds. Planning-only; does not move, lock, approve, or commit any overlay.",
      inputSchema: {
        type: "object",
        properties: {
          maxTalkingHeadSeconds: {
            type: "number",
            minimum: 5,
            maximum: 30,
            description: "Maximum uninterrupted talking-head seconds before a pacing gap is flagged.",
          },
        },
        required: ["maxTalkingHeadSeconds"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: async (rawInput, options) => {
        throwIfCancelled(options?.signal);
        const parsed = setPacingPreferenceSchema.safeParse(rawInput);
        if (!parsed.success) return invalidArguments("set_pacing_preference", parsed.error);
        return store.getState().setPacingPreference(parsed.data.maxTalkingHeadSeconds);
      },
    },
    {
      name: "replan_unlocked_sections",
      title: "Replan unlocked sections",
      description:
        "Re-read the shared timeline and update only unlocked, agent-authored ghost B-roll proposals whose source moment is no longer the strongest available uploaded match. Human locks, human-authored overlays, and committed edits are always preserved untouched, and a moment the human previously rejected for any slot is never re-proposed. Requires the timelineRevision last read from get_timeline/get_edit_plan/get_project_summary; a stale value is rejected with STALE_TIMELINE instead of silently overwriting a timeline the human has since changed. Never creates new overlays or generation suggestions; only revises existing unlocked ones.",
      inputSchema: {
        type: "object",
        properties: {
          objective: {
            type: "string",
            minLength: 1,
            maxLength: 500,
            description:
              "Optional editorial objective/search focus guiding which unlocked decisions are re-evaluated. Defaults to each decision's own stored reason or overlapping transcript text.",
          },
          preserveHumanChanges: {
            type: "boolean",
            const: true,
            description: "Must be true; replan never overwrites human locks or human-placed overlays.",
          },
          timelineRevision: {
            type: "integer",
            minimum: 0,
            description:
              "The timelineRevision this plan was built against, from the most recent get_timeline/get_edit_plan/get_project_summary read.",
          },
        },
        required: ["preserveHumanChanges", "timelineRevision"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: async (rawInput, options) => {
        throwIfCancelled(options?.signal);
        const parsed = replanUnlockedSectionsSchema.safeParse(rawInput);
        if (!parsed.success) {
          return invalidArguments("replan_unlocked_sections", parsed.error);
        }
        return store.getState().replanUnlockedSections(parsed.data);
      },
    },
  ];
}

export function createApprovalTools(store: RelayLabStoreApi): WebMCP.ModelContextTool[] {
  return [
    {
      name: "commit_approved_plan",
      title: "Commit human-approved plan",
      description:
        `Commit the plan only after the human has approved it in the ${PRODUCT_NAME} UI. Converts every approved ghost to committed while preserving human positions, source ranges, reasons, and locks. This tool cannot approve a plan and B-roll remains permanently muted.`,
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: async (_input, options) => {
        throwIfCancelled(options?.signal);
        return store.getState().commitApprovedPlan();
      },
    },
  ];
}

export function createRelayLabTools(store: RelayLabStoreApi): WebMCP.ModelContextTool[] {
  return [...createReadTools(store), ...createPlanningTools(store)];
}

export interface RegistrationSnapshot {
  activeNames: string[];
  failedNames: string[];
  projectStatus: ProjectStatus;
}

export interface RegisterRelayLabToolsOptions {
  onChange?: (snapshot: RegistrationSnapshot) => void;
}

interface RegistrationGroup {
  controller: AbortController;
  names: string[];
  ready: Promise<PromiseSettledResult<void>[]>;
}

export interface RelayLabToolRegistration {
  names: readonly string[];
  ready: Promise<PromiseSettledResult<void>[]>;
  abort: () => void;
  getActiveNames: () => string[];
  whenIdle: () => Promise<void>;
}

export function registerRelayLabTools(
  modelContext: RelayLabModelContext,
  store: RelayLabStoreApi,
  options: RegisterRelayLabToolsOptions = {},
): RelayLabToolRegistration {
  const activeNames = new Set<string>();
  const failedNames = new Set<string>();
  let disposed = false;
  let planningGroup: RegistrationGroup | null = null;
  let approvalGroup: RegistrationGroup | null = null;
  let unsubscribe = () => {};
  let lastTransition: Promise<unknown> = Promise.resolve();

  const notify = () => {
    if (disposed) return;
    options.onChange?.({
      activeNames: [...activeNames].sort(),
      failedNames: [...failedNames].sort(),
      projectStatus: store.getState().project.status,
    });
  };

  const startGroup = (tools: WebMCP.ModelContextTool[]): RegistrationGroup => {
    const controller = new AbortController();
    const names = tools.map((tool) => tool.name);
    controller.signal.addEventListener(
      "abort",
      () => {
        names.forEach((name) => activeNames.delete(name));
        notify();
      },
      { once: true },
    );

    const ready = Promise.allSettled(
      tools.map((tool) =>
        Promise.resolve().then(() =>
          modelContext.registerTool(tool, { signal: controller.signal }),
        ),
      ),
    ).then((results) => {
      if (disposed || controller.signal.aborted) return results;
      const rejected = results
        .map((result, index) => ({ result, name: names[index] }))
        .filter(
          (entry): entry is { result: PromiseRejectedResult; name: string } =>
            entry.result.status === "rejected",
        );
      if (rejected.length > 0) {
        rejected.forEach(({ name }) => failedNames.add(name));
        controller.abort();
      } else {
        names.forEach((name) => {
          failedNames.delete(name);
          activeNames.add(name);
        });
        notify();
      }
      return results;
    });

    return { controller, names, ready };
  };

  const stopGroup = (group: RegistrationGroup | null) => {
    group?.controller.abort();
  };

  const coreGroup = startGroup(createReadTools(store));

  const reconcile = (status: ProjectStatus): Promise<unknown> => {
    if (disposed) return Promise.resolve();

    if (status === "planning") {
      stopGroup(approvalGroup);
      approvalGroup = null;
      if (!planningGroup || planningGroup.controller.signal.aborted) {
        planningGroup = startGroup(createPlanningTools(store));
      }
      lastTransition = planningGroup.ready;
    } else if (status === "approved") {
      stopGroup(planningGroup);
      planningGroup = null;
      if (!approvalGroup || approvalGroup.controller.signal.aborted) {
        approvalGroup = startGroup(createApprovalTools(store));
      }
      lastTransition = approvalGroup.ready;
    } else {
      stopGroup(planningGroup);
      stopGroup(approvalGroup);
      planningGroup = null;
      approvalGroup = null;
      lastTransition = Promise.resolve();
      notify();
    }

    return lastTransition;
  };

  // The read surface is the registrar's core health check. Do not expose or
  // subscribe any state-dependent mutation group until it is fully active.
  // This also prevents a later status transition from resurrecting tools
  // after a failed core registration.
  const ready = coreGroup.ready.then(async (coreResults) => {
    if (
      disposed ||
      coreResults.some((result) => result.status === "rejected")
    ) {
      stopGroup(planningGroup);
      stopGroup(approvalGroup);
      return coreResults;
    }

    unsubscribe = store.subscribe((state, previous) => {
      if (state.project.status !== previous.project.status) {
        void reconcile(state.project.status);
      }
    });

    const status = await reconcile(store.getState().project.status);
    const statusResults = Array.isArray(status)
      ? (status as PromiseSettledResult<void>[])
      : [];
    return [...coreResults, ...statusResults];
  });
  lastTransition = ready;
  notify();

  const abort = () => {
    if (disposed) return;
    unsubscribe();
    stopGroup(coreGroup);
    stopGroup(planningGroup);
    stopGroup(approvalGroup);
    activeNames.clear();
    disposed = true;
  };

  return {
    names: ALL_RELAYLAB_TOOL_NAMES,
    ready,
    abort,
    getActiveNames: () => [...activeNames].sort(),
    whenIdle: async () => {
      await lastTransition;
    },
  };
}
