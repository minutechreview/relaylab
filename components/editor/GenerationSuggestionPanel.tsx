"use client";

import { useEffect, useState } from "react";

import { useRelayLabStore } from "./EditorProvider";
import { TrashIcon } from "./Icons";
import type { GeneratedBrollSuggestion } from "@/lib/editor/types";
import { requestAndMeasureGeneratedBroll } from "@/lib/generation/requestGeneratedBroll";

export function GenerationSuggestionPanel({
  suggestion,
}: {
  suggestion: GeneratedBrollSuggestion;
}) {
  const projectStatus = useRelayLabStore((state) => state.project.status);
  const updateSuggestion = useRelayLabStore(
    (state) => state.updateGeneratedBrollSuggestion,
  );
  const removeSuggestion = useRelayLabStore(
    (state) => state.removeGeneratedBrollSuggestion,
  );
  const beginGeneration = useRelayLabStore((state) => state.beginGeneratedBroll);
  const failGeneration = useRelayLabStore((state) => state.failGeneratedBroll);
  const completeGeneration = useRelayLabStore((state) => state.completeGeneratedBroll);
  const [prompt, setPrompt] = useState(suggestion.prompt);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => setPrompt(suggestion.prompt), [suggestion.id, suggestion.prompt]);

  const editable = projectStatus === "planning" && suggestion.status !== "generating";

  async function generateClip() {
    setLocalError(null);
    const updated = updateSuggestion(suggestion.id, { prompt });
    if (!updated.ok) {
      setLocalError(updated.message);
      return;
    }
    const started = beginGeneration(suggestion.id);
    if (!started.ok) {
      setLocalError(started.message);
      return;
    }

    try {
      const generated = await requestAndMeasureGeneratedBroll({
        prompt: updated.prompt,
        duration: updated.timelineEnd - updated.timelineStart,
        aspectRatio: "16:9",
      });
      const completed = completeGeneration({
        suggestionId: suggestion.id,
        sourceUrl: generated.url,
        provider: generated.provider,
        model: generated.model,
        duration: generated.duration,
      });
      if (!completed.ok) {
        failGeneration(suggestion.id, completed.message);
        setLocalError(completed.message);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Video generation failed.";
      failGeneration(suggestion.id, message);
      setLocalError(message);
    }
  }

  return (
    <div data-testid="generation-suggestion-panel">
      <div className="flex items-center justify-between">
        <div className="micro-label">AI B-roll suggestion</div>
        <span
          className={`rounded border px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.1em] ${
            suggestion.status === "generating"
              ? "border-[#5a738a] bg-[#1c2b37] text-[#9bc6e8]"
              : suggestion.status === "failed"
                ? "border-[#754845] bg-[#321d1c] text-[#eba49c]"
                : "border-[#76588b] bg-[#30213a] text-[#d4abe9]"
          }`}
        >
          {suggestion.status === "generating" ? "Generating" : suggestion.status}
        </span>
      </div>

      <div className="mt-2 rounded-md border border-[#2d2533] bg-[#100e13] p-2.5">
        <div className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[#817187]">Why</div>
        <p className="mt-1 text-[10px] leading-4 text-[#b9afbF]">{suggestion.reason}</p>
      </div>

      <label className="mt-2 block">
        <span className="mb-1 block text-[9px] text-[#8c7895]">Suggested prompt · editable</span>
        <textarea
          aria-label="Generated B-roll prompt"
          className="min-h-24 w-full resize-none rounded-md border border-[#3b3042] bg-[#0d0b0f] px-2.5 py-2 text-[10px] leading-4 text-[#d7cddd] outline-none transition focus:border-[#8d68a3] disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!editable}
          maxLength={1_000}
          onBlur={() => updateSuggestion(suggestion.id, { prompt })}
          onChange={(event) => setPrompt(event.target.value)}
          value={prompt}
        />
      </label>

      <div className="mt-2 grid grid-cols-2 gap-2">
        <label>
          <span className="mb-1 block text-[9px] text-[#69717d]">Timeline start</span>
          <input
            aria-label="Generation suggestion timeline start"
            className="numeric-field text-[10px] disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!editable}
            min={0}
            onChange={(event) =>
              updateSuggestion(suggestion.id, { timelineStart: Number(event.target.value) })
            }
            step={0.1}
            type="number"
            value={suggestion.timelineStart}
          />
        </label>
        <label>
          <span className="mb-1 block text-[9px] text-[#69717d]">Duration</span>
          <input
            aria-label="Generation suggestion duration"
            className="numeric-field text-[10px] disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!editable}
            max={10}
            min={1}
            onChange={(event) =>
              updateSuggestion(suggestion.id, { duration: Number(event.target.value) })
            }
            step={1}
            type="number"
            value={suggestion.duration}
          />
        </label>
      </div>

      {suggestion.error || localError ? (
        <p
          aria-live="polite"
          className="mt-2 rounded border border-[#5e3633] bg-[#261514] px-2 py-1.5 text-[9px] leading-4 text-[#e6a099]"
          data-testid="generation-error"
        >
          {localError ?? suggestion.error}
        </p>
      ) : null}

      <button
        className="mt-2 w-full rounded-md border border-[#76558a] bg-[#34213f] px-3 py-2.5 text-[10px] font-bold uppercase tracking-[0.08em] text-[#e0b9f0] outline-none transition hover:border-[#9b70b3] hover:bg-[#41284f] focus-visible:ring-2 focus-visible:ring-[#a477ba]/35 disabled:cursor-not-allowed disabled:opacity-45"
        data-testid="generate-clip"
        disabled={!editable || prompt.trim().length < 10}
        onClick={() => void generateClip()}
        title="Human-only action. This may incur fal.ai usage charges."
        type="button"
      >
        {suggestion.status === "generating"
          ? "Generating…"
          : suggestion.status === "failed"
            ? "Retry generation · may incur cost"
            : "Generate Clip · human confirmation"}
      </button>
      <p className="mt-1.5 text-[8px] leading-3 text-[#665a6b]">
        No provider call occurs until you press Generate Clip. Approval never generates unresolved suggestions.
      </p>

      <button
        className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md border border-[#493235] bg-[#1f1517] px-2 py-2 text-[9px] font-semibold text-[#c78f92] outline-none transition hover:border-[#75484c] disabled:cursor-not-allowed disabled:opacity-35"
        data-testid="dismiss-generation-suggestion"
        disabled={!editable}
        onClick={() => removeSuggestion(suggestion.id)}
        type="button"
      >
        <TrashIcon className="h-3 w-3" /> Dismiss suggestion
      </button>
    </div>
  );
}
