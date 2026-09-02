# RelayLab TODO

Last verified baseline: September 2, 2026. RelayLab was selected by the human and applied on September 1; every local post-rename gate passes.

## Completed product phases

- [x] Phase 1 — shared WebMCP/timeline vertical slice.
- [x] Phase 2 — human locks, approval, dynamic commit registration, preserved commit.
- [x] Phase 3 — local base/B-roll uploads, object URL ownership, master-clock preview, muted B-roll.
- [x] Phase 4 — deterministic transcript/moment metadata, segmentation helpers, opportunity detection, search, bounded read tools.
- [x] Phase 5 — captions, transcript focus, pacing UI, keyboard/numeric alternatives, honest states.
- [x] Phase 6 — edit JSON, SRT, safe ffmpeg script, base-audio-only mapping, commit-gated final export.
- [x] Phase 7 — hackathon narrative, judge-loop E2E, CI, license, positioning, deployment and rename checklists.
- [x] Uploaded-footage-first AI B-roll fallback:
  - [x] deterministic strong-match threshold (default 0.65, configurable);
  - [x] distinct unresolved generation-suggestion blocks;
  - [x] `propose_generated_broll`, `update_generated_broll_suggestion`, and `remove_generated_broll_suggestion` planning tools;
  - [x] no WebMCP tool capable of paid generation;
  - [x] human-only **Generate Clip** and explicit-cost regenerate controls;
  - [x] server-only fal.ai key/model configuration;
  - [x] honest credential-free demo failure that preserves state;
  - [x] generated results enter the ordinary B-roll asset/moment/ghost pipeline;
  - [x] generated B-roll remains muted in preview, state, edit JSON, and ffmpeg export;
  - [x] unresolved suggestions survive approval without triggering generation.
- [x] Blank local workspace at `/`, separated from the deterministic `/demo` judging route; empty timelines cannot be edited or approved before a base upload.
- [x] Preview-first UI refinement:
  - [x] compact icon-led shell with collapsible Media/Transcript panels;
  - [x] larger preview and timeline-first hierarchy;
  - [x] file drop zones for base and B-roll uploads;
  - [x] library-moment drag directly onto the B-roll track as a human-authored muted ghost;
  - [x] hover-to-scrub ruler and transcript click-to-seek;
  - [x] larger overlay resize handles; and
  - [x] compact plan preflight for blocking, warning, and informational checks.

- [x] RelayLab usability pass:
  - [x] compact final wordmark and consistent icon-led header controls;
  - [x] portrait-aware program frame with uncropped base preview;
  - [x] conditional slide-in timeline inspector;
  - [x] immediate local candidate indexing for uploaded source reels;
  - [x] touch-friendly add-at-playhead plus drag-to-place;
  - [x] B-roll-only split at playhead and visible trim handles;
  - [x] manual caption creation/editing and top/center/bottom placement;
  - [x] optional server-only automatic transcription route; and
  - [x] caption placement preserved in edit JSON and ffmpeg burn style.

- [x] EditPlan differentiation (agent editorial reasoning as a first-class object):
  - [x] `EditPlan`/`EditDecision` model (`lib/editor/types.ts`), derived live from overlay/generation-suggestion state (`lib/editor/editPlan.ts`), never stored separately;
  - [x] `get_edit_plan` always-available WebMCP read tool;
  - [x] `Project.timelineRevision`, incremented on every material timeline mutation;
  - [x] optional `expectedTimelineRevision` on `propose_overlay`/`update_overlay_proposal`, rejecting stale calls with `STALE_TIMELINE`;
  - [x] `replan_unlocked_sections` hero planning tool — preserves human locks/placements, requires `timelineRevision`, never re-proposes a human-rejected moment;
  - [x] `Project.humanPreferences` tracking rejected-moment feedback, recorded on `remove_overlay_proposal` for agent-authored overlays; and
  - [x] `Overlay.alternatives` field for ranked-candidate "why this clip" data, populated by `replan_unlocked_sections` (UI panel not built — deferred, see below).

## Verified gates

- [x] `npm run typecheck` — pass.
- [x] `npm test` — 34 files, 189 tests, all pass.
- [x] `npm run test:coverage` — pass:
  - statements 89.46%;
  - branches 80.48%;
  - functions 89.81%;
  - lines 91.08%.
- [x] `npm run test:e2e` — 11/11 serial Chromium flows pass, including blank-project base upload, ruler hover-scrub, library-to-timeline drag, and RelayLab timeline controls.
- [x] Phase 8 route test — 8 request cases pass, including configured-provider success, cross-origin rejection, and remote-default denial.
- [x] `npm run build` — pass with webpack; `/`, `/demo`, and `/_not-found` are static; `/api/generate-broll` and `/api/transcribe` are dynamic.
- [x] Post-build `npm run typecheck` — pass; no duplicate generated declarations.
- [x] Production server smoke — `/demo` returns HTTP 200.
- [x] Temporary HTTPS quick-tunnel smoke — `/` and `/demo` return HTTP 200 with RelayLab metadata.
- [x] Generation-suggestion UI evidence — `working-name-generation-suggestion.png`.
- [x] Final-name UI evidence — `relaylab-blank.png` and `relaylab-phase3.png`.
- [x] GoogleChromeLabs-compatible WebMCP eval journeys — `tests/webmcp-evals/relaylab.json`.
- [x] Native WebMCP Evals smoke — 15/15 calls pass in Google Chrome 152.0.7977.65; the replacement-generation journey ends with exactly one unresolved suggestion.
- [x] No dependency vulnerabilities reported after adding `@fal-ai/client@1.10.1`.

### EditPlan differentiation feature — verified September 2, 2026

The whole-suite numbers above predate this feature and the concurrent BYOK/vision work; they will need a fresh full run before submission. What is independently verified for this feature:

- `npm run typecheck` — pass, zero errors, after all EditPlan/replan/revision-safety changes.
- `npx vitest run tests/phase11` — pass, 3 files, 20 tests, 0 failures (EditPlan shape, timeline-revision staleness rejection, replan lock/human-overlay/rejected-moment preservation).
- `npx vitest run tests/phase1/webmcpVerticalSlice.test.ts tests/phase2/guardBranches.test.ts tests/phase2/webmcpApprovalLifecycle.test.ts tests/phase11` — pass, 6 files, 38 tests, 0 failures (confirms the tool-count/registration-list updates for the two new tools did not regress existing lifecycle behavior).
- This sandbox had severe concurrent-agent resource contention during verification (vitest's `pool: "threads"` repeatedly failed to spawn worker threads under sustained load averages of 8–20 from multiple simultaneous agent test runs in the same repository); every reported result above is from a run that completed cleanly with zero unhandled worker-spawn errors, not from a partial or timed-out run.
- `npm run build` — attempted multiple times; stalled under the same resource contention without completing by the time of this report. Needs a rerun once the shared machine is quieter.

## Required before submission

- [x] Receive the exact human-chosen replacement name: RelayLab.
- [x] Apply the public rename while keeping stable WebMCP tool names and competitor citations intact.
- [x] Rerun typecheck, tests, coverage, Playwright, and build after the rename.
- [x] Capture final renamed screenshots; do not submit working-name screenshots as final evidence.
- [ ] Record the final sub-three-minute public demo video with audio.
- [ ] Replace the temporary HTTPS tunnel with a durable deployment and verify `/demo` plus both server routes.
- [ ] Configure a real `FAL_KEY` and a current compatible `FAL_VIDEO_MODEL` only if the live demo will generate one clip; otherwise keep the honest demo-mode path.
- [ ] If fal.ai is enabled, run exactly one deliberate human-clicked generation smoke test and confirm the returned clip previews muted.
- [ ] Run the collaboration loop in the challenge’s native WebMCP-enabled Chrome/ChatGPT host; automated tests currently use a faithful `document.modelContext` double.
- [x] Run the deterministic WebMCP Evals smoke suite in native Chrome against the current HTTPS URL.
- [ ] Rerun that smoke once against the final durable URL and retain the output with submission evidence.
- [ ] Record native host/version and final tool list.
- [ ] Initialize a dedicated project Git repository or move the project out of the home-level repository before publishing.
- [ ] Start the official Devpost workflow, create the draft, complete required fields/assets, review, and submit.
- [ ] Freeze the Devpost entry, public repository, deployed app, and video after the September 3 1:00 PM PT deadline while judging is active.

## Honest known limitations

- [ ] Uploaded reels use deterministic local candidate-window indexing; semantic frame-difference/vision descriptions are not yet part of the live upload path.
- [ ] Automatic transcription requires `OPENAI_API_KEY` and a media file no larger than 25 MB; manual captions are the credential-free fallback.
- [ ] The optional OpenAI vision adapter is not part of the live import path and should not be marketed as live analysis.
- [ ] Uploaded media/state are browser-session local and do not survive reload or produce a shareable project.
- [ ] Browser rendering is intentionally omitted; edit JSON + SRT + reproducible ffmpeg script are the supported export.
- [ ] Generated media URLs may be provider-hosted/temporary; download the result beside the exported script using the portable filename before running ffmpeg.
- [ ] The human-confirmation header is an intent guard, not authentication or billing authorization. Remote paid generation is denied by default; keep `FAL_ALLOW_REMOTE_GENERATION` false/unset publicly, or add proper auth/rate limits before any public paid use.
- [ ] `Overlay.alternatives` (ranked "why this clip?" candidates) is populated by `replan_unlocked_sections` but not yet by `propose_overlay`, and no UI panel surfaces it yet — the data model and the one write path exist; the click-to-inspect UI and initial-proposal population are deferred follow-up work.
- [ ] An Edit Plan review UI (a compact list view of all EditDecisions before approval) was not built; `get_edit_plan` is fully functional as a WebMCP read but has no dedicated visual counterpart yet — the existing plan preflight panel is the closest UI today.

## Scope guard

- [x] No transitions, color grading, keyframes, music, audio mixer, effects, stock search, accounts, billing, teams, comments, cloud projects, or NLE-clone features.
- [x] Optional background music and visual adjustments from the later brief remain deferred; they are not needed for the WebMCP story.
- [x] Broader autonomous/generative-media ideas remain in `V2_IDEAS.md`.
