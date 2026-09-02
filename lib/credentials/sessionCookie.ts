import { decodeCredentialsCookiePayload, encodeCredentialsCookiePayload } from "./credentialCookieCodec";
import { createSessionId, SESSION_COOKIE_NAME, setSessionCredential, type SessionCredentials } from "./sessionCredentials";

const ID_PATTERN = /^[a-f0-9-]{10,80}$/i;

/**
 * Cookie value is `<sessionId>` or `<sessionId>.<encryptedCredentialsBlob>`.
 * The blob (present only when `SESSION_ENCRYPTION_KEY` is configured) is the
 * durable, cross-instance copy of this session's credentials — necessary
 * because the in-memory `sessionCredentials` Map is local to one server
 * process and does not survive a different serverless instance handling the
 * next request. On every read, a present blob is decrypted and used to
 * rehydrate the local Map for this id, so `getSessionCredentials(sessionId)`
 * transparently sees the right data regardless of which instance saved it.
 */
function parseCookieValue(raw: string | undefined): string | null {
  if (!raw) return null;
  const [id, blob] = raw.split(".", 2);
  if (!id || !ID_PATTERN.test(id)) return null;
  if (blob) {
    const decrypted = decodeCredentialsCookiePayload(blob);
    if (decrypted) setSessionCredential(id, decrypted);
  }
  return id;
}

function extractCookieValue(request: Request): string | undefined {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const match = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE_NAME}=`));
  return match?.slice(SESSION_COOKIE_NAME.length + 1);
}

/**
 * Reads the session id from the request's cookie header, or mints a new one.
 * Returns both the id to use for this request and whether a new cookie needs
 * to be set on the response. As a side effect, rehydrates the in-memory
 * credential store from the cookie's encrypted blob, if present.
 */
export function readOrCreateSessionId(request: Request): { sessionId: string; isNew: boolean } {
  const id = parseCookieValue(extractCookieValue(request));
  if (id) return { sessionId: id, isNew: false };
  return { sessionId: createSessionId(), isNew: true };
}

export function readSessionId(request: Request): string | null {
  return parseCookieValue(extractCookieValue(request));
}

export function sessionCookieHeader(
  sessionId: string,
  credentials: SessionCredentials,
  options: { secure?: boolean } = {},
): string {
  const secure = options.secure ?? process.env.NODE_ENV === "production";
  const blob = encodeCredentialsCookiePayload(credentials);
  const value = blob ? `${sessionId}.${blob}` : sessionId;
  // HttpOnly prevents client-side key-session access; SameSite=Strict blocks
  // cross-site requests; Secure is mandatory for production/HTTPS while an
  // explicit localhost development call may opt out.
  return `${SESSION_COOKIE_NAME}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400${secure ? "; Secure" : ""}`;
}
