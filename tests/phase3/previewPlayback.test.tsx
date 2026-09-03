// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  EditorProvider,
  useRelayLabStoreApi,
} from "@/components/editor/EditorProvider";
import {
  BrollPreviewVideo,
  PreviewPanel,
} from "@/components/editor/PreviewPanel";
import { createDemoProject } from "@/lib/demo/project";

const pausedState = new WeakMap<HTMLMediaElement, boolean>();
let originalPaused: PropertyDescriptor | undefined;

beforeEach(() => {
  originalPaused = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "paused");
  Object.defineProperty(HTMLMediaElement.prototype, "paused", {
    configurable: true,
    get() {
      return pausedState.get(this as HTMLMediaElement) ?? true;
    },
  });
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(function (
    this: HTMLMediaElement,
  ) {
    pausedState.set(this, false);
    this.dispatchEvent(new Event("play"));
    return Promise.resolve();
  });
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(function (
    this: HTMLMediaElement,
  ) {
    pausedState.set(this, true);
    this.dispatchEvent(new Event("pause"));
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  if (originalPaused) {
    Object.defineProperty(HTMLMediaElement.prototype, "paused", originalPaused);
  }
});

describe("Phase 3 master-clock preview", () => {
  it("renders the program frame at the project's explicit aspect ratio, independent of the loaded video's own dimensions, without cropping the base", async () => {
    // The canvas shape is a project-level setting the human controls, not
    // something auto-detected from whatever video happens to be loaded —
    // a landscape-shaped source loaded into a 9:16 project still renders
    // inside a 9:16 canvas (letterboxed via object-contain), never cropped.
    function PortraitHarness() {
      const store = useRelayLabStoreApi();
      useEffect(() => {
        store.setState((state) => ({
          project: {
            ...state.project,
            aspectRatio: "9:16",
            baseVideo: { ...state.project.baseVideo, objectUrl: "blob:portrait" },
          },
        }));
      }, [store]);
      return <PreviewPanel onPlayheadChange={() => {}} playhead={0} />;
    }

    const { container } = render(
      <EditorProvider>
        <PortraitHarness />
      </EditorProvider>,
    );
    const video = await waitFor(() =>
      container.querySelector('[data-base-audio-policy="master"]') as HTMLVideoElement,
    );
    // A landscape-shaped source, loaded into a portrait-canvas project.
    Object.defineProperty(video, "videoWidth", { configurable: true, value: 1920 });
    Object.defineProperty(video, "videoHeight", { configurable: true, value: 1080 });
    fireEvent.loadedMetadata(video);

    await waitFor(() =>
      expect(container.querySelector('[data-preview-orientation="portrait"]')).not.toBeNull(),
    );
    expect(video.className).toContain("object-contain");
  });

  it("seeks and plays only the active B-roll as permanently muted video", async () => {
    const asset = createDemoProject().brollAssets[0];
    asset.objectUrl = "blob:active-broll";
    const view = render(
      <BrollPreviewVideo asset={asset} isPlaying sourceTime={12.4} />,
    );
    const video = screen.getByLabelText(/Muted B-roll preview/) as HTMLVideoElement;

    await waitFor(() => expect(video.currentTime).toBe(12.4));
    expect(video.muted).toBe(true);
    expect(video.defaultMuted).toBe(true);
    expect(video.getAttribute("data-broll-audio-policy")).toBe("muted");
    expect(video.getAttribute("data-source-time")).toBe("12.400");
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();

    view.rerender(
      <BrollPreviewVideo asset={asset} isPlaying sourceTime={15.6} />,
    );
    await waitFor(() => expect(video.currentTime).toBe(15.6));
  });

  it("uses base time as the clock, keeps base audio live, and lazily mounts one reel", async () => {
    function PlaybackHarness() {
      const store = useRelayLabStoreApi();
      const [playhead, setPlayhead] = useState(21.8);

      useEffect(() => {
        store.setState((state) => {
          const city = state.project.brollAssets.find(({ id }) => id === "city_reel");
          const cityMoment = city?.moments[0];
          if (!city || !cityMoment) return state;
          return {
            project: {
              ...state.project,
              baseVideo: { ...state.project.baseVideo, objectUrl: "blob:base" },
              brollAssets: state.project.brollAssets.map((asset) => ({
                ...asset,
                objectUrl: `blob:${asset.id}`,
              })),
              overlays: [
                ...state.project.overlays,
                {
                  id: "ov_city_active",
                  assetId: city.id,
                  momentId: cityMoment.id,
                  sourceStart: 74.2,
                  sourceEnd: 79,
                  timelineStart: 20,
                  timelineEnd: 24.8,
                  status: "ghost" as const,
                  lockedByHuman: false,
                  reason: "Later overlay wins the single preview lane.",
                  createdBy: "agent" as const,
                },
              ],
            },
          };
        });
      }, [store]);

      return <PreviewPanel onPlayheadChange={setPlayhead} playhead={playhead} />;
    }

    const { container } = render(
      <EditorProvider>
        <PlaybackHarness />
      </EditorProvider>,
    );
    await waitFor(() =>
      expect(
        container.querySelector('[data-base-audio-policy="master"]'),
      ).not.toBeNull(),
    );
    const base = container.querySelector(
      '[data-base-audio-policy="master"]',
    ) as HTMLVideoElement;
    const broll = screen.getByLabelText(/Muted B-roll preview: city-reel/) as HTMLVideoElement;

    expect(container.querySelectorAll("video")).toHaveLength(2);
    expect(base.muted).toBe(false);
    expect(broll.muted).toBe(true);

    base.currentTime = 22.2;
    fireEvent.timeUpdate(base);
    await waitFor(() => expect(broll.getAttribute("data-source-time")).toBe("76.400"));
    expect(broll.currentTime).toBe(76.4);

    fireEvent.click(screen.getByRole("button", { name: "Play preview" }));
    await screen.findByRole("button", { name: "Pause preview" });
    expect(pausedState.get(base)).toBe(false);
    expect(base.muted).toBe(false);
    expect(broll.muted).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Pause preview" }));
    await screen.findByRole("button", { name: "Play preview" });
    expect(pausedState.get(base)).toBe(true);
  });
});
