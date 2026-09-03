import { ASPECT_RATIO_EXPORT_DIMENSIONS } from "@/lib/editor/aspectRatio";
import type { CaptionPosition, Project } from "@/lib/editor/types";

import {
  createEditSpec,
  type EditSpec,
  type EditSpecCaption,
  type EditSpecOverlay,
} from "./editSpec";

const SIMPLE_SHELL_ARGUMENT = /^[A-Za-z0-9_@%+=:,./-]+$/u;

export interface CaptionSidecar {
  fileName: string;
  mediaType: "application/x-subrip";
  contents: string;
}

export interface FfmpegExport {
  ok: true;
  executable: "ffmpeg";
  /** Full invocation, including the executable as argv[0]. */
  argv: string[];
  command: string;
  script: string;
  filterComplex: string;
  outputFileName: string;
  captionSidecar: CaptionSidecar | null;
  renderedOverlayIds: string[];
  skippedGhostOverlayIds: string[];
  audioMapping: {
    baseInputIndex: 0;
    mappedStream: "0:a:0?";
    brollAudioMapped: false;
  };
}

export interface FfmpegExportFailure {
  ok: false;
  code: "INCONSISTENT_COMMITTED_PROJECT";
  message: string;
  ghostOverlayIds: string[];
}

export type FfmpegExportResult = FfmpegExport | FfmpegExportFailure;

export function isFfmpegExportSuccess(
  result: FfmpegExportResult,
): result is FfmpegExport {
  return result.ok;
}

export interface CreateFfmpegExportOptions {
  /** Burn captions through a generated SRT sidecar. Defaults to true. */
  burnCaptions?: boolean;
}

/** POSIX-shell escaping for displayable/downloadable commands. */
export function shellQuote(argument: string): string {
  if (argument.length > 0 && SIMPLE_SHELL_ARGUMENT.test(argument)) {
    return argument;
  }
  return `'${argument.replace(/'/gu, `'"'"'`)}'`;
}

function formatSeconds(value: number): string {
  const rounded = Math.round(value * 1000) / 1000;
  return Number.isInteger(rounded)
    ? String(rounded)
    : rounded.toFixed(3).replace(/0+$/u, "").replace(/\.$/u, "");
}

function slugifyFileStem(value: string): string {
  return (
    value
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/gu, "-")
      .replace(/^-+|-+$/gu, "")
      .slice(0, 72) || "broll-edit"
  );
}

function formatSrtTimestamp(seconds: number): string {
  const totalMilliseconds = Math.max(0, Math.round(seconds * 1000));
  const milliseconds = totalMilliseconds % 1000;
  const totalSeconds = Math.floor(totalMilliseconds / 1000);
  const second = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minute = totalMinutes % 60;
  const hour = Math.floor(totalMinutes / 60);
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")},${String(milliseconds).padStart(3, "0")}`;
}

export function createSrt(captions: EditSpecCaption[]): string {
  if (captions.length === 0) return "";
  return `${captions
    .map(
      (caption, index) =>
        `${index + 1}\n${formatSrtTimestamp(caption.start)} --> ${formatSrtTimestamp(caption.end)}\n${caption.text.replace(/\r\n?/gu, "\n")}\n`,
    )
    .join("\n")}\n`;
}

function sortCommittedOverlays(overlays: EditSpecOverlay[]): EditSpecOverlay[] {
  return overlays
    .map((overlay, projectOrder) => ({ overlay, projectOrder }))
    .filter(({ overlay }) => overlay.status === "committed")
    .sort(
      (left, right) =>
        left.overlay.timelineRange.start - right.overlay.timelineRange.start ||
        // Preview's stable descending sort picks the first project-order item
        // when starts tie. Apply that item last in ffmpeg so the same shot wins.
        right.projectOrder - left.projectOrder,
    )
    .map(({ overlay }) => overlay);
}

function buildFilterComplex(
  committedOverlays: EditSpecOverlay[],
  captionFileName: string | null,
  captionPosition: CaptionPosition,
  exportDimensions: { width: number; height: number },
): string {
  const filters = ["[0:v:0]setpts=PTS-STARTPTS[base0]"];
  let baseLabel = "base0";

  committedOverlays.forEach((overlay, overlayIndex) => {
    const inputIndex = overlayIndex + 1;
    const rawOverlayLabel = `overlay${overlayIndex}raw`;
    const scaledOverlayLabel = `overlay${overlayIndex}`;
    const referencedBaseLabel = `base${overlayIndex}ref`;
    const nextBaseLabel = `base${overlayIndex + 1}`;

    filters.push(
      `[${inputIndex}:v:0]trim=start=${formatSeconds(overlay.sourceRange.start)}:end=${formatSeconds(overlay.sourceRange.end)},setpts=PTS-STARTPTS+${formatSeconds(overlay.timelineRange.start)}/TB[${rawOverlayLabel}]`,
      `[${rawOverlayLabel}][${baseLabel}]scale2ref=w=main_w:h=main_h[${scaledOverlayLabel}][${referencedBaseLabel}]`,
      `[${referencedBaseLabel}][${scaledOverlayLabel}]overlay=x=0:y=0:eof_action=pass:enable='between(t,${formatSeconds(overlay.timelineRange.start)},${formatSeconds(overlay.timelineRange.end)})'[${nextBaseLabel}]`,
    );
    baseLabel = nextBaseLabel;
  });

  // Letterbox/pillarbox to the project's chosen output canvas. Safe
  // regardless of the source's own dimensions: force_original_aspect_ratio
  // never upscales past the target box, and pad is a no-op when the scaled
  // frame already fills it exactly.
  const { width, height } = exportDimensions;
  filters.push(
    `[${baseLabel}]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black[canvas]`,
  );
  baseLabel = "canvas";

  if (captionFileName) {
    const alignment = { top: 8, center: 5, bottom: 2 }[captionPosition];
    const margin = captionPosition === "center" ? 0 : 48;
    filters.push(
      `[${baseLabel}]subtitles=filename='${captionFileName}':force_style='Alignment=${alignment},MarginV=${margin},Fontsize=24,Outline=2,Shadow=0'[vout]`,
    );
  } else {
    filters.push(`[${baseLabel}]null[vout]`);
  }

  return filters.join(";");
}

function sourceNameForOverlay(spec: EditSpec, overlay: EditSpecOverlay): string {
  const source = spec.sources.broll.find((candidate) => candidate.id === overlay.assetId);
  if (!source) {
    // createEditSpec guarantees this cannot occur. Keep the generator's failure
    // explicit in case a future caller mutates the returned spec before use.
    throw new Error(`Missing exported B-roll source ${overlay.assetId}.`);
  }
  return source.fileName;
}

export function createFfmpegExport(
  project: Project,
  options: CreateFfmpegExportOptions = {},
): FfmpegExportResult {
  const spec = createEditSpec(project);
  const skippedGhostOverlayIds = spec.timeline.overlays
    .filter((overlay) => overlay.status === "ghost")
    .map((overlay) => overlay.id);
  if (spec.project.status === "committed" && skippedGhostOverlayIds.length > 0) {
    return {
      ok: false,
      code: "INCONSISTENT_COMMITTED_PROJECT",
      message:
        "A committed project cannot contain ghost overlays. Recommit the approved plan before exporting.",
      ghostOverlayIds: skippedGhostOverlayIds,
    };
  }

  const committedOverlays = sortCommittedOverlays(spec.timeline.overlays);
  const stem = slugifyFileStem(spec.project.title);
  const outputFileName = `${stem}-edit.mp4`;
  const burnCaptions = options.burnCaptions ?? true;
  const captionSidecar =
    burnCaptions && spec.captions.length > 0
      ? {
          fileName: `${stem}.captions.srt`,
          mediaType: "application/x-subrip" as const,
          contents: createSrt(spec.captions),
        }
      : null;
  const filterComplex = buildFilterComplex(
    committedOverlays,
    captionSidecar?.fileName ?? null,
    spec.captionStyle.position,
    ASPECT_RATIO_EXPORT_DIMENSIONS[project.aspectRatio],
  );

  const argv = ["ffmpeg", "-hide_banner", "-y", "-i", spec.sources.base.fileName];
  committedOverlays.forEach((overlay) => {
    argv.push("-i", sourceNameForOverlay(spec, overlay));
  });
  argv.push(
    "-filter_complex",
    filterComplex,
    "-map",
    "[vout]",
    "-map",
    "0:a:0?",
    "-c:v",
    "libx264",
    "-preset",
    "medium",
    "-crf",
    "18",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-movflags",
    "+faststart",
    "-t",
    formatSeconds(spec.project.duration),
    outputFileName,
  );

  const command = argv.map(shellQuote).join(" ");
  const committedAssetIds = new Set(committedOverlays.map((overlay) => overlay.assetId));
  const generatedSourceInstructions = spec.sources.broll
    .filter(
      (source) => committedAssetIds.has(source.id) && source.retrieval !== undefined,
    )
    .map(
      (source) =>
        `# REQUIRED GENERATED SOURCE: download ${source.retrieval!.url} as ${source.retrieval!.downloadAs} before running ffmpeg.`,
    )
    .join("\n");
  const sidecarInstruction = captionSidecar
    ? `# Save the generated caption sidecar as ${shellQuote(captionSidecar.fileName)} beside the media files.\n`
    : "";
  const generatedInstructionBlock = generatedSourceInstructions
    ? `${generatedSourceInstructions}\n`
    : "";
  const script = `#!/usr/bin/env sh\nset -eu\n\n# Place every named source file beside this script, then run it from that directory.\n# B-roll inputs are video-only; the sole mapped audio stream is optional base input 0 audio.\n${generatedInstructionBlock}${sidecarInstruction}${command}\n`;

  return {
    ok: true,
    executable: "ffmpeg",
    argv,
    command,
    script,
    filterComplex,
    outputFileName,
    captionSidecar,
    renderedOverlayIds: committedOverlays.map((overlay) => overlay.id),
    skippedGhostOverlayIds,
    audioMapping: {
      baseInputIndex: 0,
      mappedStream: "0:a:0?",
      brollAudioMapped: false,
    },
  };
}
