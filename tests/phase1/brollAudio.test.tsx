// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  EditorProvider,
  useRelayLabStoreApi,
} from "@/components/editor/EditorProvider";
import {
  FilmIcon,
  LinkIcon,
  LockIcon,
  MutedIcon,
  SparkLineIcon,
  VolumeIcon,
} from "@/components/editor/Icons";
import {
  BrollPreviewVideo,
  PreviewPanel,
} from "@/components/editor/PreviewPanel";
import { createDemoProject } from "@/lib/demo/project";
import { isBrollAudioMuted } from "@/lib/editor/audioPolicy";

afterEach(cleanup);

describe("B-roll preview audio policy", () => {
  it("renders B-roll as video-only with no volume control", () => {
    const asset = createDemoProject().brollAssets[0];
    asset.objectUrl = "blob:relaylab-demo-broll";

    const { container } = render(
      <BrollPreviewVideo asset={asset} sourceTime={asset.moments[0].sourceStart} />,
    );
    const video = screen.getByLabelText(
      `Muted B-roll preview: ${asset.name}`,
    ) as HTMLVideoElement;

    expect(isBrollAudioMuted()).toBe(true);
    expect(video.muted).toBe(true);
    expect(video.getAttribute("data-broll-audio-policy")).toBe("muted");
    expect(video.controls).toBe(false);
    expect(video.hasAttribute("controls")).toBe(false);
    expect(container.querySelector("[data-broll-volume]")).toBeNull();
    expect(
      screen.queryByRole("slider", { name: /b-roll volume/i }),
    ).toBeNull();
  });

  it("keeps the base video as master while an active B-roll video is shown", () => {
    const onPlayheadChange = vi.fn();

    function MediaHarness() {
      const store = useRelayLabStoreApi();

      useEffect(() => {
        store.setState((state) => {
          const active = state.project.overlays[0];

          return {
            project: {
              ...state.project,
              baseVideo: {
                ...state.project.baseVideo,
                objectUrl: "blob:relaylab-base",
              },
              brollAssets: state.project.brollAssets.map((asset) =>
                asset.id === active.assetId
                  ? { ...asset, objectUrl: "blob:relaylab-broll" }
                  : asset,
              ),
              overlays: [
                ...state.project.overlays,
                {
                  ...active,
                  id: "ov_overlapping_test",
                  sourceStart: active.sourceStart + 0.4,
                  sourceEnd: active.sourceEnd - 0.4,
                  timelineStart: active.timelineStart + 0.4,
                  timelineEnd: active.timelineEnd - 0.4,
                },
              ],
            },
          };
        });
      }, [store]);

      return (
        <PreviewPanel
          onPlayheadChange={onPlayheadChange}
          playhead={21.8}
        />
      );
    }

    const { container } = render(
      <EditorProvider>
        <MediaHarness />
      </EditorProvider>,
    );
    const videos = container.querySelectorAll("video");
    const baseVideo = videos[0] as HTMLVideoElement;
    const brollVideo = videos[1] as HTMLVideoElement;

    expect(videos).toHaveLength(2);
    expect(baseVideo.muted).toBe(false);
    expect(baseVideo.getAttribute("data-broll-audio-policy")).toBeNull();
    expect(brollVideo.muted).toBe(true);
    expect(brollVideo.getAttribute("data-broll-audio-policy")).toBe("muted");

    baseVideo.currentTime = 33;
    fireEvent.timeUpdate(baseVideo);
    fireEvent.change(screen.getByLabelText("Preview playhead"), {
      target: { value: "31.5" },
    });
    expect(onPlayheadChange).toHaveBeenCalledWith(33);
    expect(onPlayheadChange).toHaveBeenCalledWith(31.5);
  });

  it("renders the talking head alone outside an overlay and handles no caption", () => {
    const onPlayheadChange = vi.fn();
    const view = render(
      <EditorProvider>
        <PreviewPanel onPlayheadChange={onPlayheadChange} playhead={0} />
      </EditorProvider>,
    );

    expect(screen.queryByLabelText(/Muted B-roll preview:/)).toBeNull();
    expect(
      screen.getByText(/Most products do not have an attention problem/i),
    ).toBeTruthy();

    view.rerender(
      <EditorProvider>
        <PreviewPanel onPlayheadChange={onPlayheadChange} playhead={84.4} />
      </EditorProvider>,
    );
    expect(screen.getAllByText("84.4s")).toHaveLength(2);
  });

  it("renders every compact editor icon without interactive audio controls", () => {
    const { container } = render(
      <div>
        <LockIcon />
        <FilmIcon />
        <VolumeIcon />
        <MutedIcon />
        <LinkIcon />
        <SparkLineIcon />
      </div>,
    );

    expect(container.querySelectorAll("svg")).toHaveLength(6);
    expect(container.querySelectorAll("button, input")).toHaveLength(0);
  });
});
