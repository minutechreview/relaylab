# RelayLab demo media

The deterministic demo uses precomputed metadata and deliberately does not fabricate binary media. Since Phase 3, users can also upload one real base video and multiple real B-roll videos directly in the browser; those local files remain session-only.

To replace the visual placeholders with the intended demo files later, add:

- `founder-story.mp4` — 84.4-second talking-head/base video; its audio is the only master audio.
- `workspace-reel.mp4` — at least 96 seconds of B-roll.
- `product-reel.mp4` — at least 72 seconds of B-roll.
- `city-reel.mp4` — at least 110 seconds of B-roll.

Until those named files are provided, the bundled cards remain clearly labeled as metadata-only assets. The WebMCP/timeline collaboration flow remains fully testable, and real playback can be tested with user-selected local videos. Newly uploaded B-roll is immediately divided into honest local candidate windows with exact source ranges. Semantic vision descriptions are not fabricated; the deterministic demo remains the pre-described path.

The deterministic demo also includes one unresolved AI B-roll suggestion over the “AI manager” sentence. It never calls a provider automatically. Without `FAL_KEY` and `FAL_VIDEO_MODEL`, pressing **Generate Clip** returns the honest message “Video generation is unavailable in demo mode” and preserves the suggestion for retry. Remote paid generation is denied by default even when credentials exist; keep `FAL_ALLOW_REMOTE_GENERATION` false/unset publicly and use localhost for an optional controlled one-clip smoke. No binary success is fabricated.
