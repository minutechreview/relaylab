import { describe, expect, it } from "vitest";

import { createDemoProject } from "@/lib/demo/project";
import { getEditPlan } from "@/lib/editor/editPlan";

describe("EditPlan status and provenance branches", () => {
  it("distinguishes committed, human-modified, and generated decision outcomes", () => {
    const project = createDemoProject();
    const baseOverlay = project.overlays[0];
    const baseSuggestion = project.generationSuggestions[0];

    project.overlays = [
      {
        ...baseOverlay,
        id: "committed",
        status: "committed",
        lockedByHuman: false,
        reason: undefined,
        alternatives: [
          {
            momentId: "alternative_moment",
            assetId: "alternative_asset",
            assetName: "Alternative reel",
            score: 0.72,
            description: "A grounded alternative.",
          },
        ],
      },
      {
        ...baseOverlay,
        id: "human",
        status: "ghost",
        lockedByHuman: false,
        createdBy: "human",
      },
    ];
    project.generationSuggestions = [
      { ...baseSuggestion, id: "generating", status: "generating" },
      { ...baseSuggestion, id: "failed", status: "failed" },
    ];

    const plan = getEditPlan(project);

    expect(plan.decisions.find(({ id }) => id === "committed")).toMatchObject({
      status: "locked",
      reason: "",
      alternatives: [{ momentId: "alternative_moment" }],
    });
    expect(plan.decisions.find(({ id }) => id === "human")?.status).toBe(
      "modified-by-human",
    );
    expect(plan.decisions.find(({ id }) => id === "generating")?.status).toBe(
      "accepted",
    );
    expect(plan.decisions.find(({ id }) => id === "failed")?.status).toBe(
      "rejected",
    );
  });

  it("maps committed and approved project states directly", () => {
    const committed = createDemoProject();
    committed.status = "committed";
    expect(getEditPlan(committed).status).toBe("committed");

    const approved = createDemoProject();
    approved.status = "approved";
    expect(getEditPlan(approved).status).toBe("approved");
  });

  it("reports draft for an empty plan and review for generation-only work", () => {
    const empty = createDemoProject();
    empty.overlays = [];
    empty.generationSuggestions = [];
    expect(getEditPlan(empty).status).toBe("draft");

    const generationOnly = createDemoProject();
    generationOnly.overlays = [];
    expect(getEditPlan(generationOnly).status).toBe("needs-review");
  });

  it("uses timeline end as the deterministic tie-breaker for equal starts", () => {
    const project = createDemoProject();
    const overlay = project.overlays[0];
    const suggestion = project.generationSuggestions[0];
    project.overlays = [
      {
        ...overlay,
        timelineStart: 10,
        timelineEnd: 16,
      },
    ];
    project.generationSuggestions = [
      {
        ...suggestion,
        timelineStart: 10,
        timelineEnd: 13,
        duration: 3,
      },
    ];

    expect(getEditPlan(project).decisions.map(({ id }) => id)).toEqual([
      suggestion.id,
      overlay.id,
    ]);
  });
});
