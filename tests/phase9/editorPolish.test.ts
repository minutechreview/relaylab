import { describe, expect, it } from "vitest";

import { createDemoProject } from "@/lib/demo/project";
import { createBlankProject } from "@/lib/editor/blankProject";
import { createRelayLabStore } from "@/lib/editor/store";
import { createLocalBrollIndex, filenameTags } from "@/lib/media/indexBroll";

describe("RelayLab editor usability pass", () => {
  it("indexes a long uploaded reel into contiguous bounded source moments", () => {
    const moments = createLocalBrollIndex("reel_1", "Cafe Manager Reel.mp4", 87);

    expect(moments.length).toBeGreaterThan(1);
    expect(moments[0].sourceStart).toBe(0);
    expect(moments.at(-1)?.sourceEnd).toBe(87);
    expect(moments.every((moment) => moment.analysisStatus === "indexed")).toBe(true);
    expect(moments.every((moment) => moment.sourceEnd - moment.sourceStart <= 8)).toBe(true);
    moments.slice(1).forEach((moment, index) => {
      expect(moment.sourceStart).toBe(moments[index].sourceEnd);
    });
    expect(filenameTags("Cafe Manager Reel.mp4")).toEqual(
      expect.arrayContaining(["cafe", "manager", "uploaded"]),
    );
  });

  it("splits an unlocked ghost without changing total source or timeline coverage", () => {
    const store = createRelayLabStore(createDemoProject());
    const original = store.getState().project.overlays[0];
    const result = store.getState().splitOverlay(original.id, 22);

    expect(result).toMatchObject({ ok: true, leftOverlayId: original.id, brollAudio: "muted" });
    if (!result.ok) return;
    const left = store.getState().project.overlays.find((overlay) => overlay.id === result.leftOverlayId)!;
    const right = store.getState().project.overlays.find((overlay) => overlay.id === result.rightOverlayId)!;
    expect(left.timelineStart).toBe(original.timelineStart);
    expect(left.timelineEnd).toBe(22);
    expect(right.timelineStart).toBe(22);
    expect(right.timelineEnd).toBe(original.timelineEnd);
    expect(left.sourceStart).toBe(original.sourceStart);
    expect(right.sourceEnd).toBe(original.sourceEnd);
    expect(left.sourceEnd).toBe(right.sourceStart);
    expect(store.getState().getTimeline().overlays).toHaveLength(2);
  });

  it("rejects split attempts on a human-locked overlay", () => {
    const store = createRelayLabStore(createDemoProject());
    const overlay = store.getState().project.overlays[0];
    store.getState().setOverlayLocked(overlay.id, true);

    expect(store.getState().splitOverlay(overlay.id, 22)).toMatchObject({
      ok: false,
      code: "HUMAN_LOCKED",
    });
  });

  it("adds and edits offline captions and preserves human placement", () => {
    const project = createBlankProject();
    const store = createRelayLabStore(project);
    store.getState().replaceBaseMedia({
      name: "portrait.mp4",
      duration: 20,
      objectUrl: "blob:portrait",
    });

    const captionId = store.getState().addCaption({ start: 2, end: 5, text: "  Hello  " });
    expect(captionId).toBeTruthy();
    expect(store.getState().setCaptionPosition("top")).toBe(true);
    expect(store.getState().updateCaption(captionId!, { text: "Updated", end: 6 })).toBe(true);
    expect(store.getState().project.captionStyle.position).toBe("top");
    expect(store.getState().project.captions[0]).toMatchObject({
      text: "Updated",
      start: 2,
      end: 6,
    });
  });
});
