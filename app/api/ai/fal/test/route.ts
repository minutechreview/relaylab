import { NextResponse } from "next/server";

import { resolveFalCredential } from "@/lib/credentials/resolveCredentials";
import { readSessionId } from "@/lib/credentials/sessionCookie";
import { isSameOriginRequest } from "@/lib/security/sameOrigin";

export const runtime = "nodejs";
export const maxDuration = 30;
const TOKEN_EXPIRATION_SECONDS = 120;

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json({ ok: false, code, message }, { status });
}

function modelAlias(model: string): string | null {
  const parts = model.split("/").filter(Boolean);
  const alias = parts[0] === "workflows" || parts[0] === "comfy" ? parts[2] : parts[1];
  return alias?.trim() || null;
}

/**
 * fal.ai has no documented free-standing "list models"/"whoami" endpoint.
 * The cheapest genuine auth-only call available is `POST
 * https://rest.alpha.fal.ai/tokens/`, which fal.ai's own client SDK uses to
 * mint short-lived realtime tokens — it authenticates the key without
 * running or queuing any model, so it does not spend generation credits.
 * If this endpoint ever stops being auth-only, prefer failing this check
 * honestly over silently falling back to a real generation call.
 */
export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return errorResponse(403, "CROSS_ORIGIN_REJECTED", "Test-connection requests must come from the editor's own origin.");
  }

  const sessionId = readSessionId(request);
  const { apiKey, model } = resolveFalCredential(sessionId);
  if (!apiKey.value || !model.value) {
    return errorResponse(503, "NOT_CONFIGURED", "No complete fal.ai key and model configuration is available for this session or server.");
  }
  const allowedApp = modelAlias(model.value);
  if (!allowedApp) {
    return errorResponse(400, "INVALID_MODEL", "Use a fal.ai model ID in owner/model format.");
  }

  try {
    const response = await fetch("https://rest.alpha.fal.ai/tokens/", {
      method: "POST",
      headers: {
        Authorization: `Key ${apiKey.value}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        allowed_apps: [allowedApp],
        token_expiration: TOKEN_EXPIRATION_SECONDS,
      }),
      signal: request.signal,
    });
    if (response.status === 401 || response.status === 403) {
      return errorResponse(401, "INVALID_KEY", "fal.ai rejected this key.");
    }
    if (!response.ok) {
      return errorResponse(502, "PROVIDER_ERROR", `fal.ai's auth endpoint returned ${response.status}.`);
    }
    return NextResponse.json({ ok: true, provider: "fal" });
  } catch {
    return errorResponse(
      502,
      "PROVIDER_UNREACHABLE",
      "Could not reach fal.ai to validate the key.",
    );
  }
}
