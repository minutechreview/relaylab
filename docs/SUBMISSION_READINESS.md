# RelayLab submission readiness

Audit date: September 2, 2026. Official deadline: **September 3, 2026 at 1:00 PM Pacific / 8:00 PM UTC / 11:00 PM Kuwait**.

This is the short operational checklist for the [WebMCP Challenge](https://webmcp.devpost.com/). The local product is complete; the remaining risk is submission evidence and availability.

## Current position

| Area | Status | Evidence or next action |
| --- | --- | --- |
| Focused WebMCP product | Ready | Shared timeline, structured context, ghost edits, human locks, human approval, dynamic commit |
| Current imperative API | Ready | Central `document.modelContext.registerTool(tool, { signal })`; AbortSignal owns dynamic registration |
| Trust boundary | Ready | Agent cannot approve, lock, unlock, generate paid video, or enable B-roll audio |
| Automated regression suite | Ready | 34 files / 189 unit tests; 11/11 Playwright flows; coverage/build/typecheck pass |
| WebMCP Evals artifact | Ready | `tests/webmcp-evals/relaylab.json` contains five outcome-focused journeys |
| Native WebMCP smoke | Ready on current URL | 15/15 tool calls pass in Chrome 152.0.7977.65; rerun once on the final durable URL |
| Final ChatGPT agent loop | **Required** | Record the complete human/agent loop and the tool surface changing across planning → approved → committed |
| Durable HTTPS URL | **Required** | Replace the temporary quick tunnel with a stable deployment |
| Public source repository | **Required** | Create a dedicated public repo; verify README, source, setup, dated history, and top-level `LICENSE` in incognito |
| Public demo video | **Required** | Public YouTube video under three minutes, with audio and the live agent/tool loop |
| Devpost entry | **Required** | Complete all fields, identify tested agent/client and AI tools, accept team invitation if applicable, and submit rather than leave draft |

## Why the official journey guidance fits

RelayLab is a **co-browsing** journey: the human and agent collaborate in the same live editor. The tool surface follows the recommended trust layers:

1. **Answer:** project summary, bounded transcript, live timeline, opportunities, and B-roll search.
2. **Reversible action:** ghost proposal/update/removal, pacing preference, and generation-suggestion metadata.
3. **Commitment:** approval remains a human UI action; only afterward does `commit_approved_plan` become discoverable.

The tools represent editorial outcomes rather than UI buttons or backend endpoints. Tool descriptions are specific, schemas are bounded, read tools carry `readOnlyHint`, all arguments are validated, and the agent rereads the same state the human edits.

## Native verification sequence

Use the final deployed `/demo` URL.

1. Open it in the ChatGPT in-app browser, or Chrome 149+ with `chrome://flags/#enable-webmcp-testing` enabled.
2. Inspect the planning tool list using [Chrome DevTools WebMCP](https://developer.chrome.com/docs/devtools/application/webmcp) or the [Nekuda WebMCP Workbench](https://chromewebstore.google.com/detail/nekuda-webmcp-workbench/amochnnbmnkjjlblolhpddkokhnalkjp).
3. Execute the hero loop: read context → propose uploaded footage → human retimes/swaps/locks → agent rereads → human approves → commit tool appears → agent commits.
4. Record the exact browser/agent version and screenshots of the planning, approved, and committed tool lists.
5. Run the deterministic [GoogleChromeLabs WebMCP Evals](https://github.com/GoogleChromeLabs/webmcp-tools/tree/main/webmcp-evals) smoke suite while the production server is already running:

   ```bash
   npm run test:webmcp:smoke
   ```

   For a deployed target, use:

   ```bash
   npx --yes webmcp-evals@0.0.4 --chrome-channel chrome smoke \
     -u https://YOUR-DOMAIN.example/demo \
     -e tests/webmcp-evals/relaylab.json -v
   ```

The smoke runner calls exact tools without an LLM or API key. In `webmcp-evals@0.0.4`, a completed callback can pass even when a domain result contains RelayLab's structured `{ ok: false }`; use this evidence for native discovery/invocation, not as the sole domain assertion. Vitest and Playwright remain the result-aware state/visual suites.

## Three-minute video structure

- **0:00–0:15:** show the working editor and an agent-created ghost block immediately.
- **0:15–1:10:** agent reads transcript/timeline, searches uploaded footage, and proposes edits.
- **1:10–1:55:** human moves/swaps/locks; agent rereads and replans around that decision.
- **1:55–2:25:** human approves; show `commit_approved_plan` appearing and being called.
- **2:25–2:45:** show muted B-roll preview plus export artifacts.
- **2:45–3:00:** one-sentence impact and trust-boundary close.

Keep generation as an optional fallback suggestion, not the headline. Remove typing, provider waits, and dead air. Audio is required.

## Judging alignment

The four criteria are weighted equally:

- **WebMCP leverage:** non-trivial structured reads/actions, live state synchronization, human-only authority, and dynamic tool availability.
- **Execution:** polished editor plus deterministic demo, tests, captions, preview, local media, and reproducible export.
- **Potential impact:** creators keep editorial judgment while agents receive precise context instead of brittle browser automation.
- **Creativity and ambition:** the differentiator is negotiation on a shared timeline—especially human retime/swap/lock followed by agent replanning—not automatic B-roll placement.

## Deadline freeze

After the submission deadline, do not edit the Devpost entry, public repository, deployed app, or video until judging concludes. Finish durable hosting, native evidence, public repo, video, and the submitted Devpost entry before the deadline.

## Reference set

- [WebMCP Challenge](https://webmcp.devpost.com/)
- [WebMCP Evals](https://github.com/GoogleChromeLabs/webmcp-tools/tree/main/webmcp-evals)
- [Chrome WebMCP eval documentation](https://developer.chrome.com/docs/ai/webmcp/evals)
- [Chrome DevTools WebMCP debugger](https://developer.chrome.com/docs/devtools/application/webmcp)
- [Building user journeys with WebMCP](https://webmcp.com/blog/building-user-journeys-with-webmcp)
- [WebMCP resource directory](https://webmcp.com/resources)
