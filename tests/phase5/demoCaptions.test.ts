import { describe, expect, it } from "vitest";

import { createDemoProject } from "@/lib/demo/project";
import { findActiveCaption } from "@/lib/editor/captions";

describe("Phase 5 demo project captions", () => {
  it("populates captions from the demo transcript on load", () => {
    const project = createDemoProject();
    expect(project.captions.length).toBe(project.transcript.length);
    expect(project.captions[0]).toMatchObject({
      start: project.transcript[0].start,
      end: project.transcript[0].end,
      text: project.transcript[0].text,
    });
  });

  it("resolves the active caption at a known playhead time matching the active transcript segment", () => {
    const project = createDemoProject();
    const playhead = 20; // Falls inside tr_3 (18.2-28.8) per the demo transcript.
    const activeSegment = project.transcript.find(
      (segment) => playhead >= segment.start && playhead < segment.end,
    );
    const activeCaption = findActiveCaption(project.captions, playhead);

    expect(activeSegment).toBeDefined();
    expect(activeCaption?.text).toBe(activeSegment?.text);
    expect(activeCaption?.start).toBe(activeSegment?.start);
    expect(activeCaption?.end).toBe(activeSegment?.end);
  });
});
