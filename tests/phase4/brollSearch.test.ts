import { describe, expect, it } from "vitest";

import { createDemoProject } from "@/lib/demo/project";
import { searchBroll } from "@/lib/editor/brollSearch";
import type { Overlay, Project } from "@/lib/editor/types";

function overlayFor(project: Project, momentId: string, timelineStart: number): Overlay {
  const match = project.brollAssets
    .flatMap((asset) => asset.moments.map((moment) => ({ asset, moment })))
    .find(({ moment }) => moment.id === momentId);
  if (!match) throw new Error(`Fixture moment ${momentId} not found.`);
  const duration = match.moment.sourceEnd - match.moment.sourceStart;
  return {
    id: `ov_${momentId}_${timelineStart}`,
    assetId: match.asset.id,
    momentId: match.moment.id,
    sourceStart: match.moment.sourceStart,
    sourceEnd: match.moment.sourceEnd,
    timelineStart,
    timelineEnd: timelineStart + duration,
    status: "ghost",
    lockedByHuman: false,
    createdBy: "agent",
  };
}

describe("Phase 4 B-roll search ranking", () => {
  it("ranks a moment matching the query text above unrelated moments", () => {
    const project = createDemoProject();
    const results = searchBroll(project, { query: "dashboard progress" });

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].momentId).toBe("moment_product_result");
    expect(results[0].score).toBeGreaterThan(
      results.find((result) => result.momentId === "moment_city_momentum")?.score ?? 1,
    );
  });

  it("excludes unindexed placeholder moments from search results", () => {
    const project = createDemoProject();
    project.brollAssets.push({
      id: "asset_unindexed",
      name: "raw-reel.mp4",
      duration: 40,
      objectUrl: null,
      moments: [
        {
          id: "moment_unindexed",
          assetId: "asset_unindexed",
          sourceStart: 0,
          sourceEnd: 40,
          description: "Unindexed source reel — full range available; visual analysis pending.",
          tags: ["uploaded", "unindexed", "source reel"],
          analysisStatus: "unindexed",
        },
      ],
    });

    const results = searchBroll(project, { query: "reel" });
    expect(results.some((result) => result.momentId === "moment_unindexed")).toBe(false);
  });

  it("scores a moment closer to the target duration higher than a much longer one", () => {
    const project = createDemoProject();
    // moment_product_result spans 8.2-15.4 (7.2s); moment_city_momentum spans
    // 74.2-80.1 (5.9s). Query both generically and check duration weighting
    // pulls the closer-duration moment up when text scores are tied at zero.
    const results = searchBroll(project, { query: "zzzznomatch", targetDuration: 6 });
    const cityScore = results.find((result) => result.momentId === "moment_city_momentum")?.score;
    const workspaceOverheadScore = results.find(
      (result) => result.momentId === "moment_workspace_overhead",
    )?.score;

    expect(cityScore).toBeDefined();
    expect(workspaceOverheadScore).toBeDefined();
    // city moment (5.9s) is closer to target 6s than workspace overhead (7.8s).
    expect(cityScore ?? 0).toBeGreaterThan(workspaceOverheadScore ?? 0);
  });

  it("penalizes a moment that was recently reused on the timeline", () => {
    const project = createDemoProject();
    const withoutReuse = searchBroll(project, { query: "workspace" });
    const workspaceScoreBefore = withoutReuse.find(
      (result) => result.momentId === "moment_workspace_overhead",
    )?.score;

    project.overlays.push(overlayFor(project, "moment_workspace_overhead", 40));
    const withReuse = searchBroll(project, { query: "workspace" });
    const workspaceScoreAfter = withReuse.find(
      (result) => result.momentId === "moment_workspace_overhead",
    )?.score;

    expect(workspaceScoreBefore).toBeDefined();
    expect(workspaceScoreAfter).toBeDefined();
    expect(workspaceScoreAfter ?? 0).toBeLessThan(workspaceScoreBefore ?? 0);
  });

  it("respects the result limit", () => {
    const project = createDemoProject();
    const results = searchBroll(project, { query: "product", limit: 1 });
    expect(results).toHaveLength(1);
  });
});
