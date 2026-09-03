import type { CaptionBackground, CaptionFontFamily, CaptionStyle } from "./types";

export const CAPTION_FONT_PRESETS: readonly CaptionFontFamily[] = [
  "inter",
  "roboto",
  "poppins",
  "montserrat",
  "oswald",
  "bebas-neue",
];

export const CAPTION_FONT_LABELS: Record<CaptionFontFamily, string> = {
  inter: "Inter",
  roboto: "Roboto",
  poppins: "Poppins",
  montserrat: "Montserrat",
  oswald: "Oswald",
  "bebas-neue": "Bebas Neue",
};

/** Browser preview font stacks. Families are loaded from Google Fonts in app/layout.tsx. */
export const CAPTION_FONT_STACKS: Record<CaptionFontFamily, string> = {
  inter: "'Inter', ui-sans-serif, system-ui, sans-serif",
  roboto: "'Roboto', ui-sans-serif, system-ui, sans-serif",
  poppins: "'Poppins', ui-sans-serif, system-ui, sans-serif",
  montserrat: "'Montserrat', ui-sans-serif, system-ui, sans-serif",
  oswald: "'Oswald', ui-sans-serif, system-ui, sans-serif",
  "bebas-neue": "'Bebas Neue', ui-sans-serif, system-ui, sans-serif",
};

/**
 * ffmpeg subtitles force_style FontName values. libass resolves these via
 * fontconfig on the machine that runs the exported script — honest best
 * effort, not a guarantee the font is installed there.
 */
export const CAPTION_FONT_EXPORT_NAMES: Record<CaptionFontFamily, string> = {
  inter: "Inter",
  roboto: "Roboto",
  poppins: "Poppins",
  montserrat: "Montserrat",
  oswald: "Oswald",
  "bebas-neue": "Bebas Neue",
};

export const CAPTION_FONT_SIZE_MIN = 12;
export const CAPTION_FONT_SIZE_MAX = 56;

export const DEFAULT_CAPTION_STYLE: CaptionStyle = {
  position: "bottom",
  fontFamily: "inter",
  fontSize: 20,
  color: "#ffffff",
  background: "solid",
  backgroundColor: "#000000",
};

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export function isValidHexColor(value: string): boolean {
  return HEX_COLOR.test(value);
}

export function isCaptionFontFamily(value: string): value is CaptionFontFamily {
  return (CAPTION_FONT_PRESETS as readonly string[]).includes(value);
}

export function isCaptionBackground(value: string): value is CaptionBackground {
  return value === "none" || value === "solid";
}

export function clampCaptionFontSize(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_CAPTION_STYLE.fontSize;
  return Math.min(CAPTION_FONT_SIZE_MAX, Math.max(CAPTION_FONT_SIZE_MIN, Math.round(value)));
}

/** Converts a #RRGGBB hex color into ASS's &HAABBGGRR& format for the ffmpeg subtitles filter. */
export function hexToAssColor(hex: string, alphaHex = "00"): string {
  const r = hex.slice(1, 3);
  const g = hex.slice(3, 5);
  const b = hex.slice(5, 7);
  return `&H${alphaHex}${b}${g}${r}`.toUpperCase();
}
