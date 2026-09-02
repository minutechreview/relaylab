import type { Caption, TranscriptSegment } from "./types";

/**
 * Simple caption-block generation from transcript timestamps. Each
 * timestamped transcript segment already carries the correct start/end
 * boundaries for one readable caption line, so this is a deterministic
 * one-to-one mapping rather than new segmentation logic. Segments with no
 * spoken text or a non-positive duration are dropped — a caption with
 * nothing to show or a zero/negative-length window is not a caption.
 */
export function generateCaptionsFromTranscript(
  transcript: TranscriptSegment[],
): Caption[] {
  return transcript
    .filter((segment) => segment.end > segment.start && segment.text.trim().length > 0)
    .map((segment) => ({
      id: `cap_${segment.id}`,
      start: segment.start,
      end: segment.end,
      text: segment.text.trim(),
    }))
    .sort((a, b) => a.start - b.start);
}

/**
 * Find the caption block active at a given playhead time, if any. Matches
 * the same half-open [start, end) convention used for transcript-highlight
 * lookups elsewhere in the editor so caption and transcript focus never
 * disagree at a boundary.
 */
export function findActiveCaption(
  captions: Caption[],
  playhead: number,
): Caption | undefined {
  return captions.find((caption) => playhead >= caption.start && playhead < caption.end);
}
