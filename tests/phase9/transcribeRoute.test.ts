import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/transcribe/route";
import {
  _resetSessionCredentialsForTests,
  setSessionCredential,
} from "@/lib/credentials/sessionCredentials";

function transcriptionRequest(
  headers: Record<string, string> = {},
  file = new File(["video"], "talking-head.mp4", { type: "video/mp4" }),
  url = "http://localhost:3000/api/transcribe",
) {
  const form = new FormData();
  form.append("media", file);
  return new Request(url, {
    method: "POST",
    headers,
    body: form,
  });
}

describe("POST /api/transcribe", () => {
  const originalKey = process.env.OPENAI_API_KEY;
  const originalRemoteSetting = process.env.OPENAI_ALLOW_REMOTE_TRANSCRIPTION;

  beforeEach(() => {
    _resetSessionCredentialsForTests();
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_ALLOW_REMOTE_TRANSCRIPTION;
  });

  afterEach(() => {
    _resetSessionCredentialsForTests();
    vi.unstubAllGlobals();
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
    if (originalRemoteSetting === undefined) delete process.env.OPENAI_ALLOW_REMOTE_TRANSCRIPTION;
    else process.env.OPENAI_ALLOW_REMOTE_TRANSCRIPTION = originalRemoteSetting;
  });

  it("requires the human Auto captions intent", async () => {
    const response = await POST(transcriptionRequest());
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      code: "HUMAN_TRANSCRIPTION_REQUIRED",
    });
  });

  it("reports provider unavailability without fabricating captions", async () => {
    const response = await POST(
      transcriptionRequest({ "x-relaylab-human-action": "transcribe" }),
    );
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      code: "TRANSCRIPTION_UNAVAILABLE",
    });
  });

  it("rejects cross-origin requests", async () => {
    const response = await POST(
      transcriptionRequest({
        "x-relaylab-human-action": "transcribe",
        origin: "https://attacker.example",
      }),
    );
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      code: "CROSS_ORIGIN_TRANSCRIPTION_REJECTED",
    });
  });

  it("keeps server-funded transcription disabled without explicit opt-in", async () => {
    process.env.OPENAI_API_KEY = "sk-server-key";
    const form = new FormData();
    form.append("media", new File(["video"], "base.mp4", { type: "video/mp4" }));
    const response = await POST(
      new Request("http://localhost:3000/api/transcribe", {
        method: "POST",
        headers: {
          "x-relaylab-human-action": "transcribe",
        },
        body: form,
      }),
    );
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      code: "SERVER_TRANSCRIPTION_DISABLED",
    });
  });

  it("returns timestamped transcript data from the configured server provider", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.OPENAI_ALLOW_REMOTE_TRANSCRIPTION = "true";
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          text: "Hello RelayLab.",
          segments: [{ id: 0, start: 0, end: 1.4, text: "Hello RelayLab." }],
          words: [
            { word: "Hello", start: 0, end: 0.6 },
            { word: "RelayLab.", start: 0.6, end: 1.4 },
          ],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(
      transcriptionRequest({ "x-relaylab-human-action": "transcribe" }),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      transcript: [
        { start: 0, end: 1.4, text: "Hello RelayLab.", words: expect.any(Array) },
      ],
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("uses a Settings BYOK key for remote automatic captions", async () => {
    const sessionId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    setSessionCredential(sessionId, { openaiApiKey: "sk-session-key" });
    process.env.OPENAI_API_KEY = "sk-server-key";
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer sk-session-key");
      return new Response(
        JSON.stringify({
          text: "Session captions.",
          segments: [{ id: 0, start: 0, end: 1, text: "Session captions." }],
        }),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(
      transcriptionRequest(
        {
          "x-relaylab-human-action": "transcribe",
          origin: "https://demo.example",
          cookie: `relaylab_session=${sessionId}`,
        },
        undefined,
        "https://demo.example/api/transcribe",
      ),
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("validates missing, oversized, and non-media uploads before calling a provider", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.OPENAI_ALLOW_REMOTE_TRANSCRIPTION = "true";
    const emptyForm = new FormData();
    const missing = await POST(
      new Request("http://localhost:3000/api/transcribe", {
        method: "POST",
        headers: { "x-relaylab-human-action": "transcribe" },
        body: emptyForm,
      }),
    );
    expect(missing.status).toBe(400);

    const oversizedFile = new File(
      [new Uint8Array(25 * 1024 * 1024 + 1)],
      "huge.mp4",
      { type: "video/mp4" },
    );
    const oversized = await POST(
      transcriptionRequest({ "x-relaylab-human-action": "transcribe" }, oversizedFile),
    );
    expect(oversized.status).toBe(413);

    const wrongType = await POST(
      transcriptionRequest(
        { "x-relaylab-human-action": "transcribe" },
        new File(["notes"], "notes.txt", { type: "text/plain" }),
      ),
    );
    expect(wrongType.status).toBe(400);
  });

  it("returns a structured upstream failure", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.OPENAI_ALLOW_REMOTE_TRANSCRIPTION = "true";
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("bad request", { status: 400 })));

    const response = await POST(
      transcriptionRequest({ "x-relaylab-human-action": "transcribe" }),
    );
    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      code: "TRANSCRIPTION_FAILED",
      message: "Automatic transcription failed. The existing transcript and captions were preserved.",
    });
  });
});
