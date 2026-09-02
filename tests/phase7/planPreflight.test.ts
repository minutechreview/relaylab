import { describe, expect, it } from "vitest";

import { createDemoProject } from "@/lib/demo/project";
import { getPlanPreflight } from "@/lib/editor/planPreflight";
import { createRelayLabStore } from "@/lib/editor/store";

describe("plan preflight", () => {
  it("treats unresolved generation ideas as visible information, not paid work", () => {
    const preflight = getPlanPreflight(createDemoProject());

    expect(preflight).toMatchObject({
      status: "ready",
      blockingCount: 0,
      warningCount: 0,
      infoCount: 1,
    });
    expect(preflight.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "UNRESOLVED_GENERATION",
          severity: "info",
        }),
      ]),
    );
  });

  it("warns about overlapping B-roll on the single overlay track", () => {
    const project = createDemoProject();
    project.overlays.push({
      ...project.overlays[0],
      id: "ov_overlap",
      timelineStart: 20,
      timelineEnd: 22,
      sourceEnd: project.overlays[0].sourceStart + 2,
    });

    const preflight = getPlanPreflight(project);

    expect(preflight.status).toBe("warnings");
    expect(preflight.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "OVERLAPPING_OVERLAYS",
          overlayIds: ["ov_demo_1", "ov_overlap"],
        }),
      ]),
    );
  });

  it("blocks approval when an overlay references missing media", () => {
    const project = createDemoProject();
    project.overlays[0].assetId = "missing_asset";
    const store = createRelayLabStore(project);

    expect(store.getState().getTimeline().preflight.status).toBe("blocked");
    expect(store.getState().approvePlan()).toMatchObject({
      ok: false,
      code: "INVALID_ARGUMENTS",
      message: expect.stringMatching(/missing B-roll source/i),
    });
    expect(store.getState().project.status).toBe("planning");
  });

  it("places a library moment as a human-authored muted ghost", () => {
    const project = createDemoProject();
    const moment = project.brollAssets[0].moments[0];
    const store = createRelayLabStore(project);

    const result = store.getState().placeBrollMoment({
      momentId: moment.id,
      timelineStart: 31,
      duration: 4,
      reason: "Placed by the human from the B-roll library.",
    });

    expect(result).toMatchObject({ ok: true, status: "ghost", brollAudio: "muted" });
    expect(store.getState().getTimeline().overlays.at(-1)).toMatchObject({
      momentId: moment.id,
      timelineStart: 31,
      timelineEnd: 35,
      createdBy: "human",
      status: "ghost",
      lockedByHuman: false,
    });
  });
});
