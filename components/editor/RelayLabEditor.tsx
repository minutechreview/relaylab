"use client";

import { useEffect, useRef, useState } from "react";

import {
  PRODUCT_NAME,
  PRODUCT_NAME_STATUS,
} from "@/lib/brand";
import { getPlanPreflight } from "@/lib/editor/planPreflight";

import { BrollLibrary } from "./BrollLibrary";
import { CaptionPanel } from "./CaptionPanel";
import {
  EditorProvider,
  useRelayLabStore,
  type EditorProjectKind,
} from "./EditorProvider";
import { ExportMenu } from "./ExportMenu";
import { CaptionsIcon, CheckIcon, FilmIcon, TranscriptIcon } from "./Icons";
import { PreviewPanel } from "./PreviewPanel";
import { SettingsPanel } from "./SettingsPanel";
import { Timeline } from "./Timeline";
import { TranscriptPanel } from "./TranscriptPanel";
import { WebMcpBridge } from "./WebMcpBridge";

function EditorWorkspace({ projectKind }: { projectKind: EditorProjectKind }) {
  const project = useRelayLabStore((state) => state.project);
  const approvePlan = useRelayLabStore((state) => state.approvePlan);
  const [playhead, setPlayhead] = useState(() =>
    projectKind === "demo" ? 21.8 : 0,
  );
  const [sidePanel, setSidePanel] = useState<"library" | "transcript" | "captions" | null>(
    "library",
  );
  const previousBaseUrl = useRef(project.baseVideo.objectUrl);
  const localMediaCount =
    (project.baseVideo.objectUrl ? 1 : 0) +
    project.brollAssets.filter((asset) => asset.objectUrl).length;
  const generationInFlight = project.generationSuggestions.some(
    (suggestion) => suggestion.status === "generating",
  ) || project.brollAssets.some(
    (asset) => asset.generation?.status === "regenerating",
  );
  const baseReady = project.duration > 0;
  const preflight = getPlanPreflight(project);

  useEffect(() => {
    setPlayhead((current) => Math.min(current, project.duration));
  }, [project.duration]);

  useEffect(() => {
    if (previousBaseUrl.current !== project.baseVideo.objectUrl) {
      previousBaseUrl.current = project.baseVideo.objectUrl;
      setPlayhead(0);
    }
  }, [project.baseVideo.objectUrl]);

  const statusStyles = {
    planning: "border-[#4a4030] bg-[#211c14] text-[#e3b96d]",
    approved: "border-[#315345] bg-[#15251f] text-[#7ee2b8]",
    committed: "border-[#365064] bg-[#14202a] text-[#8fcff5]",
  }[project.status];

  const statusDot = {
    planning: "bg-[#e3b96d]",
    approved: "bg-[#7ee2b8] shadow-[0_0_8px_#7ee2b8]",
    committed: "bg-[#8fcff5] shadow-[0_0_8px_#8fcff5]",
  }[project.status];

  return (
    <main className="relaylab-main h-[100dvh] overflow-hidden bg-[#090a0c] p-2.5 text-[#f4f5f6]">
      <div className="relaylab-shell mx-auto flex h-full max-w-[1800px] flex-col gap-2.5">
        <header className="flex h-12 shrink-0 items-center justify-between rounded-lg border border-[#242831] bg-[#101216] px-3 shadow-[0_12px_36px_rgba(0,0,0,.16)]">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex items-center gap-2.5">
              <div className="relative h-7 w-7 overflow-hidden rounded-lg border border-[#35433d] bg-[#151b18]">
                <span className="absolute left-[7px] top-[6px] h-[14px] w-px rotate-[24deg] bg-[#7ee2b8]" />
                <span className="absolute right-[7px] top-[6px] h-[14px] w-px -rotate-[24deg] bg-[#7ee2b8]" />
                <span className="absolute left-[10px] top-[13px] h-px w-[7px] bg-[#7ee2b8]" />
              </div>
              <div className="hidden text-[13px] font-extrabold tracking-[-0.02em] text-white sm:block">{PRODUCT_NAME}</div>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              aria-label="Toggle B-roll library"
              aria-pressed={sidePanel === "library"}
              className={`icon-button ${sidePanel === "library" ? "icon-button-active" : ""}`}
              onClick={() => setSidePanel((current) => current === "library" ? null : "library")}
              title="B-roll library"
              type="button"
            >
              <FilmIcon className="h-4 w-4" />
            </button>
            <button
              aria-label="Toggle transcript"
              aria-pressed={sidePanel === "transcript"}
              className={`icon-button ${sidePanel === "transcript" ? "icon-button-active" : ""}`}
              onClick={() => setSidePanel((current) => current === "transcript" ? null : "transcript")}
              title="Transcript"
              type="button"
            >
              <TranscriptIcon className="h-4 w-4" />
            </button>
            <button
              aria-label="Toggle captions"
              aria-pressed={sidePanel === "captions"}
              className={`icon-button ${sidePanel === "captions" ? "icon-button-active" : ""}`}
              onClick={() => setSidePanel((current) => current === "captions" ? null : "captions")}
              title="Captions"
              type="button"
            >
              <CaptionsIcon className="h-4 w-4" />
            </button>
            <WebMcpBridge />
            <SettingsPanel />
            <ExportMenu />
            <div
              aria-label={`Project ${project.status}`}
              className={`flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[8px] font-bold uppercase tracking-[0.1em] ${statusStyles}`}
              data-project-status={project.status}
              data-testid="project-status"
              title={`Project ${project.status}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${statusDot}`} /> {project.status}
            </div>
            {project.status === "planning" ? (
              <button
                className="flex h-8 items-center gap-1.5 rounded-md border border-[#5d8d77] bg-[#193429] px-2.5 text-[9px] font-bold text-[#9df0ca] outline-none transition hover:border-[#7ee2b8] hover:bg-[#1f4033] focus-visible:ring-2 focus-visible:ring-[#7ee2b8]/30 disabled:cursor-not-allowed disabled:opacity-40"
                data-testid="approve-plan"
                disabled={generationInFlight || !baseReady || preflight.status === "blocked"}
                onClick={() => approvePlan()}
                title={
                  !baseReady
                    ? "Upload a base talking-head video before approving the plan."
                    : generationInFlight
                    ? "Wait for the human-started generation request to finish or fail."
                    : "Human-only action. WebMCP cannot approve the plan; unresolved suggestions remain suggestions."
                }
                type="button"
              >
                <CheckIcon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Approve</span>
              </button>
            ) : (
              <div className="flex h-8 items-center gap-1.5 rounded-md border border-[#2a2f37] bg-[#15181d] px-2.5 text-[9px] text-[#8d949e]" title={project.status === "approved" ? "Approved by human; ready for agent commit" : "Plan committed"}>
                <CheckIcon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{project.status === "approved" ? "Approved" : "Committed"}</span>
              </div>
            )}
          </div>
        </header>

        <div className={`workspace-layout grid min-h-0 flex-1 gap-2.5 ${sidePanel ? "grid-cols-[250px_minmax(0,1fr)]" : "grid-cols-1"}`}>
          {sidePanel ? (
            <div className="workspace-sidebar min-h-0">
              {sidePanel === "library" ? (
                <BrollLibrary playhead={playhead} projectKind={projectKind} />
              ) : sidePanel === "transcript" ? (
                <TranscriptPanel onPlayheadChange={setPlayhead} playhead={playhead} />
              ) : (
                <CaptionPanel onPlayheadChange={setPlayhead} playhead={playhead} />
              )}
            </div>
          ) : null}
          <PreviewPanel
            onPlayheadChange={setPlayhead}
            playhead={playhead}
            projectKind={projectKind}
          />
        </div>

        <Timeline onPlayheadChange={setPlayhead} playhead={playhead} />

        <footer className="flex h-4 shrink-0 items-center justify-between px-1 text-[8px] text-[#505761]">
          <span>
            {PRODUCT_NAME_STATUS} · {localMediaCount > 0
              ? `${localMediaCount} local media source${localMediaCount === 1 ? "" : "s"} active`
              : projectKind === "demo"
                ? "deterministic demo metadata"
                : "no media loaded yet"}
          </span>
          <span title="Base audio only; all B-roll permanently muted">Audio: base only</span>
        </footer>
      </div>
    </main>
  );
}

export function RelayLabEditor({
  projectKind = "demo",
}: {
  projectKind?: EditorProjectKind;
}) {
  return (
    <EditorProvider projectKind={projectKind}>
      <EditorWorkspace projectKind={projectKind} />
    </EditorProvider>
  );
}
