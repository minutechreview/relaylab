import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * BYOK credentials must never be persisted to localStorage/IndexedDB. Rather
 * than asserting intent, this walks the actual source tree that could touch
 * credentials (the settings UI, the credential lib, and the local media
 * provider) and asserts none of it references browser storage APIs at all.
 */
function collectFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next") continue;
      collectFiles(fullPath, out);
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      out.push(fullPath);
    }
  }
  return out;
}

describe("no localStorage/IndexedDB persistence of BYOK credentials", () => {
  it(
    "lib/credentials and the Settings UI never reference browser storage APIs",
    () => {
      const root = process.cwd();
      const files = [
        ...collectFiles(join(root, "lib/credentials")),
        join(root, "components/editor/SettingsPanel.tsx"),
      ];

      for (const file of files) {
        const source = readFileSync(file, "utf-8");
        expect(source, `${file} references localStorage`).not.toMatch(/localStorage/);
        expect(source, `${file} references sessionStorage`).not.toMatch(/sessionStorage/);
        expect(source, `${file} references IndexedDB`).not.toMatch(/indexedDB/i);
      }
    },
    // A tiny fixed file set (lib/credentials + one component); the default
    // 5s budget is occasionally too tight under heavy concurrent test-runner
    // load rather than the assertion itself being slow.
    15_000,
  );
});
