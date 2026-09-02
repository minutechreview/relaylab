/**
 * Session-scoped BYOK credential store.
 *
 * Mechanism, stated honestly: a plain in-memory `Map<sessionId, Credentials>`
 * on the Node.js server process, keyed by an opaque random session id carried
 * in an httpOnly, SameSite=strict cookie (`relaylab_session`). There is no
 * database, no disk write, no encryption at rest beyond process memory.
 *
 * Real limitations:
 * - Lost on server restart or redeploy — there is no persistence layer.
 * - Not shared across server instances/replicas; a multi-instance deployment
 *   would need sticky sessions or a shared store, neither of which exists here.
 * - Scoped to one browser via the session cookie, not to one human across
 *   devices/browsers.
 * - No idle/absolute expiry beyond the cookie's own `maxAge`; entries persist
 *   in memory until explicitly cleared or the process restarts. Good enough
 *   for a hackathon demo session, not a production secrets vault.
 *
 * Keys never leave this module in plaintext except to the two places that
 * legitimately need them: the outbound OpenAI/fal.ai HTTP call itself, and
 * (masked only, e.g. "Configured ••••X9a2") the settings-status API response.
 */

export interface SessionCredentials {
  openaiApiKey?: string;
  falApiKey?: string;
  falModel?: string;
}

const store = new Map<string, SessionCredentials>();

export const SESSION_COOKIE_NAME = "relaylab_session";

export function createSessionId(): string {
  return crypto.randomUUID();
}

export function getSessionCredentials(sessionId: string | undefined | null): SessionCredentials {
  if (!sessionId) return {};
  return store.get(sessionId) ?? {};
}

export function setSessionCredential(
  sessionId: string,
  patch: Partial<SessionCredentials>,
): SessionCredentials {
  const current = store.get(sessionId) ?? {};
  const next: SessionCredentials = { ...current, ...patch };
  // Drop empty-string values instead of storing them, so "" reliably means
  // "not configured" everywhere else in the codebase.
  for (const key of Object.keys(next) as (keyof SessionCredentials)[]) {
    if (next[key] === "") delete next[key];
  }
  store.set(sessionId, next);
  return next;
}

export function clearSessionCredential(
  sessionId: string,
  key: keyof SessionCredentials,
): void {
  const current = store.get(sessionId);
  if (!current) return;
  const { [key]: _removed, ...rest } = current;
  if (Object.keys(rest).length === 0) {
    store.delete(sessionId);
  } else {
    store.set(sessionId, rest);
  }
}

export function clearAllSessionCredentials(sessionId: string): void {
  store.delete(sessionId);
}

/** Test-only escape hatch; never called from production code paths. */
export function _resetSessionCredentialsForTests(): void {
  store.clear();
}

/** Mask a key for display, e.g. "sk-abc...X9a2" -> "••••X9a2". Never returns the full key. */
export function maskKeySuffix(key: string): string {
  const suffix = key.slice(-4);
  return suffix.length > 0 ? `••••${suffix}` : "••••";
}
