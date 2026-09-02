import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { _resetSessionCredentialsForTests, setSessionCredential } from "@/lib/credentials/sessionCredentials";

import { POST } from "@/app/api/ai/analyze-broll/route";

function jsonRequest(
  body: unknown,
  headers: Record<string, string> = {},
  url = "http://localhost/api/ai/analyze-broll",
) {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

const validBody = {
  assetId: "asset_1",
  source: "blob:http://localhost/abc",
  moments: [
    {
      momentId: "m_1",
      sourceStart: 0,
      sourceEnd: 3,
      frameImages: ["data:image/jpeg;base64,AA=="],
    },
  ],
};

describe("POST /api/ai/analyze-broll", () => {
  const originalKey = process.env.OPENAI_API_KEY;
  const originalRemoteVision = process.env.OPENAI_ALLOW_REMOTE_VISION;

  beforeEach(() => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_ALLOW_REMOTE_VISION;
  });

  afterEach(() => {
    _resetSessionCredentialsForTests();
    vi.restoreAllMocks();
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
    if (originalRemoteVision === undefined) delete process.env.OPENAI_ALLOW_REMOTE_VISION;
    else process.env.OPENAI_ALLOW_REMOTE_VISION = originalRemoteVision;
  });

  it("rejects requests missing the human-action header", async () => {
    const response = await POST(jsonRequest(validBody));
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ code: "HUMAN_CONFIRMATION_REQUIRED" });
  });

  it("rejects cross-origin requests", async () => {
    const response = await POST(
      jsonRequest(validBody, {
        "x-relaylab-human-action": "analyze-broll",
        origin: "https://evil.example",
      }),
    );
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ code: "CROSS_ORIGIN_REJECTED" });
  });

  it("reports VISION_UNAVAILABLE honestly with no key configured, never claiming success", async () => {
    const response = await POST(
      jsonRequest(validBody, { "x-relaylab-human-action": "analyze-broll" }),
    );
    expect(response.status).toBe(503);
    const payload = await response.json();
    expect(payload).toMatchObject({ ok: false, code: "VISION_UNAVAILABLE" });
    expect(payload.message).toMatch(/OpenAI API key/i);
  });

  it("rejects invalid request bodies", async () => {
    const response = await POST(
      jsonRequest({ assetId: "" }, { "x-relaylab-human-action": "analyze-broll" }),
    );
    expect(response.status).toBe(400);
  });

  it("uses a session BYOK key on a remote deployment without spending a server key", async () => {
    setSessionCredential("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", { openaiApiKey: "sk-session-key" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify({ description: "A desk.", tags: ["desk"] }) } }],
          }),
          { status: 200 },
        ),
      ),
    );

    const response = await POST(
      jsonRequest(
        validBody,
        {
          "x-relaylab-human-action": "analyze-broll",
          origin: "https://demo.example",
          cookie: "relaylab_session=aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        },
        "https://demo.example/api/ai/analyze-broll",
      ),
    );
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.ok).toBe(true);
    expect(payload.results[0]).toMatchObject({ ok: true, description: "A desk." });
    vi.unstubAllGlobals();
  });

  it("blocks server-funded vision without explicit opt-in even on localhost", async () => {
    process.env.OPENAI_API_KEY = "sk-server-key";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(
      jsonRequest(validBody, { "x-relaylab-human-action": "analyze-broll" }),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ code: "SERVER_VISION_DISABLED" });
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("caps analyzed moments and reports truncation for large candidate sets", async () => {
    process.env.OPENAI_API_KEY = "sk-server-key";
    process.env.OPENAI_ALLOW_REMOTE_VISION = "true";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify({ description: "ok", tags: [] }) } }],
          }),
          { status: 200 },
        ),
      ),
    );

    const manyMoments = Array.from({ length: 25 }, (_, index) => ({
      momentId: `m_${index}`,
      sourceStart: index * 4,
      sourceEnd: index * 4 + 3,
      frameImages: ["data:image/jpeg;base64,AA=="],
    }));
    const response = await POST(
      jsonRequest(
        { ...validBody, moments: manyMoments, maxMoments: 20 },
        { "x-relaylab-human-action": "analyze-broll" },
      ),
    );
    const payload = await response.json();
    expect(payload.candidateCount).toBe(25);
    expect(payload.analyzedCount).toBe(20);
    expect(payload.truncated).toBe(true);
    vi.unstubAllGlobals();
  });

  it("rejects a declared oversized analysis body before provider work", async () => {
    const response = await POST(
      jsonRequest(validBody, {
        "x-relaylab-human-action": "analyze-broll",
        "content-length": String(16 * 1024 * 1024 + 1),
      }),
    );

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({
      code: "ANALYSIS_REQUEST_TOO_LARGE",
    });
  });
});
