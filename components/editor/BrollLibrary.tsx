"use client";

import { useMemo, useState, type DragEvent } from "react";

import type { BrollAssetWithVisionAnalysis } from "@/lib/providers/applyBrollAnalysis";

import { useRelayLabStore, type EditorProjectKind } from "./EditorProvider";
import { FilmIcon, MutedIcon, PlusIcon, UploadIcon, WarningIcon } from "./Icons";
import { useLocalMedia } from "./LocalMediaProvider";

function analysisSummary(asset: BrollAssetWithVisionAnalysis): {
  label: string;
  tone: "neutral" | "processing" | "ready" | "failed";
} {
  const analysis = asset.visionAnalysis;
  if (!analysis) return { label: "Not analyzed", tone: "neutral" };
  if (analysis.status === "processing") return { label: "Analyzing…", tone: "processing" };
  if (analysis.status === "failed" && analysis.analyzedMomentCount === 0) {
    return { label: analysis.requestError ?? "Analysis failed", tone: "failed" };
  }
  const suffix = analysis.failures.length > 0 ? ` · ${analysis.failures.length} failed` : "";
  return {
    label: `${analysis.analyzedMomentCount}/${analysis.totalMomentCount} moments indexed${suffix}`,
    tone: "ready",
  };
}

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60);
  return `${minutes}:${remainder.toString().padStart(2, "0")}`;
}

const swatches = [
  "from-[#253648] to-[#17222d]",
  "from-[#3a3048] to-[#211a2a]",
  "from-[#2e3b35] to-[#19231f]",
  "from-[#443429] to-[#251d18]",
  "from-[#29354a] to-[#171d2b]",
];

export function BrollLibrary({
  projectKind = "demo",
  playhead = 0,
}: {
  projectKind?: EditorProjectKind;
  playhead?: number;
}) {
  const project = useRelayLabStore((state) => state.project);
  const placeBrollMoment = useRelayLabStore((state) => state.placeBrollMoment);
  const assets = project.brollAssets as BrollAssetWithVisionAnalysis[];
  const uploadedAssets = assets.filter((asset) => asset.origin === "uploaded");
  const { brollImport, importBrollVideos, analyzeBrollAsset } = useLocalMedia();
  const [isDragging, setIsDragging] = useState(false);
  const moments = useMemo(
    () =>
      assets.flatMap((asset) =>
        asset.moments.map((moment) => ({
          ...moment,
          assetName: asset.name,
          assetDuration: asset.duration,
          assetOrigin: asset.origin,
        })),
      ),
    [assets],
  );
  const canImport =
    brollImport.status !== "reading" &&
    project.status === "planning" &&
    project.duration > 0;

  function importDroppedReels(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    setIsDragging(false);
    if (!canImport) return;
    const files = Array.from(event.dataTransfer.files).filter(
      (file) =>
        file.type.startsWith("video/") ||
        /\.(?:mkv|mov|m4v|mp4|webm)$/iu.test(file.name),
    );
    if (files.length > 0) void importBrollVideos(files);
  }

  return (
    <aside
      className="editor-panel flex min-h-0 flex-col overflow-hidden"
      title={projectKind === "demo" ? "Demo indexed media" : "Local media"}
    >
      <div className="panel-heading">
        <div>
          <div className="micro-label">Media</div>
          <div className="mt-0.5 font-mono text-[9px] text-[#676f7b]">{assets.length} reels · {moments.length} moments</div>
        </div>
        <div className="flex items-center gap-1.5">
          <span aria-label="B-roll is video only" className="flex h-7 w-7 items-center justify-center text-[#6f7782]" title="B-roll muted"><MutedIcon className="h-3.5 w-3.5" /></span>
          <label
            aria-label="Add B-roll reels"
            className={`icon-button h-7 w-7 cursor-pointer ${canImport ? "icon-button-active" : "pointer-events-none opacity-40"}`}
            htmlFor="broll-upload"
            title={
              project.duration <= 0
                ? "Upload the base talking-head video first."
                : "Import video-only B-roll source reels"
            }
          >
            <UploadIcon className="h-3.5 w-3.5" />
          </label>
          <input
            accept="video/*,.mkv"
            aria-label="Upload B-roll videos"
            className="sr-only"
            disabled={!canImport}
            id="broll-upload"
            multiple
            onChange={(event) => {
              const input = event.currentTarget;
              const files = Array.from(input.files ?? []);
              if (files.length > 0) void importBrollVideos(files);
              input.value = "";
            }}
            type="file"
          />
        </div>
      </div>

      {uploadedAssets.length > 0 ? (
        <div className="space-y-1 border-b border-[#242831] px-2.5 py-2" data-testid="analysis-status-list">
          {uploadedAssets.map((asset) => {
            const summary = analysisSummary(asset);
            return (
              <div
                className="flex items-center justify-between gap-2 text-[9px]"
                data-testid={`analysis-status-${asset.id}`}
                key={asset.id}
              >
                <span className="truncate text-[#8d95a1]" title={asset.name}>
                  {asset.name}
                </span>
                <span
                  className={`flex shrink-0 items-center gap-1 ${
                    summary.tone === "ready"
                      ? "text-[#83cdaa]"
                      : summary.tone === "failed"
                        ? "text-[#e59589]"
                        : summary.tone === "processing"
                          ? "text-[#e3b96d]"
                          : "text-[#68717c]"
                  }`}
                >
                  {summary.tone === "failed" ? <WarningIcon className="h-3 w-3" /> : null}
                  {summary.label}
                  {summary.tone === "failed" ? (
                    <button
                      className="ml-1 rounded border border-[#593a37] px-1.5 py-0.5 text-[8px] font-semibold text-[#e59589] hover:border-[#7a4d47]"
                      data-testid={`analysis-retry-${asset.id}`}
                      onClick={() => void analyzeBrollAsset(asset.id)}
                      type="button"
                    >
                      Retry
                    </button>
                  ) : null}
                </span>
              </div>
            );
          })}
        </div>
      ) : null}

      <div
        className="relative min-h-0 flex-1 space-y-2 overflow-y-auto p-2.5"
        data-testid="broll-drop-zone"
        onDragEnter={(event) => {
          event.preventDefault();
          if (canImport) setIsDragging(true);
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setIsDragging(false);
          }
        }}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = canImport ? "copy" : "none";
        }}
        onDrop={importDroppedReels}
      >
        {moments.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-4 text-center text-[10px] leading-4 text-[#5f6772]">
            <UploadIcon className="mb-2 h-5 w-5" />
            <span>{project.duration > 0 ? "Drop B-roll here" : "Add a base video first"}</span>
            <span className="sr-only">No B-roll moments yet.</span>
          </div>
        ) : null}
        {moments.map((moment, index) => (
          <article
            aria-label={`B-roll moment: ${moment.description}. Drag onto the timeline to place it.`}
            className={`group overflow-hidden rounded-lg border border-[#242831] bg-[#12151a] transition-colors hover:border-[#3b414c] ${
              project.status === "planning" && project.duration > 0
                ? "cursor-grab active:cursor-grabbing"
                : ""
            }`}
            draggable={project.status === "planning" && project.duration > 0}
            key={moment.id}
            onDragStart={(event) => {
              event.dataTransfer.effectAllowed = "copy";
              event.dataTransfer.setData("application/x-relaylab-moment", moment.id);
              event.dataTransfer.setData("text/plain", moment.id);
            }}
            title="Drag onto the B-roll track"
          >
            <div className={`relative h-[74px] overflow-hidden bg-gradient-to-br ${swatches[index % swatches.length]}`}>
              <div className="absolute inset-0 opacity-40 [background-image:linear-gradient(120deg,transparent_20%,rgba(255,255,255,.08)_20%,rgba(255,255,255,.08)_22%,transparent_22%)] [background-size:32px_32px]" />
              <div className="absolute left-2 top-2 flex items-center gap-1 rounded bg-black/55 px-1.5 py-1 text-[9px] font-semibold text-white/80 backdrop-blur-sm">
                <FilmIcon className="h-3 w-3" />
                {formatDuration(moment.sourceStart)}–{formatDuration(moment.sourceEnd)}
              </div>
              <div className="absolute bottom-2 right-2 rounded bg-black/55 px-1.5 py-1 text-[9px] text-white/70">
                {formatDuration(moment.sourceEnd - moment.sourceStart)}
              </div>
              <div className="absolute bottom-2 left-2 h-5 w-8 rounded-sm border border-white/10 bg-white/5 shadow-inner" />
            </div>
            <div className="p-2.5">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="truncate text-[9px] font-semibold uppercase tracking-[0.08em] text-[#6f7782]">
                  {moment.assetName}
                </span>
                <span className="shrink-0 rounded border border-[#345343] bg-[#16241d] px-1 py-0.5 text-[7px] font-bold uppercase tracking-[0.08em] text-[#83cdaa]">
                  {moment.assetOrigin === "uploaded" ? "Local index" : "Indexed"}
                </span>
              </div>
              <p className="line-clamp-2 text-[11px] leading-[1.45] text-[#d2d5da]">{moment.description}</p>
              <div className="mt-2 flex items-end justify-between gap-2">
                <div className="flex min-w-0 flex-wrap gap-1">
                  {moment.tags.slice(0, 2).map((tag) => (
                    <span className="rounded bg-[#1d2128] px-1.5 py-0.5 text-[9px] text-[#8d95a1]" key={tag}>
                      {tag}
                    </span>
                  ))}
                </div>
                <button
                  aria-label={`Add ${moment.description} at ${playhead.toFixed(1)} seconds`}
                  className="flex h-7 shrink-0 items-center gap-1 rounded-md border border-[#3b574a] bg-[#17231e] px-2 text-[8px] font-semibold text-[#8dd7b6] hover:border-[#5b8b73] disabled:cursor-not-allowed disabled:opacity-35"
                  disabled={project.status !== "planning" || project.duration <= 0}
                  onClick={(event) => {
                    event.stopPropagation();
                    const duration = Math.min(5, moment.sourceEnd - moment.sourceStart);
                    placeBrollMoment({
                      momentId: moment.id,
                      timelineStart: playhead,
                      duration,
                      reason: "Placed by the human from the B-roll library.",
                    });
                  }}
                  onDragStart={(event) => event.preventDefault()}
                  onPointerDown={(event) => event.stopPropagation()}
                  title="Add at playhead (also works on touch devices)"
                  type="button"
                >
                  <PlusIcon className="h-3 w-3" /> Add
                </button>
              </div>
            </div>
          </article>
        ))}
        {isDragging ? (
          <div className="pointer-events-none absolute inset-2 z-20 flex items-center justify-center rounded-lg border-2 border-dashed border-[#7ee2b8] bg-[#0d1713]/94 text-[11px] font-semibold text-[#a7f0d1] backdrop-blur-sm">
            <UploadIcon className="mr-2 h-4 w-4" /> Drop B-roll reels
          </div>
        ) : null}
      </div>

      {brollImport.message ? (
        <div
          aria-live="polite"
          className={`border-t border-[#242831] px-3 py-2 text-[9px] leading-4 ${
            brollImport.status === "error" ? "text-[#e59589]" : "text-[#646c77]"
          }`}
        >
          {brollImport.message}
        </div>
      ) : null}
    </aside>
  );
}
