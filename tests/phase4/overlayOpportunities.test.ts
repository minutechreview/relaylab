import { describe, expect, it } from "vitest";

import { createDemoProject } from "@/lib/demo/project";
import {
  findOverlayOpportunities,
  findPacingGaps,
  findSemanticOpportunities,
} from "@/lib/editor/overlayOpportunities";

describe("Phase 4 pacing-gap detection", () => {
  it("finds a pacing gap longer than the 15 second default preference", () => {
    const project = createDemoProject();
    project.overlays = [];
    project.duration = 40;

    const gaps = findPacingGaps(project, 15);
    expect(gaps.length).toBeGreaterThan(0);
    expect(gaps[0]).toMatchObject({ kind: "pacing_gap", start: 0, end: 40 });
    expect(gaps[0].end - gaps[0].start).toBeGreaterThan(15);
  });

  it("does not flag a gap shorter than or equal to the pacing preference", () => {
    const project = createDemoProject();
    project.overlays = [];
    project.duration = 15;

    expect(findPacingGaps(project, 15)).toEqual([]);
  });

  it("splits gaps around existing overlays and only flags the long remainder", () => {
    const project = createDemoProject();
    project.duration = 60;
    project.overlays = [
      {
        id: "ov_cover",
        assetId: "workspace_reel",
        momentId: "moment_workspace_overhead",
        sourceStart: 12.4,
        sourceEnd: 15.4,
        timelineStart: 10,
        timelineEnd: 13,
        status: "ghost",
        lockedByHuman: false,
        createdBy: "agent",
      },
    ];

    const gaps = findPacingGaps(project, 15);
    // Gap 1: 0-10 (10s, not flagged). Gap 2: 13-60 (47s, flagged).
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toMatchObject({ start: 13, end: 60 });
  });

  it("uses the project pacing preference by default when none is passed explicitly", () => {
    const project = createDemoProject();
    project.overlays = [];
    project.duration = 20;
    project.pacingPreference = { maxTalkingHeadSeconds: 25 };

    expect(findPacingGaps(project)).toEqual([]);
  });
});

describe("Phase 4 semantic opportunity heuristics", () => {
  it("detects ordered-list and enumerated-count cues in the demo transcript", () => {
    const project = createDemoProject();
    const cues = findSemanticOpportunities(project.transcript);

    expect(cues.some((cue) => /first/i.test(cue.cue ?? ""))).toBe(true);
    expect(cues.some((cue) => /second/i.test(cue.cue ?? ""))).toBe(true);
    expect(cues.some((cue) => /third/i.test(cue.cue ?? ""))).toBe(true);
    // "three things" appears in tr_2's text.
    expect(
      cues.some((cue) => cue.start === project.transcript[1].start && /things/i.test(cue.cue ?? "")),
    ).toBe(true);
  });

  it("detects a concrete-example cue", () => {
    const cues = findSemanticOpportunities([
      { id: "seg_x", start: 0, end: 5, text: "Here is an example, like a checkout flow." },
    ]);
    expect(cues.length).toBeGreaterThan(0);
  });

  it("returns no cues for plain narrative text", () => {
    const cues = findSemanticOpportunities([
      { id: "seg_y", start: 0, end: 5, text: "We built this because it felt slow." },
    ]);
    expect(cues).toEqual([]);
  });
});

describe("Phase 4 combined overlay opportunities", () => {
  it("returns pacing and semantic opportunities sorted by start time", () => {
    const project = createDemoProject();
    const opportunities = findOverlayOpportunities(project);

    expect(opportunities.length).toBeGreaterThan(0);
    for (let index = 1; index < opportunities.length; index += 1) {
      expect(opportunities[index].start).toBeGreaterThanOrEqual(opportunities[index - 1].start);
    }
    expect(opportunities.some((opportunity) => opportunity.kind === "semantic_cue")).toBe(true);
  });
});
