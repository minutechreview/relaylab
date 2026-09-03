import { describe, expect, it } from "vitest";

import { createDemoProject } from "@/lib/demo/project";
import { createRelayLabStore } from "@/lib/editor/store";
import type { Project } from "@/lib/editor/types";

/** A project with one semantic-cue opportunity and one B-roll moment engineered to score well above the match threshold against it. */
function projectWithStrongBrollMatch(): Project {
  const project = createDemoProject({ showcase: true });
  project.transcript = [
    { id: "t1", start: 0, end: 10, text: "First look at the dashboard now" },
  ];
  project.brollAssets = [
    {
      id: "asset1",
      name: "test-reel.mp4",
      duration: 30,
      objectUrl: null,
      moments: [
        {
          id: "moment1",
          assetId: "asset1",
          sourceStart: 0,
          sourceEnd: 5,
          description: "First look at the dashboard now",
          tags: ["first", "look", "dashboard"],
        },
      ],
    },
  ];
  return project;
}

describe("suggestPlacements: local first pass", () => {
  it("uses a strong uploaded B-roll match as a ghost overlay", () => {
    const store = createRelayLabStore(projectWithStrongBrollMatch());
    const before = store.getState().project.overlays.length;

    const result = store.getState().suggestPlacements();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(store.getState().project.overlays.length).toBeGreaterThan(before);
    expect(result.createdOverlayIds.length).toBeGreaterThan(0);

    // Every created overlay is a plain, human-reviewable ghost — nothing
    // auto-approves or auto-commits.
    for (const id of result.createdOverlayIds) {
      const overlay = store.getState().project.overlays.find((candidate) => candidate.id === id);
      expect(overlay?.status).toBe("ghost");
      expect(overlay?.lockedByHuman).toBe(false);
    }
  });

  it("falls back to generation suggestions (never overlays) when there is no B-roll to match", () => {
    // The showcase project (real /demo content) intentionally ships with an
    // empty B-roll library.
    const project = createDemoProject({ showcase: true });
    expect(project.brollAssets).toHaveLength(0);
    const store = createRelayLabStore(project);

    const result = store.getState().suggestPlacements();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.createdOverlayIds).toHaveLength(0);
    expect(result.createdSuggestionIds.length).toBeGreaterThan(0);

    for (const id of result.createdSuggestionIds) {
      const suggestion = store
        .getState()
        .project.generationSuggestions.find((candidate) => candidate.id === id);
      expect(suggestion?.status).toBe("suggested");
      expect(suggestion?.prompt.length).toBeGreaterThanOrEqual(10);
      expect(suggestion?.duration).toBeLessThanOrEqual(10);
    }
  });

  it("never proposes over an already-covered span, including generation-suggestion spans", () => {
    const store = createRelayLabStore(createDemoProject({ showcase: true }));
    store.getState().suggestPlacements();
    const overlaysAfterFirstPass = store.getState().project.overlays;
    const suggestionsAfterFirstPass = store.getState().project.generationSuggestions;
    expect(overlaysAfterFirstPass.length + suggestionsAfterFirstPass.length).toBeGreaterThan(0);

    // Running it again should not double-book the same slots.
    const second = store.getState().suggestPlacements();
    expect(second.ok).toBe(true);
    if (!second.ok) return;

    const existingRanges = [
      ...overlaysAfterFirstPass.map((o) => ({ start: o.timelineStart, end: o.timelineEnd })),
      ...suggestionsAfterFirstPass.map((s) => ({ start: s.timelineStart, end: s.timelineEnd })),
    ];
    const newRanges = [
      ...second.createdOverlayIds
        .map((id) => store.getState().project.overlays.find((o) => o.id === id))
        .filter((o): o is NonNullable<typeof o> => Boolean(o))
        .map((o) => ({ start: o.timelineStart, end: o.timelineEnd })),
      ...second.createdSuggestionIds
        .map((id) => store.getState().project.generationSuggestions.find((s) => s.id === id))
        .filter((s): s is NonNullable<typeof s> => Boolean(s))
        .map((s) => ({ start: s.timelineStart, end: s.timelineEnd })),
    ];

    for (const fresh of newRanges) {
      for (const existing of existingRanges) {
        const overlaps = fresh.start < existing.end && fresh.end > existing.start;
        expect(overlaps).toBe(false);
      }
    }
  });

  it("refuses to run outside planning status", () => {
    const project = createDemoProject({ showcase: true });
    const store = createRelayLabStore(project);
    store.getState().suggestPlacements();
    const approval = store.getState().approvePlan();
    expect(approval.ok).toBe(true);

    const result = store.getState().suggestPlacements();
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("INVALID_PROJECT_STATE");
  });
});
