"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
} from "react";

import { useRelayLabStore, type EditorProjectKind } from "./EditorProvider";
import {
  CaptionsIcon,
  MutedIcon,
  PauseIcon,
  PlayIcon,
  UploadIcon,
  VolumeIcon,
} from "./Icons";
import { useLocalMedia } from "./LocalMediaProvider";
import { findActiveCaption } from "@/lib/editor/captions";
import { timelineTimeToSourceTime } from "@/lib/editor/timeline";
import type { BrollAsset } from "@/lib/editor/types";

function isVideoFile(file: File): boolean {
  return file.type.startsWith("video/") || /\.(?:mkv|mov|m4v|mp4|webm)$/iu.test(file.name);
}

export function BrollPreviewVideo({
  asset,
  isPlaying = false,
  sourceTime,
}: {
  asset: BrollAsset;
  isPlaying?: boolean;
  sourceTime: number;
}) {
  const ref = useRef<HTMLVideoElement | null>(null);

  const synchronize = useCallback(() => {
    const video = ref.current;
    if (!video) return;
    video.muted = true;
    video.defaultMuted = true;
    if (Math.abs(video.currentTime - sourceTime) > 0.12) {
      try {
        video.currentTime = sourceTime;
      } catch {
        // Metadata may not be ready yet. onLoadedMetadata retries the seek.
      }
    }
  }, [sourceTime]);

  useEffect(() => {
    synchronize();
  }, [synchronize]);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    video.muted = true;
    if (isPlaying) {
      void video.play().catch(() => {
        // A seek still displays the correct frame if autoplay is blocked.
      });
    } else if (!video.paused) {
      video.pause();
    }
  }, [isPlaying]);

  if (!asset.objectUrl) return null;

  return (
    <video
      aria-label={`Muted B-roll preview: ${asset.name}`}
      className="absolute inset-0 h-full w-full object-cover"
      data-broll-audio-policy="muted"
      data-source-time={sourceTime.toFixed(3)}
      muted
      onLoadedMetadata={synchronize}
      playsInline
      preload="auto"
      ref={ref}
      src={asset.objectUrl}
    />
  );
}

export function PreviewPanel({
  playhead,
  onPlayheadChange,
  projectKind = "demo",
}: {
  playhead: number;
  onPlayheadChange: (time: number) => void;
  projectKind?: EditorProjectKind;
}) {
  const project = useRelayLabStore((state) => state.project);
  const { baseImport, importBaseVideo } = useLocalMedia();
  const baseRef = useRef<HTMLVideoElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [captionsEnabled, setCaptionsEnabled] = useState(true);
  const [isDraggingBase, setIsDraggingBase] = useState(false);
  const [baseAspectRatio, setBaseAspectRatio] = useState(16 / 9);
  const activeOverlay = project.overlays
    .filter((overlay) => playhead >= overlay.timelineStart && playhead < overlay.timelineEnd)
    .sort((a, b) => b.timelineStart - a.timelineStart)[0];

  const activeAsset = activeOverlay
    ? project.brollAssets.find((asset) => asset.id === activeOverlay.assetId)
    : undefined;
  const activeMoment = activeOverlay
    ? activeAsset?.moments.find((moment) => moment.id === activeOverlay.momentId)
    : undefined;
  const sourceTime = activeOverlay
    ? timelineTimeToSourceTime(activeOverlay, playhead) ?? activeOverlay.sourceStart
    : 0;
  const activeCaption = useMemo(
    () => findActiveCaption(project.captions, playhead),
    [playhead, project.captions],
  );

  useEffect(() => {
    if (baseRef.current && Math.abs(baseRef.current.currentTime - playhead) > 0.2) {
      baseRef.current.currentTime = playhead;
    }
  }, [playhead]);

  useEffect(() => {
    setBaseAspectRatio(16 / 9);
  }, [project.baseVideo.objectUrl]);

  const togglePlayback = useCallback(() => {
    const video = baseRef.current;
    if (!video) return;
    if (video.paused) {
      void video.play().catch(() => setIsPlaying(false));
    } else {
      video.pause();
    }
  }, []);

  const canImportBase =
    baseImport.status !== "reading" && project.status === "planning";
  const portraitPreview = baseAspectRatio < 1;
  const captionPositionClass = {
    top: "top-4",
    center: "top-1/2 -translate-y-1/2",
    bottom: "bottom-4",
  }[project.captionStyle.position];

  const importDroppedBase = useCallback(
    (event: DragEvent<HTMLElement>) => {
      event.preventDefault();
      setIsDraggingBase(false);
      if (!canImportBase) return;
      const file = Array.from(event.dataTransfer.files).find(isVideoFile);
      if (!file) return;
      if (
        project.baseVideo.objectUrl &&
        !window.confirm(
          "Replace the base video? This resets transcript, captions, overlays, and approval state.",
        )
      ) {
        return;
      }
      void importBaseVideo(file);
    },
    [canImportBase, importBaseVideo, project.baseVideo.objectUrl],
  );

  return (
    <section className="editor-panel preview-panel flex min-h-0 flex-col overflow-hidden">
      <div className="panel-heading">
        <div className="min-w-0">
          <div className="micro-label">Preview</div>
          <div
            aria-live="polite"
            className={`mt-0.5 max-w-[420px] truncate text-[9px] ${baseImport.status === "error" ? "text-[#e59589]" : "text-[#676f7b]"}`}
          >
            {baseImport.message ?? project.baseVideo.name}
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-[10px]">
          <span aria-label="Base audio is the master" className="flex h-7 w-7 items-center justify-center text-[#7ee2b8]" title="Base audio only"><VolumeIcon className="h-3.5 w-3.5" /></span>
          <span aria-label="B-roll is muted" className="flex h-7 w-7 items-center justify-center text-[#69717d]" title="B-roll muted"><MutedIcon className="h-3.5 w-3.5" /></span>
          <label
            aria-label="Toggle captions"
            className={`icon-button h-7 w-7 ${captionsEnabled ? "icon-button-active" : ""} ${
              project.captions.length === 0
                ? "cursor-not-allowed opacity-40"
                : "cursor-pointer"
            }`}
            htmlFor="captions-toggle"
            title={project.captions.length === 0 ? "No captions available for this project yet." : undefined}
          >
            <input
              checked={captionsEnabled}
              className="sr-only"
              disabled={project.captions.length === 0}
              id="captions-toggle"
              onChange={(event) => setCaptionsEnabled(event.target.checked)}
              type="checkbox"
            />
            <CaptionsIcon className="h-3.5 w-3.5" />
          </label>
          <label
            aria-label={project.baseVideo.objectUrl ? "Choose replacement base video" : "Choose base video"}
            className={`icon-button h-7 w-7 cursor-pointer ${
              canImportBase ? "icon-button-active" : "pointer-events-none opacity-40"
            }`}
            htmlFor="base-video-upload"
            title={
              project.baseVideo.objectUrl
                ? "Replacing the base resets transcript, captions, overlays, and approval state tied to the old timeline."
                : "Load one local talking-head video as the locked master track."
            }
          >
            <UploadIcon className="h-3.5 w-3.5" />
          </label>
          <input
            accept="video/*"
            aria-label="Upload base video"
            className="sr-only"
            disabled={!canImportBase}
            id="base-video-upload"
            onChange={(event) => {
              const input = event.currentTarget;
              const file = input.files?.[0];
              if (file) void importBaseVideo(file);
              input.value = "";
            }}
            type="file"
          />
        </div>
      </div>

      <div
        className="relative flex min-h-0 flex-1 items-center justify-center bg-[#08090b] p-2"
        data-testid="base-drop-zone"
        onDragEnter={(event) => {
          event.preventDefault();
          if (canImportBase) setIsDraggingBase(true);
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setIsDraggingBase(false);
          }
        }}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = canImportBase ? "copy" : "none";
        }}
        onDrop={importDroppedBase}
      >
        <div
          className={`relative max-h-full max-w-full overflow-hidden rounded-md border border-[#292d34] bg-black shadow-[0_24px_70px_rgba(0,0,0,.4)] ${
            portraitPreview
              ? "h-full min-h-0 w-auto"
              : "h-auto w-full max-w-[1100px]"
          }`}
          data-preview-orientation={portraitPreview ? "portrait" : "landscape"}
          style={{ aspectRatio: baseAspectRatio }}
        >
          {project.baseVideo.objectUrl ? (
            <video
              className="absolute inset-0 h-full w-full object-contain"
              data-base-audio-policy="master"
              onEnded={() => setIsPlaying(false)}
              onLoadedMetadata={(event) => {
                const { videoWidth, videoHeight } = event.currentTarget;
                if (videoWidth > 0 && videoHeight > 0) {
                  setBaseAspectRatio(videoWidth / videoHeight);
                }
              }}
              onPause={() => setIsPlaying(false)}
              onPlay={() => setIsPlaying(true)}
              onTimeUpdate={(event) => onPlayheadChange(event.currentTarget.currentTime)}
              playsInline
              preload="metadata"
              ref={baseRef}
              src={project.baseVideo.objectUrl}
            />
          ) : projectKind === "demo" ? (
            <div className="absolute inset-0 overflow-hidden bg-[#171a1f]">
              <div className="absolute inset-x-0 bottom-0 h-[42%] bg-[#0f1114]" />
              <div className="absolute left-[18%] top-[19%] h-[52%] w-[28%] rounded-t-[46%] bg-[#272c33] shadow-[0_0_0_1px_rgba(255,255,255,.03)]" />
              <div className="absolute left-[24.5%] top-[13%] h-[24%] w-[15%] rounded-[45%] bg-[#3a4048]" />
              <div className="absolute right-[14%] top-[17%] h-[43%] w-[31%] rounded border border-[#2f353d] bg-[#1d2229]">
                <div className="m-3 h-1.5 w-[58%] rounded bg-[#7ee2b8]/35" />
                <div className="m-3 mt-2 h-1.5 w-[76%] rounded bg-white/10" />
                <div className="m-3 mt-2 h-16 rounded border border-white/5 bg-[#15191e]" />
              </div>
              <div className="absolute bottom-3 left-3 rounded bg-black/55 px-2 py-1 text-[9px] text-white/55 backdrop-blur">
                Metadata demo · add founder-story.mp4 for live video
              </div>
            </div>
          ) : (
            <div
              className="absolute inset-0 flex items-center justify-center bg-[#0f1216] p-8"
              data-testid="blank-project-preview"
            >
              <div className="max-w-sm text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-[#365044] bg-[#14231d] text-[#8de2bd]">
                  <PlayIcon className="h-5 w-5" />
                </div>
                <h1 className="mt-4 text-[15px] font-semibold text-[#eef1f3]">
                  Drop or choose a base video
                </h1>
                <p className="mx-auto mt-2 max-w-[310px] text-[10px] leading-5 text-[#77808b]">
                  Locked master track · only audio source
                </p>
                <label
                  className={`mt-4 inline-flex cursor-pointer items-center rounded-md border border-[#5d8d77] bg-[#193429] px-4 py-2 text-[10px] font-bold text-[#9df0ca] outline-none transition hover:border-[#7ee2b8] hover:bg-[#1f4033] ${
                    baseImport.status === "reading" || project.status !== "planning"
                      ? "pointer-events-none opacity-40"
                      : ""
                  }`}
                  htmlFor="base-video-upload"
                >
                  <UploadIcon className="mr-1.5 h-3.5 w-3.5" />
                  {baseImport.status === "reading" ? "Reading…" : "Choose video"}
                </label>
              </div>
            </div>
          )}

          {activeOverlay && activeAsset ? (
            <div className="absolute inset-0 bg-[#151922]">
              <BrollPreviewVideo
                asset={activeAsset}
                isPlaying={isPlaying}
                sourceTime={sourceTime}
              />
              {!activeAsset.objectUrl ? (
                <div className="absolute inset-0 flex items-center justify-center overflow-hidden bg-[#151922]">
                  <div className="absolute inset-0 opacity-45 [background-image:linear-gradient(125deg,transparent_18%,rgba(111,124,255,.16)_18%,rgba(111,124,255,.16)_20%,transparent_20%)] [background-size:64px_64px]" />
                  <div className="relative max-w-[72%] text-center">
                    <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-[#6f7cff]/30 bg-[#6f7cff]/10 text-[#9ca5ff]">
                      <MutedIcon className="h-4 w-4" />
                    </div>
                    <p className="text-sm font-medium leading-6 text-[#e8eaff]">{activeMoment?.description}</p>
                    <p className="mt-2 font-mono text-[10px] text-[#8790a3]">
                      {activeAsset.name} · source {sourceTime.toFixed(1)}s · video only
                    </p>
                  </div>
                </div>
              ) : null}
              <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded border border-[#6f7cff]/30 bg-[#161938]/90 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.12em] text-[#aab0ff] backdrop-blur">
                <span className="h-1.5 w-1.5 rounded-full bg-[#7f8aff]" /> {activeOverlay.status} overlay
              </div>
            </div>
          ) : null}

          {captionsEnabled && activeCaption ? (
            <div
              aria-live="polite"
              className={`absolute left-1/2 z-30 max-w-[86%] -translate-x-1/2 rounded-md bg-black/80 px-3.5 py-2 text-center text-[13px] font-semibold leading-5 text-white shadow-[0_4px_16px_rgba(0,0,0,.4)] ${captionPositionClass}`}
              data-caption-position={project.captionStyle.position}
              data-testid="active-caption"
            >
              {activeCaption.text}
            </div>
          ) : null}
        </div>
        {isDraggingBase ? (
          <div className="pointer-events-none absolute inset-2 z-50 flex items-center justify-center rounded-lg border-2 border-dashed border-[#7ee2b8] bg-[#0d1713]/90 text-[#a7f0d1] backdrop-blur-sm">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <UploadIcon className="h-5 w-5" /> Drop base video
            </div>
          </div>
        ) : null}
      </div>

      <div className="flex items-center gap-3 border-t border-[#242831] bg-[#101216] px-3 py-2">
        <button
          aria-label={isPlaying ? "Pause preview" : "Play preview"}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#354039] bg-[#17211c] text-[#7ee2b8] outline-none transition hover:border-[#659b81] disabled:cursor-not-allowed disabled:opacity-35"
          disabled={!project.baseVideo.objectUrl}
          onClick={togglePlayback}
          type="button"
        >
          {isPlaying ? <PauseIcon className="h-3.5 w-3.5" /> : <PlayIcon className="h-3.5 w-3.5" />}
        </button>
        <time className="w-11 font-mono text-[10px] tabular-nums text-[#d4d7dc]">{playhead.toFixed(1)}s</time>
        <input
          aria-label="Preview playhead"
          className="h-1 flex-1 cursor-pointer accent-[#7ee2b8] disabled:cursor-not-allowed disabled:opacity-35"
          disabled={project.duration <= 0}
          max={Math.max(project.duration, 0.1)}
          min={0}
          onChange={(event) => onPlayheadChange(Number(event.target.value))}
          step={0.1}
          type="range"
          value={Math.min(playhead, Math.max(project.duration, 0))}
        />
        <time className="w-11 text-right font-mono text-[10px] tabular-nums text-[#69717d]">{project.duration.toFixed(1)}s</time>
      </div>
    </section>
  );
}
