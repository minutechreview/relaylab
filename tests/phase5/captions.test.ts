import { describe, expect, it } from "vitest";

import { findActiveCaption, generateCaptionsFromTranscript } from "@/lib/editor/captions";
import { createDemoProject } from "@/lib/demo/project";
import type { TranscriptSegment } from "@/lib/editor/types";

describe("Phase 5 caption generation", () => {
  it("generates one caption block per transcript segment with matching boundaries", () => {
    const project = createDemoProject();
    const captions = generateCaptionsFromTranscript(project.transcript);

    expect(captions).toHaveLength(project.transcript.length);
    captions.forEach((caption, index) => {
      const segment = project.transcript[index];
      expect(caption.start).toBe(segment.start);
      expect(caption.end).toBe(segment.end);
      expect(caption.text).toBe(segment.text);
      expect(caption.id).toBe(`cap_${segment.id}`);
    });
  });

  it("produces no overlap and no gap beyond what the transcript already implies", () => {
    const project = createDemoProject();
    const captions = generateCaptionsFromTranscript(project.transcript);

    for (let index = 1; index < captions.length; index += 1) {
      const previous = captions[index - 1];
      const current = captions[index];
      expect(current.start).toBeGreaterThanOrEqual(previous.end);
    }
  });

  it("drops segments with empty or whitespace-only text", () => {
    const transcript: TranscriptSegment[] = [
      { id: "a", start: 0, end: 2, text: "Hello there." },
      { id: "b", start: 2, end: 4, text: "   " },
      { id: "c", start: 4, end: 6, text: "" },
    ];

    const captions = generateCaptionsFromTranscript(transcript);
    expect(captions).toHaveLength(1);
    expect(captions[0].text).toBe("Hello there.");
  });

  it("drops segments with zero or negative duration", () => {
    const transcript: TranscriptSegment[] = [
      { id: "a", start: 0, end: 0, text: "Zero length." },
      { id: "b", start: 5, end: 3, text: "Negative length." },
      { id: "c", start: 1, end: 2, text: "Valid." },
    ];

    const captions = generateCaptionsFromTranscript(transcript);
    expect(captions).toHaveLength(1);
    expect(captions[0].text).toBe("Valid.");
  });

  it("returns captions sorted by start time regardless of input order", () => {
    const transcript: TranscriptSegment[] = [
      { id: "b", start: 5, end: 8, text: "Second." },
      { id: "a", start: 0, end: 3, text: "First." },
    ];

    const captions = generateCaptionsFromTranscript(transcript);
    expect(captions.map((caption) => caption.text)).toEqual(["First.", "Second."]);
  });

  it("returns an empty array for an empty transcript", () => {
    expect(generateCaptionsFromTranscript([])).toEqual([]);
  });
});

describe("Phase 5 active caption lookup", () => {
  const captions = generateCaptionsFromTranscript([
    { id: "a", start: 0, end: 5, text: "First block." },
    { id: "b", start: 5, end: 10, text: "Second block." },
  ]);

  it("finds the caption covering the playhead", () => {
    expect(findActiveCaption(captions, 2)?.text).toBe("First block.");
    expect(findActiveCaption(captions, 5)?.text).toBe("Second block.");
  });

  it("returns undefined when the playhead is outside every caption", () => {
    expect(findActiveCaption(captions, 10)).toBeUndefined();
    expect(findActiveCaption(captions, -1)).toBeUndefined();
  });

  it("returns undefined for an empty caption list", () => {
    expect(findActiveCaption([], 3)).toBeUndefined();
  });
});
