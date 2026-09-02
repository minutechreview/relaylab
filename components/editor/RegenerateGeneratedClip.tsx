"use client";

import { useState } from "react";

import { useRelayLabStore } from "./EditorProvider";
import type { BrollAsset, Overlay } from "@/lib/editor/types";
import { requestAndMeasureGeneratedBroll } from "@/lib/generation/requestGeneratedBroll";

export function RegenerateGeneratedClip({
  asset,
  overlay,
}: {
  asset: BrollAsset;
  overlay: Overlay;
}) {
  const replaceGeneratedBroll = useRelayLabStore((state) => state.replaceGeneratedBroll);
  const beginReplacement = useRelayLabStore(
    (state) => state.beginGeneratedBrollReplacement,
  );
  const failReplacement = useRelayLabStore(
    (state) => state.failGeneratedBrollReplacement,
  );
  const projectStatus = useRelayLabStore((state) => state.project.status);
  const [prompt, setPrompt] = useState(asset.generation?.prompt ?? "");
  const [error, setError] = useState<string | null>(null);

  if (asset.origin !== "generated" || !asset.generation) return null;
  const regenerating = asset.generation.status === "regenerating";
  const disabled =
    regenerating ||
    projectStatus !== "planning" ||
    overlay.lockedByHuman ||
    overlay.status !== "ghost";

  async function regenerate() {
    setError(null);
    const started = beginReplacement(asset.id);
    if (!started.ok) {
      setError(started.message);
      return;
    }
    try {
      const generated = await requestAndMeasureGeneratedBroll({
        prompt,
        duration: overlay.timelineEnd - overlay.timelineStart,
        aspectRatio: "16:9",
      });
      const result = replaceGeneratedBroll({
        assetId: asset.id,
        operationId: started.operationId,
        sourceUrl: generated.url,
        provider: generated.provider,
        model: generated.model,
        duration: generated.duration,
        prompt,
      });
      if (!result.ok) {
        failReplacement(asset.id, started.operationId, result.message);
        setError(result.message);
      }
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Regeneration failed.";
      failReplacement(asset.id, started.operationId, message);
      setError(message);
    }
  }

  return (
    <div className="mt-2 rounded-md border border-[#3a2d41] bg-[#141018] p-2.5" data-testid="regenerate-generated-clip">
      <div className="text-[8px] font-bold uppercase tracking-[0.1em] text-[#b18fc0]">
        Generated source · video only
      </div>
      <textarea
        aria-label="Regeneration prompt"
        className="mt-1.5 min-h-16 w-full resize-none rounded border border-[#3a3040] bg-[#0c0a0e] px-2 py-1.5 text-[9px] leading-4 text-[#cfc3d5] outline-none focus:border-[#89639a] disabled:opacity-50"
        disabled={disabled}
        maxLength={1_000}
        onChange={(event) => setPrompt(event.target.value)}
        value={prompt}
      />
      {error || asset.generation.error ? (
        <p className="mt-1 text-[8px] leading-3 text-[#e39a92]">
          {error ?? asset.generation.error}
        </p>
      ) : null}
      <a
        className="mt-1.5 block w-full rounded border border-[#3d4650] bg-[#171b20] px-2 py-2 text-center text-[8px] font-semibold text-[#aeb8c3] hover:border-[#65717f]"
        download={asset.name}
        href={asset.generation.sourceUrl}
        rel="noreferrer"
        target="_blank"
      >
        Download current generated source
      </a>
      <button
        className="mt-1.5 w-full rounded border border-[#654b70] bg-[#2b1d31] px-2 py-2 text-[8px] font-bold uppercase tracking-[0.08em] text-[#d7b8e3] hover:border-[#8b6799] disabled:cursor-not-allowed disabled:opacity-40"
        disabled={disabled || prompt.trim().length < 10}
        onClick={() => void regenerate()}
        title="Each click starts a new fal.ai request and may incur another charge."
        type="button"
      >
        {regenerating ? "Regenerating…" : "Regenerate · explicit paid action"}
      </button>
      {overlay.lockedByHuman ? (
        <p className="mt-1 text-[8px] text-[#8f7950]">Unlock this clip before regenerating it.</p>
      ) : null}
      {projectStatus !== "planning" ? (
        <p className="mt-1 text-[8px] text-[#8f7950]">
          Regeneration is available only while the plan is still planning.
        </p>
      ) : null}
    </div>
  );
}
