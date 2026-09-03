import { createFalClient } from "@fal-ai/client";

export interface VideoGenerationRequest {
  prompt: string;
  duration?: number;
  aspectRatio?: string;
}

export interface VideoGenerationResult {
  url: string;
  provider: "fal.ai";
  model: string;
}

export interface VideoGenerator {
  generate(
    request: VideoGenerationRequest,
    options?: { signal?: AbortSignal },
  ): Promise<VideoGenerationResult>;
}

export interface FalVideoGeneratorConfig {
  apiKey: string;
  model: string;
}

export interface FalSubscriptionClient {
  subscribe(
    model: string,
    options: {
      input: Record<string, unknown>;
      abortSignal?: AbortSignal;
      logs?: boolean;
    },
  ): Promise<{ data: unknown }>;
}

function extractVideoUrl(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const record = data as Record<string, unknown>;
  const directUrl = record.url;
  if (typeof directUrl === "string") return directUrl;

  for (const key of ["video", "output", "file"]) {
    const nested = extractVideoUrl(record[key]);
    if (nested) return nested;
  }

  if (Array.isArray(record.videos)) {
    for (const video of record.videos) {
      const nested = extractVideoUrl(video);
      if (nested) return nested;
    }
  }
  return null;
}

function assertHttpsUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:") {
    throw new Error("fal.ai returned a non-HTTPS video URL.");
  }
  return url.toString();
}

/**
 * Server-side fal.ai adapter. The endpoint ID is required configuration rather
 * than an assumed model baked into the editor. The configured model must accept
 * the small prompt/duration/aspect_ratio payload used by this v1 adapter.
 */
export function createFalVideoGenerator(
  config: FalVideoGeneratorConfig,
  client?: FalSubscriptionClient,
): VideoGenerator {
  const apiKey = config.apiKey.trim();
  const model = config.model.trim();
  if (!apiKey || !model) {
    throw new Error("FAL_KEY and FAL_VIDEO_MODEL must both be configured.");
  }
  const falClient =
    client ??
    (createFalClient({ credentials: apiKey }) as unknown as FalSubscriptionClient);

  return {
    async generate(request, options) {
      const input: Record<string, unknown> = {
        prompt: request.prompt,
        // Required by some models (e.g. minimax/h3-max/text-to-video) with
        // no default; harmless for models that don't define this field —
        // fal endpoints ignore unrecognized input keys. "balanced" trades
        // ~1s of extra latency for prompt rewriting versus the "quality"
        // mode's up to ~30s.
        prompt_expansion_mode: "balanced",
      };
      if (request.duration !== undefined) input.duration = request.duration;
      if (request.aspectRatio !== undefined) input.aspect_ratio = request.aspectRatio;

      const result = await falClient.subscribe(model, {
        input,
        abortSignal: options?.signal,
        logs: false,
      });
      const url = extractVideoUrl(result.data);
      if (!url) {
        throw new Error("fal.ai completed without returning a video URL.");
      }
      return { url: assertHttpsUrl(url), provider: "fal.ai", model };
    },
  };
}

export function createConfiguredVideoGenerator(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): VideoGenerator | null {
  const apiKey = environment.FAL_KEY?.trim();
  const model = environment.FAL_VIDEO_MODEL?.trim();
  if (!apiKey || !model) return null;
  return createFalVideoGenerator({ apiKey, model });
}
