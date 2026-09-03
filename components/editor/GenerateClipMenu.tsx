"use client";

import { useEffect, useRef, useState } from "react";

import { useRelayLabStore } from "./EditorProvider";
import { WandIcon } from "./Icons";

const MIN_PROMPT_LENGTH = 10;
const MIN_DURATION = 1;
const MAX_DURATION = 10;

type Feedback = { kind: "success" | "error"; message: string } | null;

/**
 * Human-typed alternative to "Suggest placements": type your own prompt and
 * timing directly, rather than relying on the transcript-driven heuristic.
 * Creates a plain generation suggestion — the same reviewable ghost state a
 * WebMCP agent's propose_generated_broll call would produce. Never spends
 * money itself; that still requires opening the suggestion and clicking
 * Generate Clip, same as every other path into this feature.
 */
export function GenerateClipMenu({ playhead }: { playhead: number }) {
  const project = useRelayLabStore((state) => state.project);
  const proposeGeneratedBroll = useRelayLabStore((state) => state.proposeGeneratedBroll);
  const [isOpen, setIsOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [timelineStart, setTimelineStart] = useState(0);
  const [duration, setDuration] = useState(5);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimelineStart(Math.round(Math.min(playhead, Math.max(0, project.duration - duration)) * 10) / 10);
      setFeedback(null);
    }
    // Only re-seed the default start when the popover opens, not on every playhead tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setIsOpen(false);
    }
    function closeOnOutsidePointer(event: PointerEvent) {
      if (event.target instanceof Node && !containerRef.current?.contains(event.target)) {
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

  const canSubmit = project.status === "planning" && prompt.trim().length >= MIN_PROMPT_LENGTH;

  function submit() {
    const result = proposeGeneratedBroll({
      timelineStart,
      duration,
      prompt: prompt.trim(),
      reason: "Human-typed generation request.",
    });
    if (!result.ok) {
      setFeedback({ kind: "error", message: result.message });
      return;
    }
    setFeedback({ kind: "success", message: "Added as a suggestion. Open it on the timeline to review or generate." });
    setPrompt("");
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        aria-label="Generate AI clip"
        className="icon-button"
        data-testid="generate-clip-menu-trigger"
        onClick={() => setIsOpen((current) => !current)}
        title="Manually request an AI-generated B-roll clip"
        type="button"
      >
        <WandIcon className="h-4 w-4" />
      </button>

      {isOpen ? (
        <section
          aria-label="Generate AI clip"
          className="absolute right-0 top-[calc(100%+8px)] z-50 w-[320px] rounded-xl border border-[#303640] bg-[#111419] p-3 shadow-[0_22px_70px_rgba(0,0,0,.55)]"
          data-testid="generate-clip-menu"
          role="dialog"
        >
          <div className="mb-2">
            <div className="micro-label">Generate AI clip</div>
            <p className="mt-1.5 text-[10px] leading-4 text-[#68717c]">
              Type your own prompt and timing. Adds a suggestion — nothing generates or spends
              credit until you open it and click Generate Clip.
            </p>
          </div>

          <label className="mb-2 block">
            <span className="mb-1 block text-[9px] text-[#69717d]">Prompt</span>
            <textarea
              aria-label="Generation prompt"
              className="numeric-field min-h-16 resize-none text-[10px] leading-4"
              data-testid="generate-clip-prompt"
              maxLength={1000}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="A close-up of hands typing on a laptop in a bright office, natural motion, no text overlays"
              value={prompt}
            />
            <span className="mt-1 block text-[8px] text-[#5c6470]">
              {prompt.trim().length}/{MIN_PROMPT_LENGTH} min characters
            </span>
          </label>

          <div className="mb-2 grid grid-cols-2 gap-2">
            <label className="block">
              <span className="mb-1 block text-[9px] text-[#69717d]">Timeline start</span>
              <input
                aria-label="Suggestion timeline start"
                className="numeric-field text-[10px]"
                data-testid="generate-clip-start"
                min={0}
                onChange={(event) => setTimelineStart(Number(event.target.value))}
                step={0.5}
                type="number"
                value={timelineStart}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[9px] text-[#69717d]">Duration</span>
              <input
                aria-label="Suggestion duration"
                className="numeric-field text-[10px]"
                data-testid="generate-clip-duration"
                max={MAX_DURATION}
                min={MIN_DURATION}
                onChange={(event) => setDuration(Number(event.target.value))}
                step={0.5}
                type="number"
                value={duration}
              />
            </label>
          </div>

          <button
            className="flex h-9 w-full items-center justify-center gap-1.5 rounded-md border border-[#4a3f6b] bg-[#221c38] text-[9px] font-semibold text-[#c9b8f5] outline-none transition hover:border-[#6a5aa0] disabled:cursor-not-allowed disabled:opacity-40"
            data-testid="generate-clip-submit"
            disabled={!canSubmit}
            onClick={submit}
            type="button"
          >
            <WandIcon className="h-3.5 w-3.5" /> Add suggestion
          </button>

          {feedback ? (
            <p
              aria-live="polite"
              className={`mt-2 text-[9px] leading-4 ${
                feedback.kind === "error" ? "text-[#e59589]" : "text-[#83cdaa]"
              }`}
            >
              {feedback.message}
            </p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
