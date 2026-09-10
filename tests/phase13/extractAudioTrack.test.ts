// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  extractAudioTrack,
  isAudioExtractionSupported,
} from "@/lib/media/extractAudioTrack";

describe("extractAudioTrack: unsupported-environment fallback", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reports unsupported when the Web Audio API is unavailable (e.g. jsdom, older browsers)", () => {
    // jsdom does not implement AudioContext/OfflineAudioContext; this must
    // resolve to false rather than throwing, so callers can cleanly fall
    // back to uploading the raw video file.
    expect(isAudioExtractionSupported()).toBe(false);
  });

  it("rejects with a clear error instead of hanging when unsupported", async () => {
    await expect(
      extractAudioTrack(new File(["x"], "clip.mp4", { type: "video/mp4" })),
    ).rejects.toThrow(/cannot extract audio locally/i);
  });

  it("respects an already-aborted signal even when otherwise supported", async () => {
    vi.stubGlobal(
      "AudioContext",
      class {
        decodeAudioData = vi.fn();
        close = vi.fn();
      } as unknown as typeof AudioContext,
    );
    vi.stubGlobal(
      "OfflineAudioContext",
      class {} as unknown as typeof OfflineAudioContext,
    );

    const controller = new AbortController();
    controller.abort(new DOMException("cancelled by test", "AbortError"));

    await expect(
      extractAudioTrack(new File(["x"], "clip.mp4", { type: "video/mp4" }), {
        signal: controller.signal,
      }),
    ).rejects.toThrow(/cancelled/i);
  });

  it("respects an abort signal that fires mid-extraction, with no reason attached", async () => {
    vi.stubGlobal(
      "AudioContext",
      class {
        decodeAudioData = vi.fn();
        close = vi.fn();
      } as unknown as typeof AudioContext,
    );
    vi.stubGlobal(
      "OfflineAudioContext",
      class {} as unknown as typeof OfflineAudioContext,
    );

    const controller = new AbortController();
    const file = new File(["x"], "clip.mp4", { type: "video/mp4" });
    file.arrayBuffer = vi.fn(async () => {
      controller.abort();
      return new ArrayBuffer(0);
    });

    const error = await extractAudioTrack(file, {
      signal: controller.signal,
    }).catch((e) => e);
    expect((error as { name: string }).name).toBe("AbortError");
  });
});

function makeAudioBuffer(options: {
  duration: number;
  sampleRate: number;
  samples: number[];
}): AudioBuffer {
  return {
    duration: options.duration,
    sampleRate: options.sampleRate,
    getChannelData: () => Float32Array.from(options.samples),
  } as unknown as AudioBuffer;
}

describe("extractAudioTrack: full pipeline", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubHappyPathContexts(decoded: AudioBuffer, rendered: AudioBuffer) {
    const close = vi.fn();
    vi.stubGlobal(
      "AudioContext",
      class {
        decodeAudioData = vi.fn(async () => decoded);
        close = close;
      } as unknown as typeof AudioContext,
    );

    const startRendering = vi.fn(async () => rendered);
    const bufferSource = {
      buffer: undefined as AudioBuffer | undefined,
      connect: vi.fn(),
      start: vi.fn(),
    };
    vi.stubGlobal(
      "OfflineAudioContext",
      class {
        destination = {};
        createBufferSource = vi.fn(() => bufferSource);
        startRendering = startRendering;
      } as unknown as typeof OfflineAudioContext,
    );

    return { close, startRendering, bufferSource };
  }

  it("decodes, renders, and encodes a valid 16-bit PCM WAV file end to end", async () => {
    const decoded = makeAudioBuffer({
      duration: 1,
      sampleRate: 44_100,
      samples: [0, 0.5, -0.5, 1, -1],
    });
    const rendered = makeAudioBuffer({
      duration: 1,
      sampleRate: 16_000,
      samples: [0, 0.5, -0.5, 1, -1],
    });
    const { close, bufferSource } = stubHappyPathContexts(decoded, rendered);

    const input = new File(["fake video bytes"], "my-clip.mp4", {
      type: "video/mp4",
    });
    const result = await extractAudioTrack(input);

    expect(result.name).toBe("my-clip.audio.wav");
    expect(result.type).toBe("audio/wav");
    expect(close).toHaveBeenCalled();
    expect(bufferSource.buffer).toBe(decoded);
    expect(bufferSource.connect).toHaveBeenCalled();
    expect(bufferSource.start).toHaveBeenCalled();

    const bytes = new Uint8Array(await result.arrayBuffer());
    const header = new TextDecoder().decode(bytes.slice(0, 4));
    expect(header).toBe("RIFF");
    expect(new TextDecoder().decode(bytes.slice(8, 12))).toBe("WAVE");
    // 44-byte header + 5 samples * 2 bytes/sample
    expect(bytes.length).toBe(44 + 5 * 2);
  });

  it("strips a multi-dot filename extension down to a single .audio.wav suffix", async () => {
    const buf = makeAudioBuffer({
      duration: 1,
      sampleRate: 16_000,
      samples: [0],
    });
    stubHappyPathContexts(buf, buf);

    const input = new File(["x"], "my.recording.v2.mov", {
      type: "video/quicktime",
    });
    const result = await extractAudioTrack(input);

    expect(result.name).toBe("my.recording.v2.audio.wav");
  });

  it("throws a clear error when decodeAudioData rejects (corrupt/unsupported audio)", async () => {
    const close = vi.fn();
    vi.stubGlobal(
      "AudioContext",
      class {
        decodeAudioData = vi.fn(async () => {
          throw new Error("boom");
        });
        close = close;
      } as unknown as typeof AudioContext,
    );
    vi.stubGlobal(
      "OfflineAudioContext",
      class {} as unknown as typeof OfflineAudioContext,
    );

    const input = new File(["x"], "clip.mp4", { type: "video/mp4" });
    await expect(extractAudioTrack(input)).rejects.toThrow(
      /could not be decoded/i,
    );
    expect(close).toHaveBeenCalled();
  });

  it("throws a clear error when the decoded buffer has no audio (zero duration)", async () => {
    const decoded = makeAudioBuffer({
      duration: 0,
      sampleRate: 44_100,
      samples: [],
    });
    vi.stubGlobal(
      "AudioContext",
      class {
        decodeAudioData = vi.fn(async () => decoded);
        close = vi.fn();
      } as unknown as typeof AudioContext,
    );
    vi.stubGlobal(
      "OfflineAudioContext",
      class {} as unknown as typeof OfflineAudioContext,
    );

    const input = new File(["x"], "clip.mp4", { type: "video/mp4" });
    await expect(extractAudioTrack(input)).rejects.toThrow(/no audio track/i);
  });

  it("tolerates a decoding AudioContext with no close method", async () => {
    const decoded = makeAudioBuffer({
      duration: 1,
      sampleRate: 44_100,
      samples: [0.25],
    });
    vi.stubGlobal(
      "AudioContext",
      class {
        decodeAudioData = vi.fn(async () => decoded);
      } as unknown as typeof AudioContext,
    );
    const bufferSource = {
      buffer: undefined as AudioBuffer | undefined,
      connect: vi.fn(),
      start: vi.fn(),
    };
    vi.stubGlobal(
      "OfflineAudioContext",
      class {
        destination = {};
        createBufferSource = vi.fn(() => bufferSource);
        startRendering = vi.fn(async () => decoded);
      } as unknown as typeof OfflineAudioContext,
    );

    const input = new File(["x"], "clip.mp4", { type: "video/mp4" });
    await expect(extractAudioTrack(input)).resolves.toBeInstanceOf(File);
  });
});
