import { NextResponse } from "next/server";

import { createOpenAiTranscriptionProvider } from "@/lib/analysis/transcribe";
import { resolveOpenAiKey } from "@/lib/credentials/resolveCredentials";
import { readSessionId } from "@/lib/credentials/sessionCookie";
import { isSameOriginRequest } from "@/lib/security/sameOrigin";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

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
    return errorResponse(
      413,
      "TRANSCRIPTION_MEDIA_TOO_LARGE",
      "Automatic transcription accepts files up to 25 MB. Add captions manually or upload a smaller proxy.",
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
      error instanceof Error ? error.name : "UnknownError",
    );
    return errorResponse(
      502,
      "TRANSCRIPTION_FAILED",
      "Automatic transcription failed. The existing transcript and captions were preserved.",
    );
  }
}
