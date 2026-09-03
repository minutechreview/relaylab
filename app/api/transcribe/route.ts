import { NextResponse } from "next/server";

import { createOpenAiTranscriptionProvider } from "@/lib/analysis/transcribe";
import { resolveOpenAiKey } from "@/lib/credentials/resolveCredentials";
import { readSessionId } from "@/lib/credentials/sessionCookie";
import { isSameOriginRequest } from "@/lib/security/sameOrigin";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * OpenAI's own `/v1/audio/transcriptions` limit is 25 MB, which is the
 * right ceiling for a long-running Node server. On Vercel, Node.js
 * Serverless Functions reject request bodies above ~4.5 MB at the platform
 * level (`FUNCTION_PAYLOAD_TOO_LARGE`) before this handler ever runs — no
 * amount of application-level config raises that. Stay safely under it
 * there instead of returning a confusing platform-level error for videos
 * that would otherwise be well within OpenAI's own limit.
 */
const MAX_UPLOAD_BYTES = process.env.VERCEL ? 4 * 1024 * 1024 : 25 * 1024 * 1024;

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json({ ok: false, code, message }, { status });
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return errorResponse(
      403,
      "CROSS_ORIGIN_TRANSCRIPTION_REJECTED",
      "Transcription requests must come from the editor's own origin.",
    );
  }
  if (request.headers.get("x-relaylab-human-action") !== "transcribe") {
    return errorResponse(
      403,
      "HUMAN_TRANSCRIPTION_REQUIRED",
      "Automatic captions start only from the human Auto captions control.",
    );
  }
  const resolvedKey = resolveOpenAiKey(readSessionId(request));
  if (!resolvedKey.value) {
    return errorResponse(
      503,
      "TRANSCRIPTION_UNAVAILABLE",
      "Automatic transcription is unavailable. Add your own OpenAI key in Settings, configure OPENAI_API_KEY on the server, or add captions manually.",
    );
  }
  if (
    resolvedKey.source === "server" &&
    process.env.OPENAI_ALLOW_REMOTE_TRANSCRIPTION !== "true"
  ) {
    return errorResponse(
      503,
      "SERVER_TRANSCRIPTION_DISABLED",
      "Server-funded transcription is disabled. Add your own OpenAI key in Settings, add captions manually, or explicitly secure and enable a private demo.",
    );
  }

  const form = await request.formData().catch(() => null);
  const media = form?.get("media");
  if (!(media instanceof File) || media.size === 0) {
    return errorResponse(400, "INVALID_TRANSCRIPTION_MEDIA", "Choose a readable audio or video file.");
  }
  if (media.size > MAX_UPLOAD_BYTES) {
    const limitMb = Math.floor(MAX_UPLOAD_BYTES / (1024 * 1024));
    return errorResponse(
      413,
      "TRANSCRIPTION_MEDIA_TOO_LARGE",
      process.env.VERCEL
        ? `This hosted deployment accepts files up to ${limitMb} MB for automatic transcription (a Vercel serverless platform limit, not OpenAI's). Trim the clip, extract just the audio track first, add captions manually, or run this locally where the limit is 25 MB.`
        : `Automatic transcription accepts files up to ${limitMb} MB. Add captions manually or upload a smaller proxy.`,
    );
  }
  if (
    media.type &&
    !media.type.startsWith("video/") &&
    !media.type.startsWith("audio/")
  ) {
    return errorResponse(400, "INVALID_TRANSCRIPTION_MEDIA", "The uploaded file is not audio or video.");
  }

  try {
    const provider = createOpenAiTranscriptionProvider({ apiKey: resolvedKey.value });
    const transcript = await provider.transcribe({
      source: media,
      filename: media.name || "base-video.mp4",
      signal: request.signal,
    });
    return NextResponse.json({ ok: true, transcript, provider: provider.name });
  } catch (error) {
    console.error(
      "OpenAI transcription failed",
      error instanceof Error ? `${error.name}: ${error.message}` : "UnknownError",
    );
    return errorResponse(
      502,
      "TRANSCRIPTION_FAILED",
      "Automatic transcription failed. The existing transcript and captions were preserved.",
    );
  }
}
