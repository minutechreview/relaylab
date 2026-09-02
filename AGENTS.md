<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# RelayLab engineering handoff

This is the authoritative takeover brief for the OpenAI WebMCP Challenge submission. Read it, `README.md`, `TODO.md`, and `docs/MILESTONES.md` before editing. Deadline: **September 3, 2026**.

## Mission

Build a focused WebMCP-native B-roll overlay editor for one continuous talking-head video. The human keeps the visual interface and final editorial judgment. An external agent receives exact transcript, indexed source-moment, timeline, pacing, lock, and approval data through a small WebMCP surface.

The agent must not operate the editor through screenshots, DOM clicking, coordinates, or browser automation.

The hero loop is:

1. Agent reads structured context and searches uploaded footage.
2. Agent creates ghost proposals.
3. Human retimes, resizes, swaps, removes, or locks them.
4. Agent rereads the same timeline and replans around human decisions.
5. Human clicks **Approve Plan**.
6. Only then does `commit_approved_plan` appear.
7. Agent commits without losing human timing, sources, reasons, or locks.

If uploaded footage is weak, the agent may propose one AI-generation suggestion containing prompt/timing/reason metadata. It may not call fal.ai. Only a human click may start paid generation.

## Current verified checkpoint

The frozen local MVP is implemented through Phases 1–8 plus the RelayLab usability pass. Verified September 2, 2026:

- `npm run typecheck` passes before and after build.
- `npm test`: **34 files, 189 tests, all pass**.
- `npm run test:coverage`: **89.46% statements, 80.48% branches, 89.81% functions, 91.08% lines**.
- `npm run test:e2e`: **11/11 serial Chromium flows pass**.
- `npm run build`: pass with Next.js 16.3.3 and webpack.
- Build routes: static `/`, `/demo`, `/_not-found`; dynamic `/api/generate-broll`, `/api/transcribe`.
- Phase 8 route tests cover eight real request cases, including provider success, cross-origin rejection, and remote-default denial.
- GoogleChromeLabs WebMCP Evals: **15/15 native calls pass across five journeys in Chrome 152.0.7977.65**.
- Generation-suggestion UI evidence: `working-name-generation-suggestion.png`.

The previous jsdom and Playwright blockers are closed. During final close-out, a stale local `node_modules` copy caused package reads to stall in both managed and normal Terminal processes; a clean `npm ci` restored the locked dependencies and the exact 165-test command passed. A stale `.next` webpack cache was removed before the clean build. If either symptom recurs, refresh only those regenerable artifacts; do not weaken assertions or relabel a fresh failure without reproducing it.

The build script intentionally uses `next build --webpack`; this avoids a managed-environment Turbopack/PostCSS worker-port issue while producing a clean supported build.

## Immediate takeover assignment

RelayLab was selected by the human on September 1, 2026. The remaining work is submission preparation:

1. Replace the temporary HTTPS quick tunnel with a durable deployment.
2. Run the exact judge loop in the final ChatGPT WebMCP host and record agent/client/build plus planning/approved/committed tool evidence. The native Chrome evaluator already passes; rerun it against the final durable URL.
3. If live fal.ai generation will be shown, configure a current compatible model and run exactly one deliberate human-clicked smoke; verify it previews muted.
4. Initialize a dedicated public repository and verify the README, source, setup, history, and top-level license in incognito.
5. Record a public YouTube demo under three minutes with audio.
6. Complete and submit Devpost before September 3 at 1:00 PM PT, then freeze public artifacts during judging.

## Repository safety

This directory is not currently its own Git repository; `git rev-parse --show-toplevel` resolves to `/Users/mac`. Do not run broad `git clean`, `git reset`, or home-level status/cleanup commands. Work only inside this directory unless the user explicitly initializes or moves it into a dedicated repository.

Never weaken assertions to make a gate pass.

## Working product

- deterministic credential-free `/demo` project with timestamped transcript and indexed moments;
- genuinely blank local `/` workspace for uploading a base video and B-roll without seeded editorial state;
- local base-video upload/replacement and multiple B-roll uploads;
- owned object URL creation, replacement, failure cleanup, and teardown;
- locked base track and one B-roll track;
- base-video master playback and sole audio;
- source-time/timeline-time mapping and active B-roll drift correction;
- only the active B-roll video mounted, always muted;
- ghost, locked, committed, and generation-suggestion timeline treatments;
- pointer drag, edge resize, numeric, and keyboard editing;
- preview-first icon shell, on-demand Media/Transcript panels, hover-scrub ruler, transcript seek, and human library-to-timeline drag placement;
- plan preflight returned by project/timeline reads and enforced for blocking approval issues;
- human source swap, delete, lock/unlock, approval, and generation controls;
- planning → approved → committed state machine;
- centralized AbortSignal-owned WebMCP lifecycle and debug drawer;
- bounded transcript reads, opportunity heuristics, B-roll ranking, and pacing preference;
- deterministic caption blocks, live caption overlay, transcript focus, and caption timeline;
- edit JSON, SRT, and safe reproducible ffmpeg export mapping only base audio;
- uploaded-first generation recommendation threshold;
- human-only fal.ai generation/regeneration through a server route;
- generated media converted into ordinary B-roll asset/moment/ghost state; and
- honest empty, missing-media, provider-unavailable, and generation-failure states.

## WebMCP surface

RelayLab uses `document.modelContext.registerTool(tool, { signal })` with `webmcp-types@0.1.5`. Do not invent `unregisterTool`; abort the owning signal.

Always registered:

- `get_project_summary`
- `get_transcript`
- `get_timeline`
- `get_edit_plan`
- `find_overlay_opportunities`
- `search_broll`

Planning only:

- `propose_overlay`
- `update_overlay_proposal`
- `remove_overlay_proposal`
- `propose_generated_broll`
- `update_generated_broll_suggestion`
- `remove_generated_broll_suggestion`
- `set_pacing_preference`
- `replan_unlocked_sections`

Approved only:

- `commit_approved_plan`

Never expose:

- `approve_plan`, `lock_overlay`, or `unlock_overlay`;
- `generate_video`, `generate_broll`, or any paid-generation call;
- B-roll volume, enable-audio, or audio-mixing tools; or
- arbitrary file execution.

The read group must succeed before status-dependent groups register. Group registration is all-or-none. Status transitions abort the old group before starting the new one. Store actions recheck authority because discoverability changes cannot cancel an invocation already in flight.

## Non-negotiable invariants

- Exactly one locked base/talking-head track.
- Exactly one B-roll overlay track.
- Base audio is the only master audio.
- Uploaded and generated B-roll are always muted in preview and export.
- There is no B-roll volume control.
- Source time and timeline time remain separate.
- Source reels are never destructively trimmed.
- Agent edits begin as ghosts.
- Agent cannot approve, lock, unlock, or spend generation credits.
- Locked overlays reject agent updates/removal.
- `commit_approved_plan` does not exist before human approval.
- Approval never generates unresolved suggestions.
- Generated results follow the ordinary B-roll pipeline.
- All external arguments are validated and clamped.

## Narrow generation carve-out

Broader generative media remains out of scope. The only v1 exception is a single-purpose fallback after uploaded B-roll search:

1. Search indexed user footage.
2. If the best result meets the configurable threshold (default 0.65), prefer it.
3. If it does not, allow the agent to suggest prompt/timing/reason metadata.
4. Render a distinct suggestion block; do not call a provider.
5. Only the human **Generate Clip** or **Regenerate** click may call `/api/generate-broll`.
6. Preserve the suggestion on failure.
7. Convert a success to a normal muted B-roll asset, moment, and ghost overlay.

`FAL_KEY` and `FAL_VIDEO_MODEL` are server-only and both required. No default model ID is hardcoded. The configured model must accept the adapter's prompt, duration, and aspect-ratio fields.

The request header is an intent guard, not authentication. Do not enable paid generation on a public unauthenticated deployment. Use a private demo or add real auth/rate limiting outside this frozen auth-free MVP.

## Frozen v1 scope

Build only one base track, one muted B-roll track, caption layer, library and long-reel indexing boundaries, transcript, timeline, ghost proposals, human edit/locks/approval, small WebMCP surface, live preview, edit JSON/SRT/ffmpeg export, and the narrow human-clicked generation fallback.

Do not build transitions, color grading, keyframes, music, audio mixing, sound effects, multiple video tracks, stock search, effects, motion-graphics authoring, accounts, authentication, billing, teams, comments, cloud projects, mobile editing, or NLE-clone functionality. Keep them in `V2_IDEAS.md`.

## Architecture map

- `lib/editor/types.ts` — project, transcript, asset, moment, overlay, caption, suggestion, EditPlan/EditDecision, human-preference, and result contracts.
- `lib/editor/store.ts` — authoritative synchronous Zustand state transitions, guards, and `timelineRevision` bookkeeping.
- `lib/editor/timeline.ts` — pure geometry and timeline/source mapping.
- `lib/editor/audioPolicy.ts` — immutable base-master/B-roll-muted policy.
- `lib/editor/editPlan.ts` — derives the live `EditPlan` from overlay/generation-suggestion state.
- `lib/editor/replan.ts` — `replan_unlocked_sections` logic: preserves locks/human overlays, skips human-rejected moments.
- `lib/editor/brollSearch.ts` — deterministic token/tag/duration/reuse ranking.
- `lib/editor/brollRecommendation.ts` — uploaded-match/generate-suggestion/no-visual decision.
- `lib/editor/overlayOpportunities.ts` — pacing and semantic heuristics.
- `lib/editor/planPreflight.ts` — blocking/warning/info checks for plan readiness.
- `lib/media/` — object URL lifecycle, metadata probing, segmentation, frame timestamps.
- `lib/analysis/` — optional transcription and moment-description boundaries; not wired to upload UI.
- `lib/generation/videoGenerator.ts` — provider-neutral contract and server-only fal.ai adapter.
- `lib/generation/requestGeneratedBroll.ts` — human UI request client.
- `app/api/generate-broll/route.ts` — strict server validation and provider invocation.
- `lib/export/` — edit spec, SRT, safe ffmpeg generation.
- `lib/webmcp/registerRelayLabTools.ts` — every WebMCP schema/tool/registration group.
- `lib/demo/project.ts` — deterministic offline judging state.
- `components/editor/` — shared store, media ownership, preview, timeline, library, transcript, generation/export panels, and debug drawer.
- `tests/phase1` … `tests/phase9`, `tests/phase11` — domain, lifecycle, provider, export, and EditPlan/revision-safety/replan coverage.
- `tests/e2e/` — ten browser flows, including the exact judge loop, human-paid-generation boundary, hover scrub, and human drag placement.

## Honest limitations

- Uploaded media/state are tab-local and not persistent/shareable.
- New uploads receive an immediate, honest candidate-window index; semantic frame/vision descriptions are not wired.
- Automatic OpenAI transcription is human-started and server-only when configured; manual captions remain credential-free.
- Browser MP4 rendering is omitted; JSON/SRT/ffmpeg are the supported export.
- Provider-hosted generated URLs may expire; download the asset before running the exported script.
- Automated E2E uses a faithful `document.modelContext` test double; native-host smoke is still required.
- Deployment, native smoke, final media, repository initialization, and Devpost submission remain outstanding.
- `Overlay.alternatives` ("why this clip?" ranked candidates) is populated by `replan_unlocked_sections` but not yet by `propose_overlay`; the click-to-inspect UI panel for it was not built.
- No dedicated Edit Plan review UI exists yet; `get_edit_plan` is a fully functional WebMCP read with no visual counterpart beyond the existing plan preflight panel.

## Verification sequence

Run sequentially:

```bash
npm run typecheck
npm test
npm run test:coverage
npm run test:e2e
npm run build
npm run typecheck
```

If `npm run test:e2e` cannot bind/serve inside a managed agent sandbox, run it in a normal terminal or CI. The September 2 suite passes 11/11 serially. With the production server already running, `npm run test:webmcp:smoke` exercises five outcome-focused WebMCP Evals journeys; it requires native WebMCP-enabled Chrome and does not replace Playwright assertions.

## Takeover completion standard

A change is complete only when visible behavior works, important invariants have tests, typecheck/tests/coverage/Playwright/build pass, and README/TODO/milestones state measured evidence rather than intent.

## Ready-to-paste continuation prompt

> Continue RelayLab from its verified Phase 8 plus preview-first interaction checkpoint. Read `AGENTS.md`, `README.md`, `TODO.md`, and `docs/MILESTONES.md`; do not scaffold, replace architecture, or add product features. `/` is the blank upload workspace; `/demo` is the deterministic judging project. Work only on a named submission gate or explicit user-directed UI request. Preserve base-master audio, permanently muted B-roll, source/timeline separation, human locks, approval-gated commit, uploaded-first matching, human-only paid generation, and compact plan preflight. Rerun every gate after source changes and report exact evidence.
