import type { ProjectAspectRatio } from "./types";

export const ASPECT_RATIO_PRESETS: readonly ProjectAspectRatio[] = ["16:9", "9:16", "1:1", "4:5"];

export const ASPECT_RATIO_LABELS: Record<ProjectAspectRatio, string> = {
  "16:9": "16:9 Landscape",
  "9:16": "9:16 Portrait",
  "1:1": "1:1 Square",
  "4:5": "4:5 Portrait",
};

/** Numeric width/height ratio, for CSS `aspect-ratio`. */
export function numericAspectRatio(ratio: ProjectAspectRatio): number {
  const [width, height] = ratio.split(":").map(Number);
  return width / height;
}

/** Export target pixel dimensions for each preset, even multiples of 2 (required by most H.264 encoders). */
export const ASPECT_RATIO_EXPORT_DIMENSIONS: Record<ProjectAspectRatio, { width: number; height: number }> = {
  "16:9": { width: 1920, height: 1080 },
  "9:16": { width: 1080, height: 1920 },
  "1:1": { width: 1080, height: 1080 },
  "4:5": { width: 1080, height: 1350 },
};

export function isProjectAspectRatio(value: string): value is ProjectAspectRatio {
  return (ASPECT_RATIO_PRESETS as readonly string[]).includes(value);
}
