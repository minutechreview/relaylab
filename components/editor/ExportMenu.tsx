"use client";

import { useEffect, useRef, useState } from "react";

import {
  createFfmpegExport,
  isFfmpegExportSuccess,
  serializeEditSpec,
} from "@/lib/export";

import { useRelayLabStore } from "./EditorProvider";
import { ExportIcon } from "./Icons";

type Feedback =
  | { kind: "success"; message: string }
  | { kind: "error"; message: string }
  | null;

function downloadText(fileName: string, contents: string, mediaType: string): void {
  const blob = new Blob([contents], { type: `${mediaType};charset=utf-8` });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = fileName;
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
}

function safeFileStem(title: string): string {
  return (
    title
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/gu, "-")
      .replace(/^-+|-+$/gu, "")
      .slice(0, 72) || "broll-edit"
  );
}

function feedbackClassName(feedback: Feedback): string {
  if (!feedback) return "text-[#737b86]";
  return feedback.kind === "success" ? "text-[#7ee2b8]" : "text-[#ff9e9e]";
}

export function ExportMenu() {
  const project = useRelayLabStore((state) => state.project);
  const [isOpen, setIsOpen] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const canRenderFinal = project.status === "committed";

  useEffect(() => {
    if (!isOpen) return;

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    function closeOnOutsidePointer(event: PointerEvent) {
      if (
        event.target instanceof Node &&
        !containerRef.current?.contains(event.target)
      ) {
        setIsOpen(false);
      }
    }

    document.addEventListener("keydown", closeOnEscape);
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
    };
  }, [isOpen]);

  function reportError(error: unknown): void {
    setFeedback({
      kind: "error",
      message: error instanceof Error ? error.message : "Export failed validation.",
    });
  }

  function downloadEditJson(): void {
    try {
      downloadText(
        `${safeFileStem(project.title)}.edit.json`,
        serializeEditSpec(project),
        "application/json",
      );
      setFeedback({ kind: "success", message: "Edit JSON downloaded." });
    } catch (error) {
      reportError(error);
    }
  }

  function downloadFfmpegScript(): void {
    try {
      const generated = createFfmpegExport(project);
      if (!isFfmpegExportSuccess(generated)) {
        setFeedback({ kind: "error", message: generated.message });
        return;
      }
      downloadText(
        `${safeFileStem(project.title)}.render.sh`,
        generated.script,
        "text/x-shellscript",
      );
      setFeedback({
        kind: "success",
        message: generated.captionSidecar
          ? "Script downloaded. Download its caption sidecar too."
          : "ffmpeg script downloaded.",
      });
    } catch (error) {
      reportError(error);
    }
  }

  function downloadCaptionSidecar(): void {
    try {
      const generated = createFfmpegExport(project);
      if (!isFfmpegExportSuccess(generated)) {
        setFeedback({ kind: "error", message: generated.message });
        return;
      }
      const sidecar = generated.captionSidecar;
      if (!sidecar) {
        setFeedback({ kind: "error", message: "This project has no caption sidecar." });
        return;
      }
      downloadText(sidecar.fileName, sidecar.contents, sidecar.mediaType);
      setFeedback({ kind: "success", message: "Caption sidecar downloaded." });
    } catch (error) {
      reportError(error);
    }
  }

  async function copyFfmpegCommand(): Promise<void> {
    try {
      const generated = createFfmpegExport(project);
      if (!isFfmpegExportSuccess(generated)) {
        setFeedback({ kind: "error", message: generated.message });
        return;
      }
      await navigator.clipboard.writeText(generated.command);
      setFeedback({ kind: "success", message: "ffmpeg command copied." });
    } catch (error) {
      reportError(error);
    }
  }

  const gateMessage =
    project.status === "approved"
      ? "Human approval recorded. The agent must call commit_approved_plan before final render export unlocks."
      : "Approve the plan in the UI, then let the agent commit it to unlock final render export.";

  return (
    <div className="relative" ref={containerRef}>
      <button
        aria-label="Export"
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        className="icon-button"
        data-testid="export-menu-trigger"
        onClick={() => {
          setFeedback(null);
          setIsOpen((current) => !current);
        }}
        type="button"
      >
        <ExportIcon className="h-4 w-4" />
      </button>

      {isOpen ? (
        <section
          aria-label="Export project"
          className="absolute right-0 top-[calc(100%+8px)] z-50 w-[330px] rounded-xl border border-[#303640] bg-[#111419] p-3 shadow-[0_22px_70px_rgba(0,0,0,.55)]"
          data-testid="export-menu"
          role="dialog"
        >
          <div className="mb-3">
            <div className="text-[11px] font-bold text-white">Reproducible export</div>
            <p className="mt-1 text-[9px] leading-4 text-[#79818c]">
              Source and timeline ranges stay separate. Only base input audio is mapped;
              every B-roll input remains video-only.
            </p>
          </div>

          <button
            className="w-full rounded-lg border border-[#343b45] bg-[#191d23] px-3 py-2.5 text-left outline-none transition hover:border-[#586473] focus-visible:ring-2 focus-visible:ring-[#7ee2b8]/30"
            data-testid="export-edit-json"
            onClick={downloadEditJson}
            type="button"
          >
            <span className="block text-[10px] font-bold text-[#e8eaed]">Export Edit JSON</span>
            <span className="mt-0.5 block text-[8px] leading-3 text-[#777f8a]">
              Auditable project snapshot · available in every state
            </span>
          </button>

          <div className="my-3 h-px bg-[#282d34]" />

          {canRenderFinal ? (
            <div className="space-y-2" data-testid="final-export-actions">
              <button
                className="w-full rounded-lg border border-[#38604f] bg-[#172b23] px-3 py-2.5 text-left outline-none transition hover:border-[#5e987e] focus-visible:ring-2 focus-visible:ring-[#7ee2b8]/30"
                data-testid="download-ffmpeg-script"
                onClick={downloadFfmpegScript}
                type="button"
              >
                <span className="block text-[10px] font-bold text-[#9df0ca]">Download ffmpeg script</span>
                <span className="mt-0.5 block text-[8px] text-[#6f9e8a]">Committed overlays only · base audio only</span>
              </button>
              {project.captions.length > 0 ? (
                <button
                  className="w-full rounded-md border border-[#303640] bg-[#16191e] px-3 py-2 text-[9px] font-semibold text-[#c9cdd3] outline-none transition hover:border-[#46505d] focus-visible:ring-2 focus-visible:ring-[#7ee2b8]/30"
                  data-testid="download-caption-sidecar"
                  onClick={downloadCaptionSidecar}
                  type="button"
                >
                  Download caption sidecar (.srt)
                </button>
              ) : null}
              <button
                className="w-full rounded-md border border-[#303640] bg-[#16191e] px-3 py-2 text-[9px] font-semibold text-[#c9cdd3] outline-none transition hover:border-[#46505d] focus-visible:ring-2 focus-visible:ring-[#7ee2b8]/30"
                data-testid="copy-ffmpeg-command"
                onClick={() => void copyFfmpegCommand()}
                type="button"
              >
                Copy ffmpeg command
              </button>
            </div>
          ) : (
            <div
              className="rounded-lg border border-[#4a4030] bg-[#211c14] px-3 py-2.5 text-[9px] leading-4 text-[#caa664]"
              data-testid="final-export-gate"
            >
              {gateMessage}
            </div>
          )}

          <div
            aria-live="polite"
            className={`mt-2 min-h-4 text-[8px] leading-4 ${feedbackClassName(feedback)}`}
          >
            {feedback?.message ?? "Generated files never contain session-only object URLs."}
          </div>
        </section>
      ) : null}
    </div>
  );
}
