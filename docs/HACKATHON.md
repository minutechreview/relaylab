# WebMCP Challenge submission narrative

> **Public name:** RelayLab, selected by the human on September 1, 2026. See [POSITIONING.md](POSITIONING.md) for the collision-avoidance rationale.

## Why WebMCP?

Video editing combines two different strengths. An agent can reason across transcript meaning, pacing, and described source moments. A human is better at visual taste, timing, and deciding whether an edit feels right.

Browser automation gives the agent the wrong interface: screenshots, DOM controls, coordinates, and fragile clicks. This project exposes the small editorial model the agent actually needs through `document.modelContext.registerTool(...)`. The human and agent work against the same state without asking the agent to impersonate a mouse.

## What can humans and agents do together here that was difficult before?

The agent can identify a transcript opportunity, search exact moments inside long user-owned source reels, and create a ghost on the live timeline. The human can retime, resize, swap, remove, or lock it. Those decisions are not hidden UI state: the next `get_timeline` call returns the changed values and lock, so the agent can explicitly replan elsewhere.

When uploaded footage cannot communicate an idea, the agent may propose one generation prompt and timing range. It still cannot call a provider. The human chooses whether the idea deserves a paid generation attempt.

Approval changes capability, not only presentation. Before human approval, `commit_approved_plan` is absent. After the human clicks **Approve Plan**, planning tools are aborted and the commit tool is registered. After commit, it disappears again.

## How WebMCP is implemented

All registrations live in `lib/webmcp/registerRelayLabTools.ts` and use the current `registerTool(tool, { signal })` lifecycle in three groups:

1. Five persistent read/search tools.
2. Seven planning mutation tools.
3. One approval-only commit tool.

| Tool | Availability | Role |
| --- | --- | --- |
| `get_project_summary` | Always | Bounded project orientation and counts |
| `get_transcript` | Always | Time- and count-bounded transcript reads |
| `get_timeline` | Always | Live ranges, reasons, statuses, locks, and suggestions |
| `find_overlay_opportunities` | Always | Read-only pacing and semantic opportunity scan |
| `search_broll` | Always | Rank uploaded moments and return uploaded-first recommendation state |
| `propose_overlay` | Planning | Create an uploaded-footage ghost |
| `update_overlay_proposal` | Planning | Revise an unlocked ghost |
| `remove_overlay_proposal` | Planning | Remove an unlocked ghost |
| `propose_generated_broll` | Planning | Create prompt/timing metadata only after rechecking that no strong uploaded match exists |
| `update_generated_broll_suggestion` | Planning | Revise suggestion metadata only |
| `remove_generated_broll_suggestion` | Planning | Dismiss a suggestion |
| `set_pacing_preference` | Planning | Set a 5–30 second pacing preference |
| `commit_approved_plan` | Approved only | Commit the exact human-approved ghosts |

Every runtime Zod schema is strict. Every mutation also rechecks status, IDs, source/timeline ranges, locks, and in-flight generation state inside the store. Dynamic registration controls discoverability; domain guards control authority.

`propose_generated_broll` requires the concise visual search query and reruns the same uploaded-footage decision. If a result clears the configured threshold, it returns `UPLOADED_MATCH_AVAILABLE` with the preferred source instead of creating a generation suggestion.

## What remains human-controlled?

- approving the plan;
- locking and unlocking overlays;
- final timing and source choice;
- whether an AI-generation suggestion is dismissed, edited, or generated;
- every paid generation or regeneration attempt;
- whether a generated result is retained;
- export; and
- final editorial judgment and submission approval.

There is no agent tool for approval, locks, generation execution, B-roll volume, audio mixing, or arbitrary file execution.

## What does the agent perceive?

- duration, project status, counts, and pacing preference;
- bounded transcript segments and timestamps;
- indexed moment descriptions, tags, source ranges, and match scores;
- pacing and lightweight semantic opportunities;
- ghost/committed overlays and unresolved generation suggestions;
- separate source in/out and timeline in/out;
- reasons, human locks, and live human-edited positions; and
- the tool surface appropriate to the current state.

## What does the agent not perceive or control?

- screenshots or DOM structure as its state interface;
- pointer coordinates or click targets;
- arbitrary local files;
- base audio or any way to enable B-roll audio;
- approval or lock authority;
- paid generation authority; or
- commit capability before human approval.

## Why not browser automation?

A browser-driving agent must infer timestamps from rendered blocks, guess whether a lock icon is active, drag approximate coordinates, and hope a later screenshot matches internal state. WebMCP returns exact values. A `timelineStart` of `22.0`, source range `74.2–80.1`, and `lockedByHuman: true` remain explicit and domain-enforced.

## Uploaded footage first

The generation fallback is deliberately restrained:

```text
visual opportunity
      ↓
search uploaded indexed moments
      ↓
score ≥ threshold ── yes ──→ propose uploaded moment
      │
      no
      ↓
agent may propose prompt/timing metadata
      ↓
human may click Generate Clip
      ↓
measured generated video becomes an ordinary muted ghost
```

The default threshold is 0.65 and configurable. It is a deterministic editing rule, not a scientific confidence score. The agent is never forced to fill every opportunity.

The fal.ai key and model are server-only and no model ID is hardcoded. Returned media duration is probed from the actual video before source ranges are created. Regeneration is represented in authoritative store state, blocks approval/base replacement while in flight, and requires a matching operation token before the result can replace the source.

Paid generation is remote-disabled by default. On a public unauthenticated deployment, leave `FAL_ALLOW_REMOTE_GENERATION` false/unset and keep the demo suggestion-only. A live paid clip should be generated only in a controlled local/private demo.

## Master-audio trust policy

The talking-head base is the sole audio source. Uploaded and generated B-roll are permanently muted in preview, state, edit JSON, and ffmpeg. The script maps only optional base audio `0:a:0?`.

## Exact demo script

### 1. Establish the contract

Open `/demo`. Show the locked base track, one muted B-roll track, transcript, captions, visible playhead, generation-suggestion treatment, and WebMCP debug drawer. Point out that `commit_approved_plan` is not registered while planning.

### 2. Let the agent orient

Ask the external agent to call `get_project_summary`, bounded `get_transcript`, `get_timeline`, and `find_overlay_opportunities`. Have it explain one semantic opportunity and one pacing opportunity from returned data.

### 3. Prove uploaded footage comes first

Ask the agent to search for the workspace/design opportunity. The strong indexed source moment should clear the threshold. Call `propose_overlay` and show the uploaded ghost appear immediately.

### 4. Show the one generation fallback

Focus on the line:

> “I wanted the system to feel like an AI manager watching everything happening across the store.”

Search for a restaurant manager monitoring a live operations dashboard. The available POS and coffee footage should not clear the threshold. Ask the agent to call `propose_generated_broll` with the same search need, timing, reason, and a visually grounded prompt. Show the distinct **Generate** block; emphasize that no provider call or charge occurred.

If using a controlled credentialed local demo, let the human click **Generate Clip** once. Otherwise click it in credential-free mode and show the honest unavailable message while the suggestion remains. Never fake a successful generation.

### 5. Make visible human decisions

As the human, drag one uploaded proposal earlier, resize it numerically, swap another source, and lock the preferred edit. This demonstrates that drag is not the only input method.

### 6. Make the agent adapt

Ask the agent to call `get_timeline` again. It should state the new human timing and lock, avoid the locked overlay, and replan an unlocked area. Optionally attempt a locked update to show `HUMAN_LOCKED`.

### 7. Demonstrate approval-gated capability

Click **Approve Plan**. Show all seven planning tools disappear and `commit_approved_plan` appear. Unresolved generation suggestions remain suggestions and trigger no provider calls.

### 8. Commit and export

Ask the agent to call `commit_approved_plan`. Confirm ghosts become committed without losing human changes/locks and the commit tool disappears. Export edit JSON and the ffmpeg script. Point out the generated-source retrieval handoff, unique filename validation, and base-only audio mapping.

## Honest demo claims

- `/demo` works without credentials or bundled binary media.
- Real local upload, immediate local candidate indexing, muted synchronized preview, manual captions, and optional server transcription work. New uploads do not fabricate semantic vision descriptions.
- Automated E2E uses a faithful page-level `document.modelContext` double; native challenge-host smoke is still required.
- JSON/SRT/ffmpeg are supported; a short browser MP4 render is intentionally omitted.
- Live fal.ai is optional, local/private by default, and never agent-triggered.
- No Devpost submission exists until the official workflow produces a verified public entry.
