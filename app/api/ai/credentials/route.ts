import { NextResponse } from "next/server";
import { z } from "zod";

import { resolveFalCredential, resolveOpenAiKey } from "@/lib/credentials/resolveCredentials";
import { readOrCreateSessionId, readSessionId, sessionCookieHeader } from "@/lib/credentials/sessionCookie";
import {
  clearAllSessionCredentials,
  clearSessionCredential,
  getSessionCredentials,
  maskKeySuffix,
  setSessionCredential,
} from "@/lib/credentials/sessionCredentials";
import { isSameOriginRequest } from "@/lib/security/sameOrigin";

export const runtime = "nodejs";

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json({ ok: false, code, message }, { status });
}

/**
 * GET returns only "available"/"not configured" per provider — never a key,
 * never a key suffix, and never which layer (session vs. server env)
 * supplied it. That distinction must not leak to the client.
 */
export async function GET(request: Request) {
  const sessionId = readSessionId(request);
  const openai = resolveOpenAiKey(sessionId);
  const fal = resolveFalCredential(sessionId);
  return NextResponse.json({
    ok: true,
    openai: { status: openai.value ? "available" : "not_configured" },
    fal: {
      status: fal.apiKey.value && fal.model.value ? "available" : "not_configured",
      model: fal.model.value ?? null,
    },
  });
}

const setCredentialSchema = z
  .object({
    provider: z.enum(["openai", "fal"]),
    apiKey: z.string().trim().min(1).max(500),
    model: z.string().trim().min(1).max(200).optional(),
  })
  .strict();

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return errorResponse(403, "CROSS_ORIGIN_REJECTED", "Credential requests must come from the editor's own origin.");
  }

  const rawBody = await request.json().catch(() => null);
  const parsed = setCredentialSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        code: "INVALID_CREDENTIAL",
        message: "Provide a provider and a non-empty API key.",
        issues: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
      },
      { status: 400 },
    );
  }

  const { sessionId } = readOrCreateSessionId(request);
  const { provider, apiKey, model } = parsed.data;

  const merged =
    provider === "openai"
      ? setSessionCredential(sessionId, { openaiApiKey: apiKey })
      : setSessionCredential(sessionId, {
          falApiKey: apiKey,
          ...(model ? { falModel: model } : {}),
        });

  const response = NextResponse.json({
    ok: true,
    provider,
    status: "available" as const,
    masked: maskKeySuffix(apiKey),
  });
  // Always re-issue the cookie (not just on first save): the encrypted
  // blob embeds the full credential state so a different serverless
  // instance can rehydrate it on the next request. See sessionCookie.ts.
  const secure = process.env.NODE_ENV === "production" || new URL(request.url).protocol === "https:";
  response.headers.append("set-cookie", sessionCookieHeader(sessionId, merged, { secure }));
  return response;
}

const deleteCredentialSchema = z
  .object({
    provider: z.enum(["openai", "fal", "all"]),
  })
  .strict();

export async function DELETE(request: Request) {
  if (!isSameOriginRequest(request)) {
    return errorResponse(403, "CROSS_ORIGIN_REJECTED", "Credential requests must come from the editor's own origin.");
  }

  const rawBody = await request.json().catch(() => ({ provider: "all" }));
  const parsed = deleteCredentialSchema.safeParse(rawBody);
  if (!parsed.success) {
    return errorResponse(400, "INVALID_REQUEST", "provider must be one of openai, fal, all.");
  }

  const sessionId = readSessionId(request);
  if (!sessionId) {
    return NextResponse.json({ ok: true, cleared: [] });
  }

  if (parsed.data.provider === "all") {
    clearAllSessionCredentials(sessionId);
  } else if (parsed.data.provider === "openai") {
    clearSessionCredential(sessionId, "openaiApiKey");
  } else {
    clearSessionCredential(sessionId, "falApiKey");
    clearSessionCredential(sessionId, "falModel");
  }

  const response = NextResponse.json({
    ok: true,
    cleared: parsed.data.provider === "all" ? ["openai", "fal"] : [parsed.data.provider],
  });
  // Re-issue the cookie with the post-clear state so a stale encrypted blob
  // (from a different serverless instance) can't resurrect a cleared key.
  const secure = process.env.NODE_ENV === "production" || new URL(request.url).protocol === "https:";
  response.headers.append(
    "set-cookie",
    sessionCookieHeader(sessionId, getSessionCredentials(sessionId), { secure }),
  );
  return response;
}
