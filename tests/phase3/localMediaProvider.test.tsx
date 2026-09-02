// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BrollLibrary } from "@/components/editor/BrollLibrary";
import {
  EditorProvider,
  useRelayLabStore,
} from "@/components/editor/EditorProvider";
import { PreviewPanel } from "@/components/editor/PreviewPanel";
import { useLocalMedia } from "@/components/editor/LocalMediaProvider";
import { createDemoProject } from "@/lib/demo/project";
import { readVideoMetadata } from "@/lib/media/readVideoMetadata";

vi.mock("@/lib/media/readVideoMetadata", () => ({
  readVideoMetadata: vi.fn(),
}));

const createObjectURL = vi.fn<() => string>();
const revokeObjectURL = vi.fn<(url: string) => void>();
let sequence = 0;
const DEMO_ASSET_COUNT = createDemoProject().brollAssets.length;

function ProjectObserver() {
  const project = useRelayLabStore((state) => state.project);
  return (
    <div>
      <output data-testid="base-name">{project.baseVideo.name}</output>
      <output data-testid="transcript-count">{project.transcript.length}</output>
      <output data-testid="overlay-count">{project.overlays.length}</output>
      <output data-testid="caption-count">{project.captions.length}</output>
      <output data-testid="asset-count">{project.brollAssets.length}</output>
      <output data-testid="local-assets">
        {project.brollAssets.filter((asset) => asset.objectUrl).map((asset) => asset.name).join(",")}
      </output>
    </div>
  );
}

function TranscriptionControls() {
  const { transcription, transcribeBaseVideo } = useLocalMedia();
  return (
    <div>
      <button onClick={() => void transcribeBaseVideo()} type="button">Transcribe now</button>
      <output data-testid="transcription-status">{transcription.status}</output>
      <output data-testid="transcription-message">{transcription.message}</output>
    </div>
  );
}

function MediaHarness() {
  return (
    <EditorProvider>
      <PreviewPanel onPlayheadChange={() => {}} playhead={21.8} />
      <BrollLibrary />
      <TranscriptionControls />
      <ProjectObserver />
    </EditorProvider>
  );
}

beforeEach(() => {
  sequence = 0;
  createObjectURL.mockReset().mockImplementation(() => `blob:local-${++sequence}`);
  revokeObjectURL.mockReset();
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: createObjectURL,
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: revokeObjectURL,
  });
  vi.mocked(readVideoMetadata).mockReset();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("local media import UI", () => {
  it("loads one base, multiple reels, replaces the base, and revokes on cleanup", async () => {
    vi.mocked(readVideoMetadata)
      .mockResolvedValueOnce({ duration: 40 })
      .mockResolvedValueOnce({ duration: 90 })
      .mockResolvedValueOnce({ duration: 45 })
      .mockResolvedValueOnce({ duration: 20 });

    const view = render(<MediaHarness />);
    const baseInput = screen.getByLabelText("Upload base video");
    fireEvent.change(baseInput, {
      target: { files: [new File(["base"], "talking-head.mp4", { type: "video/mp4" })] },
    });
    await waitFor(() => expect(screen.getByTestId("base-name").textContent).toBe("talking-head.mp4"));
    expect(screen.getByTestId("transcript-count").textContent).toBe("0");
    expect(screen.getByTestId("overlay-count").textContent).toBe("0");

    fireEvent.change(screen.getByLabelText("Upload B-roll videos"), {
      target: {
        files: [
          new File(["one"], "cafe.mp4", { type: "video/mp4" }),
          new File(["two"], "street.webm", { type: "video/webm" }),
        ],
      },
    });
    await waitFor(() =>
      expect(screen.getByTestId("asset-count").textContent).toBe(String(DEMO_ASSET_COUNT + 2)),
    );
    expect(screen.getByTestId("local-assets").textContent).toBe("cafe.mp4,street.webm");

    fireEvent.change(baseInput, {
      target: { files: [new File(["new"], "replacement.mov", { type: "video/quicktime" })] },
    });
    await waitFor(() => expect(screen.getByTestId("base-name").textContent).toBe("replacement.mov"));
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:local-1");

    view.unmount();
    expect(new Set(revokeObjectURL.mock.calls.flat())).toEqual(
      new Set(["blob:local-1", "blob:local-2", "blob:local-3", "blob:local-4"]),
    );
  });

  it("revokes a whole failed batch and keeps project media unchanged", async () => {
    vi.mocked(readVideoMetadata)
      .mockResolvedValueOnce({ duration: 10 })
      .mockRejectedValueOnce(new Error("Unreadable second reel"));

    render(<MediaHarness />);
    fireEvent.change(screen.getByLabelText("Upload B-roll videos"), {
      target: {
        files: [
          new File(["one"], "one.mp4", { type: "video/mp4" }),
          new File(["two"], "two.mp4", { type: "video/mp4" }),
        ],
      },
    });

    await screen.findByText("Unreadable second reel");
    expect(screen.getByTestId("asset-count").textContent).toBe(String(DEMO_ASSET_COUNT));
    expect(new Set(revokeObjectURL.mock.calls.flat())).toEqual(
      new Set(["blob:local-1", "blob:local-2"]),
    );
  });

  it("creates transcript-backed captions only after a human starts transcription", async () => {
    vi.mocked(readVideoMetadata).mockResolvedValueOnce({ duration: 40 });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          transcript: [{ id: "seg_1", start: 0, end: 2, text: "Timed words." }],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<MediaHarness />);

    fireEvent.click(screen.getByRole("button", { name: "Transcribe now" }));
    await waitFor(() => expect(screen.getByTestId("transcription-status").textContent).toBe("error"));
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Upload base video"), {
      target: { files: [new File(["base"], "talking-head.mp4", { type: "video/mp4" })] },
    });
    await waitFor(() => expect(screen.getByTestId("base-name").textContent).toBe("talking-head.mp4"));
    fireEvent.click(screen.getByRole("button", { name: "Transcribe now" }));

    await waitFor(() => expect(screen.getByTestId("transcription-status").textContent).toBe("complete"));
    expect(screen.getByTestId("transcript-count").textContent).toBe("1");
    expect(screen.getByTestId("caption-count").textContent).toBe("1");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/transcribe",
      expect.objectContaining({
        method: "POST",
        headers: { "x-relaylab-human-action": "transcribe" },
      }),
    );
  });

  it("surfaces an automatic-caption failure without destroying project state", async () => {
    vi.mocked(readVideoMetadata).mockResolvedValueOnce({ duration: 40 });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ ok: false, message: "Provider unavailable" }),
          { status: 503 },
        ),
      ),
    );
    render(<MediaHarness />);
    fireEvent.change(screen.getByLabelText("Upload base video"), {
      target: { files: [new File(["base"], "talking-head.mp4", { type: "video/mp4" })] },
    });
    await waitFor(() => expect(screen.getByTestId("base-name").textContent).toBe("talking-head.mp4"));
    fireEvent.click(screen.getByRole("button", { name: "Transcribe now" }));

    await waitFor(() => expect(screen.getByTestId("transcription-status").textContent).toBe("error"));
    expect(screen.getByTestId("transcription-message").textContent).toContain("Provider unavailable");
    expect(screen.getByTestId("transcript-count").textContent).toBe("0");
  });

  it("places an indexed moment from the touch-friendly Add control", async () => {
    render(<MediaHarness />);
    const before = Number(screen.getByTestId("overlay-count").textContent);
    fireEvent.click(screen.getAllByRole("button", { name: /^Add .* at / })[0]);
    await waitFor(() =>
      expect(screen.getByTestId("overlay-count").textContent).toBe(String(before + 1)),
    );
  });
});
