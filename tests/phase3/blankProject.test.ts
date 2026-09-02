import { describe, expect, it } from "vitest";

import { createBlankProject } from "@/lib/editor/blankProject";
import { createRelayLabStore } from "@/lib/editor/store";

describe("blank local project", () => {
  it("starts with no seeded editorial or media state", () => {
    const project = createBlankProject();

    expect(project).toMatchObject({
      title: "Untitled project",
      duration: 0,
      status: "planning",
      baseVideo: {
        name: "No base video",
        duration: 0,
        objectUrl: null,
      },
      transcript: [],
      brollAssets: [],
      overlays: [],
      generationSuggestions: [],
      captions: [],
    });
  });

  it("cannot edit or approve a timeline until a base video exists", () => {
    const store = createRelayLabStore(createBlankProject());

    expect(store.getState().approvePlan()).toMatchObject({
      ok: false,
      code: "INVALID_ARGUMENTS",
    });
    expect(
      store.getState().addBrollMedia([
        {
          name: "too-early.mp4",
          duration: 10,
          objectUrl: "blob:too-early",
        },
      ]),
    ).toMatchObject({ ok: false, code: "INVALID_ARGUMENTS" });
    expect(
      store.getState().proposeGeneratedBroll({
        timelineStart: 0,
        duration: 5,
        prompt: "A simple visual scene",
        reason: "Support the spoken idea",
      }),
    ).toMatchObject({ ok: false, code: "INVALID_ARGUMENTS" });
    expect(store.getState().project.status).toBe("planning");
    expect(store.getState().project.generationSuggestions).toHaveLength(0);
    expect(store.getState().project.brollAssets).toHaveLength(0);

    expect(
      store.getState().replaceBaseMedia({
        name: "my-talking-head.mp4",
        duration: 42.5,
        objectUrl: "blob:my-talking-head",
      }),
    ).toMatchObject({ ok: true });
    expect(store.getState().approvePlan()).toMatchObject({
      ok: true,
      status: "approved",
    });
  });
});
