# RelayLab milestones

This is the implementation and evidence record for the OpenAI WebMCP Challenge build. A milestone is complete only when its behavior exists and the relevant gates pass. RelayLab was selected by the human on September 1, 2026.

## Final local verification

Verified September 2, 2026 after the RelayLab usability pass:

| Gate | Result |
| --- | --- |
| `npm run typecheck` | Pass before and after production build |
| `npm test` | Pass — 34 files, 189 tests |
| `npm run test:coverage` | Pass — 89.46% statements, 80.48% branches, 89.81% functions, 91.08% lines |
| `npm run test:e2e` | Pass — 11/11 serial Chromium flows |
| `npm run build` | Pass — Next.js 16.3.3 webpack build |
| Build routes | Static `/`, `/demo`, `/_not-found`; dynamic `/api/generate-broll`, `/api/transcribe` |
| Phase 8 route test | Pass — eight request cases, including provider success, cross-origin rejection, and remote-default denial |
| Production HTTP smoke | Fresh production build served `/demo` with HTTP 200 |
| Native WebMCP Evals | Pass — 15/15 calls across five journeys in Chrome 152.0.7977.65 |

The earlier Phase 5 managed-sandbox jsdom and dev-server limitations are superseded by this complete verification. During final close-out, a stale local `node_modules` copy reproduced the jsdom worker timeout even in Terminal; `npm ci` restored the exact locked packages and the unmodified 165-test command passed. A stale `.next` webpack cache was likewise removed before the clean production build. The unrestricted browser run initially found a Phase 8 test-double lifecycle bug: it did not reject registration with an already-aborted signal during React Strict Mode remount. The fake was aligned with the WebMCP lifecycle, then the focused Phase 8 tests and all eight browser flows passed.

The September 2 official WebMCP Evals audit found a native-only interoperability defect that the page-level test doubles could not reveal: Chrome invokes the tool callback with `execute(input)` while the installed type package also models `execute(input, { signal })`. All tool callbacks now tolerate the absent options object while preserving cancellation whenever Chrome or a test host supplies a signal. A regression invokes all thirteen callbacks with the native one-argument shape.

The August 31 interaction pass reproduced the stale jsdom import symptom once; a clean `npm ci` restored the locked dependencies. Playwright media/evidence flows use one Chromium worker because concurrent video playback and full-page screenshots contended for the local browser/GPU. The September 2 post-rename suite passes all eleven flows serially.

## Milestone 1 — WebMCP vertical slice

**Status:** Complete — verified August 29, 2026

Required proof:

```text
propose_overlay
      ↓
visible ghost block
      ↓
human moves/resizes it
      ↓
get_timeline returns the human-edited position
```

Implemented:

- deterministic demo state;
- base preview, locked base track, and one B-roll track;
- validated `get_timeline` and `propose_overlay`;
- immediate ghost rendering;
- pointer, keyboard, and numeric editing;
- separate source/timeline ranges; and
- base-master/B-roll-muted policy.

Evidence: `tests/e2e/phase1.spec.ts` and [`cutroom-phase1.png`](../cutroom-phase1.png).

## Milestone 2 — Human/agent collaboration

**Status:** Complete — verified August 29, 2026

Implemented:

- human retime, resize, source swap, remove, lock, and unlock;
- structured `HUMAN_LOCKED` rejection;
- human-only **Approve Plan**;
- AbortSignal-owned planning and approval tool groups;
- `commit_approved_plan` absent → present → absent across the state machine;
- committed overlays preserve human timing, sources, reasons, and locks; and
- live WebMCP debug drawer.

Evidence: `tests/e2e/phase2.spec.ts` and [`cutroom-phase2.png`](../cutroom-phase2.png).

## Milestone 3 — Real local media

**Status:** Complete — verified August 29, 2026

Implemented:

- one local base upload/replacement and multiple B-roll imports;
- owned object URL lifecycle;
- abortable/error-aware duration probing;
- base video as playback clock and sole audio source;
- one lazily mounted active B-roll element, always muted;
- timeline-to-source seeking and drift correction; and
- honest unindexed full-reel placeholders for imports.

Evidence: `tests/e2e/phase3.spec.ts` and [`cutroom-phase3.png`](../cutroom-phase3.png). The browser fixture is generated with ffmpeg at test time; no binary is fabricated in the repository.

The default `/` route is a genuinely blank local workspace with no seeded transcript, assets, overlays, captions, or generation suggestions. `/demo` remains the deterministic pre-indexed judging path. The blank timeline stays inert and approval remains unavailable until a valid base-video duration has been loaded.

## Milestone 4 — Content understanding

**Status:** Complete — verified August 29, 2026

Implemented:

- deterministic timestamped demo transcript and indexed source moments;
- provider boundaries for transcription and factual moment descriptions;
- long-reel candidate segmentation and representative frame timestamps;
- deterministic token/tag/duration/reuse search;
- pacing-gap and semantic-cue opportunity detection;
- bounded `get_project_summary`, `get_transcript`, `find_overlay_opportunities`, and `search_broll`; and
- clamped planning-only `set_pacing_preference`.

Honest boundary: the live upload UI does not invoke transcription/frame capture/vision indexing. It creates an unindexed full-reel moment. The fully indexed judging path is `/demo`.

## Milestone 5 — Captions and polish

**Status:** Complete — unrestricted verification closed August 30, 2026

Implemented:

- deterministic captions from transcript timestamp ranges;
- one readable preview caption style and on/off toggle;
- playhead-synchronized transcript focus;
- caption timeline row;
- 5–30 second pacing numeric control;
- keyboard alternatives to dragging; and
- honest empty/loading/error states.

Evidence: `tests/e2e/phase5.spec.ts` passes in the final 9/9 suite. The historical sandbox report remains at `docs/verification/phase5-external.md`, but its blocked status is superseded by the final results above.

## Milestone 6 — Reproducible export

**Status:** Complete — verified August 30, 2026

Implemented:

- edit JSON with portable names, source/timeline ranges, locks, provenance, captions, status, suggestions, and mute policy;
- deterministic SRT;
- approval/commit-gated final ffmpeg export;
- shell-safe path quoting and range validation;
- committed-overlay composition; and
- base audio mapping only (`0:a:0?`), with every B-roll audio stream ignored.

The app generates export artifacts but never executes arbitrary commands. The optional short browser render is deliberately omitted; there is no fake control.

Evidence: `tests/phase6/` and `tests/e2e/phase6-export.spec.ts`.

## Milestone 7 — Hackathon hardening

**Status:** Complete for local implementation; submission gates remain external

Implemented:

- exact judge-loop browser flow;
- full invariant/regression inventory;
- GitHub Actions quality and Chromium jobs;
- MIT license;
- hackathon narrative and demo script;
- positioning/name-collision analysis;
- deployment and rename procedures;
- honest demo-media contract; and
- measured full-suite verification.

Evidence: `tests/e2e/phase7-judge-loop.spec.ts` proves agent proposal → human retime/swap/lock → agent reread/replan → human approval → dynamic commit → preserved human decisions.

## Milestone 8 — Uploaded-first, human-gated generation fallback

**Status:** Complete — verified August 30, 2026

Purpose: allow one useful generated B-roll fallback without turning the product into a generative-video app or giving an agent spending authority.

Implemented:

- deterministic `uploaded_match`, `generate_suggestion`, or `no_visual_needed` decision;
- configurable default match threshold of 0.65;
- distinct generation-suggestion timeline block and details panel;
- planning-only `propose_generated_broll`, `update_generated_broll_suggestion`, and `remove_generated_broll_suggestion`;
- no WebMCP paid-generation tool;
- explicit human **Generate Clip** and **Regenerate** controls;
- provider-neutral server contract and current `@fal-ai/client` queue subscription;
- required server-side `FAL_KEY` and `FAL_VIDEO_MODEL`, with no hardcoded model ID;
- strict prompt/duration/aspect-ratio validation;
- honest 503 demo-mode behavior without credentials;
- failure preservation and retry;
- successful generated media conversion to a normal B-roll asset, indexed moment, and ghost overlay;
- generated B-roll muted throughout preview/state/export;
- unresolved suggestions survive approval without generating; and
- an “AI manager” demo suggestion where the available POS/coffee footage is intentionally weak.

Phase 8 tests prove:

1. strong uploaded match avoids unnecessary generation recommendation;
2. weak/no match permits a suggestion;
3. suggestion tools never call fal.ai;
4. only the human request path calls the API;
5. no agent-accessible paid tool exists;
6. generated results enter the normal asset/moment/overlay pipeline;
7. generated video remains muted;
8. provider failure preserves suggestion state;
9. regeneration needs another explicit click;
10. locked generated overlays reject agent mutation;
11. source/timeline mapping stays correct;
12. approval does not generate unresolved suggestions; and
13. the route's human gate, strict schema, unavailable state, provider error, and success branches behave correctly.

Evidence: `tests/phase8/`, `tests/e2e/phase8-generation-suggestion.spec.ts`, and [`working-name-generation-suggestion.png`](../working-name-generation-suggestion.png).

## Interaction refinement — Preview first, timeline hero

**Status:** Complete — verified August 31, 2026

Implemented without changing the WebMCP trust surface:

- compact icon-led header and on-demand Media/Transcript side panels;
- a substantially larger preview canvas;
- prominent full-width seek timeline with hover-to-scrub ruler;
- transcript segment click-to-seek;
- base-video and B-roll file drop zones;
- indexed library moments draggable directly onto the B-roll track as human-authored muted ghosts;
- larger drag/resize hit targets; and
- a compact plan preflight surfaced in both the editor and structured timeline/project reads.

The human placement action is UI-only; it does not add a WebMCP tool or alter agent authority. Evidence: `tests/phase7/planPreflight.test.ts`, `tests/e2e/phase5.spec.ts`, and the refreshed phase screenshots.

## Interaction refinement — RelayLab focused timeline controls

**Status:** Complete — verified September 2, 2026

Implemented within the frozen single-overlay-track scope:

- RelayLab public branding and compact, consistently sized header controls;
- portrait-aware program framing that keeps the base video uncropped;
- a conditional slide-in inspector instead of a permanently empty timeline column;
- immediate deterministic 3–8 second candidate indexing for uploaded source reels;
- human drag-to-place and touch-friendly add-at-playhead controls;
- visible edge handles plus B-roll-only split-at-playhead;
- offline manual caption creation, timing edits, and top/center/bottom placement;
- optional human-started, server-only OpenAI automatic transcription; and
- caption placement carried through preview, edit JSON, and ffmpeg export.

This does not add transitions, extra tracks, destructive base cuts, B-roll audio, or other general-purpose NLE features. Local candidate labels are intentionally non-semantic until a vision provider supplies grounded descriptions.

Evidence: `tests/phase9/`, the expanded Phase 3/4/6/8 regression tests, `relaylab-blank.png`, `relaylab-phase3.png`, and the final verification table above.

## Milestone 9 — EditPlan differentiation (agent editorial reasoning as a first-class object)

**Status:** Complete — verified September 2, 2026

Built to make the agent's editorial reasoning visible and structurally distinct from a competing "generic timeline operations" WebMCP surface, without regressing any existing trust boundary:

- `EditPlan`/`EditDecision` model (`lib/editor/types.ts`), derived live in `lib/editor/editPlan.ts` from the same `overlays`/`generationSuggestions` state `get_timeline` already reads — never a duplicated or divergent copy;
- `get_edit_plan`, an always-available WebMCP read tool returning the derived plan, including `timelineRevisionUsed`;
- `Project.timelineRevision`, incremented on every material overlay/generation-suggestion mutation (propose/update/remove/swap/lock, generated-B-roll completion, drag/resize);
- optional `expectedTimelineRevision` on `propose_overlay`/`update_overlay_proposal`; a stale value is rejected with a structured `STALE_TIMELINE` failure (`{expectedRevision, currentRevision}`) instead of silently applying against a timeline the human already changed — omitting the field preserves prior behavior for existing callers;
- `replan_unlocked_sections`, a new planning-only WebMCP tool requiring `timelineRevision`: it preserves every human-locked and human-authored overlay untouched, remembers moments the human has explicitly rejected (`Project.humanPreferences`, recorded by `remove_overlay_proposal` for agent-authored overlays) so it never immediately re-proposes them, and only revises unlocked agent ghost overlays whose current source moment is no longer the strongest available match; and
- `Overlay.alternatives` for ranked "why this clip?" candidate data, populated when `replan_unlocked_sections` swaps a moment.

Deferred (see TODO.md honest-limitations): the "why this clip?" click-to-inspect UI panel, wiring `alternatives` into the initial `propose_overlay` path, and a dedicated Edit Plan review list view before approval.

Evidence: `tests/phase11/editPlan.test.ts`, `tests/phase11/timelineRevision.test.ts`, `tests/phase11/replanUnlockedSections.test.ts` (3 files, 20 tests, 0 failures in a clean run), plus updated `tests/phase1/webmcpVerticalSlice.test.ts` and `tests/phase2/{guardBranches,webmcpApprovalLifecycle}.test.ts` tool-registration-list assertions (6 files, 38 tests, 0 failures together). `npm run typecheck` passes clean. This sandbox experienced sustained multi-agent resource contention during verification (vitest thread-pool spawn timeouts under concurrent test runs from other agents in the same repository); reported numbers are from runs that completed with zero unhandled worker errors. `npm run build` was attempted repeatedly and consistently stalled mid-webpack-compile under that same contention without completing by the time of this report — needs a rerun.

## Remaining submission gates

These are not missing local product code:

- [x] Receive and apply the exact human-chosen public name: RelayLab.
- [x] Rerun all gates after the rename.
- [ ] Create a dedicated Git repository and push so `.github/workflows/ci.yml` runs.
- [ ] Replace the verified temporary HTTPS tunnel with durable hosting and verify `/demo` plus both server routes.
- [ ] Run the judge loop in the challenge's native WebMCP-enabled Chrome/ChatGPT host and record the host/build/tool list.
- [ ] If fal.ai will be demonstrated, run exactly one explicit human-clicked generation and confirm muted preview.
- [x] Capture final renamed screenshots.
- [ ] Record and publish the final sub-three-minute video with audio.
- [x] Run `tests/webmcp-evals/relaylab.json` in native Chrome — 15/15 calls pass.
- [ ] Rerun the same native smoke against the final durable URL and retain the output.
- [ ] Create, review, and submit the Devpost entry.

## Scope freeze

No transitions, color tools, keyframes, music, audio mixing, stock search, effects, accounts, billing, teams, comments, cloud projects, or NLE-clone features. Broader generation is deferred. The only v1 exception is the narrow uploaded-first, human-clicked fallback above.
