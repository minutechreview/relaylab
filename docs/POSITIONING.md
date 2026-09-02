# Submission positioning and rename decision

## Public name

The human selected **RelayLab** as the public project name on September 1, 2026. This completes the collision-avoidance rename; it is not a trademark-clearance claim.

The rename is important because two existing products already use the name and overlap with parts of the feature set:

- [Cutroom](https://cutroomai.com/add-b-roll-to-video) is a commercial talking-head workflow that transcribes a take, places B-roll against spoken words, supports creator footage, burns captions, and returns a finished video.
- [kuluruvineeth/cutroom](https://github.com/kuluruvineeth/cutroom) is an open-source native macOS editor positioned as an AI-native editor with an agent operating a real timeline.

This is a name and surface-feature collision, not evidence that the submission's central WebMCP interaction already exists.

## Defensible headline

> A human and an external AI agent co-edit the same B-roll timeline through a structured WebMCP contract.

Do not lead with “AI automatically adds B-roll.” Automatic placement is common and is not the submission's strongest contribution.

## Product distinction

The submission is intentionally built around shared authority:

1. The external agent reads structured transcript, indexed source moments, pacing opportunities, locks, and live timeline state through WebMCP.
2. It creates visible ghost proposals rather than silently producing a final cut.
3. The human moves, resizes, swaps, removes, and locks proposals in a visual timeline.
4. The agent rereads the same state and replans only around unlocked areas.
5. Approval remains a human-only UI action.
6. The commit tool is absent from the WebMCP surface until approval, appears dynamically afterward, and disappears after commit.

The small tool surface, human locks, reread/replan loop, and approval-gated capability change are the hero—not automated media selection by itself.

The optional generation fallback strengthens this distinction only when framed correctly: the editor searches the creator's footage first, and the agent may suggest a prompt only when no stored moment clears the deterministic threshold. The agent cannot call fal.ai or spend credits; the human decides whether one suggested clip is worth generating. Do not market the submission as an AI video generator.

## Demo priority

The judge-facing hero sequence must be:

```text
agent reads structured context
        ↓
agent searches uploaded footage and proposes a strong uploaded match
        ↓
agent identifies one weak-match concept and creates prompt metadata only
        ↓
human moves one, swaps another, and locks the preferred edit
        ↓
agent rereads the timeline and explicitly sees the changes and lock
        ↓
agent replans a different unlocked area
        ↓
human clicks Approve Plan
        ↓
commit_approved_plan appears in the WebMCP tool surface
        ↓
agent commits; human decisions remain intact
```

If demo time permits, the human may click **Generate Clip** exactly once in a controlled local/private environment. The suggestion itself—not a long generation sequence—is sufficient to prove the trust boundary. Never enable the paid endpoint on the public unauthenticated demo.

Do not spend the limited demo time on generic transcription, stock search, visual effects, or a long export progress sequence.

## Rename acceptance checklist

Once the user provides the exact human-chosen name:

- update visible brand text, document headings, metadata, package name/description, project/demo IDs where safe, screenshot labels, and public copy;
- keep WebMCP tool names stable unless a technical reason requires changing them;
- do not rename historical milestone screenshots merely to hide the working-name history;
- rerun `rg -ni 'cutroom|cut room'` and manually classify every remaining occurrence;
- rerun typecheck, unit tests, Playwright, and production build;
- capture new final screenshots only after the public name is applied; and
- do not claim a trademark clearance—this is a collision-avoidance product rename, not legal advice.
