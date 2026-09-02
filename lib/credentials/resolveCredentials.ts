import { getSessionCredentials, type SessionCredentials } from "./sessionCredentials";

export type CredentialSource = "session" | "server" | "none";

export interface ResolvedCredential {
  value: string | null;
  source: CredentialSource;
}

/**
 * Precedence: session BYOK key > server env var > not configured.
 *
 * The `source` is for internal route logic only (e.g. choosing whether a
 * later failure is retryable). Never send `source` to the client — that
 * would leak whether a server-level secret exists, which the settings UI
 * must never reveal.
 */
export function resolveOpenAiKey(
  sessionId: string | undefined | null,
  env: Readonly<Record<string, string | undefined>> = process.env,
): ResolvedCredential {
  const session = getSessionCredentials(sessionId);
  if (session.openaiApiKey) return { value: session.openaiApiKey, source: "session" };
  const serverKey = env.OPENAI_API_KEY?.trim();
  if (serverKey) return { value: serverKey, source: "server" };
  return { value: null, source: "none" };
}

export function resolveFalCredential(
  sessionId: string | undefined | null,
  env: Readonly<Record<string, string | undefined>> = process.env,
): { apiKey: ResolvedCredential; model: ResolvedCredential } {
  const session = getSessionCredentials(sessionId);
  const apiKey: ResolvedCredential = session.falApiKey
    ? { value: session.falApiKey, source: "session" }
    : env.FAL_KEY?.trim()
      ? { value: env.FAL_KEY.trim(), source: "server" }
      : { value: null, source: "none" };
  const model: ResolvedCredential = session.falModel
    ? { value: session.falModel, source: "session" }
    : env.FAL_VIDEO_MODEL?.trim()
      ? { value: env.FAL_VIDEO_MODEL.trim(), source: "server" }
      : { value: null, source: "none" };
  return { apiKey, model };
}

/**
 * Client-safe status summary: "available" / "not configured" only. Never
 * reveals whether the underlying source is a session key or a server env
 * var — that distinction must not leak to the browser.
 */
export function credentialStatus(resolved: ResolvedCredential): "available" | "not_configured" {
  return resolved.value ? "available" : "not_configured";
}

export type { SessionCredentials };
