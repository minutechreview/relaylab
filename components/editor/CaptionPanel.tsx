"use client";

import { useEffect, useState } from "react";

import type { Caption, CaptionPosition } from "@/lib/editor/types";

import { useRelayLabStore } from "./EditorProvider";
import { CaptionsIcon, PlusIcon, TrashIcon } from "./Icons";
import { useLocalMedia } from "./LocalMediaProvider";

function CaptionRow({
  caption,
  disabled,
  onSeek,
}: {
  caption: Caption;
  disabled: boolean;
  onSeek: (time: number) => void;
}) {
  const updateCaption = useRelayLabStore((state) => state.updateCaption);
  const removeCaption = useRelayLabStore((state) => state.removeCaption);
  const [text, setText] = useState(caption.text);
  const [start, setStart] = useState(String(caption.start));
  const [end, setEnd] = useState(String(caption.end));

  useEffect(() => setText(caption.text), [caption.text]);
  useEffect(() => setStart(String(caption.start)), [caption.start]);
  useEffect(() => setEnd(String(caption.end)), [caption.end]);

  function saveText() {
    if (!updateCaption(caption.id, { text })) setText(caption.text);
  }

  function saveRange() {
    if (!updateCaption(caption.id, { start: Number(start), end: Number(end) })) {
      setStart(String(caption.start));
      setEnd(String(caption.end));
    }
  }

  return (
    <article className="rounded-lg border border-[#272c34] bg-[#111419] p-2.5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <button
          className="font-mono text-[9px] text-[#7ee2b8] hover:text-[#b4f4d8]"
          onClick={() => onSeek(caption.start)}
          type="button"
        >
          {caption.start.toFixed(1)}s
        </button>
        <button
          aria-label="Delete caption"
          className="icon-button h-6 w-6 text-[#a56862] disabled:opacity-35"
          disabled={disabled}
          onClick={() => removeCaption(caption.id)}
          type="button"
        >
          <TrashIcon className="h-3 w-3" />
        </button>
      </div>
      <textarea
        aria-label={`Caption text at ${caption.start.toFixed(1)} seconds`}
        className="numeric-field min-h-16 max-h-28 resize-none overflow-y-auto text-[10px] leading-4 disabled:opacity-55"
        disabled={disabled}
        maxLength={240}
        onBlur={saveText}
        onChange={(event) => setText(event.target.value)}
        value={text}
      />
      <div className="mt-2 grid grid-cols-2 gap-2">
        <label className="text-[8px] text-[#68717c]">
          Start
          <input
            aria-label="Caption start"
            className="numeric-field mt-1 text-[9px] disabled:opacity-55"
            disabled={disabled}
            min={0}
            onBlur={saveRange}
            onChange={(event) => setStart(event.target.value)}
            step={0.1}
            type="number"
            value={start}
          />
        </label>
        <label className="text-[8px] text-[#68717c]">
          End
          <input
            aria-label="Caption end"
            className="numeric-field mt-1 text-[9px] disabled:opacity-55"
            disabled={disabled}
            min={0.25}
            onBlur={saveRange}
            onChange={(event) => setEnd(event.target.value)}
            step={0.1}
            type="number"
            value={end}
          />
        </label>
      </div>
    </article>
  );
}

export function CaptionPanel({
  playhead,
  onPlayheadChange,
}: {
  playhead: number;
  onPlayheadChange: (time: number) => void;
}) {
  const project = useRelayLabStore((state) => state.project);
  const addCaption = useRelayLabStore((state) => state.addCaption);
  const generateCaptions = useRelayLabStore((state) => state.generateCaptions);
  const setCaptionPosition = useRelayLabStore((state) => state.setCaptionPosition);
  const { transcription, transcribeBaseVideo } = useLocalMedia();
  const [draft, setDraft] = useState("");
  const [duration, setDuration] = useState(3);
  const editable = project.status === "planning" && project.duration > 0;

  function addAtPlayhead() {
    const id = addCaption({
      start: playhead,
      end: Math.min(project.duration, playhead + duration),
      text: draft,
    });
    if (id) setDraft("");
  }

  const positions: Array<{ value: CaptionPosition; label: string }> = [
    { value: "top", label: "Top" },
    { value: "center", label: "Center" },
    { value: "bottom", label: "Bottom" },
  ];

  return (
    <aside className="editor-panel flex min-h-0 flex-col overflow-hidden">
      <div className="panel-heading">
        <div className="flex items-center gap-2">
          <CaptionsIcon className="h-3.5 w-3.5 text-[#7ee2b8]" />
          <div>
            <div className="micro-label">Captions</div>
            <div className="mt-0.5 font-mono text-[9px] text-[#676f7b]">
              {project.captions.length} blocks
            </div>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2.5">
        <section className="rounded-lg border border-[#272c34] bg-[#0d0f12] p-2.5">
          <div className="text-[8px] font-bold uppercase tracking-[0.12em] text-[#69717d]">
            Placement
          </div>
          <div className="mt-2 grid grid-cols-3 gap-1" role="group" aria-label="Caption placement">
            {positions.map((position) => {
              const active = project.captionStyle.position === position.value;
              return (
                <button
                  aria-pressed={active}
                  className={`flex h-8 items-center justify-center rounded-md border px-1 text-[9px] font-semibold transition disabled:opacity-45 ${
                    active
                      ? "border-[#547966] bg-[#172820] text-[#9be8c6]"
                      : "border-[#2b3038] bg-[#14171b] text-[#7f8792] hover:border-[#444b55]"
                  }`}
                  disabled={!editable}
                  key={position.value}
                  onClick={() => setCaptionPosition(position.value)}
                  type="button"
                >
                  {position.label}
                </button>
              );
            })}
          </div>
        </section>

        {project.transcript.length > 0 ? (
          <div className="mt-2">
            <button
              className="flex h-9 w-full items-center justify-center gap-1.5 rounded-md border border-[#365847] bg-[#16251e] text-[9px] font-semibold text-[#97dfbf] hover:border-[#568a70] disabled:opacity-40"
              data-testid="captions-from-transcript"
              disabled={!editable}
              onClick={() => {
                if (
                  project.captions.length === 0 ||
                  window.confirm("Replace current captions with the timed transcript?")
                ) generateCaptions();
              }}
              title="Turns the project's existing transcript into caption blocks. Local only — no API call."
              type="button"
            >
              <CaptionsIcon className="h-3.5 w-3.5" /> Create from transcript
            </button>
            <p className="mt-1 text-center text-[8px] leading-4 text-[#5c6470]">
              Uses the existing transcript. Does not call OpenAI.
            </p>
          </div>
        ) : null}

        {project.baseVideo.objectUrl ? (
          <div className={project.transcript.length > 0 ? "mt-3" : "mt-2"}>
            <button
              className="flex h-9 w-full items-center justify-center gap-1.5 rounded-md border border-[#365847] bg-[#16251e] text-[9px] font-semibold text-[#97dfbf] hover:border-[#568a70] disabled:opacity-40"
              data-testid="auto-captions"
              disabled={!editable || transcription.status === "reading"}
              onClick={() => void transcribeBaseVideo()}
              title="Sends the uploaded video's audio to OpenAI Whisper for real speech-to-text transcription."
              type="button"
            >
              <CaptionsIcon className="h-3.5 w-3.5" />
              {transcription.status === "reading" ? "Transcribing…" : "Auto captions (OpenAI)"}
            </button>
            <p className="mt-1 text-center text-[8px] leading-4 text-[#5c6470]">
              Runs OpenAI Whisper on your uploaded video's audio.
            </p>
            {transcription.message ? (
              <p
                aria-live="polite"
                className={`mt-1.5 text-[8px] leading-4 ${
                  transcription.status === "error" ? "text-[#d9867c]" : "text-[#75808a]"
                }`}
              >
                {transcription.message}
              </p>
            ) : null}
          </div>
        ) : project.transcript.length === 0 ? (
          <p className="mt-2 rounded-md border border-[#2a2f37] bg-[#12151a] px-2.5 py-2 text-[9px] leading-4 text-[#737b86]">
            No timed transcript yet. Add captions manually below; automatic transcription needs a configured provider.
          </p>
        ) : null}

        <section className="mt-2 rounded-lg border border-[#272c34] bg-[#0d0f12] p-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[8px] font-bold uppercase tracking-[0.12em] text-[#69717d]">
              Add at {playhead.toFixed(1)}s
            </span>
            <label className="flex items-center gap-1 text-[8px] text-[#68717c]">
              Length
              <input
                aria-label="New caption duration"
                className="numeric-field w-14 py-1 text-[9px]"
                max={10}
                min={0.5}
                onChange={(event) => setDuration(Number(event.target.value))}
                step={0.5}
                type="number"
                value={duration}
              />
            </label>
          </div>
          <textarea
            aria-label="New caption text"
            className="numeric-field mt-2 min-h-16 resize-none text-[10px] leading-4 disabled:opacity-45"
            disabled={!editable}
            maxLength={240}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Type caption…"
            value={draft}
          />
          <button
            className="mt-2 flex h-8 w-full items-center justify-center gap-1.5 rounded-md border border-[#465f53] bg-[#17251f] text-[9px] font-semibold text-[#98dfbf] hover:border-[#6a9a82] disabled:opacity-35"
            disabled={!editable || draft.trim().length === 0}
            onClick={addAtPlayhead}
            type="button"
          >
            <PlusIcon className="h-3.5 w-3.5" /> Add caption
          </button>
        </section>

        <div className="mt-2 space-y-2">
          {project.captions.map((caption) => (
            <CaptionRow
              caption={caption}
              disabled={!editable}
              key={caption.id}
              onSeek={onPlayheadChange}
            />
          ))}
        </div>
      </div>
    </aside>
  );
}
