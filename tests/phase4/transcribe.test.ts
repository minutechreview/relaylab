import { describe, expect, it } from "vitest";

import {
  createOpenAiTranscriptionProvider,
  getConfiguredTranscriptionModel,
} from "@/lib/analysis/transcribe";

function fakeFetch(
  responses: Record<string, () => Response>,
): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    const matched = Object.entries(responses).find(([key]) => url.includes(key));
    if (!matched) throw new Error(`Unexpected fetch to ${url}`);
    return matched[1]();
  }) as typeof fetch;
}

describe("Phase 4 transcription provider", () => {
  it("defaults the configured model to whisper-1 when no env var is set", () => {
    expect(getConfiguredTranscriptionModel({})).toBe("whisper-1");
  });

  it("honors an explicit RELAYLAB_TRANSCRIPTION_MODEL override", () => {
    expect(
      getConfiguredTranscriptionModel({ RELAYLAB_TRANSCRIPTION_MODEL: "gpt-transcribe" }),
    ).toBe("gpt-transcribe");
  });

  it("accepts an uploaded Blob without refetching browser media", async () => {
    const fetchImpl = fakeFetch({
      "audio/transcriptions": () =>
        new Response(JSON.stringify({ text: "Blob input.", segments: [{ id: 1, start: 0, end: 1, text: "Blob input." }] }), { status: 200 }),
    });
    const provider = createOpenAiTranscriptionProvider({ apiKey: "sk-test", fetchImpl });

    await expect(
      provider.transcribe({ source: new Blob(["audio"]), filename: "clip.mp3" }),
    ).resolves.toEqual([
      expect.objectContaining({ text: "Blob input.", start: 0, end: 1 }),
    ]);
  });

  it("maps a verbose_json response into timestamped transcript segments", async () => {
    const provider = createOpenAiTranscriptionProvider({
      apiKey: "sk-test",
      fetchImpl: fakeFetch({
        "audio/transcriptions": () =>
          new Response(
            JSON.stringify({
              text: "Hello world.",
              segments: [{ id: 0, start: 0, end: 1.2, text: "Hello world." }],
              words: [
                { word: "Hello", start: 0, end: 0.5 },
                { word: "world.", start: 0.5, end: 1.2 },
              ],
            }),
            { status: 200 },
          ),
        source: () => new Response(new Blob(["fake-audio"]), { status: 200 }),
      }),
    });

    const segments = await provider.transcribe({
      source: "blob:source",
      filename: "clip.mp3",
    });

    expect(segments).toHaveLength(1);
    expect(segments[0]).toMatchObject({ start: 0, end: 1.2, text: "Hello world." });
    expect(segments[0].words).toHaveLength(2);
  });

  it("throws a clear error when no API key is configured", async () => {
    const provider = createOpenAiTranscriptionProvider({
      apiKey: undefined,
      fetchImpl: fakeFetch({}),
    });

    await expect(
      provider.transcribe({ source: "blob:source", filename: "clip.mp3" }),
    ).rejects.toThrow(/OPENAI_API_KEY/);
  });

  it("surfaces a transcription request failure with the response status", async () => {
    const provider = createOpenAiTranscriptionProvider({
      apiKey: "sk-test",
      fetchImpl: fakeFetch({
        "audio/transcriptions": () => new Response("bad request", { status: 400 }),
        source: () => new Response(new Blob(["fake-audio"]), { status: 200 }),
      }),
    });

    await expect(
      provider.transcribe({ source: "blob:source", filename: "clip.mp3" }),
    ).rejects.toThrow(/400/);
  });
});
