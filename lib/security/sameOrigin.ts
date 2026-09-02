/**
 * Same-origin check for state-changing routes (credentials, generation,
 * transcription, analysis). Compares the browser-sent `Origin` header
 * against the request's effective host rather than the full URL string.
 *
 * A raw `origin === new URL(request.url).origin` comparison breaks behind
 * any TLS-terminating reverse proxy (Cloudflare Tunnel, Vercel, etc.):
 * the browser's Origin is `https://<public-host>`, but the origin server
 * receives a plain-HTTP loopback request, so `request.url` resolves to
 * `http://<public-host>` — same host, different scheme, and the strict
 * string match rejects a legitimate same-origin request. Scheme is not
 * a trustworthy signal past a proxy hop, so it is intentionally excluded;
 * `x-forwarded-host` (or `host` as a fallback) is not attacker-controlled
 * for requests that actually reach this origin through the deployment's
 * own proxy, so comparing hosts preserves the cross-origin rejection this
 * check exists for.
 */
export function isSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;

  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return false;
  }

  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? new URL(request.url).host;

  return originHost === host;
}
