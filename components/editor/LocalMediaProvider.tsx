"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  AnalyzeBrollRequestError,
  requestAnalyzeBroll,
} from "@/lib/analysis/requestAnalyzeBroll";
import type { RelayLabStoreApi } from "@/lib/editor/store";
import type { TranscriptSegment } from "@/lib/editor/types";
import { extractAudioTrack, isAudioExtractionSupported } from "@/lib/media/extractAudioTrack";
import { createObjectUrlRegistry, type ObjectUrlRegistry } from "@/lib/media/objectUrlRegistry";
import { readVideoMetadata } from "@/lib/media/readVideoMetadata";
import {
  applyBrollAnalysisResult,
  markAssetAnalysisProcessing,
  markAssetAnalysisRequestFailed,
} from "@/lib/providers/applyBrollAnalysis";

export type MediaImportStatus = "idle" | "reading" | "complete" | "error";

export interface MediaImportState {
  status: MediaImportStatus;
  message: string | null;
}

export interface MediaImportOutcome {
  ok: boolean;
  message?: string;
  importedCount?: number;
}

interface LocalMediaContextValue {
  baseImport: MediaImportState;
  brollImport: MediaImportState;
  transcription: MediaImportState;
  importBaseVideo(file: File): Promise<MediaImportOutcome>;
  importBrollVideos(files: File[]): Promise<MediaImportOutcome>;
  transcribeBaseVideo(): Promise<MediaImportOutcome>;
  analyzeBrollAsset(assetId: string): Promise<MediaImportOutcome>;
}

const LocalMediaContext = createContext<LocalMediaContextValue | null>(null);
const VIDEO_EXTENSION = /\.(mp4|mov|m4v|webm|ogv|avi|mkv)$/i;
const IMAGE_EXTENSION = /\.(jpe?g|png|webp|gif|avif)$/i;
/** Fixed on-screen hold for an uploaded still image, per RelayLab's image B-roll spec. */
export const IMAGE_BROLL_DURATION_SECONDS = 3;

function isLikelyVideo(file: File): boolean {
  return file.type.startsWith("video/") || (!file.type && VIDEO_EXTENSION.test(file.name));
}

function isLikelyImage(file: File): boolean {
  return file.type.startsWith("image/") || (!file.type && IMAGE_EXTENSION.test(file.name));
}

function isLikelyBrollMedia(file: File): boolean {
  return isLikelyVideo(file) || isLikelyImage(file);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "The selected media could not be imported.";
}

export function LocalMediaProvider({
  children,
  store,
}: {
  children: ReactNode;
  store: RelayLabStoreApi;
}) {
  const registryRef = useRef<ObjectUrlRegistry | null>(null);
  const lifecycleRef = useRef<AbortController | null>(null);
  const importingBaseRef = useRef(false);
  const importingBrollRef = useRef(false);
  const baseFileRef = useRef<File | null>(null);
  const [baseImport, setBaseImport] = useState<MediaImportState>({
    status: "idle",
    message: null,
  });
  const [brollImport, setBrollImport] = useState<MediaImportState>({
    status: "idle",
    message: null,
  });
  const [transcription, setTranscription] = useState<MediaImportState>({
    status: "idle",
    message: null,
  });

  useEffect(() => {
    const registry = createObjectUrlRegistry();
    const lifecycle = new AbortController();
    registryRef.current = registry;
    lifecycleRef.current = lifecycle;

    return () => {
      lifecycle.abort(new DOMException("Editor media lifecycle ended.", "AbortError"));
      registry.dispose();
      if (registryRef.current === registry) registryRef.current = null;
      if (lifecycleRef.current === lifecycle) lifecycleRef.current = null;
      importingBaseRef.current = false;
      importingBrollRef.current = false;
      baseFileRef.current = null;
    };
  }, []);

  const importBaseVideo = useCallback(
    async (file: File): Promise<MediaImportOutcome> => {
      if (importingBaseRef.current) {
        return { ok: false, message: "A base video is already being read." };
      }
      if (!isLikelyVideo(file)) {
        const message = "Choose a supported video file for the base track.";
        setBaseImport({ status: "error", message });
        return { ok: false, message };
      }

      const registry = registryRef.current;
      const signal = lifecycleRef.current?.signal;
      if (!registry || !signal) {
        return { ok: false, message: "The local media system is still initializing." };
      }

      importingBaseRef.current = true;
      setBaseImport({ status: "reading", message: `Reading ${file.name}…` });
      const objectUrl = registry.create(file);

      try {
        const { duration } = await readVideoMetadata(objectUrl, { signal });
        const result = store.getState().replaceBaseMedia({
          name: file.name,
          duration,
          objectUrl,
        });
        if (!result.ok) {
          registry.revoke(objectUrl);
          setBaseImport({ status: "error", message: result.message });
          return { ok: false, message: result.message };
        }

        registry.revoke(result.previousObjectUrl);
        baseFileRef.current = file;
        setTranscription({ status: "idle", message: null });
        const message = `${file.name} loaded as the master base video.`;
        setBaseImport({ status: "complete", message });
        return { ok: true, importedCount: 1, message };
      } catch (error) {
        registry.revoke(objectUrl);
        if (signal.aborted) return { ok: false, message: "Media import cancelled." };
        const message = errorMessage(error);
        setBaseImport({ status: "error", message });
        return { ok: false, message };
      } finally {
        importingBaseRef.current = false;
      }
    },
    [store],
  );

  const analyzeBrollAssetImpl = useCallback(
    async (assetId: string): Promise<MediaImportOutcome> => {
      const signal = lifecycleRef.current?.signal;
      const asset = store.getState().project.brollAssets.find((candidate) => candidate.id === assetId);
      if (!asset || !asset.objectUrl) {
        return { ok: false, message: "That B-roll asset is no longer available for analysis." };
      }

      markAssetAnalysisProcessing(store, assetId);
      try {
        const outcome = await requestAnalyzeBroll({
          assetId,
          source: asset.objectUrl,
          moments: asset.moments.map((moment) => ({
            momentId: moment.id,
            sourceStart: moment.sourceStart,
            sourceEnd: moment.sourceEnd,
          })),
          signal,
        });
        applyBrollAnalysisResult(store, assetId, {
          results: outcome.results,
          analyzedCount: outcome.analyzedCount,
          candidateCount: outcome.candidateCount,
          truncated: outcome.truncated,
        });
        const message =
          outcome.analyzedCount > 0
            ? `${outcome.analyzedCount}/${outcome.candidateCount} candidate moments indexed${outcome.truncated ? " (request capped for cost and runtime)." : "."}`
            : "B-roll visual analysis did not index any moments.";
        return { ok: true, message };
      } catch (error) {
        if (signal?.aborted) return { ok: false, message: "Analysis cancelled." };
        const message =
          error instanceof AnalyzeBrollRequestError && error.code === "VISION_UNAVAILABLE"
            ? "B-roll visual analysis requires an OpenAI API key. Add your own key in Settings."
            : errorMessage(error);
        markAssetAnalysisRequestFailed(store, assetId, message);
        return { ok: false, message };
      }
    },
    [store],
  );

  const importBrollVideos = useCallback(
    async (files: File[]): Promise<MediaImportOutcome> => {
      if (importingBrollRef.current) {
        return { ok: false, message: "B-roll files are already being read." };
      }
      if (files.length === 0 || files.some((file) => !isLikelyBrollMedia(file))) {
        const message = "Choose one or more supported video or image files for B-roll.";
        setBrollImport({ status: "error", message });
        return { ok: false, message };
      }

      const registry = registryRef.current;
      const signal = lifecycleRef.current?.signal;
      if (!registry || !signal) {
        return { ok: false, message: "The local media system is still initializing." };
      }

      importingBrollRef.current = true;
      setBrollImport({
        status: "reading",
        message: `Reading ${files.length} B-roll ${files.length === 1 ? "reel" : "reels"}…`,
      });
      const createdUrls: string[] = [];

      try {
        const descriptors: { name: string; duration: number; objectUrl: string; kind: "video" | "image" }[] = [];
        // Metadata-only probes run sequentially so a large batch never loads
        // every source reel at the same time.
        for (const file of files) {
          const objectUrl = registry.create(file);
          createdUrls.push(objectUrl);
          if (isLikelyImage(file)) {
            descriptors.push({ name: file.name, duration: IMAGE_BROLL_DURATION_SECONDS, objectUrl, kind: "image" });
          } else {
            const { duration } = await readVideoMetadata(objectUrl, { signal });
            descriptors.push({ name: file.name, duration, objectUrl, kind: "video" });
          }
        }

        const result = store.getState().addBrollMedia(descriptors);
        if (!result.ok) {
          createdUrls.forEach((url) => registry.revoke(url));
          setBrollImport({ status: "error", message: result.message });
          return { ok: false, message: result.message };
        }

        const message = `${result.assetIds.length} B-roll ${result.assetIds.length === 1 ? "reel" : "reels"} loaded as muted, video/image sources.`;
        setBrollImport({ status: "complete", message });
        // Kick off real vision analysis per asset in the background. Import
        // itself never waits on this — an OpenAI outage or missing key must
        // not block getting usable (if unindexed) B-roll onto the timeline.
        // Analysis targets video frames only; skip it for still images since
        // there is no frame timeline to sample.
        result.assetIds
          .filter((assetId) => {
            const asset = store.getState().project.brollAssets.find((candidate) => candidate.id === assetId);
            return asset?.kind !== "image";
          })
          .forEach((assetId) => {
            void analyzeBrollAssetImpl(assetId);
          });
        return { ok: true, importedCount: result.assetIds.length, message };
      } catch (error) {
        createdUrls.forEach((url) => registry.revoke(url));
        if (signal.aborted) return { ok: false, message: "Media import cancelled." };
        const message = errorMessage(error);
        setBrollImport({ status: "error", message });
        return { ok: false, message };
      } finally {
        importingBrollRef.current = false;
      }
    },
    [store, analyzeBrollAssetImpl],
  );

  const transcribeBaseVideo = useCallback(async (): Promise<MediaImportOutcome> => {
    const file = baseFileRef.current;
    if (!file) {
      const message = "Load a local base video before creating automatic captions.";
      setTranscription({ status: "error", message });
      return { ok: false, message };
    }
    if (store.getState().project.status !== "planning") {
      const message = "Captions are frozen after plan approval.";
      setTranscription({ status: "error", message });
      return { ok: false, message };
    }
    // Vercel's Node.js Serverless Functions reject request bodies above
    // ~4.5 MB at the platform level, well below OpenAI's own 25 MB limit —
    // matches the server-side check in app/api/transcribe/route.ts.
    const isVercelDeployment =
      typeof window !== "undefined" && window.location.hostname.endsWith(".vercel.app");
    const maxBytes = isVercelDeployment ? 4 * 1024 * 1024 : 25 * 1024 * 1024;

    // Video is the overwhelming majority of most talking-head recordings'
    // size; Whisper only needs the audio. Extract it client-side (real
    // browser APIs, no new dependency) so the upload is small regardless of
    // the source video's size, instead of sending the raw video and hitting
    // either limit above. Falls back to the raw file if the browser can't
    // extract audio, or if extraction itself fails.
    let uploadFile: File = file;
    if (isAudioExtractionSupported()) {
      try {
        setTranscription({ status: "reading", message: "Extracting audio…" });
        uploadFile = await extractAudioTrack(file);
      } catch (err) {
        console.error("DEBUG extraction error:", err); // TEMP
        uploadFile = file; // Fall back to the original video file below.
      }
    }

    if (uploadFile.size > maxBytes) {
      const limitMb = Math.floor(maxBytes / (1024 * 1024));
      const usedExtractedAudio = uploadFile !== file;
      const message = isVercelDeployment
        ? `This hosted deployment accepts ${usedExtractedAudio ? "extracted audio" : "files"} up to ${limitMb} MB for automatic transcription (a platform limit, not OpenAI's).${usedExtractedAudio ? " Even the audio track is too large — try" : " Extract just the audio track, or try"} a shorter clip, add captions manually, or run this locally where the limit is 25 MB.`
        : `Automatic transcription accepts ${usedExtractedAudio ? "extracted audio" : "files"} up to ${limitMb} MB. Add captions manually or upload a smaller proxy.`;
      setTranscription({ status: "error", message });
      return { ok: false, message };
    }

    setTranscription({ status: "reading", message: "Transcribing base audio…" });
    const form = new FormData();
    form.append("media", uploadFile, uploadFile.name);
    try {
      const response = await fetch("/api/transcribe", {
        method: "POST",
        headers: { "x-relaylab-human-action": "transcribe" },
        body: form,
      });
      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; message?: string; transcript?: TranscriptSegment[] }
        | null;
      if (!response.ok || !payload?.ok || !payload.transcript) {
        throw new Error(payload?.message ?? "Automatic transcription failed.");
      }
      const captionCount = store.getState().replaceTranscript(payload.transcript);
      const message = `${captionCount} timed captions created from the base audio.`;
      setTranscription({ status: "complete", message });
      return { ok: true, importedCount: captionCount, message };
    } catch (error) {
      const message = errorMessage(error);
      setTranscription({ status: "error", message });
      return { ok: false, message };
    }
  }, [store]);

  return (
    <LocalMediaContext.Provider
      value={{
        baseImport,
        brollImport,
        transcription,
        importBaseVideo,
        importBrollVideos,
        transcribeBaseVideo,
        analyzeBrollAsset: analyzeBrollAssetImpl,
      }}
    >
      {children}
    </LocalMediaContext.Provider>
  );
}

export function useLocalMedia(): LocalMediaContextValue {
  const context = useContext(LocalMediaContext);
  if (!context) {
    throw new Error("useLocalMedia must be used inside LocalMediaProvider.");
  }
  return context;
}
