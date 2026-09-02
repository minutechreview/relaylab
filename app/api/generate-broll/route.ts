import { NextResponse } from "next/server";
import { z } from "zod";

import { resolveFalCredential } from "@/lib/credentials/resolveCredentials";
import { readSessionId } from "@/lib/credentials/sessionCookie";
import { createFalVideoGenerator } from "@/lib/generation/videoGenerator";
import { isSameOriginRequest } from "@/lib/security/sameOrigin";

export const runtime = "nodejs";
export const maxDuration = 300;

const requestSchema = z
  .object({
    prompt: z.string().trim().min(10).max(1_000),
    duration: z.number().finite().min(1).max(10).default(5),
    aspectRatio: z.enum(["16:9", "9:16", "1:1"]).default("16:9"),
  })
  .strict();

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json({ ok: false, code, message }, { status });
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return errorResponse(
      403,
      "CROSS_ORIGIN_GENERATION_REJECTED",
      "Video generation requests must come from the editor's own origin.",
    );
  }
  if (request.headers.get("x-relaylab-human-action") !== "generate") {
    return errorResponse(
      403,
      "HUMAN_CONFIRMATION_REQUIRED",
      "Video generation starts only from the human Generate Clip control.",
    );
  }

  const rawBody = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        code: "INVALID_GENERATION_REQUEST",
        message: "The generation prompt, duration, or aspect ratio is invalid.",
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
      { status: 400 },
    );
  }

  const { apiKey, model } = resolveFalCredential(readSessionId(request));
  if (!apiKey.value || !model.value) {
    return errorResponse(
      503,
      "GENERATION_UNAVAILABLE",
      "Video generation is unavailable in demo mode. Add your own fal.ai key and model in Settings, or configure FAL_KEY and FAL_VIDEO_MODEL on the server.",
    );
  }
  if (
    apiKey.source === "server" &&
    process.env.FAL_ALLOW_REMOTE_GENERATION !== "true"
  ) {
    return errorResponse(
      503,
      "SERVER_GENERATION_DISABLED",
      "Server-funded video generation is disabled. Use a session BYOK key, keep the credential-free suggestion flow, or explicitly secure and enable a private demo.",
    );
  }
  const generator = createFalVideoGenerator({ apiKey: apiKey.value, model: model.value });

  try {
    const result = await generator.generate(parsed.data, { signal: request.signal });
    return NextResponse.json({
      ok: true,
      result,
    });
  } catch (error) {
    console.error("fal.ai generation failed", error);
    return errorResponse(
      502,
      "GENERATION_PROVIDER_ERROR",
      "Video generation failed at the provider. The suggestion was preserved so you can retry.",
    );
  }
}
