import { describe, expect, it } from "vitest";

import { createDemoProject } from "@/lib/demo/project";
import { DEFAULT_CAPTION_STYLE } from "@/lib/editor/captionStyle";
import { createRelayLabStore } from "@/lib/editor/store";

describe("caption style customization", () => {
  it("applies a partial patch, clamping font size and leaving other fields untouched", () => {
    const store = createRelayLabStore(createDemoProject());

    const result = store.getState().setCaptionStyle({ fontFamily: "oswald", fontSize: 999 });

    expect(result).toMatchObject({
      ok: true,
      captionStyle: {
        fontFamily: "oswald",
        fontSize: 56,
        position: DEFAULT_CAPTION_STYLE.position,
        color: DEFAULT_CAPTION_STYLE.color,
        background: DEFAULT_CAPTION_STYLE.background,
        backgroundColor: DEFAULT_CAPTION_STYLE.backgroundColor,
      },
    });
    expect(store.getState().project.captionStyle.fontFamily).toBe("oswald");
  });

  it("clamps an undersized font size up to the minimum", () => {
    const store = createRelayLabStore(createDemoProject());
    const result = store.getState().setCaptionStyle({ fontSize: 1 });
    expect(result).toMatchObject({ ok: true, captionStyle: { fontSize: 12 } });
  });

  it("accepts a full style patch: color, background, and box color together", () => {
    const store = createRelayLabStore(createDemoProject());
    const result = store.getState().setCaptionStyle({
      color: "#ffcc00",
      background: "none",
      backgroundColor: "#111111",
    });
    expect(result).toMatchObject({
      ok: true,
      captionStyle: { color: "#ffcc00", background: "none", backgroundColor: "#111111" },
    });
  });

  it("rejects an invalid hex color without mutating existing style", () => {
    const store = createRelayLabStore(createDemoProject());
    const result = store.getState().setCaptionStyle({ color: "not-a-color" });
    expect(result).toMatchObject({ ok: false, code: "INVALID_ARGUMENTS" });
    expect(store.getState().project.captionStyle.color).toBe(DEFAULT_CAPTION_STYLE.color);
  });

  it("rejects an unknown font family", () => {
    const store = createRelayLabStore(createDemoProject());
    const result = store.getState().setCaptionStyle({ fontFamily: "comic-sans" as never });
    expect(result).toMatchObject({ ok: false, code: "INVALID_ARGUMENTS" });
  });

  it("rejects an unknown background value", () => {
    const store = createRelayLabStore(createDemoProject());
    const result = store.getState().setCaptionStyle({ background: "gradient" as never });
    expect(result).toMatchObject({ ok: false, code: "INVALID_ARGUMENTS" });
  });

  it("refuses to change caption style outside planning status", () => {
    const store = createRelayLabStore(createDemoProject());
    store.setState((current) => ({ project: { ...current.project, status: "approved" } }));

    const result = store.getState().setCaptionStyle({ fontSize: 30 });
    expect(result).toMatchObject({ ok: false, code: "INVALID_PROJECT_STATE" });
  });

  it("setCaptionPosition no longer drops the rest of the caption style (regression)", () => {
    const store = createRelayLabStore(createDemoProject());
    store.getState().setCaptionStyle({ fontFamily: "poppins", fontSize: 30, color: "#ff0000" });

    expect(store.getState().setCaptionPosition("center")).toBe(true);

    expect(store.getState().project.captionStyle).toMatchObject({
      position: "center",
      fontFamily: "poppins",
      fontSize: 30,
      color: "#ff0000",
    });
  });
});
