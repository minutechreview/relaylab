import { describe, expect, it } from "vitest";

import { createDemoProject } from "@/lib/demo/project";
import { createRelayLabStore } from "@/lib/editor/store";

describe("Phase 5 pacing-preference clamping", () => {
  it("clamps a value below the 5 second minimum up to 5", () => {
    const store = createRelayLabStore(createDemoProject());
    const result = store.getState().setPacingPreference(1);
    expect(result).toMatchObject({ ok: true, maxTalkingHeadSeconds: 5 });
    expect(store.getState().project.pacingPreference.maxTalkingHeadSeconds).toBe(5);
  });

  it("clamps a value above the 30 second maximum down to 30", () => {
    const store = createRelayLabStore(createDemoProject());
    const result = store.getState().setPacingPreference(90);
    expect(result).toMatchObject({ ok: true, maxTalkingHeadSeconds: 30 });
    expect(store.getState().project.pacingPreference.maxTalkingHeadSeconds).toBe(30);
  });

  it("accepts the boundary value 5 unchanged", () => {
    const store = createRelayLabStore(createDemoProject());
    const result = store.getState().setPacingPreference(5);
    expect(result).toMatchObject({ ok: true, maxTalkingHeadSeconds: 5 });
  });

  it("accepts the boundary value 30 unchanged", () => {
    const store = createRelayLabStore(createDemoProject());
    const result = store.getState().setPacingPreference(30);
    expect(result).toMatchObject({ ok: true, maxTalkingHeadSeconds: 30 });
  });

  it("accepts a mid-range value unchanged", () => {
    const store = createRelayLabStore(createDemoProject());
    const result = store.getState().setPacingPreference(18);
    expect(result).toMatchObject({ ok: true, maxTalkingHeadSeconds: 18 });
  });

  it("defaults the demo project to 15 seconds", () => {
    const store = createRelayLabStore(createDemoProject());
    expect(store.getState().project.pacingPreference.maxTalkingHeadSeconds).toBe(15);
  });

  it("is rejected outside planning even with an otherwise valid value", () => {
    const project = createDemoProject();
    project.status = "approved";
    const store = createRelayLabStore(project);
    const result = store.getState().setPacingPreference(15);
    expect(result).toMatchObject({ ok: false, code: "INVALID_PROJECT_STATE" });
  });
});
