# RelayLab

> A human and an external AI agent co-edit the same B-roll timeline through a structured WebMCP contract.

> Public name selected by the human on September 1, 2026. RelayLab’s hero is the shared human/agent WebMCP timeline—not automatic B-roll placement.

## What it is

This is a focused desktop B-roll overlay editor for one continuous talking-head video. It is not a general-purpose editor and it is not an automatic “one take in, finished video out” service.

The base video is locked and its audio is always the master audio. B-roll contributes video only. An external agent receives exact transcript, source-moment, pacing, timeline, lock, and approval data through WebMCP. It creates ghost proposals on the same timeline the human sees; the human keeps final editorial judgment.

The differentiating loop is:

```text
agent reads structured context
        ↓
agent searches uploaded source moments and proposes ghost edits
        ↓
human moves, swaps, resizes, removes, or locks an edit
        ↓
agent rereads the shared timeline and replans around that decision
        ↓
human clicks Approve Plan
        ↓
commit_approved_plan appears in the WebMCP tool surface
        ↓
agent commits without losing human timing, sources, reasons, or locks
```

If no uploaded clip clears the pragmatic match threshold, the agent may create a distinct AI-generation suggestion containing only timing, reason, and prompt metadata. It cannot generate video or spend credits. A fal.ai request starts only when the human presses **Generate Clip**. The returned clip enters the ordinary muted B-roll pipeline as another ghost edit.

## Why WebMCP

Browser automation gives an editorial agent pixels, DOM controls, approximate coordinates, and fragile click sequences. WebMCP exposes the concepts it actually needs:

- bounded transcript ranges and timestamps;
- indexed moments inside long source reels;
- separate source and timeline ranges;
- pacing and semantic opportunities;
- ghost and committed overlays;
- human locks and live human-edited positions;
- approval state; and
- the exact tools allowed in that state.

The visual editor remains for human taste. Structured state is authoritative for the agent.

## Trust model

- The agent may inspect, search, propose, revise, and remove unlocked planning work.
- The agent cannot approve a plan or control locks.
- Locked overlays reject agent mutation with `HUMAN_LOCKED`.
- `commit_approved_plan` is not registered before human UI approval.
- The agent may propose an AI-generation prompt, but no WebMCP tool can call a paid provider.
- Approval never generates unresolved suggestions.
- Base audio is the sole audio source; uploaded and generated B-roll are always muted.
- Tool inputs are validated and clamped; exported commands are generated but never executed by the app.

## Current status

The local product implementation is complete for the frozen hackathon MVP. Verified September 2, 2026 after the RelayLab usability pass:

- `npm run typecheck` — pass before and after the production build;
- `npm test` — 34 files, 189 tests, all pass;
- `npm run test:coverage` — 89.46% statements, 80.48% branches, 89.81% functions, 91.08% lines;
- `npm run test:e2e` — 11/11 serial Chromium flows pass;
- `npm run build` — pass with Next.js 16.3.3 and webpack;
- routes: static `/`, `/demo`, `/_not-found`; dynamic `/api/generate-broll`, `/api/transcribe`.

Open `/` for a genuinely blank local project and upload your own base video and B-roll. Open `/demo` for the deterministic pre-indexed judging project.

The editor is preview-first: Media and Transcript are compact on-demand panels, the seek timeline is the primary interaction surface, moving across its ruler scrubs the playhead, transcript segments seek on click, and indexed moments can be dragged from Media directly onto the B-roll track. A compact plan preflight shows blocking, warning, and informational checks before human approval.

Remaining submission work is external or human-owned: replace the verified temporary HTTPS tunnel with durable hosting, record the full collaboration loop using the final ChatGPT agent/client, publish the dedicated source repository and sub-three-minute video, and complete Devpost. See [submission readiness](docs/SUBMISSION_READINESS.md).

## WebMCP tools

All registrations are centralized in `lib/webmcp/registerRelayLabTools.ts` and use `document.modelContext.registerTool(tool, { signal })`. Aborting the owning signal removes a dynamic tool group.

| Tool | Availability | Purpose |
| --- | --- | --- |
| `get_project_summary` | Always | Read duration, status, counts, pacing, preflight, generation-suggestion count, and audio policy |
| `get_transcript` | Always | Read a time- and count-bounded transcript range |
| `get_timeline` | Always | Read live source/timeline ranges, statuses, locks, reasons, suggestions, preflight, and audio policy |
| `get_edit_plan` | Always | Read the agent's structured editorial plan — one decision per overlay/suggestion, with transcript context, reason, status, and `timelineRevisionUsed` |
| `find_overlay_opportunities` | Always | Find pacing gaps and lightweight semantic opportunities without mutating state |
| `search_broll` | Always | Rank indexed uploaded moments and report the uploaded-first recommendation decision |
| `propose_overlay` | Planning | Add a validated uploaded-footage ghost overlay; accepts an optional `expectedTimelineRevision` |
| `update_overlay_proposal` | Planning | Revise an unlocked ghost overlay; accepts an optional `expectedTimelineRevision` |
| `remove_overlay_proposal` | Planning | Remove an unlocked ghost overlay |
| `propose_generated_broll` | Planning | Add prompt/timing metadata for a human-reviewable generation suggestion; never calls a provider |
| `update_generated_broll_suggestion` | Planning | Revise unresolved suggestion metadata only |
| `remove_generated_broll_suggestion` | Planning | Dismiss an unresolved suggestion |
| `set_pacing_preference` | Planning | Set the gap threshold, constrained to 5–30 seconds |
| `replan_unlocked_sections` | Planning | Re-evaluate only unlocked, agent-authored ghost overlays against a required `timelineRevision`, preserving every human lock/placement and never re-proposing a previously rejected moment |
| `commit_approved_plan` | Approved only | Commit the exact human-approved ghost overlays |

Never exposed: `approve_plan`, `lock_overlay`, `unlock_overlay`, `generate_video`, `generate_broll`, B-roll volume, or audio mixing.

While planning, 6 read tools and 8 planning tools are registered. After human approval the planning tools are removed and `commit_approved_plan` appears. After commit, only the 6 read tools remain.

### EditPlan and timeline revision safety

The agent's editorial reasoning is a first-class, structured object — not something a human has to infer from clip positions. `get_edit_plan` derives an `EditPlan` (with `EditDecision[]`) live from the same overlay/generation-suggestion state `get_timeline` reads; it is never a separate or stale copy.

`Project.timelineRevision` increments on every material overlay/suggestion mutation. `propose_overlay` and `update_overlay_proposal` accept an optional `expectedTimelineRevision`; when provided and stale, the mutation is rejected with `STALE_TIMELINE` (`{expectedRevision, currentRevision}`) instead of silently overwriting a timeline the human already changed. `replan_unlocked_sections` requires `timelineRevision` and enforces the same check unconditionally — it is the hero tool for "the agent rereads the shared timeline and replans around" a human decision: it preserves every locked or human-authored overlay untouched, remembers moments the human has explicitly rejected (tracked as `Project.humanPreferences`) so it never immediately re-proposes them, and only revises unlocked agent ghost overlays whose source moment is no longer the strongest available match.

## Uploaded-footage-first generation fallback

`lib/editor/brollRecommendation.ts` implements a deterministic decision:

1. Search the user's indexed B-roll moments.
2. If the best score meets `NEXT_PUBLIC_BROLL_MATCH_THRESHOLD` (default `0.65`), recommend the uploaded moment.
3. If the score is lower, allow—but do not require—a generation suggestion.
4. If no visual is needed, recommend neither.

The threshold is a pragmatic, configurable editing rule, not a scientific confidence score.

The human flow is:

1. Select the distinct **Generate** suggestion block.
2. Review why it was suggested, the prompt, and duration.
3. Edit the prompt if desired.
4. Explicitly press **Generate Clip**.
5. If fal.ai succeeds, convert the result into a normal B-roll asset, indexed moment, and ghost overlay.
6. Preview, move, trim, swap, delete, regenerate, or lock it through the normal editor controls.

Regeneration requires another explicit click. A failure preserves the suggestion and allows retry. Without credentials, the demo honestly reports that generation is unavailable and makes no fabricated success response.

## Long source reels and content understanding

A B-roll file is treated as a source reel. Stored moments contain source in/out times, factual descriptions, and tags. `lib/media/segmentBroll.ts` produces bounded candidate windows and subdivides long uncut stretches; `lib/media/sampleFrames.ts` selects representative start/middle/end timestamps. Search then works over stored metadata without rerunning vision during editing.

The deterministic `/demo` route includes a timestamped transcript and pre-indexed moments, so the core WebMCP demonstration never depends on credentials or binary media.

The upload UI now converts every source reel into contiguous 3–8 second local candidate windows immediately, preserving exact source ranges and deriving searchable filename tags. These are deliberately labeled local candidate indexes rather than invented semantic scene descriptions. Automatic OpenAI transcription is wired through a server-only route when configured; semantic vision description remains an optional provider boundary and is not claimed for new uploads.

## Preview, captions, and audio policy

The base `<video>` is the master clock and keeps playing underneath visual overlays. Only the active B-roll source is mounted; its source time is calculated from the base timeline and drift-corrected. Every B-roll element, including fal.ai results, is permanently muted.

Captions can be generated from timestamped transcript segments or added and retimed manually at the playhead. The human can choose top, center, or bottom placement; preview and ffmpeg export preserve that choice. Automatic captions use a server-only OpenAI transcription route when configured, and otherwise fail honestly while manual captions remain available.

## Export

The editor always supports:

- an auditable edit JSON containing project state, portable media names, separate source/timeline ranges, captions, unresolved generation suggestions, provenance, and explicit mute policy;
- an SRT caption sidecar; and
- a reproducible ffmpeg shell script for committed edits.

The ffmpeg graph ignores all B-roll audio streams and maps only optional base audio `0:a:0?`. The app does not execute the generated script or arbitrary tool-supplied paths. A short Canvas/MediaRecorder render was deliberately omitted to protect core reliability.

## Architecture

- `lib/editor/types.ts` — serializable project, media, moment, overlay, caption, generation-suggestion, EditPlan/EditDecision, and human-preference contracts.
- `lib/editor/store.ts` — authoritative Zustand actions, trust-boundary checks, and `timelineRevision` bookkeeping.
- `lib/editor/timeline.ts` — pure range clamping, movement, resizing, and source-time mapping.
- `lib/editor/editPlan.ts` — derives the live `EditPlan`/`EditDecision[]` from overlay and generation-suggestion state.
- `lib/editor/replan.ts` — `replan_unlocked_sections` planning logic: preserves locks/human overlays, skips rejected moments.
- `lib/editor/brollSearch.ts` / `brollRecommendation.ts` — deterministic ranking and uploaded-first decision.
- `lib/editor/overlayOpportunities.ts` — pacing and semantic heuristics.
- `lib/editor/planPreflight.ts` — approval-readiness checks shared by UI, state, and WebMCP reads.
- `lib/webmcp/registerRelayLabTools.ts` — all WebMCP schemas, tools, and dynamic registration lifecycle.
- `lib/media/` — object URL ownership, metadata probing, long-reel segmentation, and representative-frame timing.
- `lib/analysis/` — optional transcription and moment-description provider boundaries.
- `lib/generation/videoGenerator.ts` — server-only fal.ai adapter behind a provider-neutral interface.
- `app/api/generate-broll/route.ts` — strict human-intent, prompt, duration, and aspect-ratio validation.
- `app/api/transcribe/route.ts` — server-only, human-started automatic transcription with file and origin validation.
- `lib/export/` — edit JSON, SRT, and base-audio-only ffmpeg generation.
- `components/editor/` — one shared editor/store, preview, library, transcript, timeline, export, generation UI, and WebMCP debug drawer.
- `tests/phase1` … `tests/phase9`, `tests/phase11`, and `tests/e2e` — domain, trust, provider, export, EditPlan/revision-safety/replan, and browser collaboration coverage.

Source time and timeline time are separate throughout. A shot at `74.2–80.1` in a source reel can appear at `22.0–27.9` on the main timeline without destructively trimming the upload.

## Run locally

Requirements: Node.js 22+, npm, Chromium for Playwright, and ffmpeg only for the real-upload browser fixture.

```bash
npm install
npm run dev
```

Open `/demo`. No API key is needed.

Optional server configuration:

```bash
FAL_KEY=
FAL_VIDEO_MODEL=
FAL_ALLOW_REMOTE_GENERATION=false
NEXT_PUBLIC_BROLL_MATCH_THRESHOLD=0.65
OPENAI_API_KEY=
RELAYLAB_TRANSCRIPTION_MODEL=whisper-1
RELAYLAB_VISION_MODEL=
OPENAI_ALLOW_REMOTE_TRANSCRIPTION=false
```

Both `FAL_KEY` and a current compatible `FAL_VIDEO_MODEL` are required for live video generation. The key remains server-side. Remote paid generation is denied unless `FAL_ALLOW_REMOTE_GENERATION=true`; keep it false/unset on a public unauthenticated deployment. The human-intent header is not authentication or billing protection.

## Verify

```bash
npm run typecheck
npm test
npm run test:coverage
npm run test:e2e
npm run build
npm run typecheck
```

The GitHub Actions workflow in `.github/workflows/ci.yml` runs the same quality and browser jobs after the project is placed in its own repository and pushed.

## Judge demo

Use the exact script in [docs/HACKATHON.md](docs/HACKATHON.md). The hero moment is human/agent negotiation, not automatic B-roll:

1. Agent reads transcript, opportunities, timeline, and uploaded moments.
2. Agent proposes uploaded footage where the score is strong.
3. For the “AI manager” sentence, the uploaded POS and coffee clips are weak; the agent creates one generation suggestion instead.
4. Human reviews the prompt and may explicitly generate one clip.
5. Human retimes/swaps/locks another edit.
6. Agent rereads the timeline and replans around the lock.
7. Human approves; the commit tool appears; the agent commits.

## Native WebMCP testing

Automated browser tests use a faithful page-level `document.modelContext` double. In addition, the official GoogleChromeLabs smoke runner passes **15/15 native calls across five journeys in Chrome 152.0.7977.65**. Before submission, repeat the complete human/agent judge loop in the final ChatGPT host and record the agent/client version plus the planning, approved, and committed tool lists. The WebMCP debug drawer shows availability, project state, registered tools, and failures.

Five outcome-focused journeys for the experimental GoogleChromeLabs WebMCP Evals CLI live in `tests/webmcp-evals/relaylab.json`. With the production server already running, execute `npm run test:webmcp:smoke`; this complements rather than replaces the state/visual Playwright assertions.

## Known limitations

- Uploaded media and project state are browser-session local, not persistent or shareable.
- Local B-roll is immediately segmented into honest candidate windows; semantic vision descriptions are not yet generated for new uploads.
- Automatic captions require a configured `OPENAI_API_KEY` and accept a maximum 25 MB local media file; manual captions always remain available.
- No browser-rendered final MP4; JSON, SRT, and reproducible ffmpeg are the supported exports.
- Generated provider URLs may be temporary; download a generated clip beside the exported script before rendering.
- The fal.ai endpoint has an intent guard and strict validation, but no authentication or rate limiting. Keep paid generation disabled on a public demo or add real protection outside this auth-free MVP.
- The native Chrome smoke passes; the final ChatGPT agent loop, durable public deployment, public media/repository, and Devpost submission remain outstanding.

## Frozen v1 scope

Exactly one base track, one muted B-roll track, one caption layer, local media, indexed moments, transcript, timeline, ghost proposals, human locks/approval, small WebMCP surface, live preview, reproducible export, and one narrow human-clicked generation fallback.

Transitions, color grading, keyframes, music, audio mixing, stock search, effects, accounts, billing, collaboration, cloud projects, and NLE-clone features remain in [V2_IDEAS.md](V2_IDEAS.md).

## Documentation

- [Milestones and measured evidence](docs/MILESTONES.md)
- [Current TODO and submission gates](TODO.md)
- [Official-resource audit and submission readiness](docs/SUBMISSION_READINESS.md)
- [Hackathon narrative and demo script](docs/HACKATHON.md)
- [Deployment checklist](docs/DEPLOYMENT.md)
- [Positioning and rename decision](docs/POSITIONING.md)
- [Rename inventory](docs/RENAME_CHECKLIST.md)
- [Deferred ideas](V2_IDEAS.md)
- [Demo media contract](public/demo/README.md)
