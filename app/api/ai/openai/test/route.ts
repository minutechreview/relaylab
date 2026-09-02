import { NextResponse } from "next/server";

import { resolveOpenAiKey } from "@/lib/credentials/resolveCredentials";
import { readSessionId } from "@/lib/credentials/sessionCookie";
import { isSameOriginRequest } from "@/lib/security/sameOrigin";

export const runtime = "nodejs";
export const maxDuration = 30;

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json({ ok: false, code, message }, { status });
}

/**
 * Validates an OpenAI key with the cheapest available check: an
 * authenticated `GET /v1/models` list call. This does not burn a
 * transcription or vision call — it only confirms the key authenticates.
 */
export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return errorResponse(403, "CROSS_ORIGIN_REJECTED", "Test-connection requests must come from the editor's own origin.");
  }

  const sessionId = readSessionId(request);
  const resolved = resolveOpenAiKey(sessionId);
  if (!resolved.value) {
    return errorResponse(503, "NOT_CONFIGURED", "No OpenAI API key is configured for this session or server.");
  }

  try {
    const response = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${resolved.value}` },
      signal: request.signal,
    });
    if (!response.ok) {
      return errorResponse(
        response.status === 401 ? 401 : 502,
        response.status === 401 ? "INVALID_KEY" : "PROVIDER_ERROR",
        response.status === 401
          ? "OpenAI rejected this key."
          : `OpenAI's models endpoint returned ${response.status}.`,
      );
    }
    return NextResponse.json({ ok: true, provider: "openai" });
  } catch (error) {
    return errorResponse(
      502,
      "PROVIDER_UNREACHABLE",
      error instanceof Error ? error.message : "Could not reach OpenAI to validate the key.",
    );
  }
}
