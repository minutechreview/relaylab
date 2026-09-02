import { NextResponse } from "next/server";
import { z } from "zod";

import {
  analyzeBrollAsset,
  clampMaxMoments,
  MAX_MOMENTS_PER_ASSET_CEILING,
} from "@/lib/analysis/analyzeBrollAsset";
import { createOpenAiVisionProvider } from "@/lib/analysis/describeMoment";
import { resolveOpenAiKey } from "@/lib/credentials/resolveCredentials";
import { readSessionId } from "@/lib/credentials/sessionCookie";
import { isSameOriginRequest } from "@/lib/security/sameOrigin";

export const runtime = "nodejs";
export const maxDuration = 300;

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json({ ok: false, code, message }, { status });
}

const DATA_URL_PATTERN = /^data:image\/(jpeg|png|webp);base64,/;
const MAX_FRAME_IMAGE_BYTES = 1024 * 1024;
const MAX_ANALYSIS_BODY_BYTES = 16 * 1024 * 1024;

type JsonBodyResult =
  | { ok: true; value: unknown }
  | { ok: false; tooLarge: boolean };

async function readBoundedJson(request: Request): Promise<JsonBodyResult> {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_ANALYSIS_BODY_BYTES) {
    return { ok: false, tooLarge: true };
  }
  if (!request.body) return { ok: false, tooLarge: false };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > MAX_ANALYSIS_BODY_BYTES) {
      await reader.cancel("Analysis request exceeded the body limit.");
      return { ok: false, tooLarge: true };
    }
    chunks.push(value);
  }

  const body = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return { ok: true, value: JSON.parse(new TextDecoder().decode(body)) };
  } catch {
    return { ok: false, tooLarge: false };
  }
}

const frameImageSchema = z
  .string()
  .regex(DATA_URL_PATTERN, "Frame images must be jpeg/png/webp data URLs.")
  .refine((value) => value.length <= MAX_FRAME_IMAGE_BYTES, {
    message: "Frame image data URL exceeds the size limit.",
  });

const momentSchema = z
  .object({
    momentId: z.string().trim().min(1),
    sourceStart: z.number().finite().nonnegative(),
    sourceEnd: z.number().finite().positive(),
    /**
     * Real captured frame data URLs from `captureVideoFrame` on the client.
     * Uploaded B-roll lives at a browser-local `blob:` URL the server can
     * never fetch, so frame bytes must travel with the request rather than
     * as a source URL the server dereferences itself.
     */
    frameImages: z.array(frameImageSchema).max(3).optional(),
  })
  .strict()
  .refine((moment) => moment.sourceEnd > moment.sourceStart, {
    message: "sourceEnd must be greater than sourceStart.",
  });

const requestSchema = z
  .object({
    assetId: z.string().trim().min(1).max(200),
    /** Identity/logging only — never fetched by the server. */
    source: z.string().trim().min(1).max(2_000),
    candidateCount: z.number().int().positive().max(10_000).optional(),
    moments: z.array(momentSchema).min(1).max(MAX_MOMENTS_PER_ASSET_CEILING),
    maxMoments: z.number().int().positive().max(MAX_MOMENTS_PER_ASSET_CEILING).optional(),
  })
  .strict()
  .refine((value) => (value.candidateCount ?? value.moments.length) >= value.moments.length, {
    message: "candidateCount cannot be smaller than the supplied moment list.",
    path: ["candidateCount"],
  });

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return errorResponse(403, "CROSS_ORIGIN_REJECTED", "Analysis requests must come from the editor's own origin.");
  }
  if (request.headers.get("x-relaylab-human-action") !== "analyze-broll") {
    return errorResponse(
      403,
      "HUMAN_CONFIRMATION_REQUIRED",
      "B-roll visual analysis starts only from the human upload/analyze action.",
    );
  }

  const rawBody = await readBoundedJson(request);
  if (!rawBody.ok && rawBody.tooLarge) {
    return errorResponse(
      413,
      "ANALYSIS_REQUEST_TOO_LARGE",
      "B-roll analysis payloads are limited to 16 MB. Analyze fewer moments or retry with smaller frames.",
    );
  }
  const parsed = requestSchema.safeParse(rawBody.ok ? rawBody.value : null);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        code: "INVALID_ANALYSIS_REQUEST",
        message: "The asset reference, source URL, or moment list is invalid.",
        issues: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
      },
      { status: 400 },
    );
  }

  const sessionId = readSessionId(request);
  const resolvedKey = resolveOpenAiKey(sessionId);
  if (!resolvedKey.value) {
    return errorResponse(
      503,
      "VISION_UNAVAILABLE",
      "B-roll visual analysis requires an OpenAI API key. Add your own key in Settings.",
    );
  }
  if (
    resolvedKey.source === "server" &&
    process.env.OPENAI_ALLOW_REMOTE_VISION !== "true"
  ) {
    return errorResponse(
      503,
      "SERVER_VISION_DISABLED",
      "Server-funded B-roll analysis is disabled. Add your own OpenAI key in Settings or explicitly secure and enable a private demo.",
    );
  }

  const { assetId, source, moments, maxMoments } = parsed.data;
  const candidateCount = parsed.data.candidateCount ?? moments.length;
  const cappedMoments = clampMaxMoments(maxMoments);

  try {
    const provider = createOpenAiVisionProvider({ apiKey: resolvedKey.value });
    const result = await analyzeBrollAsset(provider, {
      source,
      moments,
      maxMoments: cappedMoments,
      signal: request.signal,
    });
    return NextResponse.json({
      ok: true,
      assetId,
      candidateCount,
      analyzedCount: result.analyzedCount,
      truncated: candidateCount > result.results.length,
      results: result.results,
    });
  } catch (error) {
    console.error(
      "B-roll vision analysis failed",
      error instanceof Error ? error.name : "UnknownError",
    );
    return errorResponse(
      502,
      "ANALYSIS_PROVIDER_ERROR",
      "Vision analysis failed at the provider.",
    );
  }
}
