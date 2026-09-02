/**
 * Vision-metadata provider abstraction. Returns short, factual
 * `{ description, tags }` metadata for a sampled B-roll moment — never
 * fabricated or embellished content. When no provider is configured, or a
 * moment has not been analyzed yet, callers must use
 * `pendingMomentDescription()` and label the moment as unindexed rather than
 * invent a description.
 *
 * Analysis runs once per moment at import time (see `addBrollMedia` in
 * `lib/editor/store.ts` for the unindexed placeholder path); editing and
 * search operate on the stored result afterward and never re-run analysis.
 */

export interface MomentDescription {
  description: string;
  tags: string[];
}

export interface DescribeMomentInput {
  /** Local object URL or remote URL to the source reel. */
  source: string;
  /** Representative frame timestamps in seconds, from `sampleFrameTimestamps`. */
  frameTimestamps: number[];
  /**
   * Optional actual frame image data URLs (e.g. `data:image/jpeg;base64,...`)
   * captured client-side via `captureVideoFrame`, one per `frameTimestamps`
   * entry. When present, `createOpenAiVisionProvider` sends real image
   * content to the model instead of only text timestamps, which is required
   * for a genuine (non-fabricated) visual description.
   */
  frameImages?: string[];
  signal?: AbortSignal;
}

export interface VisionMetadataProvider {
  readonly name: string;
  describe(input: DescribeMomentInput): Promise<MomentDescription>;
}

export const PENDING_ANALYSIS_DESCRIPTION =
  "Unindexed source reel — full range available; visual analysis pending.";

/** Honest placeholder for a moment that has not been analyzed yet. */
export function pendingMomentDescription(): MomentDescription {
  return {
    description: PENDING_ANALYSIS_DESCRIPTION,
    tags: ["uploaded", "unindexed", "source reel"],
  };
}

export interface OpenAiVisionProviderOptions {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

const DEFAULT_VISION_MODEL = "gpt-4o-mini";

/**
 * Optional real vision-metadata provider. Not wired into the demo path.
 * Sends representative frame timestamps as context and asks for a strictly
 * factual one-sentence description plus short tags — the prompt explicitly
 * forbids invented detail so a provider failure or refusal degrades to
 * `pendingMomentDescription()` rather than fabricated content.
 */
export function createOpenAiVisionProvider(
  options: OpenAiVisionProviderOptions = {},
): VisionMetadataProvider {
  const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
  const model =
    options.model ??
    process.env.RELAYLAB_VISION_MODEL ??
    DEFAULT_VISION_MODEL;
  const baseUrl = options.baseUrl ?? "https://api.openai.com/v1";
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    name: `openai:${model}`,
    async describe({ frameTimestamps, frameImages, signal }) {
      if (!apiKey) {
        throw new Error("OPENAI_API_KEY is not configured; the vision provider cannot run.");
      }
      if (frameTimestamps.length === 0) {
        return pendingMomentDescription();
      }

      const hasRealFrames = Boolean(frameImages && frameImages.length > 0);
      const userContent: Array<
        | { type: "text"; text: string }
        | { type: "image_url"; image_url: { url: string } }
      > = [
        {
          type: "text",
          text: hasRealFrames
            ? `Representative frame timestamps (seconds): ${frameTimestamps.join(", ")}`
            : `No frame images were captured. Representative timestamps (seconds): ${frameTimestamps.join(", ")}. ` +
              "Describe only that this range is unanalyzed rather than guessing visual content.",
        },
        ...(frameImages ?? []).map((dataUrl) => ({
          type: "image_url" as const,
          image_url: { url: dataUrl },
        })),
      ];

      const response = await fetchImpl(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: "system",
              content:
                "Describe only what is visually present in the given B-roll frames. " +
                "Never invent people, objects, brands, or actions that are not clearly " +
                "visible. If no frame images are provided, say the moment is unanalyzed " +
                "rather than inventing a description. Respond with strict JSON: " +
                "{\"description\": string, \"tags\": string[]}.",
            },
            {
              role: "user",
              content: userContent,
            },
          ],
          response_format: { type: "json_object" },
        }),
        signal,
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(`Vision metadata request failed (${response.status}): ${detail}`);
      }

      const payload = (await response.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const content = payload.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error("Vision metadata response had no content.");
      }

      const parsed = JSON.parse(content) as { description?: string; tags?: string[] };
      const description = parsed.description?.trim();
      if (!description) {
        throw new Error("Vision metadata response did not include a description.");
      }

      return {
        description,
        tags: Array.isArray(parsed.tags) ? parsed.tags.filter((tag) => typeof tag === "string") : [],
      };
    },
  };
}
