import { describe, expect, it } from "vitest";

import { createDemoProject } from "@/lib/demo/project";
import {
  clampBrollMatchThreshold,
  DEFAULT_BROLL_MATCH_THRESHOLD,
  decideVisualSupport,
} from "@/lib/editor/brollRecommendation";

describe("uploaded-footage-first B-roll decisions", () => {
  it("uses a strong uploaded match instead of recommending generation", () => {
    const decision = decideVisualSupport(createDemoProject(), {
      query: "overhead designer arranging interface sketches laptop workspace planning",
      duration: 5,
    });

    expect(decision).toMatchObject({
      kind: "uploaded_match",
      threshold: DEFAULT_BROLL_MATCH_THRESHOLD,
      match: { momentId: "moment_workspace_overhead" },
    });
  });

  it("allows a generation suggestion when no uploaded source moment is strong", () => {
    const decision = decideVisualSupport(createDemoProject(), {
      query: "restaurant manager monitors live inventory across stores on tablet",
      duration: 5,
    });

    expect(decision.kind).toBe("generate_suggestion");
    if (decision.kind !== "generate_suggestion") return;
    expect(decision.bestScore ?? 0).toBeLessThan(decision.threshold);
  });

  it("supports editorial restraint when no visual is needed", () => {
    expect(
      decideVisualSupport(createDemoProject(), {
        query: "dashboard",
        duration: 5,
        visualNeeded: false,
      }),
    ).toMatchObject({ kind: "no_visual_needed" });
    expect(
      decideVisualSupport(createDemoProject(), { query: "   ", duration: 5 }),
    ).toMatchObject({ kind: "no_visual_needed" });
  });

  it("clamps configurable match thresholds to deterministic bounds", () => {
    expect(clampBrollMatchThreshold(Number.NaN)).toBe(DEFAULT_BROLL_MATCH_THRESHOLD);
    expect(clampBrollMatchThreshold(-1)).toBe(0);
    expect(clampBrollMatchThreshold(2)).toBe(1);
  });
});
