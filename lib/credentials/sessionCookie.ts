import { createSessionId, SESSION_COOKIE_NAME } from "./sessionCredentials";

/**
 * Reads the session id from the request's cookie header, or mints a new one.
 * Returns both the id to use for this request and whether a new cookie needs
 * to be set on the response.
 */
export function readOrCreateSessionId(request: Request): { sessionId: string; isNew: boolean } {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const match = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE_NAME}=`));
  const existing = match?.slice(SESSION_COOKIE_NAME.length + 1);
  if (existing && /^[a-f0-9-]{10,80}$/i.test(existing)) {
    return { sessionId: existing, isNew: false };
  }
  return { sessionId: createSessionId(), isNew: true };
}

export function readSessionId(request: Request): string | null {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const match = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE_NAME}=`));
  const existing = match?.slice(SESSION_COOKIE_NAME.length + 1);
  return existing && /^[a-f0-9-]{10,80}$/i.test(existing) ? existing : null;
}

export function sessionCookieHeader(
  sessionId: string,
  options: { secure?: boolean } = {},
): string {
  const secure = options.secure ?? process.env.NODE_ENV === "production";
  // HttpOnly prevents client-side key-session access; SameSite=Strict blocks
  // cross-site requests; Secure is mandatory for production/HTTPS while an
  // explicit localhost development call may opt out.
  return `${SESSION_COOKIE_NAME}=${sessionId}; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400${secure ? "; Secure" : ""}`;
}
