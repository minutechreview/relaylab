import { describe, expect, it } from "vitest";

import { createDemoProject } from "@/lib/demo/project";
import type { Overlay } from "@/lib/editor/types";
import {
  createFfmpegExport,
  createSrt,
  shellQuote,
  type FfmpegExport,
  type FfmpegExportResult,
} from "@/lib/export/ffmpeg";

function ghostOverlay(): Overlay {
  return {
    id: "ov_unapproved",
    assetId: "city_reel",
    momentId: "moment_city_momentum",
    sourceStart: 74.2,
    sourceEnd: 78.2,
    timelineStart: 42,
    timelineEnd: 46,
    status: "ghost",
    lockedByHuman: false,
    reason: "This proposal has not been approved.",
    createdBy: "agent",
  };
}

function audioMapArguments(argv: string[]): string[] {
  return argv.flatMap((argument, index) =>
    argv[index - 1] === "-map" && argument.includes(":a") ? [argument] : [],
  );
}

function expectSuccess(result: FfmpegExportResult): asserts result is FfmpegExport {
  expect(result.ok).toBe(true);
}

describe("Phase 6 ffmpeg export", () => {
  it("renders committed overlays, skips ghosts, preserves source/timeline timing, and maps only base audio", () => {
    const project = createDemoProject();
    project.status = "approved";
    project.overlays[0].status = "committed";
    project.overlays.push(ghostOverlay());

    const result = createFfmpegExport(project, { burnCaptions: false });
    expectSuccess(result);

    expect(result.renderedOverlayIds).toEqual(["ov_demo_1"]);
    expect(result.skippedGhostOverlayIds).toEqual(["ov_unapproved"]);
    expect(result.argv.filter((argument) => argument === "-i")).toHaveLength(2);
    expect(result.argv).toContain("founder-story.mp4");
    expect(result.argv).toContain("product-reel.mp4");
    expect(result.argv).not.toContain("city-reel.mp4");
    expect(result.filterComplex).toContain(
      "trim=start=8.2:end=14,setpts=PTS-STARTPTS+19.2/TB",
    );
    expect(result.filterComplex).toContain("between(t,19.2,25)");
    expect(result.audioMapping).toEqual({
      baseInputIndex: 0,
      mappedStream: "0:a:0?",
      brollAudioMapped: false,
    });
    expect(audioMapArguments(result.argv)).toEqual(["0:a:0?"]);
    expect(result.command).not.toMatch(/(?:^|\s)[1-9]\d*:a/u);
    expect(result.script).toContain("the sole mapped audio stream is optional base input 0 audio");
  });

  it("creates a valid base-only command when every proposal is still a ghost", () => {
    const project = createDemoProject();
    project.status = "committed";
    project.overlays = [];

    const result = createFfmpegExport(project, { burnCaptions: false });
    expectSuccess(result);

    expect(result.renderedOverlayIds).toEqual([]);
    expect(result.skippedGhostOverlayIds).toEqual([]);
    expect(result.argv.filter((argument) => argument === "-i")).toHaveLength(1);
    expect(result.filterComplex).toBe(
      "[0:v:0]setpts=PTS-STARTPTS[base0];" +
        "[base0]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=black[canvas];" +
        "[canvas]null[vout]",
    );
    expect(audioMapArguments(result.argv)).toEqual(["0:a:0?"]);
  });

  it("shell-quotes special-character media names without changing structured argv", () => {
    const project = createDemoProject();
    project.status = "committed";
    project.overlays[0].status = "committed";
    project.baseVideo.name = "founder's $(touch hacked) [draft].mp4";
    project.brollAssets[1].name = "B roll; echo pwned.mp4";

    const result = createFfmpegExport(project, { burnCaptions: false });
    expectSuccess(result);

    expect(result.argv).toContain("founder's $(touch hacked) [draft].mp4");
    expect(result.argv).toContain("B roll; echo pwned.mp4");
    expect(result.command).toContain(
      `'founder'"'"'s $(touch hacked) [draft].mp4'`,
    );
    expect(result.command).toContain("'B roll; echo pwned.mp4'");
    expect(shellQuote("0:a:0?")).toBe("'0:a:0?'");
  });

  it("generates a deterministic SRT sidecar and caption-burn filter", () => {
    const project = createDemoProject();
    const result = createFfmpegExport(project);
    expectSuccess(result);

    expect(result.captionSidecar).toMatchObject({
      fileName: "how-great-products-earn-attention.captions.srt",
      mediaType: "application/x-subrip",
    });
    expect(result.captionSidecar?.contents).toContain(
      "00:00:00,000 --> 00:00:08,600",
    );
    expect(result.captionSidecar?.contents).toContain(project.captions[0].text);
    expect(result.filterComplex).toContain(
      "subtitles=filename='how-great-products-earn-attention.captions.srt'",
    );
    expect(result.filterComplex).toContain("Alignment=2,MarginV=48");
    expect(result.command).toContain("-filter_complex");
  });

  it("preserves the human caption placement in the burn filter", () => {
    const project = createDemoProject();
    project.captionStyle.position = "top";
    const result = createFfmpegExport(project);
    expectSuccess(result);
    expect(result.filterComplex).toContain("Alignment=8,MarginV=48");
  });

  it("formats SRT across hour boundaries and normalizes line endings", () => {
    expect(
      createSrt([
        {
          id: "caption_hour",
          start: 3661.002,
          end: 3662.345,
          text: "First line\r\nSecond line",
        },
      ]),
    ).toBe(
      "1\n01:01:01,002 --> 01:01:02,345\nFirst line\nSecond line\n\n",
    );
  });

  it("returns a structured failure for a committed project that still contains ghosts", () => {
    const project = createDemoProject();
    project.status = "committed";

    expect(createFfmpegExport(project)).toEqual({
      ok: false,
      code: "INCONSISTENT_COMMITTED_PROJECT",
      message:
        "A committed project cannot contain ghost overlays. Recommit the approved plan before exporting.",
      ghostOverlayIds: ["ov_demo_1"],
    });
  });

  it("applies later-starting committed overlays later so they win overlap precedence", () => {
    const project = createDemoProject();
    const earlier: Overlay = {
      ...project.overlays[0],
      id: "ov_earlier",
      status: "committed",
      timelineStart: 10,
      timelineEnd: 15.8,
    };
    const later: Overlay = {
      ...ghostOverlay(),
      id: "ov_later",
      status: "committed",
      timelineStart: 12,
      timelineEnd: 16,
    };
    project.status = "committed";
    // Reverse source-array order to prove export precedence is time-based.
    project.overlays = [later, earlier];

    const result = createFfmpegExport(project, { burnCaptions: false });
    expectSuccess(result);

    expect(result.renderedOverlayIds).toEqual(["ov_earlier", "ov_later"]);
    expect(result.filterComplex.indexOf("between(t,10,15.8)")).toBeLessThan(
      result.filterComplex.indexOf("between(t,12,16)"),
    );
  });

  it("letterboxes to the project's chosen output canvas, regardless of overlays", () => {
    const project = createDemoProject();
    project.status = "committed";
    project.overlays = [];

    project.aspectRatio = "9:16";
    const portrait = createFfmpegExport(project, { burnCaptions: false });
    expectSuccess(portrait);
    expect(portrait.filterComplex).toContain(
      "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black",
    );

    project.aspectRatio = "1:1";
    const square = createFfmpegExport(project, { burnCaptions: false });
    expectSuccess(square);
    expect(square.filterComplex).toContain(
      "scale=1080:1080:force_original_aspect_ratio=decrease,pad=1080:1080:(ow-iw)/2:(oh-ih)/2:color=black",
    );
  });
});
