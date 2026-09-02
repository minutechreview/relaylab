"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
  type PointerEvent,
} from "react";

import { useRelayLabStore } from "./EditorProvider";
import { GenerationSuggestionPanel } from "./GenerationSuggestionPanel";
import { RegenerateGeneratedClip } from "./RegenerateGeneratedClip";
import {
  CaptionsIcon,
  CheckIcon,
  CloseIcon,
  LockIcon,
  MutedIcon,
  ScissorsIcon,
  SparkLineIcon,
  TrashIcon,
  UnlockIcon,
  WarningIcon,
} from "./Icons";
import { getPlanPreflight } from "@/lib/editor/planPreflight";
import type { Overlay } from "@/lib/editor/types";

const MIN_PACING_SECONDS = 5;
const MAX_PACING_SECONDS = 30;

type DragMode = "move" | "start" | "end";

interface DragState {
  mode: DragMode;
  overlayId: string;
  originX: number;
  originStart: number;
  originEnd: number;
  width: number;
}

function timeLabel(seconds: number): string {
  const whole = Math.round(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

export function Timeline({
  playhead,
  onPlayheadChange,
}: {
  playhead: number;
  onPlayheadChange: (time: number) => void;
}) {
  const project = useRelayLabStore((state) => state.project);
  const selectedOverlayId = useRelayLabStore((state) => state.selectedOverlayId);
  const selectedSuggestionId = useRelayLabStore((state) => state.selectedSuggestionId);
  const setSelectedOverlay = useRelayLabStore((state) => state.setSelectedOverlay);
  const setSelectedSuggestion = useRelayLabStore((state) => state.setSelectedSuggestion);
  const moveOverlay = useRelayLabStore((state) => state.moveOverlay);
  const resizeOverlayStart = useRelayLabStore((state) => state.resizeOverlayStart);
  const resizeOverlayEnd = useRelayLabStore((state) => state.resizeOverlayEnd);
  const setOverlayLocked = useRelayLabStore((state) => state.setOverlayLocked);
  const swapOverlayMoment = useRelayLabStore((state) => state.swapOverlayMoment);
  const removeOverlayProposal = useRelayLabStore((state) => state.removeOverlayProposal);
  const placeBrollMoment = useRelayLabStore((state) => state.placeBrollMoment);
  const splitOverlay = useRelayLabStore((state) => state.splitOverlay);
  const setPacingPreference = useRelayLabStore((state) => state.setPacingPreference);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const seekFrameRef = useRef<number | null>(null);
  const pendingSeekRef = useRef<number | null>(null);
  const [pacingDraft, setPacingDraft] = useState<string | null>(null);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [isMomentDropActive, setIsMomentDropActive] = useState(false);
  const hasTimeline = project.duration > 0;
  const timelineDuration = Math.max(project.duration, 1);
  const preflight = getPlanPreflight(project);

  const selectedOverlay = project.overlays.find((overlay) => overlay.id === selectedOverlayId);
  const selectedSuggestion = project.generationSuggestions.find(
    (suggestion) => suggestion.id === selectedSuggestionId,
  );
  const hasSelection = Boolean(selectedOverlay || selectedSuggestion);
  const selectedMoment = useMemo(() => {
    if (!selectedOverlay?.momentId) return undefined;
    return project.brollAssets
      .flatMap((asset) => asset.moments)
      .find((moment) => moment.id === selectedOverlay.momentId);
  }, [project.brollAssets, selectedOverlay]);
  const selectedAsset = selectedOverlay
    ? project.brollAssets.find((asset) => asset.id === selectedOverlay.assetId)
    : undefined;
  const availableMoments = useMemo(
    () =>
      project.brollAssets.flatMap((asset) =>
        asset.moments.map((moment) => ({
          ...moment,
          assetName: asset.name,
        })),
      ),
    [project.brollAssets],
  );

  const selectedEditable = Boolean(
    selectedOverlay &&
      project.status === "planning" &&
      selectedOverlay.status === "ghost" &&
      !selectedOverlay.lockedByHuman,
  );
  const canSplitSelected = Boolean(
    selectedEditable &&
      selectedOverlay &&
      playhead >= selectedOverlay.timelineStart + 0.5 &&
      playhead <= selectedOverlay.timelineEnd - 0.5,
  );

  useEffect(
    () => () => {
      if (seekFrameRef.current !== null) cancelAnimationFrame(seekFrameRef.current);
    },
    [],
  );

  function timeFromPointer(event: {
    currentTarget: HTMLElement;
    clientX: number;
  }): number {
    const bounds = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width));
    return ratio * project.duration;
  }

  function scrubFromPointer(event: PointerEvent<HTMLElement>) {
    if (!hasTimeline || event.pointerType === "touch") return;
    pendingSeekRef.current = timeFromPointer(event);
    if (seekFrameRef.current !== null) return;
    seekFrameRef.current = requestAnimationFrame(() => {
      seekFrameRef.current = null;
      const nextTime = pendingSeekRef.current;
      if (nextTime === null) return;
      setHoverTime(nextTime);
      onPlayheadChange(nextTime);
    });
  }

  function stopScrubbing() {
    pendingSeekRef.current = null;
    if (seekFrameRef.current !== null) {
      cancelAnimationFrame(seekFrameRef.current);
      seekFrameRef.current = null;
    }
    setHoverTime(null);
  }

  function dropMomentOnTimeline(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsMomentDropActive(false);
    if (!hasTimeline || project.status !== "planning") return;
    const momentId = event.dataTransfer.getData("application/x-relaylab-moment");
    if (!momentId) return;
    const moment = project.brollAssets
      .flatMap((asset) => asset.moments)
      .find((candidate) => candidate.id === momentId);
    if (!moment) return;
    const duration = Math.min(5, moment.sourceEnd - moment.sourceStart);
    placeBrollMoment({
      momentId,
      timelineStart: timeFromPointer(event),
      duration,
      reason: "Placed by the human from the B-roll library.",
    });
  }

  function beginDrag(event: PointerEvent<HTMLElement>, mode: DragMode, overlay: Overlay) {
    if (!event.isPrimary || event.button !== 0) return;
    if (!hasTimeline) return;
    if (
      project.status !== "planning" ||
      overlay.status !== "ghost" ||
      overlay.lockedByHuman
    ) return;
    event.preventDefault();
    event.stopPropagation();
    const bounds = trackRef.current?.getBoundingClientRect();
    if (!bounds) return;
    const captureTarget = event.currentTarget.closest<HTMLElement>("[data-overlay-id]");
    captureTarget?.setPointerCapture(event.pointerId);
    setSelectedOverlay(overlay.id);
    dragRef.current = {
      mode,
      overlayId: overlay.id,
      originX: event.clientX,
      originStart: overlay.timelineStart,
      originEnd: overlay.timelineEnd,
      width: bounds.width,
    };
  }

  function continueDrag(event: PointerEvent<HTMLElement>) {
    const drag = dragRef.current;
    if (!drag || !event.isPrimary) return;
    const delta = ((event.clientX - drag.originX) / drag.width) * project.duration;
    if (drag.mode === "move") moveOverlay(drag.overlayId, drag.originStart + delta);
    if (drag.mode === "start") resizeOverlayStart(drag.overlayId, drag.originStart + delta);
    if (drag.mode === "end") resizeOverlayEnd(drag.overlayId, drag.originEnd + delta);
  }

  function endDrag(event: PointerEvent<HTMLElement>) {
    if (dragRef.current) {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      dragRef.current = null;
    }
  }

  function cancelDrag() {
    dragRef.current = null;
  }

  function keyboardStep(event: KeyboardEvent, overlay: Overlay, mode: DragMode) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    if (
      project.status !== "planning" ||
      overlay.status !== "ghost" ||
      overlay.lockedByHuman
    ) return;
    event.preventDefault();
    event.stopPropagation();
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const step = event.shiftKey ? 1 : 0.25;
    if (mode === "move") moveOverlay(overlay.id, overlay.timelineStart + direction * step);
    if (mode === "start") resizeOverlayStart(overlay.id, overlay.timelineStart + direction * step);
    if (mode === "end") resizeOverlayEnd(overlay.id, overlay.timelineEnd + direction * step);
  }

  const tickCount = hasTimeline ? Math.ceil(project.duration / 10) : 0;
  const preflightColor =
    preflight.status === "blocked"
      ? "border-[#794642] bg-[#2a1716] text-[#ef9a91]"
      : preflight.status === "warnings"
        ? "border-[#6f5932] bg-[#251f13] text-[#e9c475]"
        : "border-[#365f4c] bg-[#14251e] text-[#8ee8bd]";

  return (
    <section className="editor-panel timeline-panel relative z-10" aria-label="RelayLab timeline">
      <div className="panel-heading">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="shrink-0">
            <div className="micro-label">Timeline</div>
            <div className="mt-0.5 text-[9px] text-[#676f7b]">Hover ruler to scrub</div>
          </div>
          <span className="hidden rounded border border-[#313641] bg-[#15181d] px-2 py-1 font-mono text-[9px] text-[#828a96] sm:inline-flex">
            {project.overlays.length} clip{project.overlays.length === 1 ? "" : "s"}
          </span>
          <div className="hidden items-center gap-1.5 text-[#737b86] lg:flex" aria-label="Timeline color key">
            <span className="h-2 w-2 rounded-sm border border-[#8390ff] bg-[#5f6bea]/30" title="Ghost proposal" />
            <span className="h-2 w-2 rounded-sm border border-dashed border-[#a77cbd] bg-[#4a2d58]" title="Generation suggestion" />
            <span className="h-2 w-2 rounded-sm border border-[#55aa84] bg-[#25543f]" title="Committed overlay" />
            <span title="Human lock"><LockIcon className="h-3 w-3 text-[#d8b46e]" /></span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-[9px] text-[#828a96]" htmlFor="pacing-preference">
            <span className="hidden sm:inline">Pace</span>
            <input
              aria-label="Maximum uninterrupted talking-head seconds before a pacing gap is flagged, from 5 to 30"
              className="numeric-field w-14 text-[10px] disabled:cursor-not-allowed disabled:opacity-50"
              disabled={project.status !== "planning"}
              id="pacing-preference"
              max={MAX_PACING_SECONDS}
              min={MIN_PACING_SECONDS}
              onBlur={() => {
                if (pacingDraft === null) return;
                const parsed = Number(pacingDraft);
                if (Number.isFinite(parsed)) setPacingPreference(parsed);
                setPacingDraft(null);
              }}
              onChange={(event) => setPacingDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.currentTarget.blur();
              }}
              step={1}
              type="number"
              value={pacingDraft ?? project.pacingPreference.maxTalkingHeadSeconds}
            />
            s
          </label>
          <details className="group relative z-50">
            <summary
              className={`flex h-7 cursor-pointer list-none items-center gap-1 rounded-md border px-2 text-[8px] font-bold uppercase tracking-[0.08em] outline-none transition focus-visible:ring-2 focus-visible:ring-[#7ee2b8]/25 [&::-webkit-details-marker]:hidden ${preflightColor}`}
              data-testid="plan-preflight"
              title="Plan preflight"
            >
              {preflight.status === "ready" ? (
                <CheckIcon className="h-3 w-3" />
              ) : (
                <WarningIcon className="h-3 w-3" />
              )}
              {preflight.status}
            </summary>
            <div className="absolute right-0 top-9 z-50 w-72 rounded-lg border border-[#343a43] bg-[#111419] p-3 shadow-[0_18px_50px_rgba(0,0,0,.55)]">
              <div className="flex items-center justify-between">
                <span className="micro-label">Plan preflight</span>
                <span className="font-mono text-[9px] text-[#737b86]">
                  {preflight.blockingCount} blocked · {preflight.warningCount} warnings
                </span>
              </div>
              {preflight.issues.length === 0 ? (
                <p className="mt-2 text-[10px] leading-4 text-[#9be7c3]">Ready for human approval.</p>
              ) : (
                <ul className="mt-2 space-y-1.5">
                  {preflight.issues.map((issue, index) => (
                    <li className="flex gap-2 text-[9px] leading-4 text-[#a9afb8]" key={`${issue.code}-${index}`}>
                      <span
                        className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                          issue.severity === "blocking"
                            ? "bg-[#e18178]"
                            : issue.severity === "warning"
                              ? "bg-[#e2bb68]"
                              : "bg-[#6f92ad]"
                        }`}
                      />
                      {issue.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </details>
        </div>
      </div>

      <div className="timeline-stage relative overflow-hidden rounded-b-[11px]">
      <div className="timeline-stage-inner min-w-0">
        <div className="min-w-0">
          <div className="grid grid-cols-[92px_minmax(0,1fr)] border-b border-[#242831] bg-[#0d0f12]">
            <div className="border-r border-[#242831]" />
            <div
              aria-label="Timeline scrub ruler"
              className={`relative h-8 overflow-hidden ${hasTimeline ? "cursor-ew-resize" : "cursor-not-allowed"}`}
              data-testid="timeline-scrubber"
              onPointerDown={(event) => {
                if (!event.isPrimary || event.button !== 0 || !hasTimeline) return;
                onPlayheadChange(timeFromPointer(event));
              }}
              onPointerLeave={stopScrubbing}
              onPointerMove={scrubFromPointer}
              ref={trackRef}
              title="Move the pointer across the ruler to scrub"
            >
              {Array.from({ length: tickCount + 1 }, (_, index) => {
                const seconds = index * 10;
                const left = (seconds / timelineDuration) * 100;
                return (
                  <div className="absolute top-0 h-full" key={seconds} style={{ left: `${left}%` }}>
                    <span className="absolute left-0 top-0 h-1.5 border-l border-[#3a3f47]" />
                    <span className="absolute left-1 top-1.5 font-mono text-[8px] text-[#555d68]">{timeLabel(seconds)}</span>
                  </div>
                );
              })}
              {hoverTime !== null ? (
                <span
                  className="pointer-events-none absolute top-1 z-20 -translate-x-1/2 rounded bg-[#f2cf77] px-1.5 py-0.5 font-mono text-[8px] font-bold text-[#221d10] shadow"
                  style={{ left: `${(hoverTime / timelineDuration) * 100}%` }}
                >
                  {timeLabel(hoverTime)}
                </span>
              ) : null}
            </div>
          </div>

          <div className="relative">
            <div
              aria-label="Timeline playhead"
              className="pointer-events-none absolute bottom-0 top-0 z-30 w-px bg-[#f2cf77]"
              data-time={playhead.toFixed(3)}
              data-testid="timeline-playhead"
              style={{ left: `calc(92px + (100% - 92px) * ${playhead / timelineDuration})` }}
            >
              <span className="absolute -left-[4px] -top-1 h-2 w-2 rotate-45 bg-[#f2cf77]" />
            </div>

            <div className="grid grid-cols-[92px_minmax(0,1fr)] border-b border-[#242831]">
              <div className="flex h-12 items-center gap-2 border-r border-[#242831] px-3">
                <LockIcon className="h-3.5 w-3.5 text-[#69717d]" />
                <div>
                  <div className="text-[9px] font-semibold uppercase tracking-[0.1em] text-[#9da4ae]">Base</div>
                  <div className="mt-0.5 text-[8px] text-[#555d68]">master</div>
                </div>
              </div>
              <div className="timeline-grid relative flex h-12 items-center px-1">
                <div className="flex h-7 w-full items-center overflow-hidden rounded border border-[#303640] bg-[#20242a]">
                  <div className="flex h-full w-8 items-center justify-center border-r border-[#303640] text-[#707985]"><LockIcon className="h-3 w-3" /></div>
                  <div className="h-full flex-1 opacity-50 [background-image:repeating-linear-gradient(90deg,#3a4049_0,#3a4049_2px,transparent_2px,transparent_7px)]" />
                  <span className="px-2 text-[9px] text-[#828a95]">{project.baseVideo.name}</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-[92px_minmax(0,1fr)] border-b border-[#242831]">
              <div className="flex h-16 items-center gap-2 border-r border-[#242831] px-3">
                <SparkLineIcon className="h-3.5 w-3.5 text-[#7782f3]" />
                <div>
                  <div className="text-[9px] font-semibold uppercase tracking-[0.1em] text-[#aeb4bd]">B-roll</div>
                  <div className="mt-0.5 flex items-center gap-1 text-[8px] text-[#555d68]"><MutedIcon className="h-2.5 w-2.5" /> muted</div>
                </div>
              </div>
              <div
                className={`timeline-grid relative h-16 overflow-hidden bg-[#0d0f12] ${
                  hasTimeline ? "cursor-crosshair" : "cursor-not-allowed"
                }`}
                data-testid="broll-timeline-drop-zone"
                onDragEnter={(event) => {
                  if (!event.dataTransfer.types.includes("application/x-relaylab-moment")) return;
                  event.preventDefault();
                  if (project.status === "planning") setIsMomentDropActive(true);
                }}
                onDragLeave={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                    setIsMomentDropActive(false);
                  }
                }}
                onDragOver={(event) => {
                  if (!event.dataTransfer.types.includes("application/x-relaylab-moment")) return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = project.status === "planning" ? "copy" : "none";
                }}
                onDrop={dropMomentOnTimeline}
                onPointerDown={(event) => {
                  if (!event.isPrimary || event.button !== 0) return;
                  if (!hasTimeline) return;
                  const bounds = event.currentTarget.getBoundingClientRect();
                  onPlayheadChange(((event.clientX - bounds.left) / bounds.width) * project.duration);
                }}
              >
                {project.overlays.map((overlay) => {
                  const left = (overlay.timelineStart / timelineDuration) * 100;
                  const width = ((overlay.timelineEnd - overlay.timelineStart) / timelineDuration) * 100;
                  const selected = overlay.id === selectedOverlayId;
                  const editable =
                    project.status === "planning" &&
                    overlay.status === "ghost" &&
                    !overlay.lockedByHuman;
                  const overlayStyle =
                    overlay.status === "committed"
                      ? "border-[#4d9d76] bg-[#214836] text-[#a8ebca]"
                      : overlay.lockedByHuman
                        ? "border-[#ae8744] bg-[#4b3b20] text-[#f0cf8d]"
                        : "border-[#6874df] bg-[#262d61] text-[#c6caff] hover:border-[#8f99ff]";
                  return (
                    <div
                      aria-disabled={!editable}
                      aria-label={`${overlay.lockedByHuman ? "Human-locked " : ""}${overlay.status} overlay ${overlay.id}.${editable ? " Use left and right arrow keys to move; use the edge controls to resize." : " Timing is frozen."}`}
                      className={`group absolute top-2 h-12 touch-none overflow-hidden rounded-md border text-left shadow-[0_8px_18px_rgba(0,0,0,.24)] outline-none ${editable ? "cursor-grab active:cursor-grabbing" : "cursor-default"} ${overlayStyle} ${selected ? "ring-2 ring-[#dfe2ff]/25" : ""}`}
                      data-locked={overlay.lockedByHuman ? "true" : "false"}
                      data-overlay-id={overlay.id}
                      data-status={overlay.status}
                      data-testid={`overlay-${overlay.id}`}
                      key={overlay.id}
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelectedOverlay(overlay.id);
                      }}
                      onFocus={() => setSelectedOverlay(overlay.id)}
                      onKeyDown={(event) => keyboardStep(event, overlay, "move")}
                      onLostPointerCapture={cancelDrag}
                      onPointerCancel={cancelDrag}
                      onPointerDown={(event) => beginDrag(event, "move", overlay)}
                      onPointerMove={continueDrag}
                      onPointerUp={endDrag}
                      role="group"
                      style={{ left: `${left}%`, width: `${width}%` }}
                      tabIndex={0}
                    >
                      {editable ? (
                        <span
                          aria-label="Resize overlay start"
                          aria-orientation="horizontal"
                          aria-valuemax={overlay.timelineEnd - 0.5}
                          aria-valuemin={0}
                          aria-valuenow={overlay.timelineStart}
                          aria-valuetext={`${overlay.timelineStart.toFixed(1)} seconds`}
                          className="absolute bottom-0 left-0 top-0 z-10 w-3 min-w-3 cursor-ew-resize border-r border-[#aab0ff]/35 bg-[#8b94ff]/10 outline-none hover:bg-[#aab0ff]/30 focus:bg-[#aab0ff]/35"
                          onKeyDown={(event) => keyboardStep(event, overlay, "start")}
                          onPointerDown={(event) => beginDrag(event, "start", overlay)}
                          role="slider"
                          tabIndex={0}
                        />
                      ) : null}
                      <div className="flex h-full min-w-0 flex-col justify-center px-3">
                        <span className="flex items-center gap-1 truncate text-[9px] font-bold uppercase tracking-[0.1em]">
                          {overlay.lockedByHuman ? <LockIcon className="h-2.5 w-2.5 shrink-0" /> : null}
                          {overlay.status}
                        </span>
                        <span className="mt-0.5 truncate font-mono text-[8px] opacity-80">
                          {overlay.timelineStart.toFixed(1)}–{overlay.timelineEnd.toFixed(1)}
                        </span>
                      </div>
                      {editable ? (
                        <span
                          aria-label="Resize overlay end"
                          aria-orientation="horizontal"
                          aria-valuemax={project.duration}
                          aria-valuemin={overlay.timelineStart + 0.5}
                          aria-valuenow={overlay.timelineEnd}
                          aria-valuetext={`${overlay.timelineEnd.toFixed(1)} seconds`}
                          className="absolute bottom-0 right-0 top-0 z-10 w-3 min-w-3 cursor-ew-resize border-l border-[#aab0ff]/35 bg-[#8b94ff]/10 outline-none hover:bg-[#aab0ff]/30 focus:bg-[#aab0ff]/35"
                          onKeyDown={(event) => keyboardStep(event, overlay, "end")}
                          onPointerDown={(event) => beginDrag(event, "end", overlay)}
                          role="slider"
                          tabIndex={0}
                        />
                      ) : null}
                    </div>
                  );
                })}
                {project.generationSuggestions.map((suggestion) => {
                  const left = (suggestion.timelineStart / timelineDuration) * 100;
                  const width = (suggestion.duration / timelineDuration) * 100;
                  const selected = suggestion.id === selectedSuggestionId;
                  const statusStyle =
                    suggestion.status === "generating"
                      ? "border-[#6e91ac] bg-[#263b4b] text-[#b8dcf5] animate-pulse"
                      : suggestion.status === "failed"
                        ? "border-[#9b5d59] bg-[#442422] text-[#efaaa3]"
                        : "border-[#9a72ad] bg-[#3e2949] text-[#e0b9ef] hover:border-[#bd8fd1]";
                  return (
                    <button
                      aria-label={`AI B-roll generation suggestion from ${suggestion.timelineStart.toFixed(1)} to ${suggestion.timelineEnd.toFixed(1)} seconds`}
                      className={`absolute top-2 h-12 overflow-hidden rounded-md border border-dashed px-2 text-left shadow-[0_8px_18px_rgba(0,0,0,.24)] outline-none ${statusStyle} ${selected ? "ring-2 ring-[#e5c6f2]/30" : ""}`}
                      data-generation-suggestion-id={suggestion.id}
                      data-status={suggestion.status}
                      data-testid={`generation-suggestion-${suggestion.id}`}
                      key={suggestion.id}
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelectedSuggestion(suggestion.id);
                      }}
                      onFocus={() => setSelectedSuggestion(suggestion.id)}
                      style={{ left: `${left}%`, width: `${width}%` }}
                      type="button"
                    >
                      <span className="block truncate text-[8px] font-bold uppercase tracking-[0.08em]">
                        {suggestion.status === "generating" ? "Generating…" : "Generate"}
                      </span>
                      <span className="mt-0.5 block truncate font-mono text-[8px] opacity-80">
                        {suggestion.duration.toFixed(1)}s · prompt proposal
                      </span>
                    </button>
                  );
                })}
                {isMomentDropActive ? (
                  <div className="pointer-events-none absolute inset-1 z-40 flex items-center justify-center rounded-md border-2 border-dashed border-[#7ee2b8] bg-[#10231b]/90 text-[9px] font-bold uppercase tracking-[0.1em] text-[#a2edce]">
                    Drop to place
                  </div>
                ) : null}
              </div>
            </div>

            <div className="grid grid-cols-[92px_minmax(0,1fr)]">
              <div className="flex h-9 items-center gap-2 border-r border-[#242831] px-3 text-[9px] font-semibold uppercase tracking-[0.1em] text-[#666e79]"><CaptionsIcon className="h-3 w-3" /> CC</div>
              <div className="timeline-grid relative h-9 overflow-hidden bg-[#0d0f12] px-1" aria-label="Caption blocks">
                {project.captions.length > 0 ? (
                  project.captions.map((caption) => {
                    const left = (caption.start / timelineDuration) * 100;
                    const width = ((caption.end - caption.start) / timelineDuration) * 100;
                    const active = playhead >= caption.start && playhead < caption.end;
                    return (
                      <div
                        className={`absolute top-2 h-5 overflow-hidden rounded border text-[8px] leading-5 ${
                          active
                            ? "border-[#7ee2b8] bg-[#1a3327] text-[#c7f2df]"
                            : "border-[#2c313a] bg-[#171a1f] text-[#7a828d]"
                        }`}
                        key={caption.id}
                        style={{ left: `${left}%`, width: `${width}%` }}
                        title={caption.text}
                      >
                        <span className="block truncate px-1.5">{caption.text}</span>
                      </div>
                    );
                  })
                ) : (
                  <span className="absolute left-3 top-2 text-[8px] text-[#555d68]">
                    No captions
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {hasSelection ? (
        <aside className="timeline-inspector absolute bottom-0 right-0 top-0 z-40 w-[300px] overflow-y-auto border-l border-[#303640] bg-[#111318]/98 p-3 shadow-[-18px_0_44px_rgba(0,0,0,.42)] backdrop-blur" aria-label="Selected timeline item details">
          {selectedSuggestion ? (
            <div>
              <div className="mb-2 flex justify-end">
                <button
                  aria-label="Close timeline inspector"
                  className="icon-button h-7 w-7"
                  onClick={() => setSelectedSuggestion(null)}
                  type="button"
                >
                  <CloseIcon className="h-3.5 w-3.5" />
                </button>
              </div>
              <GenerationSuggestionPanel suggestion={selectedSuggestion} />
            </div>
          ) : selectedOverlay ? (
            <div>
              <div className="flex items-center justify-between">
                <div className="micro-label">Overlay details</div>
                <div className="flex items-center gap-1.5">
                  <span
                    className={`flex items-center gap-1 rounded border px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.1em] ${
                      selectedOverlay.status === "committed"
                        ? "border-[#3f795e] bg-[#1b392b] text-[#9de3c1]"
                        : selectedOverlay.lockedByHuman
                          ? "border-[#7c643b] bg-[#332817] text-[#e9c77e]"
                          : "border-[#515cc2] bg-[#252b5b] text-[#abb1ff]"
                    }`}
                  >
                    {selectedOverlay.lockedByHuman ? <LockIcon className="h-2.5 w-2.5" /> : null}
                    {selectedOverlay.status === "committed"
                      ? "Committed"
                      : selectedOverlay.lockedByHuman
                        ? "Human locked"
                        : "Ghost"}
                  </span>
                  <button
                    aria-label="Close timeline inspector"
                    className="icon-button h-7 w-7"
                    onClick={() => setSelectedOverlay(null)}
                    type="button"
                  >
                    <CloseIcon className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <p className="mt-2 line-clamp-2 min-h-8 text-[10px] leading-4 text-[#aab0b9]">{selectedMoment?.description}</p>
              <label className="mt-2 block">
                <span className="mb-1 block text-[9px] text-[#69717d]">Source moment</span>
                <select
                  aria-label="Overlay source moment"
                  className="numeric-field truncate text-[9px] disabled:cursor-not-allowed disabled:opacity-50"
                  data-testid="overlay-moment-select"
                  disabled={!selectedEditable}
                  onChange={(event) => swapOverlayMoment(selectedOverlay.id, event.target.value)}
                  value={selectedOverlay.momentId ?? ""}
                >
                  {availableMoments.map((moment) => (
                    <option key={moment.id} value={moment.id}>
                      {moment.assetName} · {moment.description}
                    </option>
                  ))}
                </select>
              </label>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="mb-1 block text-[9px] text-[#69717d]">Timeline start</span>
                  <input
                    aria-label="Overlay timeline start"
                    className="numeric-field text-[10px] disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={!selectedEditable}
                    min={0}
                    onChange={(event) => moveOverlay(selectedOverlay.id, Number(event.target.value))}
                    step={0.1}
                    type="number"
                    value={selectedOverlay.timelineStart}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[9px] text-[#69717d]">Duration</span>
                  <input
                    aria-label="Overlay duration"
                    className="numeric-field text-[10px] disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={!selectedEditable}
                    min={0.5}
                    onChange={(event) =>
                      resizeOverlayEnd(
                        selectedOverlay.id,
                        selectedOverlay.timelineStart + Number(event.target.value),
                      )
                    }
                    step={0.1}
                    type="number"
                    value={Number((selectedOverlay.timelineEnd - selectedOverlay.timelineStart).toFixed(3))}
                  />
                </label>
              </div>
              <div className="mt-2 rounded-md border border-[#242831] bg-[#0c0e11] px-2.5 py-2">
                <div className="flex justify-between text-[9px] text-[#626a75]"><span>Source in</span><span>Source out</span></div>
                <div className="mt-1 flex justify-between font-mono text-[10px] text-[#9ca3ad]"><span>{selectedOverlay.sourceStart.toFixed(1)}s</span><span>{selectedOverlay.sourceEnd.toFixed(1)}s</span></div>
              </div>
              {selectedAsset?.origin === "generated" ? (
                <RegenerateGeneratedClip asset={selectedAsset} overlay={selectedOverlay} />
              ) : null}
              {selectedOverlay.alternatives?.length ? (
                <div className="mt-2 rounded-md border border-[#242831] bg-[#0c0e11] p-2.5">
                  <div className="micro-label">Why this clip?</div>
                  <p className="mt-1 text-[9px] leading-4 text-[#7a828d]">
                    Ranked candidates considered the last time the agent replanned this slot.
                  </p>
                  <ul className="mt-2 space-y-1.5">
                    {selectedOverlay.alternatives.map((candidate) => {
                      const isCurrent = candidate.momentId === selectedOverlay.momentId;
                      return (
                        <li
                          className={`rounded-md border px-2 py-1.5 ${
                            isCurrent
                              ? "border-[#3f795e] bg-[#152720]"
                              : "border-[#2c313a] bg-[#15171b]"
                          }`}
                          data-testid={`alternative-${candidate.momentId}`}
                          key={candidate.momentId}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate text-[9px] font-semibold text-[#c5cbd4]">
                              {candidate.assetName}
                            </span>
                            <span className="shrink-0 font-mono text-[8px] text-[#7a828d]">
                              {candidate.score.toFixed(2)}
                            </span>
                          </div>
                          <p className="mt-0.5 line-clamp-2 text-[9px] leading-4 text-[#828a95]">
                            {candidate.description}
                          </p>
                          {isCurrent ? (
                            <span className="mt-1 inline-block text-[8px] font-bold uppercase tracking-[0.08em] text-[#9de3c1]">
                              Current choice
                            </span>
                          ) : (
                            <button
                              className="mt-1 rounded border border-[#343a44] bg-[#191c21] px-2 py-1 text-[8px] font-semibold text-[#a4abb5] outline-none transition hover:border-[#626b77] hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
                              data-testid={`swap-to-${candidate.momentId}`}
                              disabled={!selectedEditable}
                              onClick={() => swapOverlayMoment(selectedOverlay.id, candidate.momentId)}
                              type="button"
                            >
                              Swap in
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null}
              <div className="mt-2 grid grid-cols-3 gap-2">
                <button
                  aria-label="Split overlay at playhead"
                  className="flex h-9 items-center justify-center gap-1 rounded-md border border-[#343a44] bg-[#191c21] px-2 text-[8px] font-semibold text-[#a4abb5] outline-none transition hover:border-[#626b77] hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
                  data-testid="split-overlay"
                  disabled={!canSplitSelected}
                  onClick={() => splitOverlay(selectedOverlay.id, playhead)}
                  title={
                    canSplitSelected
                      ? `Split at ${playhead.toFixed(1)}s`
                      : "Move the playhead inside this clip, at least 0.5 seconds from either edge."
                  }
                  type="button"
                >
                  <ScissorsIcon className="h-3.5 w-3.5" /> Split
                </button>
                <button
                  aria-label={selectedOverlay.lockedByHuman ? "Unlock overlay" : "Lock overlay"}
                  className={`flex h-9 items-center justify-center gap-1 rounded-md border px-2 text-[8px] font-semibold outline-none transition disabled:cursor-not-allowed disabled:opacity-40 ${
                    selectedOverlay.lockedByHuman
                      ? "border-[#846a3e] bg-[#342916] text-[#e7c376] hover:border-[#b28b49]"
                      : "border-[#343a44] bg-[#191c21] text-[#a4abb5] hover:border-[#626b77] hover:text-white"
                  }`}
                  data-testid="toggle-overlay-lock"
                  disabled={project.status !== "planning" || selectedOverlay.status !== "ghost"}
                  onClick={() => setOverlayLocked(selectedOverlay.id, !selectedOverlay.lockedByHuman)}
                  type="button"
                >
                  {selectedOverlay.lockedByHuman ? <UnlockIcon className="h-3 w-3" /> : <LockIcon className="h-3 w-3" />}
                  {selectedOverlay.lockedByHuman ? "Unlock" : "Lock"}
                </button>
                <button
                  aria-label="Remove overlay"
                  className="flex h-9 items-center justify-center gap-1 rounded-md border border-[#4b3131] bg-[#211515] px-2 text-[8px] font-semibold text-[#ce8b83] outline-none transition hover:border-[#80504b] hover:text-[#f0aaa1] disabled:cursor-not-allowed disabled:opacity-35"
                  data-testid="remove-overlay"
                  disabled={!selectedEditable}
                  onClick={() => removeOverlayProposal(selectedOverlay.id)}
                  type="button"
                >
                  <TrashIcon className="h-3 w-3" /> Remove
                </button>
              </div>
              <p className="mt-2 text-[9px] leading-4 text-[#59616c]">
                {project.status !== "planning"
                  ? "Timing, source choice, and lock state are frozen after human approval."
                  : selectedOverlay.lockedByHuman
                    ? "This human lock rejects agent updates and removal. Unlock it here to keep editing."
                    : "Drag the block or use arrow keys. Shift + arrow moves one second."}
              </p>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-center text-[10px] leading-4 text-[#5f6772]">Select an overlay to inspect its exact timing and source range.</div>
          )}
        </aside>
        ) : null}
      </div>
      </div>
    </section>
  );
}
