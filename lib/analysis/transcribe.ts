import type { TranscriptSegment, WordTimestamp } from "@/lib/editor/types";

/**
 * Transcription provider abstraction. RelayLab's demo route never calls a
 * real provider — `createDemoProject` ships precomputed transcript segments
 * so the hackathon demo stays fully usable without credentials. This module
 * exists for a future/optional real-media transcription path.
 */
export interface TranscriptionProvider {
  readonly name: string;
  transcribe(input: TranscribeInput): Promise<TranscriptSegment[]>;
}

export interface TranscribeInput {
  /** A readable URL or an already-uploaded audio/video Blob. */
  source: string | Blob;
  /** Original filename, used only for content-type inference and errors. */
  filename: string;
  signal?: AbortSignal;
}

/**
 * Env var documented in `.env.example`. Defaults to `whisper-1`, the OpenAI
 * model that returns `verbose_json` with segment and word timestamps via
 * `timestamp_granularities`. Confirmed against current OpenAI API docs
 * (developers.openai.com/api/docs/guides/speech-to-text) on 2026-08-29.
 */
export const DEFAULT_TRANSCRIPTION_MODEL = "whisper-1";

export function getConfiguredTranscriptionModel(
  env: Record<string, string | undefined> = process.env,
): string {
  const configured = env.RELAYLAB_TRANSCRIPTION_MODEL?.trim();
  return configured && configured.length > 0 ? configured : DEFAULT_TRANSCRIPTION_MODEL;
}

interface OpenAiWord {
  word: string;
  start: number;
  end: number;
}

interface OpenAiSegment {
  id: number;
  start: number;
  end: number;
  text: string;
}

interface OpenAiVerboseTranscription {
  text: string;
  segments?: OpenAiSegment[];
  words?: OpenAiWord[];
}

export interface OpenAiTranscriptionProviderOptions {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

/**
 * Calls OpenAI's `/v1/audio/transcriptions` endpoint with
 * `response_format: "verbose_json"` and `timestamp_granularities: ["segment", "word"]`
 * to recover both segment- and word-level timestamps. Requires
 * `OPENAI_API_KEY` (or an injected key) — never hardcoded. This provider is
 * optional; the demo path in `lib/demo/project.ts` never invokes it.
 */
export function createOpenAiTranscriptionProvider(
  options: OpenAiTranscriptionProviderOptions = {},
): TranscriptionProvider {
  const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
  const model = options.model ?? getConfiguredTranscriptionModel();
  const baseUrl = options.baseUrl ?? "https://api.openai.com/v1";
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    name: `openai:${model}`,
    async transcribe({ source, filename, signal }) {
      if (!apiKey) {
        throw new Error(
          "OPENAI_API_KEY is not configured; the transcription provider cannot run.",
        );
      }

      const blob =
        typeof source === "string"
          ? await (async () => {
              const fileResponse = await fetchImpl(source, { signal });
              if (!fileResponse.ok) {
                throw new Error(`Could not read source media for transcription: ${filename}`);
              }
              return fileResponse.blob();
            })()
          : source;

      const form = new FormData();
      form.append("file", blob, filename);
      form.append("model", model);
      form.append("response_format", "verbose_json");
      form.append("timestamp_granularities[]", "segment");
      form.append("timestamp_granularities[]", "word");

      const response = await fetchImpl(`${baseUrl}/audio/transcriptions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
        signal,
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(`Transcription request failed (${response.status}): ${detail}`);
      }

      const payload = (await response.json()) as OpenAiVerboseTranscription;
      return mapVerboseTranscription(payload);
    },
  };
}

function mapVerboseTranscription(payload: OpenAiVerboseTranscription): TranscriptSegment[] {
  const words: WordTimestamp[] = (payload.words ?? []).map((word) => ({
    word: word.word,
    start: word.start,
    end: word.end,
  }));

  const segments = payload.segments ?? [];
  if (segments.length === 0) {
    // Some responses omit segments for very short clips; fall back to one
    // segment spanning the full transcript so callers always get a range.
    const start = words.at(0)?.start ?? 0;
    const end = words.at(-1)?.end ?? start;
    return [
      {
        id: "seg_0",
        start,
        end,
        text: payload.text,
        ...(words.length > 0 ? { words } : {}),
      },
    ];
  }

  return segments.map((segment) => {
    const segmentWords = words.filter(
      (word) => word.start >= segment.start && word.end <= segment.end,
    );
    return {
      id: `seg_${segment.id}`,
      start: segment.start,
      end: segment.end,
      text: segment.text.trim(),
      ...(segmentWords.length > 0 ? { words: segmentWords } : {}),
    };
  });
}
