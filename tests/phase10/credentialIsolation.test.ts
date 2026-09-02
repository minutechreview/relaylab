import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { createDemoProject } from "@/lib/demo/project";
import { createRelayLabStore } from "@/lib/editor/store";
import { setSessionCredential } from "@/lib/credentials/sessionCredentials";
import { serializeEditSpec } from "@/lib/export/editSpec";
import {
  createApprovalTools,
  createPlanningTools,
  createReadTools,
} from "@/lib/webmcp/registerRelayLabTools";

const SECRET = "sk-leak-canary-9f8e7d6c5b4a";

/**
 * Static source audit: none of the WebMCP tool implementations should ever
 * import or reference the credential storage modules. This complements the
 * dynamic tool-output test below by catching a future accidental import
 * even if that import's value happens not to appear in a particular test's
 * output.
 */
describe("WebMCP tool source never imports credential storage", () => {
  it("registerRelayLabTools.ts does not import lib/credentials", () => {
    const source = readFileSync(
      join(process.cwd(), "lib/webmcp/registerRelayLabTools.ts"),
      "utf-8",
    );
    expect(source).not.toMatch(/lib\/credentials/);
    expect(source).not.toMatch(/OPENAI_API_KEY|FAL_KEY/);
  });
});

describe("WebMCP tool outputs never contain a configured API key", () => {
  it("no read/planning/approval tool JSON output contains the session or server key", async () => {
    setSessionCredential("audit-session", { openaiApiKey: SECRET, falApiKey: SECRET });
    const originalOpenAi = process.env.OPENAI_API_KEY;
    const originalFal = process.env.FAL_KEY;
    process.env.OPENAI_API_KEY = SECRET;
    process.env.FAL_KEY = SECRET;

    try {
      const store = createRelayLabStore(createDemoProject());
      const tools = [
        ...createReadTools(store),
        ...createPlanningTools(store),
        ...createApprovalTools(store),
      ];

      for (const tool of tools) {
        // Call every tool with an empty/minimal input; failures are fine —
        // we only assert the secret never appears in whatever JSON comes
        // back, success or ToolFailure.
        let output: unknown;
        try {
          output = await tool.execute({}, { signal: new AbortController().signal });
        } catch (error) {
          output = { error: String(error) };
        }
        const serialized = JSON.stringify(output);
        expect(serialized, `tool ${tool.name} leaked a credential`).not.toContain(SECRET);
      }
    } finally {
      if (originalOpenAi === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = originalOpenAi;
      if (originalFal === undefined) delete process.env.FAL_KEY;
      else process.env.FAL_KEY = originalFal;
    }
  });
});

describe("project export never contains a configured API key", () => {
  it("edit plan JSON export has no credential material", () => {
    const originalOpenAi = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = SECRET;
    try {
      const store = createRelayLabStore(createDemoProject());
      const json = serializeEditSpec(store.getState().project);
      expect(json).not.toContain(SECRET);
    } finally {
      if (originalOpenAi === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = originalOpenAi;
    }
  });
});
