import { afterEach, describe, expect, it, vi } from "vitest";

import { _resetSessionCredentialsForTests } from "@/lib/credentials/sessionCredentials";

import { DELETE, GET, POST } from "@/app/api/ai/credentials/route";

function jsonRequest(
  method: string,
  body: unknown,
  headers: Record<string, string> = {},
  url = "http://localhost/api/ai/credentials",
) {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

afterEach(() => {
  _resetSessionCredentialsForTests();
  vi.unstubAllEnvs();
});

describe("GET /api/ai/credentials", () => {
  it("reports not_configured for both providers with no session cookie", async () => {
    const response = await GET(new Request("http://localhost/api/ai/credentials"));
    const payload = await response.json();
    expect(payload).toEqual({
      ok: true,
      openai: { status: "not_configured" },
      fal: { status: "not_configured", model: null },
    });
  });

  it("never returns a key or key suffix in the status response", async () => {
    const setResponse = await POST(
      jsonRequest("POST", { provider: "openai", apiKey: "sk-super-secret-123456" }),
    );
    const cookie = setResponse.headers.get("set-cookie");
    expect(cookie).toBeTruthy();
    const sessionId = cookie!.split(";")[0].split("=")[1];

    const statusResponse = await GET(jsonRequest("GET", undefined, { cookie: `relaylab_session=${sessionId}` }));
    const raw = await statusResponse.text();
    expect(raw).not.toContain("sk-super-secret-123456");
    expect(raw).not.toContain("123456");
    const payload = JSON.parse(raw);
    expect(payload.openai.status).toBe("available");
  });
});

describe("POST /api/ai/credentials", () => {
  it("rejects an empty key", async () => {
    const response = await POST(jsonRequest("POST", { provider: "openai", apiKey: "" }));
    expect(response.status).toBe(400);
  });

  it("sets a session cookie and reports the masked suffix only", async () => {
    const response = await POST(jsonRequest("POST", { provider: "openai", apiKey: "sk-abcd1234" }));
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload).toMatchObject({ ok: true, provider: "openai", status: "available", masked: "••••1234" });
    expect(payload.masked).not.toContain("sk-abcd1234");
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).toContain("SameSite=Strict");
  });

  it("marks the BYOK session cookie Secure on HTTPS while allowing local HTTP development", async () => {
    const secureResponse = await POST(
      jsonRequest(
        "POST",
        { provider: "openai", apiKey: "sk-secure1234" },
        { origin: "https://relaylab.example" },
        "https://relaylab.example/api/ai/credentials",
      ),
    );
    expect(secureResponse.headers.get("set-cookie")).toContain("; Secure");

    const localResponse = await POST(
      jsonRequest("POST", { provider: "openai", apiKey: "sk-local1234" }),
    );
    expect(localResponse.headers.get("set-cookie")).not.toContain("; Secure");
  });

  it("rejects cross-origin requests", async () => {
    const response = await POST(
      jsonRequest("POST", { provider: "openai", apiKey: "sk-abcd1234" }, { origin: "https://evil.example" }),
    );
    expect(response.status).toBe(403);
  });
});

describe("DELETE /api/ai/credentials", () => {
  it("clears a single provider without affecting the other", async () => {
    const setResponse = await POST(jsonRequest("POST", { provider: "openai", apiKey: "sk-abcd1234" }));
    const cookie = setResponse.headers.get("set-cookie")!.split(";")[0];
    await POST(
      jsonRequest("POST", { provider: "fal", apiKey: "fal-key-1", model: "fal-ai/some-model" }, { cookie }),
    );

    await DELETE(jsonRequest("DELETE", { provider: "openai" }, { cookie }));

    const status = await GET(jsonRequest("GET", undefined, { cookie }));
    const payload = await status.json();
    expect(payload.openai.status).toBe("not_configured");
    expect(payload.fal.status).toBe("available");
  });

  it("clears all credentials for the session", async () => {
    const setResponse = await POST(jsonRequest("POST", { provider: "openai", apiKey: "sk-abcd1234" }));
    const cookie = setResponse.headers.get("set-cookie")!.split(";")[0];

    await DELETE(jsonRequest("DELETE", { provider: "all" }, { cookie }));

    const status = await GET(jsonRequest("GET", undefined, { cookie }));
    const payload = await status.json();
    expect(payload.openai.status).toBe("not_configured");
  });
});

describe("cross-instance persistence (serverless: no shared process memory)", () => {
  it("survives losing the in-memory store between requests when SESSION_ENCRYPTION_KEY is set", async () => {
    vi.stubEnv("SESSION_ENCRYPTION_KEY", "test-only-secret-do-not-use-in-prod");

    const setResponse = await POST(
      jsonRequest("POST", { provider: "fal", apiKey: "fal-secret-key", model: "fal-ai/some-model" }),
    );
    const cookie = setResponse.headers.get("set-cookie")!.split(";")[0];
    // The cookie value must carry more than the bare session id for this
    // test to be meaningful — otherwise a fresh instance has nothing to
    // rehydrate from.
    expect(cookie.split("=")[1]).toContain(".");

    // Simulate a different serverless instance handling the next request:
    // the in-memory Map is empty, only the cookie survives.
    _resetSessionCredentialsForTests();

    const status = await GET(jsonRequest("GET", undefined, { cookie }));
    const payload = await status.json();
    expect(payload.fal.status).toBe("available");
    expect(payload.fal.model).toBe("fal-ai/some-model");
  });

  it("DELETE re-issues the cookie so the post-clear state is what a fresh instance rehydrates", async () => {
    vi.stubEnv("SESSION_ENCRYPTION_KEY", "test-only-secret-do-not-use-in-prod");

    const setResponse = await POST(jsonRequest("POST", { provider: "openai", apiKey: "sk-to-be-cleared" }));
    const preDeleteCookie = setResponse.headers.get("set-cookie")!.split(";")[0];

    const deleteResponse = await DELETE(jsonRequest("DELETE", { provider: "openai" }, { cookie: preDeleteCookie }));
    const freshCookie = deleteResponse.headers.get("set-cookie")!.split(";")[0];
    expect(freshCookie).not.toBe(preDeleteCookie);

    // A different instance rehydrating from the cookie DELETE actually
    // returned sees the cleared state, with no in-memory history at all.
    _resetSessionCredentialsForTests();
    const freshRead = await GET(jsonRequest("GET", undefined, { cookie: freshCookie }));
    expect((await freshRead.json()).openai.status).toBe("not_configured");

    // Known, accepted tradeoff of embedding state in the cookie itself
    // (no server-side revocation list): a *pre-delete* cookie value, if
    // manually replayed, still decrypts to the old key. This is not
    // reachable in normal single-browser use — a compliant browser always
    // adopts the newest Set-Cookie from the same-origin DELETE response
    // before its next request — so it is not a regression versus the prior
    // in-memory-only design, which had the same "old cookie = old session"
    // property. Documented here rather than silently assumed.
    _resetSessionCredentialsForTests();
    const staleRead = await GET(jsonRequest("GET", undefined, { cookie: preDeleteCookie }));
    expect((await staleRead.json()).openai.status).toBe("available");
  });

  it("without SESSION_ENCRYPTION_KEY, falls back to the pre-existing in-memory-only behavior", async () => {
    const setResponse = await POST(jsonRequest("POST", { provider: "openai", apiKey: "sk-no-encryption-key" }));
    const cookie = setResponse.headers.get("set-cookie")!.split(";")[0];
    // No key configured -> cookie value is the bare session id, no blob.
    expect(cookie.split("=")[1]).not.toContain(".");

    const status = await GET(jsonRequest("GET", undefined, { cookie }));
    expect((await status.json()).openai.status).toBe("available");
  });
});
