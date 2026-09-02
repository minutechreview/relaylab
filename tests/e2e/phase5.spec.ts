import { expect, test } from "@playwright/test";

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

      names(): string[] {
        return [...this.tools.keys()].sort();
      }

      async invoke(
        name: string,
        input: Record<string, unknown> = {},
      ): Promise<unknown> {
        const tool = this.tools.get(name);
        if (!tool) throw new DOMException(`Tool not found: ${name}`, "NotFoundError");
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

test("captions render over the preview, the caption toggle hides them, and pacing preference is clamped", async ({
  page,
}) => {
  await page.goto("/demo");
  await expect(page.getByTestId("webmcp-status")).toHaveAttribute(
    "data-status",
    "available",
  );

  // The demo project's playhead starts at 21.8s, inside the third transcript
  // segment (18.2-28.8s), so its matching caption should already be visible.
  const caption = page.getByTestId("active-caption");
  await expect(caption).toBeVisible();
  await expect(caption).toHaveText(
    "First, show the outcome. Let people see the finished work before you explain every control.",
  );

  const captionsToggle = page.locator("#captions-toggle");
  await page.locator('label[for="captions-toggle"]').click();
  await expect(captionsToggle).not.toBeChecked();
  await expect(caption).not.toBeVisible();
  await page.locator('label[for="captions-toggle"]').click();
  await expect(captionsToggle).toBeChecked();
  await expect(caption).toBeVisible();

  const pacingInput = page.getByLabel(
    "Maximum uninterrupted talking-head seconds before a pacing gap is flagged, from 5 to 30",
  );
  await expect(pacingInput).toHaveValue("15");
  await expect(pacingInput).toBeEditable();

  await pacingInput.fill("22");
  await pacingInput.blur();
  await expect(pacingInput).toHaveValue("22");

  // Out-of-range input is clamped by the store, not silently accepted.
  await pacingInput.fill("99");
  await pacingInput.blur();
  await expect(pacingInput).toHaveValue("30");

  // Keyboard-only interaction: tab to the field and adjust without a pointer.
  await pacingInput.focus();
  await page.keyboard.press("ArrowDown");
  await pacingInput.blur();
  await expect(pacingInput).toHaveValue("29");

  const scrubber = page.getByTestId("timeline-scrubber");
  const scrubberBox = await scrubber.boundingBox();
  expect(scrubberBox).not.toBeNull();
  if (scrubberBox) {
    await page.mouse.move(
      scrubberBox.x + scrubberBox.width * 0.72,
      scrubberBox.y + scrubberBox.height / 2,
    );
    await expect
      .poll(async () =>
        Number(await page.getByTestId("timeline-playhead").getAttribute("data-time")),
      )
      .toBeGreaterThan(60);
  }
});

test("RelayLab keeps details on demand and supports split plus caption placement", async ({
  page,
}) => {
  await page.goto("/demo");
  await expect(page.locator("header")).toContainText("RelayLab");
  await expect(page.getByLabel("Selected timeline item details")).toBeVisible();

  await page.getByRole("button", { name: "Close timeline inspector" }).click();
  await expect(page.getByLabel("Selected timeline item details")).toHaveCount(0);

  await page.getByTestId("overlay-ov_demo_1").click();
  await expect(page.getByLabel("Selected timeline item details")).toBeVisible();
  await expect(page.getByTestId("split-overlay")).toBeEnabled();
  await page.getByTestId("split-overlay").click();

  const timeline = (await page.evaluate(async () =>
    (window as unknown as {
      __relaylabWebMcp: {
        invoke: (name: string) => Promise<{
          overlays: Array<{ sourceStart: number; sourceEnd: number; timelineStart: number; timelineEnd: number }>;
        }>;
      };
    }).__relaylabWebMcp.invoke("get_timeline"),
  )) as {
    overlays: Array<{ sourceStart: number; sourceEnd: number; timelineStart: number; timelineEnd: number }>;
  };
  expect(timeline.overlays).toHaveLength(2);
  expect(timeline.overlays[0].timelineEnd).toBe(timeline.overlays[1].timelineStart);
  expect(timeline.overlays[0].sourceEnd).toBe(timeline.overlays[1].sourceStart);

  await page.locator("header").getByRole("button", { name: "Toggle captions" }).click();
  await page.getByRole("button", { name: "Top", exact: true }).click();
  await expect(page.getByTestId("active-caption")).toHaveAttribute("data-caption-position", "top");
});

test("a human can drag an indexed library moment directly onto the B-roll track", async ({
  page,
}) => {
  await page.goto("/demo");
  await expect(page.getByTestId("webmcp-status")).toHaveAttribute(
    "data-status",
    "available",
  );

  const before = (await page.evaluate(async () =>
    (window as unknown as {
      __relaylabWebMcp: { invoke: (name: string) => Promise<{ overlays: unknown[] }> };
    }).__relaylabWebMcp.invoke("get_timeline"),
  )) as { overlays: unknown[] };

  await page
    .getByLabel(/B-roll moment:/)
    .first()
    .dragTo(page.getByTestId("broll-timeline-drop-zone"), {
      targetPosition: { x: 520, y: 30 },
    });

  const after = (await page.evaluate(async () =>
    (window as unknown as {
      __relaylabWebMcp: {
        invoke: (name: string) => Promise<{
          overlays: Array<{ createdBy: string; status: string }>;
        }>;
      };
    }).__relaylabWebMcp.invoke("get_timeline"),
  )) as { overlays: Array<{ createdBy: string; status: string }> };

  expect(after.overlays).toHaveLength(before.overlays.length + 1);
  expect(after.overlays).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ createdBy: "human", status: "ghost" }),
    ]),
  );
});
