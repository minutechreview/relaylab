# Rename checklist (pre-rename inventory)

> **Completed September 1, 2026:** the human selected **RelayLab**. Public UI, metadata, package identity, request-intent headers, environment examples, and current documentation were updated. Stable WebMCP tool names were deliberately preserved. The inventory below remains as a historical classification aid; competitor citations in `docs/POSITIONING.md` remain unchanged.

> **August 30 update:** this inventory predates Phase 8. Its classifications and gotchas remain useful, but exact counts and line numbers are not authoritative. The final sweep must include `app/api/generate-broll`, `lib/generation`, `tests/phase8`, and `working-name-generation-suggestion.png`.

This is a **mechanical inventory**, not a rename plan. No replacement name has been chosen — see
[`docs/POSITIONING.md`](POSITIONING.md) for why the rename is needed (name collision with two existing
`cutroom` products) and for the acceptance checklist to follow once the human-chosen name exists. This
file exists to make that acceptance step ("rerun `rg -ni 'cutroom|cut room'` and manually classify every
remaining occurrence") fast and exhaustive by doing that classification once, now, ahead of time.

This file will go stale as the code changes. Re-run the sweep in the "How this was generated" section
below before actually executing a rename — do not trust this file blindly if much time has passed.

## Important: this is NOT name-dependent

**The core differentiation headline — "WebMCP-native B-roll overlay editor," the human/agent shared-authority
thesis, ghost proposals, human locks, reread/replan loop, and approval-gated `commit_approved_plan`
capability change — is positioning language, not the product name.** It must be preserved verbatim (or
re-worded independently on its own merits) regardless of what name is chosen. Do not let a find-and-replace
tool sweep this language up as if it were a "CutRoom" occurrence. See `docs/POSITIONING.md` for the full
defensible headline and demo priority — none of that content is touched by this checklist.

## Count summary

Total occurrences of `cutroom`/`CutRoom`/`CUTROOM` (case-insensitive) found: **~215** across **41 files**
(38 tracked text files + 3 binary screenshot files), excluding `node_modules/`, `.next/`, `coverage/`,
`test-results/`, `.claude-flow/`, and `package-lock.json`'s nested lockfile metadata (counted once as a
category below, not line-by-line).

By category:

| Category | Files | Approx. occurrences | Notes |
|---|---|---|---|
| Source code (identifiers: types, functions, hooks, components, files) | 10 | ~55 | `CutRoomState`, `CutRoomStoreApi`, `createCutRoomStore`, `useCutRoomStore`, `useCutRoomStoreApi`, `CutRoomEditor`, `registerCutRoomTools`, `ALL_CUTROOM_TOOL_NAMES`, `CutRoomModelContext`, `CutRoomToolRegistration`, `RegisterCutRoomToolsOptions`, `createCutRoomTools`, `createReadTools`/`createPlanningTools`/`createApprovalTools` (indirect), env var names `CUTROOM_TRANSCRIPTION_MODEL` / `CUTROOM_VISION_MODEL` |
| File/component names | 2 | 2 | `components/editor/CutRoomEditor.tsx`, `lib/webmcp/registerCutRoomTools.ts` |
| Test files (identifiers, describe/test bodies, fixture strings) | 20 | ~90 | Mostly re-imports of `createCutRoomStore`/`registerCutRoomTools`; a few string fixtures (`blob:cutroom-...`, `__cutroomWebMcp`, `__cutroomInvoke`, tmpdir prefix `cutroom-phase3-`) |
| Documentation (`.md`) | 8 | ~40 | `AGENTS.md`, `README.md`, `TODO.md`, `V2_IDEAS.md`, `docs/HACKATHON.md`, `docs/MILESTONES.md`, `docs/POSITIONING.md` (self-referential, expected), `public/demo/README.md` |
| Package metadata | 2 | 3 | `package.json` name field, `package-lock.json` (2 occurrences, mirrors package.json name) |
| Config (`.env.example`) | 1 | 3 | Header comment + 2 env var names |
| Assets (binary screenshots) | 3 | 3 (filenames) | `cutroom-phase1.png`, `cutroom-phase2.png`, `cutroom-phase3.png` — referenced from `README.md`, `AGENTS.md`, `docs/MILESTONES.md`, and read at runtime by `tests/e2e/phase1-3.spec.ts` |
| UI-visible strings | 3 files | ~9 | `app/layout.tsx` (`<title>`/meta description), `components/editor/CutRoomEditor.tsx` (visible "CUTROOM" wordmark + "CutRoom Phase 3 ·" status text), `README.md`/demo copy (not runtime UI but public-facing prose) |
| WebMCP tool/schema fields | 0 | 0 | See "No WebMCP tool names are affected" below — confirmed clean |

Config files confirmed to have **zero** occurrences (checked, not skipped): `next.config.ts`, `tsconfig.json`,
`playwright.config.ts`, `vitest.config.mts`, `postcss.config.mjs`, `.gitignore`, `LICENSE`, `types/webmcp.d.ts`.

No favicon, OG-image, or other `public/` binary assets currently exist beyond `public/demo/README.md` (text,
listed above) — there is nothing to re-generate in `public/` besides that one doc.

## No WebMCP tool names are affected

Checked `lib/webmcp/registerCutRoomTools.ts` tool `name`/`title`/`description` fields and all Zod schemas
individually: none of the actual WebMCP tool identifiers (`get_timeline`, `propose_overlay`,
`update_overlay_proposal`, `remove_overlay_proposal`, `commit_approved_plan`, `get_project_summary`,
`get_transcript`, `find_overlay_opportunities`, `search_broll`, `set_pacing_preference`) contain "cutroom."
Only the *file name* (`registerCutRoomTools.ts`), the *registration function name*
(`registerCutRoomTools`), the *exported constant* (`ALL_CUTROOM_TOOL_NAMES`), and two tool **description
strings** that mention "CutRoom" in prose (see checklist below) are affected. Per `AGENTS.md`, WebMCP tool
names should stay stable across a rename unless there's a technical reason to change them — this checklist
treats tool names as out of scope and does not list them as items to change.

## Structured checklist (grouped by file)

### Source code — non-test

- **`components/editor/CutRoomEditor.tsx`**
  - File name itself: internal-only (dev-visible), needs rename to match new component name.
  - L6: `import { EditorProvider, useCutRoomStore } from "./EditorProvider";` — internal-only.
  - L13-14, L108: `useCutRoomStore(...)` calls — internal-only.
  - L56: `<div ...>CUTROOM</div>` — **user-visible.** This is the literal wordmark rendered in the editor header UI. Highest-priority item for a demo/judge-facing rename.
  - L108: `` `CutRoom Phase 3 · ...` `` — **user-visible.** Status line text shown in the running app.
  - L117: `export function CutRoomEditor()` — internal-only, component export name.
- **`components/editor/EditorProvider.tsx`**
  - L9-38: `createCutRoomStore`, `CutRoomState`, `CutRoomStoreApi`, `CutRoomStoreContext`, `useCutRoomStoreApi`, `useCutRoomStore` — all internal-only identifiers, 9 occurrences. This is the central hook definition other components import from.
- **`components/editor/BrollLibrary.tsx`** — L5, L24: `useCutRoomStore` import/usage. Internal-only.
- **`components/editor/PreviewPanel.tsx`** — L5, L79: `useCutRoomStore` import/usage. Internal-only.
- **`components/editor/Timeline.tsx`** — L11, L41-50: `useCutRoomStore` import + 8 selector calls. Internal-only. L145: `aria-label="CutRoom timeline"` — **user-visible to screen readers** (accessibility-tree string, not on-screen text, but still user-facing).
- **`components/editor/TranscriptPanel.tsx`** — L5, L8: `useCutRoomStore` import/usage. Internal-only.
- **`components/editor/LocalMediaProvider.tsx`** — L13, L53: `CutRoomStoreApi` type import/usage. Internal-only.
- **`components/editor/WebMcpBridge.tsx`**
  - L7: `useCutRoomStore, useCutRoomStoreApi` import — internal-only.
  - L10-13: `ALL_CUTROOM_TOOL_NAMES`, `registerCutRoomTools` import from `@/lib/webmcp/registerCutRoomTools` — internal-only.
  - L18-19: usage — internal-only.
  - L36: `registerCutRoomTools(document.modelContext, store, {...})` call — internal-only.
  - L144: `{ALL_CUTROOM_TOOL_NAMES.map(...)}` — internal-only, but renders into the **debug drawer UI**, which is dev/judge-visible during a technical demo (not a typical end-user path). Flag as semi-user-visible.
- **`lib/editor/store.ts`** — L45, L69, L142-143: `CutRoomState`, `CutRoomStoreApi`, `createCutRoomStore` type/function definitions. Internal-only. This is the canonical definition site; renaming here cascades to every import above.
- **`lib/webmcp/registerCutRoomTools.ts`**
  - File name itself: internal-only, needs rename.
  - L5: `CutRoomStoreApi` type import — internal-only.
  - L96: `interface CutRoomModelContext` — internal-only.
  - L117: `export const ALL_CUTROOM_TOOL_NAMES = [...]` — internal-only (constant name; values inside are the actual tool name strings, unaffected — see "No WebMCP tool names are affected").
  - L141, L269, L393, L414: `createReadTools`, `createPlanningTools`, `createApprovalTools`, `createCutRoomTools` — only the last one has "CutRoom" in the name; internal-only.
  - L145, L147: tool `title: "Get CutRoom timeline"` and description text `"Read the live CutRoom timeline, ..."` — **these are user/agent-visible strings.** An LLM agent reading `get_timeline`'s tool metadata will see "CutRoom" in the title and description. Needs deliberate handling: decide whether the new name replaces it here, since this string is what an agent (ChatGPT, Claude, etc.) actually reads during the live demo.
  - L399: description text `"Commit the plan only after the human has approved it in the CutRoom UI. ..."` — **same as above, agent/tool-metadata-visible.**
  - L424, L434, L442-446: `RegisterCutRoomToolsOptions`, `CutRoomToolRegistration`, `registerCutRoomTools` signature — internal-only.
  - L581: `names: ALL_CUTROOM_TOOL_NAMES` — internal-only.
- **`lib/analysis/transcribe.ts`**
  - L4: comment `"CutRoom's demo route never calls a ..."` — internal-only (code comment).
  - L33: `env.CUTROOM_TRANSCRIPTION_MODEL?.trim()` — **environment variable name.** Special handling: this is a deploy-time config key, not just text. Renaming requires updating `.env.example`, any deployment platform's configured env vars, and this read site together, or supporting both names during a transition.
- **`lib/analysis/describeMoment.ts`** — L63: `process.env.CUTROOM_VISION_MODEL` — same env-var handling note as above.
- **`lib/demo/project.ts`** — L5: `id: "project_cutroom_demo"` — internal-only demo project ID string. Low risk but is a literal data value, not just an identifier; a naive find-and-replace on source code might miss it if scoped to "identifiers only."
- **`app/layout.tsx`**
  - L6: `title: "CutRoom — WebMCP B-roll editor"` — **user-visible.** This is the literal browser tab `<title>` / SEO title metadata.
  - L8: `description: "CutRoom lets a human and an AI agent collaboratively build B-roll edits ..."` — **user-visible** (meta description, shows in search results/link previews/social shares).
- **`app/demo/page.tsx`**, **`app/page.tsx`** — `import { CutRoomEditor } from "@/components/editor/CutRoomEditor";` and `<CutRoomEditor />` — internal-only, both files, mirrors the component rename above.

### Package metadata

- **`package.json`** L2: `"name": "cutroom"` — **affects npm package identity.** Needs an explicit decision: scoped (`@yourorg/newname`) vs. unscoped package name, and whether this matters at all given the project has no npm publish step currently. Low external impact today (not published), but is the canonical machine-readable project name.
- **`package-lock.json`** L2, L8: `"name": "cutroom"` (root + top-level package entry) — auto-regenerates from `package.json` on next `npm install`; do not hand-edit, just re-run install after the `package.json` change.

### Config

- **`.env.example`**
  - L1: comment `"# CutRoom is fully demoable without any of these ..."` — internal-only (comment).
  - L14: `CUTROOM_TRANSCRIPTION_MODEL=whisper-1` — env var name, paired with `lib/analysis/transcribe.ts` read site above.
  - L18: `CUTROOM_VISION_MODEL=gpt-4o-mini` — env var name, paired with `lib/analysis/describeMoment.ts` read site above.

### Test files

All occurrences below are internal-only (developer-visible test code/output, not seen by end users or judges), grouped by file with a one-line note where anything is non-obvious:

- **`tests/e2e/phase1.spec.ts`** — `CutRoomWebMcpTestBridge` interface, `__cutroomWebMcp` window property name (test double, string literal — special handling: this string must match whatever `WebMcpBridge.tsx`'s test-only global is named, if that's ever wired up; currently it looks like this file defines its own bridge name independent of app code, confirm before renaming), `cutroom-phase1.png` screenshot output path (see Assets section).
- **`tests/e2e/phase2.spec.ts`** — same `CutRoomWebMcpTestBridge`/`__cutroomWebMcp` pattern, `cutroom-phase2.png` output path.
- **`tests/e2e/phase3.spec.ts`** — `mkdtempSync(path.join(tmpdir(), "cutroom-phase3-"))` (OS temp-dir prefix, harmless to rename), `__cutroomInvoke` window property, `cutroom-phase3.png` output path.
- **`tests/e2e/phase5.spec.ts`** — `__cutroomWebMcp` window property (L59).
- **`tests/phase1/brollAudio.test.tsx`** — `useCutRoomStoreApi` import; fixture string literals `"blob:cutroom-demo-broll"`, `"blob:cutroom-base"`, `"blob:cutroom-broll"` (fake blob URLs, safe to rename or leave — they're opaque test fixtures, not asserted against any "cutroom"-specific logic).
- **`tests/phase1/editorActions.test.ts`**, **`tests/phase1/editorStore.test.ts`** — `createCutRoomStore` import/usage only.
- **`tests/phase1/webmcpVerticalSlice.test.ts`** — `createCutRoomStore`, `createCutRoomTools`, `registerCutRoomTools` imports/usage (heaviest single test file, ~12 occurrences).
- **`tests/phase2/collaborationStore.test.ts`**, **`tests/phase2/guardBranches.test.ts`**, **`tests/phase2/webmcpApprovalLifecycle.test.ts`** — `createCutRoomStore`/`registerCutRoomTools` imports/usage; `webmcpApprovalLifecycle.test.ts` also imports the `RegistrationSnapshot` type from the same module path.
- **`tests/phase3/localMediaProvider.test.tsx`**, **`tests/phase3/previewPlayback.test.tsx`** — `useCutRoomStore`/`useCutRoomStoreApi` imports/usage.
- **`tests/phase3/mediaStore.test.ts`** — `createCutRoomStore` import/usage.
- **`tests/phase3/objectUrlRegistry.test.ts`** — fixture string literals `` `blob:cutroom-${++sequence}` ``, `"blob:cutroom-1"`, `"blob:cutroom-2"` — opaque test fixtures, safe to rename.
- **`tests/phase4/transcribe.test.ts`** — L24, L26: test description string `"honors an explicit CUTROOM_TRANSCRIPTION_MODEL override"` and the actual env-var key passed into the test — **paired with the env var rename above; must change together or the test description becomes inaccurate/misleading.**
- **`tests/phase4/webmcpContentTools.test.ts`** — `createCutRoomStore`/`registerCutRoomTools` imports/usage (~16 occurrences, mechanical).
- **`tests/phase5/pacingPreference.test.ts`** — `createCutRoomStore` import/usage.

### Documentation

- **`README.md`** — heaviest doc file, ~14 occurrences. Includes the H1 title (L1), multiple prose mentions of the product name and thesis, and **3 links to the screenshot assets** (`cutroom-phase1.png` L63, `cutroom-phase2.png` L80, `cutroom-phase3.png` L94) — these links must be updated in lockstep with any screenshot rename/re-capture. This is the most user/judge-visible doc (first thing a reviewer opens).
- **`AGENTS.md`** — 6 occurrences: H1-adjacent heading "CutRoom engineering handoff" (L11), mission prose (L17), 3 screenshot filename mentions (L42, all three `.png` names in one line), a mention of the WebMCP contract version string (L102), the file-map entry for `registerCutRoomTools.ts` (L162), and the ready-to-paste continuation prompt (L324). Internal/developer-facing only — this file is a handoff doc, not shown to judges.
- **`TODO.md`** — 1 occurrence: H1 title only (`# CutRoom TODO`). Trivial.
- **`V2_IDEAS.md`** — 1 occurrence: H1 title only (`# CutRoom V2 ideas`). Trivial.
- **`docs/HACKATHON.md`** — 2 occurrences: L3 explicitly already contains a working-name notice pointing at `POSITIONING.md` (**do not remove this note as part of a naive sweep — update it to say the rename is complete, don't just delete it**); L21 references the `registerCutRoomTools.ts` file path in prose.
- **`docs/MILESTONES.md`** — heaviest doc after README, ~11 occurrences across milestone narrative prose (L1, L81, L150, L221, L244, L252, L284, L346) plus **3 screenshot links** (L77, L146, L217) that must move together with the actual screenshot files. This is a historical record of verified work — see "Gotchas" below on not rewriting history.
- **`docs/POSITIONING.md`** — self-referential by design (this is the doc *explaining* the rename need); contains the two competitor URLs/names (`cutroomai.com`, `github.com/kuluruvineeth/cutroom`) which **must never be changed** — they are correctly named references to *other people's* products, not this project's name. Also contains the `rg -ni 'cutroom|cut room'` command literal (L64) — that's a shell command example, not a name occurrence, leave as-is or update to reflect the new name being searched for historically.
- **`public/demo/README.md`** — 1 occurrence: H1 title only (`# CutRoom demo media`).

### Assets (binary)

- **`cutroom-phase1.png`**, **`cutroom-phase2.png`**, **`cutroom-phase3.png`** (repo root) — **screenshot filenames, not text.** A find-and-replace tool cannot touch these; they need either (a) a manual `git mv`/`mv` rename of the file plus updating every doc/test reference above, or (b) full re-capture under the new UI wordmark once `CutRoomEditor.tsx`'s visible "CUTROOM" text changes, since the *content* of these screenshots literally shows the old wordmark on-screen. Re-capture is the more honest option per the project's "no fake/stale UI evidence" standard already established in `AGENTS.md`/`docs/MILESTONES.md`.

## Gotchas (things a naive find-and-replace would break)

1. **Case sensitivity matters and is inconsistent by design, not by accident.** `CutRoom` (PascalCase, prose/identifiers), `cutroom` (lowercase, npm package name/URLs/blob fixtures/tmpdir prefixes), and `CUTROOM` (all-caps, the literal on-screen wordmark in `CutRoomEditor.tsx` L56 and the env var prefix `CUTROOM_*`) each serve a different role. A blind case-insensitive replace-then-lowercase (or replace-then-titlecase) will break the wordmark styling, the env var naming convention, and the npm-name convention simultaneously. Each case variant needs its own replacement form derived from the new name's own casing conventions.

2. **The `CUTROOM_TRANSCRIPTION_MODEL` / `CUTROOM_VISION_MODEL` env vars are a paired rename across 3 files** (`.env.example`, `lib/analysis/transcribe.ts`, `lib/analysis/describeMoment.ts`) **plus 1 test** (`tests/phase4/transcribe.test.ts`). If only some are updated, the app silently falls back to defaults instead of reading a real deploy-configured override — a correctness bug, not just a cosmetic one. Any real deployment (Vercel/etc.) with these env vars already configured under the old names would also need updating outside this repo.

3. **`docs/POSITIONING.md`'s competitor references must NOT be touched.** `cutroomai.com` and `github.com/kuluruvineeth/cutroom` are other people's product names cited as the *reason* for this rename. A regex sweep for "cutroom" that doesn't exclude this file's competitor-citation lines would incorrectly "fix" a citation into nonsense (e.g. renaming a competitor's product to this project's new name).

4. **Screenshot filenames encode phase numbers, not just the product name** (`cutroom-phase1.png`, `cutroom-phase2.png`, `cutroom-phase3.png`). Any rename script must preserve the `-phaseN` suffix and update all cross-references (README.md ×3, AGENTS.md ×1 combined line, docs/MILESTONES.md ×3, tests/e2e/phase{1,2,3}.spec.ts ×3 output paths) atomically, or screenshots referenced in docs will silently 404 / not match what Playwright actually writes to disk.

5. **`.next/` build cache and `tsconfig.tsbuildinfo`, `coverage/`, `test-results/` may embed the old name in compiled output, source maps, or cached module graphs.** These are all build artifacts (already `.gitignore`d per the repo listing, except needs confirming `.next`/`coverage`/`test-results` are actually ignored — see note below) and should be deleted/regenerated after a rename rather than edited; do not hand-edit anything under them.

6. **`package-lock.json`'s "name": "cutroom" entries should never be hand-edited** — they are two of the ~215 total occurrences but must be regenerated via `npm install` after `package.json` changes, or the lockfile becomes internally inconsistent with `package.json`.

7. **Test-only window globals (`__cutroomWebMcp` in `tests/e2e/phase1/2/5.spec.ts`, `__cutroomInvoke` in `phase3.spec.ts`) are test-double property names invented by the Playwright specs themselves** — grep the actual app code (`components/editor/WebMcpBridge.tsx`) before renaming these to confirm whether the app ever sets a matching global with the same name (it currently does not appear to — `WebMcpBridge.tsx` uses `document.modelContext` directly, not a `window.__cutroom*` bridge), so these test-only names can be renamed independently of app code with no risk of drift, but must stay self-consistent within each spec file (window property name used to `defineProperty` it must match the name used to read it later in the same file).

8. **Blob URL fixture strings** (`"blob:cutroom-demo-broll"`, `"blob:cutroom-base"`, `"blob:cutroom-broll"`, `` `blob:cutroom-${++sequence}` ``) **are opaque test fixtures with no semantic meaning beyond being unique strings** — safe to rename, but not required to; do not spend rename effort here beyond a mechanical pass, and do not confuse them with any real URL scheme (they are fake `createObjectURL` mock outputs, not endpoints).

9. **Do not rewrite `docs/MILESTONES.md`'s historical narrative to retroactively pretend the project was always the new name.** Per `docs/POSITIONING.md`'s own rename acceptance checklist: "do not rename historical milestone screenshots merely to hide the working-name history." The milestone doc is a dated, verified record; treat renaming its prose as a mechanical text substitution only, not an opportunity to rewrite history.

10. **Substring false-positive risk is low but not zero** — "cutroom" does not currently appear as an accidental substring of any unrelated word in this codebase (confirmed via the full-repo grep above; no hits like "shortcutroom" or similar). No suppression list is needed today, but re-check this if new dependencies or vendored code are added before a rename executes, since third-party code is excluded from this sweep (`node_modules/` was excluded throughout).

## How this was generated

Read-only sweep performed via `grep -rniI "cutroom"` and `find -iname "*cutroom*"` across the full project
tree, explicitly excluding `node_modules/`, `.next/`, `coverage/`, `test-results/`, and `.claude-flow/`.
Every matching file was then read line-by-line to classify each hit. Also separately checked
`next.config.ts`, `tsconfig.json`, `playwright.config.ts`, `vitest.config.mts`, `postcss.config.mjs`,
`.gitignore`, `LICENSE`, and `types/webmcp.d.ts` and confirmed zero occurrences in each. Also checked for
the space-separated variant `"cut room"` (case-insensitive) across tracked text files — the only hit is the
self-referential grep command literal inside `docs/POSITIONING.md` itself. No files were modified as part of
producing this checklist.
