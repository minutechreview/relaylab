import path from "node:path";

import { expect, test } from "@playwright/test";

interface BrowserToolResult {
  ok?: boolean;
  overlayId?: string;
  overlays?: Array<{
    id: string;
    timelineStart: number;
    timelineEnd: number;
    status: "ghost" | "committed";
  }>;
}

interface RelayLabWebMcpTestBridge {
  names: () => string[];
  invoke: (name: string, input?: Record<string, unknown>) => Promise<unknown>;
}

type TestWindow = Window & { __relaylabWebMcp: RelayLabWebMcpTestBridge };

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

test("agent proposal, human move, and timeline reread share one project", async ({
  page,
}) => {
  await page.goto("/demo");
  await expect(page.getByTestId("webmcp-status")).toHaveAttribute(
    "data-status",
    "available",
  );

  const names = await page.evaluate(() =>
    (window as unknown as TestWindow).__relaylabWebMcp.names(),
  );
  expect(names).toEqual([
    "find_overlay_opportunities",
    "get_edit_plan",
    "get_project_summary",
    "get_timeline",
    "get_transcript",
    "propose_generated_broll",
    "propose_overlay",
    "remove_generated_broll_suggestion",
    "remove_overlay_proposal",
    "replan_unlocked_sections",
    "search_broll",
    "set_caption_style",
    "set_pacing_preference",
    "update_generated_broll_suggestion",
    "update_overlay_proposal",
  ]);

  const proposal = (await page.evaluate(
    async (input) =>
      (window as unknown as TestWindow).__relaylabWebMcp.invoke("propose_overlay", input),
    {
      momentId: "moment_workspace_overhead",
      timelineStart: 9.5,
      duration: 4.2,
      reason: "Show the design process as the speaker explains clarity.",
    },
  )) as BrowserToolResult;

  expect(proposal.ok).toBe(true);
  expect(proposal.overlayId).toBeTruthy();
  const overlayId = proposal.overlayId as string;
  const overlayBlock = page.getByTestId(`overlay-${overlayId}`);
  await expect(overlayBlock).toBeVisible();
  await expect(overlayBlock).toHaveAttribute("data-status", "ghost");

  const box = await overlayBlock.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 70, box.y + box.height / 2, {
    steps: 8,
  });
  await page.mouse.up();
  await expect(page.getByLabel("Overlay timeline start")).not.toHaveValue("9.5");

  await page.getByLabel("Overlay timeline start").fill("30.5");
  await expect(page.getByLabel("Overlay timeline start")).toHaveValue("30.5");

  const timeline = (await page.evaluate(async () =>
    (window as unknown as TestWindow).__relaylabWebMcp.invoke("get_timeline"),
  )) as BrowserToolResult;
  const reread = timeline.overlays?.find((overlay) => overlay.id === overlayId);

  expect(reread).toMatchObject({
    id: overlayId,
    timelineStart: 30.5,
    timelineEnd: 34.7,
    status: "ghost",
  });

  await page.screenshot({
    path: path.join(process.cwd(), "cutroom-phase1.png"),
    fullPage: true,
  });
});
