import { readFile } from "node:fs/promises";

import { expect, test, type Download, type Page } from "@playwright/test";

interface ToolActionResult {
  ok: boolean;
  status?: "ghost" | "committed";
}

interface DownloadedEditSpec {
  sources: {
    base: {
      audioPolicy: "master";
    };
    broll: Array<{
      audioPolicy: "muted";
    }>;
  };
  audioPolicy: {
    masterSource: "base";
    baseAudio: "master";
    brollAudio: "muted";
    includeBrollAudio: false;
  };
}

interface RelayLabWebMcpTestBridge {
  names: () => string[];
  invoke: (name: string, input?: Record<string, unknown>) => Promise<unknown>;
}

type TestWindow = Window & { __relaylabWebMcp: RelayLabWebMcpTestBridge };

async function toolNames(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    (window as unknown as TestWindow).__relaylabWebMcp.names(),
  );
}

async function invokeTool<T>(
  page: Page,
  name: string,
  input: Record<string, unknown> = {},
): Promise<T> {
  return page.evaluate(
    async ({ toolName, toolInput }) =>
      (window as unknown as TestWindow).__relaylabWebMcp.invoke(
        toolName,
        toolInput,
      ) as Promise<T>,
    { toolName: name, toolInput: input },
  );
}

async function readDownload(download: Download): Promise<string> {
  const failure = await download.failure();
  expect(failure).toBeNull();
  const filePath = await download.path();
  expect(filePath).not.toBeNull();
  if (!filePath) throw new Error("Playwright did not retain the download.");
  return readFile(filePath, "utf8");
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    interface ToolDefinition {
      name: string;
      execute: (
        input: Record<string, unknown>,
        options: { signal: AbortSignal },
      ) => unknown | Promise<unknown>;
    }

    class BrowserModelContext extends EventTarget {
      private readonly tools = new Map<string, ToolDefinition>();

      async registerTool(
        tool: ToolDefinition,
        options?: { signal?: AbortSignal },
      ): Promise<void> {
        if (options?.signal?.aborted) {
          throw new DOMException("Registration aborted.", "AbortError");
        }
        if (this.tools.has(tool.name)) {
          throw new DOMException(
            `Duplicate tool: ${tool.name}`,
            "InvalidStateError",
          );
        }

        this.tools.set(tool.name, tool);
        options?.signal?.addEventListener(
          "abort",
          () => {
            if (this.tools.get(tool.name) === tool) this.tools.delete(tool.name);
          },
          { once: true },
        );
      }

      names(): string[] {
        return [...this.tools.keys()].sort();
      }

      async invoke(
        name: string,
        input: Record<string, unknown> = {},
      ): Promise<unknown> {
        const tool = this.tools.get(name);
        if (!tool) {
          throw new DOMException(`Tool not found: ${name}`, "NotFoundError");
        }
        const result = await tool.execute(structuredClone(input), {
          signal: new AbortController().signal,
        });
        return structuredClone(result);
      }
    }

    const modelContext = new BrowserModelContext();
    Object.defineProperty(document, "modelContext", {
      configurable: true,
      value: modelContext,
    });
    Object.defineProperty(window, "__relaylabWebMcp", {
      configurable: true,
      value: {
        names: () => modelContext.names(),
        invoke: (name: string, input?: Record<string, unknown>) =>
          modelContext.invoke(name, input),
      },
    });
  });
});

test("export downloads stay auditable and final rendering remains approval-gated", async ({
  page,
}) => {
  await page.goto("/demo");
  await expect(page.getByTestId("webmcp-status")).toHaveAttribute(
    "data-status",
    "available",
  );

  await page.getByTestId("export-menu-trigger").click();
  await expect(page.getByTestId("export-menu")).toBeVisible();
  await expect(page.getByTestId("final-export-gate")).toBeVisible();
  await expect(page.getByTestId("final-export-actions")).toHaveCount(0);
  await expect(page.getByTestId("download-ffmpeg-script")).toHaveCount(0);
  expect(await toolNames(page)).not.toContain("commit_approved_plan");

  const [editJsonDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("export-edit-json").click(),
  ]);
  expect(editJsonDownload.suggestedFilename()).toBe(
    "how-great-products-earn-attention.edit.json",
  );
  const editJsonText = await readDownload(editJsonDownload);
  const editSpec = JSON.parse(editJsonText) as DownloadedEditSpec;

  expect(editSpec.sources.base.audioPolicy).toBe("master");
  expect(editSpec.sources.broll.length).toBeGreaterThan(0);
  expect(
    editSpec.sources.broll.every((source) => source.audioPolicy === "muted"),
  ).toBe(true);
  expect(editSpec.audioPolicy).toEqual({
    masterSource: "base",
    baseAudio: "master",
    brollAudio: "muted",
    includeBrollAudio: false,
  });
  expect(editJsonText).not.toContain("blob:");

  await page.keyboard.press("Escape");
  await expect(page.getByTestId("export-menu")).toHaveCount(0);

  // Approval is a human UI action. It changes the WebMCP surface instead of
  // merely enabling a local button.
  await page.getByTestId("approve-plan").click();
  await expect(page.getByTestId("project-status")).toHaveAttribute(
    "data-project-status",
    "approved",
  );
  await expect.poll(() => toolNames(page)).toContain("commit_approved_plan");

  const commit = await invokeTool<ToolActionResult>(
    page,
    "commit_approved_plan",
  );
  expect(commit).toMatchObject({ ok: true, status: "committed" });
  await expect(page.getByTestId("project-status")).toHaveAttribute(
    "data-project-status",
    "committed",
  );

  await page.getByTestId("export-menu-trigger").click();
  await expect(page.getByTestId("final-export-actions")).toBeVisible();
  await expect(page.getByTestId("final-export-gate")).toHaveCount(0);

  const [scriptDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("download-ffmpeg-script").click(),
  ]);
  expect(scriptDownload.suggestedFilename()).toBe(
    "how-great-products-earn-attention.render.sh",
  );
  const script = await readDownload(scriptDownload);

  expect(script).toContain("-map '[vout]' -map '0:a:0?'");
  expect(script).not.toMatch(/-map\s+['"]?[1-9]\d*:a(?::\d+)?/u);
  expect(script).not.toMatch(/\[[1-9]\d*:a(?::\d+)?\]/u);
  expect(script).toContain(
    "trim=start=8.2:end=14,setpts=PTS-STARTPTS+19.2/TB",
  );
  expect(script).toContain("between(t,19.2,25)");

  await expect(page.getByTestId("download-caption-sidecar")).toBeVisible();
  const [captionDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("download-caption-sidecar").click(),
  ]);
  expect(captionDownload.suggestedFilename()).toBe(
    "how-great-products-earn-attention.captions.srt",
  );
  const captions = await readDownload(captionDownload);
  expect(captions).toContain("00:00:00,000 --> 00:00:08,600");
  expect(captions).toContain(
    "Most products do not have an attention problem. They have a clarity problem.",
  );
});
