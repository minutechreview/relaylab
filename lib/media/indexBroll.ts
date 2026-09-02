import type { BrollMoment } from "@/lib/editor/types";

import { segmentBroll, type SegmentBrollOptions } from "./segmentBroll";

const GENERIC_FILE_TOKENS = new Set([
  "broll",
  "clip",
  "footage",
  "mov",
  "movie",
  "mp4",
  "reel",
  "source",
  "video",
  "webm",
]);

function formatTime(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

function readableStem(fileName: string): string {
  return (
    fileName
      .replace(/\.[^.]+$/u, "")
      .replace(/[_-]+/gu, " ")
      .replace(/\s+/gu, " ")
      .trim() || "uploaded reel"
  );
}

export function filenameTags(fileName: string): string[] {
  const tokens = readableStem(fileName)
    .toLocaleLowerCase("en-US")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length > 1 && !GENERIC_FILE_TOKENS.has(token));
  return [...new Set([...tokens, "uploaded", "source reel"])].slice(0, 8);
}

/**
 * Build a deterministic, immediately usable local index for an uploaded reel.
 * These are honest candidate windows, not invented semantic scene labels. A
 * future vision provider can replace their descriptions without changing any
 * source ranges or timeline edits.
 */
export function createLocalBrollIndex(
  assetId: string,
  fileName: string,
  duration: number,
  options: SegmentBrollOptions = {},
): BrollMoment[] {
  const label = readableStem(fileName);
  const tags = filenameTags(fileName);
  return segmentBroll(duration, options).map((segment, index) => ({
    id: `${assetId}_moment_${index + 1}`,
    assetId,
    sourceStart: segment.sourceStart,
    sourceEnd: segment.sourceEnd,
    description: `Candidate ${index + 1} from ${label} · ${formatTime(segment.sourceStart)}–${formatTime(segment.sourceEnd)}.`,
    tags,
    analysisStatus: "indexed",
  }));
}
