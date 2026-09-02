import path from "node:path";

import { expect, test } from "@playwright/test";

interface ToolDefinition {
  name: string;
  execute: (
    input: Record<string, unknown>,
    options: { signal: AbortSignal },
  ) => unknown | Promise<unknown>;
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    class BrowserModelContext extends EventTarget {
      private readonly tools = new Map<string, ToolDefinition>();

      async registerTool(tool: ToolDefinition, options?: { signal?: AbortSignal }) {
        if (options?.signal?.aborted) {
          throw new DOMException("Registration aborted.", "AbortError");
        }
        if (this.tools.has(tool.name)) {
          throw new DOMException(`Duplicate tool: ${tool.name}`, "InvalidStateError");
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

      names() {
        return [...this.tools.keys()].sort();
      }

      async invoke(name: string, input: Record<string, unknown> = {}) {
        const tool = this.tools.get(name);
        if (!tool) throw new DOMException(`Tool not found: ${name}`, "NotFoundError");
        return structuredClone(
          await tool.execute(structuredClone(input), {
            signal: new AbortController().signal,
          }),
        );
      }
    }

    const context = new BrowserModelContext();
    Object.defineProperty(document, "modelContext", { configurable: true, value: context });
    Object.defineProperty(window, "__relaylabGenerationTools", {
      configurable: true,
      value: {
        names: () => context.names(),
        invoke: (name: string, input?: Record<string, unknown>) =>
          context.invoke(name, input),
      },
    });
  });
});

test("generation remains a visible human-confirmed fallback and preserves failure state", async ({
  page,
}) => {
  let providerRequests = 0;
  await page.route("**/api/generate-broll", async (route) => {
    providerRequests += 1;
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        ok: false,
        code: "GENERATION_UNAVAILABLE",
        message: "Video generation is unavailable in demo mode.",
      }),
    });
  });

  await page.goto("/demo");
  const suggestion = page.getByTestId("generation-suggestion-gen_demo_manager");
  await expect(suggestion).toBeVisible();
  expect(providerRequests).toBe(0);

  await expect(page.getByTestId("webmcp-status")).toHaveAttribute(
    "data-status",
    "available",
  );

  const tools = await page.evaluate(() =>
    (window as unknown as { __relaylabGenerationTools: { names: () => string[] } })
      .__relaylabGenerationTools.names(),
  );
  expect(tools).toContain("propose_generated_broll");
  expect(tools).not.toContain("generate_video");
  expect(tools).not.toContain("generate_broll");

  const proposed = await page.evaluate(() =>
    (
      window as unknown as {
        __relaylabGenerationTools: {
          invoke: (name: string, input: Record<string, unknown>) => Promise<{
            ok: boolean;
            suggestionId: string;
          }>;
        };
      }
    ).__relaylabGenerationTools.invoke("propose_generated_broll", {
      searchQuery: "restaurant manager monitors live inventory across stores on tablet",
      timelineStart: 69,
      duration: 4,
      prompt: "A restaurant manager reviews a live operations dashboard on a tablet.",
      reason: "No uploaded source communicates the multi-store operations concept.",
    }),
  );
  expect(proposed.ok).toBe(true);
  await expect(
    page.getByTestId(`generation-suggestion-${proposed.suggestionId}`),
  ).toBeVisible();
  expect(providerRequests).toBe(0);

  await suggestion.click();
  await expect(page.getByTestId("generation-suggestion-panel")).toBeVisible();
  await expect(page.getByLabel("Generated B-roll prompt")).toHaveValue(
    /restaurant manager/i,
  );
  expect(providerRequests).toBe(0);

  await page.getByTestId("generate-clip").click();
  await expect(page.getByTestId("generation-error")).toContainText(
    "unavailable in demo mode",
  );
  expect(providerRequests).toBe(1);
  await expect(suggestion).toHaveAttribute("data-status", "failed");

  await page.screenshot({
    path: path.join(process.cwd(), "working-name-generation-suggestion.png"),
    fullPage: true,
  });
});

test("a human generation success becomes an ordinary muted ghost with measured duration", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const nativeDuration = Object.getOwnPropertyDescriptor(
      HTMLMediaElement.prototype,
      "duration",
    )?.get;
    Object.defineProperty(HTMLMediaElement.prototype, "duration", {
      configurable: true,
      get() {
        const source = this.getAttribute("src") ?? "";
        if (source.includes("generated-fixture.mp4")) return 4.2;
        return nativeDuration?.call(this) ?? Number.NaN;
      },
    });
    const nativeLoad = HTMLMediaElement.prototype.load;
    HTMLMediaElement.prototype.load = function load() {
      const source = this.getAttribute("src") ?? "";
      if (source.includes("generated-fixture.mp4")) {
        queueMicrotask(() => this.dispatchEvent(new Event("loadedmetadata")));
        return;
      }
      nativeLoad.call(this);
    };
  });

  let providerRequests = 0;
  await page.route("**/api/generate-broll", async (route) => {
    providerRequests += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        result: {
          url: "/demo/generated-fixture.mp4",
          provider: "fal.ai",
          model: "demo/configured-model",
        },
      }),
    });
  });

  await page.goto("/demo");
  await expect(page.getByTestId("webmcp-status")).toHaveAttribute(
    "data-status",
    "available",
  );
  await page.getByTestId("generation-suggestion-gen_demo_manager").click();
  await page.getByTestId("generate-clip").click();

  const overlay = page.locator('[data-overlay-id^="ov_agent_"]').first();
  await expect(overlay).toHaveAttribute("data-status", "ghost");
  await expect(page.getByTestId("generation-suggestion-gen_demo_manager")).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Download current generated source" }),
  ).toHaveAttribute("download", /generated\.mp4$/u);
  expect(providerRequests).toBe(1);

  const overlayBox = await overlay.boundingBox();
  const track = overlay.locator("..");
  const trackBox = await track.boundingBox();
  if (!overlayBox || !trackBox) throw new Error("Generated overlay track was not measurable.");
  await track.click({
    position: {
      x: overlayBox.x + overlayBox.width / 2 - trackBox.x,
      y: trackBox.height - 2,
    },
  });

  const preview = page.locator('video[data-broll-audio-policy="muted"]');
  await expect(preview).toBeVisible();
  expect(Number(await preview.getAttribute("data-source-time"))).toBeCloseTo(2.1, 2);
  await expect
    .poll(() => preview.evaluate((video) => (video as HTMLVideoElement).muted))
    .toBe(true);
});
