import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST as testFal } from "@/app/api/ai/fal/test/route";
import { POST as testOpenAi } from "@/app/api/ai/openai/test/route";
import { _resetSessionCredentialsForTests } from "@/lib/credentials/sessionCredentials";

function request(url: string, headers: Record<string, string> = {}) {
  return new Request(url, { method: "POST", headers });
}

const originalOpenAiKey = process.env.OPENAI_API_KEY;
const originalFalKey = process.env.FAL_KEY;
const originalFalModel = process.env.FAL_VIDEO_MODEL;

describe("provider connection route guard branches", () => {
  beforeEach(() => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.FAL_KEY;
    delete process.env.FAL_VIDEO_MODEL;
  });

  afterEach(() => {
    _resetSessionCredentialsForTests();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();

    if (originalOpenAiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalOpenAiKey;
    if (originalFalKey === undefined) delete process.env.FAL_KEY;
    else process.env.FAL_KEY = originalFalKey;
    if (originalFalModel === undefined) delete process.env.FAL_VIDEO_MODEL;
    else process.env.FAL_VIDEO_MODEL = originalFalModel;
  });

  it("rejects cross-origin provider tests before reading credentials", async () => {
    const headers = { origin: "https://attacker.example" };
    const [openAiResponse, falResponse] = await Promise.all([
      testOpenAi(request("https://relaylab.example/api/ai/openai/test", headers)),
      testFal(request("https://relaylab.example/api/ai/fal/test", headers)),
    ]);

    expect(openAiResponse.status).toBe(403);
    expect(falResponse.status).toBe(403);
    await expect(openAiResponse.json()).resolves.toMatchObject({
      code: "CROSS_ORIGIN_REJECTED",
    });
    await expect(falResponse.json()).resolves.toMatchObject({
      code: "CROSS_ORIGIN_REJECTED",
    });
  });

  it("normalizes non-auth OpenAI provider errors without exposing the key", async () => {
    process.env.OPENAI_API_KEY = "sk-private";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("provider down", { status: 503 })),
    );

    const response = await testOpenAi(
      request("https://relaylab.example/api/ai/openai/test"),
    );
    expect(response.status).toBe(502);
    const body = await response.text();
    expect(body).toContain("PROVIDER_ERROR");
    expect(body).toContain("returned 503");
    expect(body).not.toContain("sk-private");
  });

  it("reports non-Error OpenAI transport failures with a safe fallback", async () => {
    process.env.OPENAI_API_KEY = "sk-private";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw "offline";
      }),
    );

    const response = await testOpenAi(
      request("https://relaylab.example/api/ai/openai/test"),
    );
    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({
      code: "PROVIDER_UNREACHABLE",
      message: "Could not reach OpenAI to validate the key.",
    });
  });

  it("treats fal 403 as an invalid credential", async () => {
    process.env.FAL_KEY = "fal-private";
    process.env.FAL_VIDEO_MODEL = "fal-ai/current-video-model";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("forbidden", { status: 403 })),
    );

    const response = await testFal(
      request("https://relaylab.example/api/ai/fal/test"),
    );
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ code: "INVALID_KEY" });
  });

  it("accepts only 2xx fal authentication responses", async () => {
    process.env.FAL_KEY = "fal-private";
    process.env.FAL_VIDEO_MODEL = "fal-ai/current-video-model";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("down", { status: 500 }))
      .mockResolvedValueOnce(new Response("bad request", { status: 400 }))
      .mockResolvedValueOnce(new Response("token", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const failed = await testFal(
      request("https://relaylab.example/api/ai/fal/test"),
    );
    expect(failed.status).toBe(502);
    await expect(failed.json()).resolves.toMatchObject({ code: "PROVIDER_ERROR" });

    const rejectedValidation = await testFal(
      request("https://relaylab.example/api/ai/fal/test"),
    );
    expect(rejectedValidation.status).toBe(502);
    await expect(rejectedValidation.json()).resolves.toMatchObject({ code: "PROVIDER_ERROR" });

    const authenticated = await testFal(request("https://relaylab.example/api/ai/fal/test"));
    expect(authenticated.status).toBe(200);
    await expect(authenticated.json()).resolves.toMatchObject({
      ok: true,
      provider: "fal",
    });
  });

  it("reports non-Error fal transport failures with a safe fallback", async () => {
    process.env.FAL_KEY = "fal-private";
    process.env.FAL_VIDEO_MODEL = "fal-ai/current-video-model";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw "offline";
      }),
    );

    const response = await testFal(
      request("https://relaylab.example/api/ai/fal/test"),
    );
    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({
      code: "PROVIDER_UNREACHABLE",
      message: "Could not reach fal.ai to validate the key.",
    });
  });
});
