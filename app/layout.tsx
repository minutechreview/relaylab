import type { Metadata, Viewport } from "next";

import { PRODUCT_DESCRIPTION, PRODUCT_NAME } from "@/lib/brand";

import "./globals.css";

export const metadata: Metadata = {
  title: `${PRODUCT_NAME} — WebMCP collaboration editor`,
  description: PRODUCT_DESCRIPTION,
};

// Explicit, since a missing/suppressed viewport tag on mobile Safari lets it
// auto-inflate text size in narrow columns (a likely cause of oddly huge,
// inconsistently-sized text reported on mobile) independent of any font-size
// this app actually sets.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // App Router hoists <link>/<meta> rendered anywhere in the tree into
    // <head> automatically; rendering a manual <head> element here would
    // fight Next's own head management (including the viewport tag above).
    <html lang="en">
      <link href="https://fonts.googleapis.com" rel="preconnect" />
      <link crossOrigin="anonymous" href="https://fonts.gstatic.com" rel="preconnect" />
      {/* Caption font presets (lib/editor/captionStyle.ts). Loaded globally so the
          preview and the caption-style picker can render every option immediately. */}
      <link
        href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700&family=Roboto:wght@400;700&family=Poppins:wght@400;700&family=Montserrat:wght@400;700&family=Oswald:wght@400;700&family=Bebas+Neue&display=swap"
        rel="stylesheet"
      />
      <body>{children}</body>
    </html>
  );
}
