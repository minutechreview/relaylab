import type {
  VideoGenerationRequest,
  VideoGenerationResult,
} from "./videoGenerator";
import { readVideoMetadata, type VideoMetadata } from "@/lib/media/readVideoMetadata";

export class GenerationRequestError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "GenerationRequestError";
  }
}

export async function requestGeneratedBroll(
  request: VideoGenerationRequest,
  options: { signal?: AbortSignal } = {},
): Promise<VideoGenerationResult> {
  const response = await fetch("/api/generate-broll", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-relaylab-human-action": "generate",
    },
    body: JSON.stringify(request),
    signal: options.signal,
  });
  const payload = (await response.json().catch(() => null)) as
    | {
        ok?: boolean;
        code?: string;
        message?: string;
        result?: VideoGenerationResult;
      }
    | null;
  if (!response.ok || !payload?.ok || !payload.result) {
    throw new GenerationRequestError(
      payload?.message ?? "Video generation failed.",
      payload?.code ?? "GENERATION_FAILED",
      response.status,
    );
  }
  return payload.result;
}

export async function requestAndMeasureGeneratedBroll(
  request: VideoGenerationRequest,
  options: {
    signal?: AbortSignal;
    readMetadata?: (
      sourceUrl: string,
      options: { signal?: AbortSignal },
    ) => Promise<VideoMetadata>;
  } = {},
): Promise<VideoGenerationResult & { duration: number }> {
  const generated = await requestGeneratedBroll(request, { signal: options.signal });
  const metadata = await (options.readMetadata ?? readVideoMetadata)(generated.url, {
    signal: options.signal,
  });
  return { ...generated, duration: metadata.duration };
}
