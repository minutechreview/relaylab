import { afterEach, describe, expect, it, vi } from "vitest";

import { resolveFalCredential, resolveOpenAiKey } from "@/lib/credentials/resolveCredentials";
import {
  _resetSessionCredentialsForTests,
  clearAllSessionCredentials,
  clearSessionCredential,
  getSessionCredentials,
  maskKeySuffix,
  setSessionCredential,
} from "@/lib/credentials/sessionCredentials";

afterEach(() => {
  _resetSessionCredentialsForTests();
  vi.unstubAllEnvs();
});

describe("session credential store", () => {
  it("stores and retrieves a credential scoped to one session id", () => {
    setSessionCredential("session-a", { openaiApiKey: "sk-test-1234" });
    expect(getSessionCredentials("session-a")).toMatchObject({ openaiApiKey: "sk-test-1234" });
    expect(getSessionCredentials("session-b")).toEqual({});
  });

  it("treats an empty string as clearing a field rather than storing it", () => {
    setSessionCredential("session-a", { openaiApiKey: "sk-test" });
    setSessionCredential("session-a", { openaiApiKey: "" });
    expect(getSessionCredentials("session-a").openaiApiKey).toBeUndefined();
  });

  it("clears a single credential without touching others in the same session", () => {
    setSessionCredential("session-a", { openaiApiKey: "sk-test", falApiKey: "fal-test" });
    clearSessionCredential("session-a", "openaiApiKey");
    expect(getSessionCredentials("session-a")).toEqual({ falApiKey: "fal-test" });
  });

  it("clears all credentials for a session", () => {
    setSessionCredential("session-a", { openaiApiKey: "sk-test", falApiKey: "fal-test" });
    clearAllSessionCredentials("session-a");
    expect(getSessionCredentials("session-a")).toEqual({});
  });

  it("returns an empty object for an unknown or missing session id", () => {
    expect(getSessionCredentials(undefined)).toEqual({});
    expect(getSessionCredentials(null)).toEqual({});
    expect(getSessionCredentials("never-set")).toEqual({});
  });

  it("masks a key to only its last four characters", () => {
    expect(maskKeySuffix("sk-abcdefgh1234X9a2")).toBe("••••X9a2");
    expect(maskKeySuffix("")).toBe("••••");
  });
});

describe("credential precedence: session > server env > not configured", () => {
  it("prefers a session OpenAI key over a server env key", () => {
    setSessionCredential("session-a", { openaiApiKey: "session-key" });
    const resolved = resolveOpenAiKey("session-a", { OPENAI_API_KEY: "server-key" });
    expect(resolved).toEqual({ value: "session-key", source: "session" });
  });

  it("falls back to the server env key when no session key is set", () => {
    const resolved = resolveOpenAiKey("session-a", { OPENAI_API_KEY: "server-key" });
    expect(resolved).toEqual({ value: "server-key", source: "server" });
  });

  it("reports not configured when neither session nor server has a key", () => {
    const resolved = resolveOpenAiKey("session-a", {});
    expect(resolved).toEqual({ value: null, source: "none" });
  });

  it("resolves fal.ai key and model independently with the same precedence", () => {
    setSessionCredential("session-a", { falApiKey: "session-fal" });
    const resolved = resolveFalCredential("session-a", {
      FAL_KEY: "server-fal",
      FAL_VIDEO_MODEL: "server-model",
    });
    expect(resolved.apiKey).toEqual({ value: "session-fal", source: "session" });
    expect(resolved.model).toEqual({ value: "server-model", source: "server" });
  });
});
