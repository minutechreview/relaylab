import { describe, expect, it } from "vitest";

import { createDemoProject } from "@/lib/demo/project";
import type { Overlay } from "@/lib/editor/types";
import {
  ExportValidationError,
  createEditSpec,
  serializeEditSpec,
} from "@/lib/export/editSpec";

function secondGhostOverlay(): Overlay {
  return {
    id: "ov_ghost_2",
    assetId: "city_reel",
    momentId: "moment_city_momentum",
    sourceStart: 74.2,
    sourceEnd: 78.2,
    timelineStart: 42,
    timelineEnd: 46,
    status: "ghost",
    lockedByHuman: true,
    reason: "Keep the human-selected city shot available for review.",
    createdBy: "agent",
  };
}

describe("Phase 6 edit specification", () => {
  it("serializes base, used B-roll sources, distinct ranges, captions, state, and mute policy", () => {
    const project = createDemoProject();
    project.status = "committed";
    project.overlays[0] = {
      ...project.overlays[0],
      status: "committed",
      lockedByHuman: true,
      timelineStart: 22,
      timelineEnd: 27.8,
    };
    project.overlays.push(secondGhostOverlay());

    const spec = createEditSpec(project);

    expect(spec).toMatchObject({
      schemaVersion: 1,
      kind: "broll-overlay-edit",
      project: {
        id: project.id,
        title: project.title,
        status: "committed",
        duration: 84.4,
      },
      sources: {
        base: {
          id: "base_founder_story",
          fileName: "founder-story.mp4",
          locked: true,
          audioPolicy: "master",
          referenceKind: "portable-file-name",
        },
      },
      timeline: {
        baseTrackLocked: true,
        brollTrackCount: 1,
      },
      audioPolicy: {
        masterSource: "base",
        baseAudio: "master",
        brollAudio: "muted",
        includeBrollAudio: false,
      },
      captionStyle: { position: "bottom" },
    });
    expect(spec.sources.broll.map(({ id }) => id)).toEqual([
      "product_reel",
      "city_reel",
    ]);
    expect(spec.sources.broll.every(({ audioPolicy }) => audioPolicy === "muted")).toBe(true);
    expect(spec.timeline.overlays).toEqual([
      expect.objectContaining({
        id: "ov_demo_1",
        status: "committed",
        lockedByHuman: true,
        sourceRange: { start: 8.2, end: 14, duration: 5.8 },
        timelineRange: { start: 22, end: 27.8, duration: 5.8 },
        audioPolicy: "muted",
      }),
      expect.objectContaining({
        id: "ov_ghost_2",
        status: "ghost",
        lockedByHuman: true,
        sourceRange: { start: 74.2, end: 78.2, duration: 4 },
        timelineRange: { start: 42, end: 46, duration: 4 },
        audioPolicy: "muted",
      }),
    ]);
    expect(spec.timeline.generationSuggestions).toEqual([
      expect.objectContaining({
        id: "gen_demo_manager",
        status: "suggested",
        paidGenerationStartedByExport: false,
      }),
    ]);
    expect(spec.captions).toHaveLength(project.transcript.length);
    expect(spec.captions[0]).toMatchObject({
      start: project.transcript[0].start,
      end: project.transcript[0].end,
      text: project.transcript[0].text,
    });
    expect(JSON.stringify(spec)).not.toContain("blob:");
  });

  it("produces deterministic, newline-terminated JSON", () => {
    const project = createDemoProject();
    project.baseVideo.objectUrl = "blob:https://example.test/base-session-url";
    project.brollAssets[1].objectUrl = "blob:https://example.test/broll-session-url";

    const first = serializeEditSpec(project);
    const second = serializeEditSpec(project);

    expect(first).toBe(second);
    expect(first.endsWith("\n")).toBe(true);
    expect(first).not.toContain("blob:https://example.test");
    expect(JSON.parse(first)).toEqual(createEditSpec(project));
  });

  it("rejects paths, missing assets, and invalid source/timeline ranges", () => {
    const pathProject = createDemoProject();
    pathProject.baseVideo.name = "../private/base.mp4";
    expect(() => createEditSpec(pathProject)).toThrowError(ExportValidationError);

    const missingAssetProject = createDemoProject();
    missingAssetProject.overlays[0].assetId = "missing_asset";
    expect(() => createEditSpec(missingAssetProject)).toThrow(
      "references missing B-roll asset missing_asset",
    );

    const mismatchedRangeProject = createDemoProject();
    mismatchedRangeProject.overlays[0].timelineEnd += 1;
    expect(() => createEditSpec(mismatchedRangeProject)).toThrow(
      "source and timeline durations must match",
    );

    const nonFiniteRangeProject = createDemoProject();
    nonFiniteRangeProject.overlays[0].sourceStart = Number.NaN;
    expect(() => createEditSpec(nonFiniteRangeProject)).toThrow(
      "source start must be a finite number",
    );
  });

  it("rejects invalid JSON indentation instead of accepting unchecked input", () => {
    expect(() => serializeEditSpec(createDemoProject(), 9)).toThrow(
      "JSON indentation must be an integer from 0 through 8",
    );
  });

  it("rejects base/B-roll and B-roll/B-roll filename collisions", () => {
    const baseCollision = createDemoProject();
    const product = baseCollision.brollAssets.find(({ id }) => id === "product_reel")!;
    product.name = baseCollision.baseVideo.name.toUpperCase();
    expect(() => createEditSpec(baseCollision)).toThrow(
      "Give every export source a unique file name",
    );

    const brollCollision = createDemoProject();
    brollCollision.overlays.push(secondGhostOverlay());
    const productAsset = brollCollision.brollAssets.find(({ id }) => id === "product_reel")!;
    const cityAsset = brollCollision.brollAssets.find(({ id }) => id === "city_reel")!;
    cityAsset.name = productAsset.name;
    expect(() => createEditSpec(brollCollision)).toThrow(
      "Give every export source a unique file name",
    );
  });
});
