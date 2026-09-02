import type { Metadata } from "next";

import { PRODUCT_DESCRIPTION, PRODUCT_NAME } from "@/lib/brand";

import "./globals.css";

export const metadata: Metadata = {
  title: `${PRODUCT_NAME} — WebMCP collaboration editor`,
  description: PRODUCT_DESCRIPTION,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
