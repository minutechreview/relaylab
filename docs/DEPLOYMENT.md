# Deployment and submission readiness

No deployment is claimed in this document. It records the current verified local state and the exact remaining deployment procedure.

## Local release baseline

Verified August 30, 2026:

- typecheck passes before and after build;
- 30 test files / 165 tests pass;
- coverage: 93.27% statements, 84.23% branches, 95.46% functions, 94.20% lines;
- 8/8 Chromium flows pass, including WebMCP-created generation suggestion and human-generated muted-ghost conversion;
- Next.js 16.3.3 webpack production build passes;
- `/`, `/demo`, and `/_not-found` are static; `/api/generate-broll` is dynamic; and
- the fresh production build served `/demo` with HTTP 200.

## Hosting requirements

- Node.js 22 or newer.
- A Next.js host with Node runtime support for `/api/generate-broll` and `/api/transcribe`; this is not a fully static export.
- HTTPS for the judge-facing deployment.
- Enough server request time for the configured fal.ai queue only if live generation is intentionally enabled.

Recommended deployment target: Vercel or another Next.js-compatible Node host. The deterministic demo needs no database, storage bucket, authentication, or API credential.

## Safe environment configuration

The public suggestion-only deployment should use:

```text
NEXT_PUBLIC_BROLL_MATCH_THRESHOLD=0.65
FAL_ALLOW_REMOTE_GENERATION=false
```

Leave these unset publicly:

```text
FAL_KEY=
FAL_VIDEO_MODEL=
```

Even if credentials are accidentally present, `/api/generate-broll` refuses non-loopback requests unless `FAL_ALLOW_REMOTE_GENERATION=true`. That override is an explicit risk switch, not authentication. This account-free MVP has no reliable way to distinguish a human browser from a scripted client on a public endpoint.

For a controlled local/private one-clip demo only:

```text
FAL_KEY=<server secret>
FAL_VIDEO_MODEL=<current compatible fal.ai endpoint ID>
FAL_ALLOW_REMOTE_GENERATION=false
```

Run it on localhost. Never place `FAL_KEY` in client-side variables or commit it. No default model ID is assumed; confirm the configured endpoint accepts prompt, duration, and `aspect_ratio` before the demo.

Optional OpenAI transcription is human-started from the Captions panel. The vision model remains an unwired provider boundary:

```text
OPENAI_API_KEY=
RELAYLAB_TRANSCRIPTION_MODEL=whisper-1
RELAYLAB_VISION_MODEL=
OPENAI_ALLOW_REMOTE_TRANSCRIPTION=false
```

## Pre-deploy sequence

1. Confirm the RelayLab public-name sweep using `RENAME_CHECKLIST.md`.
2. Initialize a dedicated Git repository; do not operate on the parent `/Users/mac` repository.
3. Install locked dependencies with Node 22.
4. Run sequentially:

```bash
npm run typecheck
npm test
npm run test:coverage
npm run test:e2e
npm run build
npm run typecheck
```

5. Push to GitHub and confirm both jobs in `.github/workflows/ci.yml` pass.
6. Deploy with remote paid generation disabled.

## Post-deploy smoke

1. Open `/demo` over HTTPS.
2. Confirm the editor renders at a desktop viewport and the working-name banner has been replaced.
3. Confirm the WebMCP drawer truthfully reports available/unavailable in an ordinary browser.
4. Confirm `/api/generate-broll` returns `REMOTE_GENERATION_DISABLED` or `GENERATION_UNAVAILABLE` on the public deployment; it must not spend credits.
5. Export edit JSON in planning state.
6. Complete human approval + agent commit and download the ffmpeg script/SRT.
7. Confirm uploaded media is described as browser-session local and does not imply persistence.

## Native WebMCP smoke

Open the deployed `/demo` in the challenge's current WebMCP-enabled Chrome or ChatGPT host and execute the script in `HACKATHON.md`:

- read summary/transcript/timeline/opportunities;
- search a strong uploaded match and create an uploaded ghost;
- search the weak “AI manager” need and create a generation suggestion;
- human retime/swap/lock;
- agent reread/replan;
- human approve;
- verify planning tools disappear and commit appears;
- agent commit; and
- verify commit disappears and human edits remain.

Record the exact host/build, public URL, tool list in each state, and any WebMCP console failure. Automated tests are not a substitute for this native smoke.

## Optional controlled fal.ai smoke

Do this once on localhost/private access, not on the public unauthenticated URL:

1. Configure both fal.ai variables with a current compatible model.
2. Open the demo generation suggestion.
3. Click **Generate Clip** exactly once.
4. Confirm the request does not start before the click.
5. Confirm returned media duration is measured from the video, not copied from the request.
6. Confirm it becomes a normal ghost overlay.
7. Seek inside it and confirm the preview video is muted.
8. Confirm **Download current generated source** is available.
9. Commit and export; verify edit JSON records the retrieval URL/download filename and the ffmpeg script tells the user to stage that file.
10. Remove credentials after recording evidence.

## Session-local media warning

The `/demo` route is safe to share. Projects made from local uploads exist only in the browser tab; object URLs do not survive reload and another visitor cannot open the same uploaded project from a link. This is deliberate hackathon scope, not cloud project storage.

## Submission checklist

- [ ] Final human-chosen name applied.
- [ ] All local gates pass after rename.
- [ ] GitHub Actions pass.
- [ ] HTTPS deployment smoke passes.
- [ ] Native WebMCP judge loop recorded.
- [ ] Optional private one-clip generation recorded, or honest suggestion-only mode retained.
- [ ] Final renamed screenshots/demo video captured.
- [ ] README public URLs and run steps verified.
- [ ] Devpost draft created, reviewed, and submitted through the official workflow.
