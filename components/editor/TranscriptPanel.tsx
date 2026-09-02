"use client";

import { useEffect, useRef } from "react";

import { useRelayLabStore } from "./EditorProvider";
import { TranscriptIcon } from "./Icons";

export function TranscriptPanel({
  playhead,
  onPlayheadChange,
}: {
  playhead: number;
  onPlayheadChange?: (time: number) => void;
}) {
  const transcript = useRelayLabStore((state) => state.project.transcript);
  const activeId = transcript.find(
    (segment) => playhead >= segment.start && playhead < segment.end,
  )?.id;
  const activeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [activeId]);

  return (
    <aside className="editor-panel transcript-column flex min-h-0 flex-col overflow-hidden">
      <div className="panel-heading">
        <div className="flex items-center gap-2">
          <TranscriptIcon className="h-3.5 w-3.5 text-[#7ee2b8]" />
          <div>
            <div className="micro-label">Transcript</div>
            <div className="mt-0.5 font-mono text-[9px] text-[#676f7b]">
              {transcript.length} timed segments
            </div>
          </div>
        </div>
        <span className="text-[9px] text-[#606873]">Click to seek</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {transcript.length === 0 ? (
          <div className="flex h-full items-center justify-center px-4 text-center text-[10px] leading-4 text-[#5f6772]">
            No transcript yet.
          </div>
        ) : null}
        {transcript.map((segment) => {
          const active = segment.id === activeId;
          return (
            <button
              aria-label={`Seek to ${segment.start.toFixed(1)} seconds: ${segment.text}`}
              className={`relative block w-full border-l px-3 py-2.5 text-left outline-none transition-colors focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[#7ee2b8]/60 ${
                active
                  ? "border-[#7ee2b8] bg-[#151c1a]"
                  : "border-[#242831] hover:bg-[#12151a]"
              }`}
              key={segment.id}
              onClick={() => onPlayheadChange?.(segment.start)}
              ref={active ? activeRef : undefined}
              type="button"
            >
              <div className={`mb-1 font-mono text-[9px] ${active ? "text-[#7ee2b8]" : "text-[#5f6772]"}`}>
                {segment.start.toFixed(1)} — {segment.end.toFixed(1)}
              </div>
              <p className={`text-[11px] leading-[1.55] ${active ? "text-[#e7ebe9]" : "text-[#9da4ae]"}`}>
                {segment.text}
              </p>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
