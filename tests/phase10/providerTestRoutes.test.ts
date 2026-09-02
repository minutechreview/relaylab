import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { _resetSessionCredentialsForTests } from "@/lib/credentials/sessionCredentials";

import { POST as testOpenAi } from "@/app/api/ai/openai/test/route";
import { POST as testFal } from "@/app/api/ai/fal/test/route";

function request(url: string, headers: Record<string, string> = {}) {
  return new Request(url, { method: "POST", headers });
}

describe("POST /api/ai/openai/test", () => {
  const originalKey = process.env.OPENAI_API_KEY;

  beforeEach(() => {
    delete process.env.OPENAI_API_KEY;
  });

  afterEach(() => {
    _resetSessionCredentialsForTests();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
  });

  it("reports NOT_CONFIGURED when no key exists", async () => {
    const response = await testOpenAi(request("http://localhost/api/ai/openai/test"));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ code: "NOT_CONFIGURED" });
  });

  it("does not burn a transcription/vision call; only calls the models list endpoint", async () => {
    process.env.OPENAI_API_KEY = "sk-server-key";
    const fetchSpy = vi.fn(async (..._args: unknown[]) => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);

    const response = await testOpenAi(request("http://localhost/api/ai/openai/test"));
    expect(response.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0][0]).toContain("/v1/models");
    expect(fetchSpy.mock.calls[0][0]).not.toContain("chat/completions");
    expect(fetchSpy.mock.calls[0][0]).not.toContain("audio/transcriptions");
  });

  it("surfaces an invalid key as 401 without leaking the key", async () => {
    process.env.OPENAI_API_KEY = "sk-bad-key";
    vi.stubGlobal("fetch", vi.fn(async () => new Response("unauthorized", { status: 401 })));

    const response = await testOpenAi(request("http://localhost/api/ai/openai/test"));
    expect(response.status).toBe(401);
    const raw = await response.text();
    expect(raw).not.toContain("sk-bad-key");
  });
});

describe("POST /api/ai/fal/test", () => {
  const originalKey = process.env.FAL_KEY;
  const originalModel = process.env.FAL_VIDEO_MODEL;

  beforeEach(() => {
    delete process.env.FAL_KEY;
    delete process.env.FAL_VIDEO_MODEL;
  });

  afterEach(() => {
    _resetSessionCredentialsForTests();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    if (originalKey === undefined) delete process.env.FAL_KEY;
    else process.env.FAL_KEY = originalKey;
    if (originalModel === undefined) delete process.env.FAL_VIDEO_MODEL;
    else process.env.FAL_VIDEO_MODEL = originalModel;
  });

  it("reports NOT_CONFIGURED when no key exists", async () => {
    const response = await testFal(request("http://localhost/api/ai/fal/test"));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ code: "NOT_CONFIGURED" });
  });

  it("uses only the free auth-token endpoint, never a generation/queue call", async () => {
    process.env.FAL_KEY = "fal-server-key";
    process.env.FAL_VIDEO_MODEL = "fal-ai/current-video-model/text-to-video";
    const fetchSpy = vi.fn(async (..._args: unknown[]) => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);

    const response = await testFal(request("http://localhost/api/ai/fal/test"));
    expect(response.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0][0]).toContain("/tokens/");
    expect(fetchSpy.mock.calls[0][0]).not.toContain("queue.fal.run");
    const requestInit = fetchSpy.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(requestInit.body))).toEqual({
      allowed_apps: ["current-video-model"],
      token_expiration: 120,
    });
  });
});
