import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createFalVideoGenerator } from "@/lib/generation/videoGenerator";
import {
  _resetSessionCredentialsForTests,
  setSessionCredential,
} from "@/lib/credentials/sessionCredentials";

vi.mock("@/lib/generation/videoGenerator", () => ({
  createFalVideoGenerator: vi.fn(),
}));

const mockedCreateFalVideoGenerator = vi.mocked(createFalVideoGenerator);

// Imported once at module load so the first test doesn't pay (and risk
// timing out on) the route module's transform cost.
const { POST } = await import("@/app/api/generate-broll/route");

function jsonRequest(
  body: unknown,
  headers: Record<string, string> = {},
  url = "http://localhost/api/generate-broll",
) {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

const validBody = {
  prompt: "A manager reviews a quarterly sales dashboard.",
  duration: 5,
  aspectRatio: "16:9" as const,
};

beforeEach(() => {
  _resetSessionCredentialsForTests();
  mockedCreateFalVideoGenerator.mockReset();
  vi.stubEnv("FAL_KEY", "");
  vi.stubEnv("FAL_VIDEO_MODEL", "");
  vi.stubEnv("FAL_ALLOW_REMOTE_GENERATION", "");
});

afterEach(() => {
  _resetSessionCredentialsForTests();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("POST /api/generate-broll", () => {
  it("rejects requests missing the human-action header", async () => {
    const response = await POST(jsonRequest(validBody));

    expect(response.status).toBe(403);
    const payload = await response.json();
    expect(payload).toMatchObject({
      ok: false,
      code: "HUMAN_CONFIRMATION_REQUIRED",
    });
  });

  it("rejects requests with the wrong human-action header value", async () => {
    const response = await POST(
      jsonRequest(validBody, { "x-relaylab-human-action": "click" }),
    );

    expect(response.status).toBe(403);
    const payload = await response.json();
    expect(payload.code).toBe("HUMAN_CONFIRMATION_REQUIRED");
  });

  it("rejects cross-origin browser requests", async () => {
    const response = await POST(
      jsonRequest(validBody, {
        "x-relaylab-human-action": "generate",
        origin: "https://attacker.example",
      }),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      code: "CROSS_ORIGIN_GENERATION_REJECTED",
    });
  });

  it("keeps server-funded generation disabled without explicit opt-in", async () => {
    vi.stubEnv("FAL_ALLOW_REMOTE_GENERATION", "false");
    vi.stubEnv("FAL_KEY", "server-fal-key");
    vi.stubEnv("FAL_VIDEO_MODEL", "owner/server-model");

    const response = await POST(
      jsonRequest(validBody, { "x-relaylab-human-action": "generate" }),
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: "SERVER_GENERATION_DISABLED" });
    expect(mockedCreateFalVideoGenerator).not.toHaveBeenCalled();
  });

  it("rejects an invalid body with a validation error", async () => {
    const response = await POST(
      jsonRequest(
        { prompt: "short", duration: 99, aspectRatio: "21:9" },
        { "x-relaylab-human-action": "generate" },
      ),
    );

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload).toMatchObject({
      ok: false,
      code: "INVALID_GENERATION_REQUEST",
    });
    expect(Array.isArray(payload.issues)).toBe(true);
    expect(payload.issues.length).toBeGreaterThan(0);
  });

  it("returns unavailable when the generator is unconfigured", async () => {
    const response = await POST(
      jsonRequest(validBody, { "x-relaylab-human-action": "generate" }),
    );

    expect(response.status).toBe(503);
    const payload = await response.json();
    expect(payload).toMatchObject({
      ok: false,
      code: "GENERATION_UNAVAILABLE",
    });
  });

  it("returns the generated result on success", async () => {
    vi.stubEnv("FAL_KEY", "server-fal-key");
    vi.stubEnv("FAL_VIDEO_MODEL", "owner/configured-video-model");
    vi.stubEnv("FAL_ALLOW_REMOTE_GENERATION", "true");
    mockedCreateFalVideoGenerator.mockReturnValue({
      generate: vi.fn(async () => ({
        url: "https://cdn.example.com/generated.mp4",
        provider: "fal.ai" as const,
        model: "owner/configured-video-model",
      })),
    });

    const response = await POST(
      jsonRequest(validBody, { "x-relaylab-human-action": "generate" }),
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload).toEqual({
      ok: true,
      result: {
        url: "https://cdn.example.com/generated.mp4",
        provider: "fal.ai",
        model: "owner/configured-video-model",
      },
    });
    expect(mockedCreateFalVideoGenerator).toHaveBeenCalledWith({
      apiKey: "server-fal-key",
      model: "owner/configured-video-model",
    });
  });

  it("uses a session fal.ai key and model for remote human generation", async () => {
    const sessionId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    setSessionCredential(sessionId, {
      falApiKey: "session-fal-key",
      falModel: "owner/session-model",
    });
    vi.stubEnv("FAL_KEY", "server-fal-key");
    vi.stubEnv("FAL_VIDEO_MODEL", "owner/server-model");
    mockedCreateFalVideoGenerator.mockReturnValue({
      generate: vi.fn(async () => ({
        url: "https://cdn.example.com/byok-generated.mp4",
        provider: "fal.ai" as const,
        model: "owner/session-model",
      })),
    });

    const response = await POST(
      jsonRequest(
        validBody,
        {
          "x-relaylab-human-action": "generate",
          origin: "https://demo.example",
          cookie: `relaylab_session=${sessionId}`,
        },
        "https://demo.example/api/generate-broll",
      ),
    );

    expect(response.status).toBe(200);
    expect(mockedCreateFalVideoGenerator).toHaveBeenCalledWith({
      apiKey: "session-fal-key",
      model: "owner/session-model",
    });
  });

  it("returns a provider error when generation throws", async () => {
    vi.stubEnv("FAL_KEY", "server-fal-key");
    vi.stubEnv("FAL_VIDEO_MODEL", "owner/configured-video-model");
    vi.stubEnv("FAL_ALLOW_REMOTE_GENERATION", "true");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockedCreateFalVideoGenerator.mockReturnValue({
      generate: vi.fn(async () => {
        throw new Error("fal.ai job failed.");
      }),
    });

    const response = await POST(
      jsonRequest(validBody, { "x-relaylab-human-action": "generate" }),
    );

    expect(response.status).toBe(502);
    const payload = await response.json();
    expect(payload).toMatchObject({
      ok: false,
      code: "GENERATION_PROVIDER_ERROR",
      message: expect.stringContaining("suggestion was preserved"),
    });
  });
});
