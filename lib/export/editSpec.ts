import { BASE_AUDIO_POLICY, BROLL_AUDIO_POLICY } from "@/lib/editor/audioPolicy";
import type {
  Caption,
  CaptionPosition,
  GeneratedBrollSuggestion,
  Overlay,
  Project,
  ProjectStatus,
} from "@/lib/editor/types";

export const EDIT_SPEC_VERSION = 1 as const;
export const EDIT_SPEC_KIND = "broll-overlay-edit" as const;

const RANGE_EPSILON_SECONDS = 0.002;

export interface EditSpecSource {
  id: string;
  fileName: string;
  duration: number;
  /**
   * Browser object URLs are intentionally excluded. They are session-local and
   * cannot be used by a reproducible command outside the browser.
   */
  referenceKind: "portable-file-name" | "provider-url-requires-download";
  origin?: "demo" | "uploaded" | "generated";
  generation?: {
    provider: string;
    model: string;
    prompt: string;
  };
  retrieval?: {
    url: string;
    downloadAs: string;
    warning: "provider URLs may expire; download before rendering";
  };
}

export interface EditSpecOverlay {
  id: string;
  assetId: string;
  momentId?: string;
  sourceRange: {
    start: number;
    end: number;
    duration: number;
  };
  timelineRange: {
    start: number;
    end: number;
    duration: number;
  };
  status: Overlay["status"];
  lockedByHuman: boolean;
  createdBy: Overlay["createdBy"];
  reason?: string;
  audioPolicy: typeof BROLL_AUDIO_POLICY;
}

export interface EditSpecCaption {
  id: string;
  start: number;
  end: number;
  text: string;
}

export interface EditSpec {
  schemaVersion: typeof EDIT_SPEC_VERSION;
  kind: typeof EDIT_SPEC_KIND;
  project: {
    id: string;
    title: string;
    status: ProjectStatus;
    duration: number;
  };
  sources: {
    base: EditSpecSource & {
      locked: true;
      audioPolicy: typeof BASE_AUDIO_POLICY;
    };
    broll: Array<
      EditSpecSource & {
        audioPolicy: typeof BROLL_AUDIO_POLICY;
      }
    >;
  };
  timeline: {
    baseTrackLocked: true;
    brollTrackCount: 1;
    overlays: EditSpecOverlay[];
    generationSuggestions: Array<
      Pick<
        GeneratedBrollSuggestion,
        | "id"
        | "timelineStart"
        | "timelineEnd"
        | "duration"
        | "prompt"
        | "reason"
        | "status"
        | "createdBy"
        | "error"
      > & { paidGenerationStartedByExport: false }
    >;
  };
  captions: EditSpecCaption[];
  captionStyle: {
    position: CaptionPosition;
  };
  audioPolicy: {
    masterSource: "base";
    baseAudio: typeof BASE_AUDIO_POLICY;
    brollAudio: typeof BROLL_AUDIO_POLICY;
    includeBrollAudio: false;
  };
}

export class ExportValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExportValidationError";
  }
}

function assertFiniteTime(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new ExportValidationError(`${label} must be a finite number.`);
  }
}

/**
 * Export commands intentionally work with media file names in one directory,
 * never user-supplied paths. The returned name is safe to pass through the
 * shell-escaping layer but is not otherwise rewritten.
 */
export function assertPortableMediaFileName(fileName: string, label: string): string {
  const trimmed = fileName.trim();
  if (!trimmed) {
    throw new ExportValidationError(`${label} must have a file name.`);
  }
  if (trimmed === "." || trimmed === ".." || /[\\/]/u.test(trimmed)) {
    throw new ExportValidationError(
      `${label} must be a portable file name, not a file system path.`,
    );
  }
  if (/\p{Cc}/u.test(trimmed)) {
    throw new ExportValidationError(`${label} contains unsupported control characters.`);
  }
  return trimmed;
}

function assertUniquePortableFileNames(
  entries: Array<{ fileName: string; label: string }>,
): void {
  const owners = new Map<string, string>();
  entries.forEach(({ fileName, label }) => {
    const normalized = fileName.normalize("NFC").toLocaleLowerCase("en-US");
    const existing = owners.get(normalized);
    if (existing) {
      throw new ExportValidationError(
        `${label} and ${existing} both resolve to ${fileName}. Give every export source a unique file name.`,
      );
    }
    owners.set(normalized, label);
  });
}

function assertGeneratedRetrievalUrl(value: string, label: string): string {
  if (value.startsWith("/demo/") && !value.includes("..") && !value.includes("\\")) {
    return value;
  }
  try {
    const url = new URL(value);
    if (url.protocol === "https:") return url.toString();
  } catch {
    // Fall through to the structured export error.
  }
  throw new ExportValidationError(`${label} requires a safe HTTPS or bundled demo URL.`);
}

function assertPositiveDuration(duration: number, label: string): void {
  assertFiniteTime(duration, label);
  if (duration <= 0) {
    throw new ExportValidationError(`${label} must be greater than zero.`);
  }
}

function assertOverlayRange(
  overlay: Overlay,
  projectDuration: number,
  sourceDuration: number,
): void {
  const values = [
    [overlay.sourceStart, `Overlay ${overlay.id} source start`],
    [overlay.sourceEnd, `Overlay ${overlay.id} source end`],
    [overlay.timelineStart, `Overlay ${overlay.id} timeline start`],
    [overlay.timelineEnd, `Overlay ${overlay.id} timeline end`],
  ] as const;
  values.forEach(([value, label]) => assertFiniteTime(value, label));

  if (overlay.sourceStart < 0 || overlay.sourceEnd <= overlay.sourceStart) {
    throw new ExportValidationError(`Overlay ${overlay.id} has an invalid source range.`);
  }
  if (overlay.sourceEnd - sourceDuration > RANGE_EPSILON_SECONDS) {
    throw new ExportValidationError(
      `Overlay ${overlay.id} extends beyond its B-roll source duration.`,
    );
  }
  if (overlay.timelineStart < 0 || overlay.timelineEnd <= overlay.timelineStart) {
    throw new ExportValidationError(`Overlay ${overlay.id} has an invalid timeline range.`);
  }
  if (overlay.timelineEnd - projectDuration > RANGE_EPSILON_SECONDS) {
    throw new ExportValidationError(
      `Overlay ${overlay.id} extends beyond the base timeline.`,
    );
  }

  const sourceRangeDuration = overlay.sourceEnd - overlay.sourceStart;
  const timelineRangeDuration = overlay.timelineEnd - overlay.timelineStart;
  if (Math.abs(sourceRangeDuration - timelineRangeDuration) > RANGE_EPSILON_SECONDS) {
    throw new ExportValidationError(
      `Overlay ${overlay.id} source and timeline durations must match in v1.`,
    );
  }
}

function assertCaption(caption: Caption, projectDuration: number): void {
  assertFiniteTime(caption.start, `Caption ${caption.id} start`);
  assertFiniteTime(caption.end, `Caption ${caption.id} end`);
  if (caption.start < 0 || caption.end <= caption.start) {
    throw new ExportValidationError(`Caption ${caption.id} has an invalid timeline range.`);
  }
  if (caption.end - projectDuration > RANGE_EPSILON_SECONDS) {
    throw new ExportValidationError(`Caption ${caption.id} extends beyond the base timeline.`);
  }
  if (!caption.text.trim()) {
    throw new ExportValidationError(`Caption ${caption.id} must contain text.`);
  }
}

function range(start: number, end: number) {
  return {
    start,
    end,
    duration: Math.round((end - start) * 1000) / 1000,
  };
}

export function createEditSpec(project: Project): EditSpec {
  assertPositiveDuration(project.duration, "Project duration");
  assertPositiveDuration(project.baseVideo.duration, "Base source duration");
  if (Math.abs(project.baseVideo.duration - project.duration) > RANGE_EPSILON_SECONDS) {
    throw new ExportValidationError(
      "Base source duration must match the project timeline duration.",
    );
  }
  const baseFileName = assertPortableMediaFileName(project.baseVideo.name, "Base source");

  const assetsById = new Map<string, Project["brollAssets"][number]>();
  project.brollAssets.forEach((asset) => {
    if (assetsById.has(asset.id)) {
      throw new ExportValidationError(`Duplicate B-roll asset ID ${asset.id}.`);
    }
    assetsById.set(asset.id, asset);
  });
  const usedAssetIds = new Set<string>();

  const overlays = project.overlays.map((overlay): EditSpecOverlay => {
    const asset = assetsById.get(overlay.assetId);
    if (!asset) {
      throw new ExportValidationError(
        `Overlay ${overlay.id} references missing B-roll asset ${overlay.assetId}.`,
      );
    }
    assertPositiveDuration(asset.duration, `B-roll source ${asset.id} duration`);
    assertPortableMediaFileName(asset.name, `B-roll source ${asset.id}`);
    assertOverlayRange(overlay, project.duration, asset.duration);
    usedAssetIds.add(asset.id);

    return {
      id: overlay.id,
      assetId: overlay.assetId,
      ...(overlay.momentId === undefined ? {} : { momentId: overlay.momentId }),
      sourceRange: range(overlay.sourceStart, overlay.sourceEnd),
      timelineRange: range(overlay.timelineStart, overlay.timelineEnd),
      status: overlay.status,
      lockedByHuman: overlay.lockedByHuman,
      createdBy: overlay.createdBy,
      ...(overlay.reason === undefined ? {} : { reason: overlay.reason }),
      audioPolicy: BROLL_AUDIO_POLICY,
    };
  });

  const captions = [...project.captions]
    .sort((left, right) => left.start - right.start || left.end - right.end)
    .map((caption): EditSpecCaption => {
      assertCaption(caption, project.duration);
      return {
        id: caption.id,
        start: caption.start,
        end: caption.end,
        text: caption.text,
      };
    });

  const usedAssets = project.brollAssets.filter((asset) => usedAssetIds.has(asset.id));
  const namedSources = [
    { fileName: baseFileName, label: "Base source" },
    ...usedAssets.map((asset) => ({
      fileName: assertPortableMediaFileName(asset.name, `B-roll source ${asset.id}`),
      label: `B-roll source ${asset.id}`,
    })),
  ];
  assertUniquePortableFileNames(namedSources);

  const broll = usedAssets.map((asset) => {
    const fileName = assertPortableMediaFileName(asset.name, `B-roll source ${asset.id}`);
    if (asset.origin === "generated" && !asset.generation) {
      throw new ExportValidationError(
        `Generated B-roll source ${asset.id} is missing provider provenance.`,
      );
    }
    const retrievalUrl = asset.generation
      ? assertGeneratedRetrievalUrl(
          asset.generation.sourceUrl,
          `Generated B-roll source ${asset.id}`,
        )
      : null;
    return {
      id: asset.id,
      fileName,
      duration: asset.duration,
      referenceKind: retrievalUrl
        ? ("provider-url-requires-download" as const)
        : ("portable-file-name" as const),
      audioPolicy: BROLL_AUDIO_POLICY,
      ...(asset.origin === undefined ? {} : { origin: asset.origin }),
      ...(asset.generation === undefined
        ? {}
        : {
            generation: {
              provider: asset.generation.provider,
              model: asset.generation.model,
              prompt: asset.generation.prompt,
            },
            retrieval: {
              url: retrievalUrl!,
              downloadAs: fileName,
              warning: "provider URLs may expire; download before rendering" as const,
            },
          }),
    };
  });

  const generationSuggestions = project.generationSuggestions
    .slice()
    .sort((left, right) => left.timelineStart - right.timelineStart)
    .map((suggestion) => ({
      ...suggestion,
      paidGenerationStartedByExport: false as const,
    }));

  return {
    schemaVersion: EDIT_SPEC_VERSION,
    kind: EDIT_SPEC_KIND,
    project: {
      id: project.id,
      title: project.title,
      status: project.status,
      duration: project.duration,
    },
    sources: {
      base: {
        id: project.baseVideo.id,
        fileName: baseFileName,
        duration: project.baseVideo.duration,
        referenceKind: "portable-file-name",
        locked: true,
        audioPolicy: BASE_AUDIO_POLICY,
      },
      broll,
    },
    timeline: {
      baseTrackLocked: true,
      brollTrackCount: 1,
      overlays,
      generationSuggestions,
    },
    captions,
    captionStyle: { ...project.captionStyle },
    audioPolicy: {
      masterSource: "base",
      baseAudio: BASE_AUDIO_POLICY,
      brollAudio: BROLL_AUDIO_POLICY,
      includeBrollAudio: false,
    },
  };
}

export function serializeEditSpec(project: Project, indentation = 2): string {
  if (!Number.isInteger(indentation) || indentation < 0 || indentation > 8) {
    throw new ExportValidationError("JSON indentation must be an integer from 0 through 8.");
  }
  return `${JSON.stringify(createEditSpec(project), null, indentation)}\n`;
}
