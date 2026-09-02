import { describe, expect, it } from "vitest";

import { createDemoProject } from "@/lib/demo/project";
import { createRelayLabStore } from "@/lib/editor/store";

describe("Phase 3 local media state", () => {
  it("replaces the base in planning and resets state tied to the old timeline", () => {
    const project = createDemoProject();
    project.captions = [{ id: "cap_1", start: 1, end: 2, text: "Old" }];
    const store = createRelayLabStore(project);

    const result = store.getState().replaceBaseMedia({
      name: "new-founder.mov",
      duration: 32.75,
      objectUrl: "blob:new-base",
    });

    expect(result).toMatchObject({
      ok: true,
      previousObjectUrl: null,
    });
    expect(store.getState()).toMatchObject({ selectedOverlayId: null });
    expect(store.getState().project).toMatchObject({
      duration: 32.75,
      status: "planning",
      baseVideo: {
        name: "new-founder.mov",
        duration: 32.75,
        objectUrl: "blob:new-base",
      },
      transcript: [],
      overlays: [],
      captions: [],
    });
    expect(store.getState().project.brollAssets).toHaveLength(
      project.brollAssets.length,
    );
  });

  it("adds multiple reels with immediately usable local candidate indexes", () => {
    const store = createRelayLabStore(createDemoProject());
    const result = store.getState().addBrollMedia([
      { name: "cafe reel.mp4", duration: 150.4, objectUrl: "blob:cafe-1" },
      { name: "cafe reel.mp4", duration: 8.25, objectUrl: "blob:cafe-2" },
    ]);

    expect(result).toMatchObject({ ok: true });
    if (!result.ok) return;
    expect(result.assetIds).toHaveLength(2);
    expect(new Set(result.assetIds).size).toBe(2);

    const imported = store
      .getState()
      .project.brollAssets.filter(({ id }) => result.assetIds.includes(id));
    expect(imported).toHaveLength(2);
    expect(imported[0]).toMatchObject({
      name: "cafe reel.mp4",
      duration: 150.4,
      objectUrl: "blob:cafe-1",
    });
    expect(imported[0].moments.length).toBeGreaterThan(1);
    expect(imported[0].moments[0]).toMatchObject({
      assetId: imported[0].id,
      sourceStart: 0,
      analysisStatus: "indexed",
    });
    expect(imported[0].moments.at(-1)?.sourceEnd).toBe(150.4);
    expect(imported[0].moments.every((moment) => moment.tags.includes("uploaded"))).toBe(true);
    expect(imported[0].moments.every((moment) => moment.sourceEnd > moment.sourceStart)).toBe(true);
  });

  it("rejects invalid media and every media mutation after approval", () => {
    const store = createRelayLabStore(createDemoProject());
    const before = structuredClone(store.getState().project);

    expect(
      store.getState().replaceBaseMedia({
        name: "",
        duration: Number.NaN,
        objectUrl: "",
      }),
    ).toMatchObject({ ok: false, code: "INVALID_MEDIA" });
    expect(store.getState().addBrollMedia([])).toMatchObject({
      ok: false,
      code: "INVALID_MEDIA",
    });
    expect(store.getState().project).toEqual(before);

    store.getState().approvePlan();
    const approved = structuredClone(store.getState().project);
    expect(
      store.getState().replaceBaseMedia({
        name: "blocked.mp4",
        duration: 10,
        objectUrl: "blob:blocked",
      }),
    ).toMatchObject({ ok: false, code: "INVALID_PROJECT_STATE" });
    expect(
      store.getState().addBrollMedia([
        { name: "blocked.mp4", duration: 10, objectUrl: "blob:blocked" },
      ]),
    ).toMatchObject({ ok: false, code: "INVALID_PROJECT_STATE" });
    expect(store.getState().project).toEqual(approved);
  });
});
