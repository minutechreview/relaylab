import { expect, test, type Page } from "@playwright/test";

interface ToolActionResult {
  ok: boolean;
  overlayId?: string;
  status?: "ghost" | "committed";
  committedOverlayIds?: string[];
}

interface TimelineOverlay {
  id: string;
  assetId: string;
  momentId?: string;
  sourceStart: number;
  sourceEnd: number;
  timelineStart: number;
  timelineEnd: number;
  status: "ghost" | "committed";
  lockedByHuman: boolean;
  reason?: string;
  createdBy: "human" | "agent";
}

interface TimelineResult {
  projectStatus: "planning" | "approved" | "committed";
  overlays: TimelineOverlay[];
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

test("judge loop preserves human judgment while the agent replans around it", async ({
  page,
}) => {
  await page.goto("/demo");
  await expect(page.getByTestId("webmcp-status")).toHaveAttribute(
    "data-status",
    "available",
  );

  // Approval is deliberately human-only: the commit tool does not exist yet.
  expect(await toolNames(page)).not.toContain("commit_approved_plan");

  const firstProposal = await invokeTool<ToolActionResult>(
    page,
    "propose_overlay",
    {
      momentId: "moment_workspace_overhead",
      timelineStart: 9.5,
      duration: 4.2,
      reason: "Support the speaker's first explanation with the design process.",
    },
  );
  expect(firstProposal).toMatchObject({ ok: true, status: "ghost" });
  expect(firstProposal.overlayId).toBeTruthy();
  const firstOverlayId = firstProposal.overlayId as string;

  const firstOverlayBlock = page.getByTestId(`overlay-${firstOverlayId}`);
  await expect(firstOverlayBlock).toHaveAttribute("data-status", "ghost");

  // The human makes the editorial judgment: retime, swap the source, then lock it.
  await page.getByLabel("Overlay timeline start").fill("30.5");
  await page
    .getByLabel("Overlay source moment")
    .selectOption("moment_city_momentum");
  await page.getByRole("button", { name: "Lock overlay" }).click();
  await expect(firstOverlayBlock).toHaveAttribute("data-locked", "true");

  // The agent rereads structured state and sees the human's exact change and lock.
  const planningTimeline = await invokeTool<TimelineResult>(
    page,
    "get_timeline",
  );
  const humanEditedOverlay = planningTimeline.overlays.find(
    (overlay) => overlay.id === firstOverlayId,
  );
  expect(planningTimeline.projectStatus).toBe("planning");
  expect(humanEditedOverlay).toMatchObject({
    id: firstOverlayId,
    assetId: "city_reel",
    momentId: "moment_city_momentum",
    sourceStart: 74.2,
    sourceEnd: 78.4,
    timelineStart: 30.5,
    timelineEnd: 34.7,
    status: "ghost",
    lockedByHuman: true,
    createdBy: "agent",
  });

  // It replans elsewhere instead of trying to overwrite the locked decision.
  const secondProposal = await invokeTool<ToolActionResult>(
    page,
    "propose_overlay",
    {
      momentId: "moment_product_action",
      timelineStart: 49.2,
      duration: 5.4,
      reason: "Use a separate unlocked area for the speaker's next-action point.",
    },
  );
  expect(secondProposal).toMatchObject({ ok: true, status: "ghost" });
  expect(secondProposal.overlayId).toBeTruthy();
  const secondOverlayId = secondProposal.overlayId as string;
  expect(secondOverlayId).not.toBe(firstOverlayId);

  const secondOverlayBlock = page.getByTestId(`overlay-${secondOverlayId}`);
  await expect(secondOverlayBlock).toHaveAttribute("data-status", "ghost");
  await expect(secondOverlayBlock).toHaveAttribute("data-locked", "false");

  const replannedTimeline = await invokeTool<TimelineResult>(
    page,
    "get_timeline",
  );
  expect(
    replannedTimeline.overlays.find((overlay) => overlay.id === firstOverlayId),
  ).toMatchObject({
    timelineStart: 30.5,
    timelineEnd: 34.7,
    momentId: "moment_city_momentum",
    lockedByHuman: true,
  });
  expect(
    replannedTimeline.overlays.find((overlay) => overlay.id === secondOverlayId),
  ).toMatchObject({
    momentId: "moment_product_action",
    timelineStart: 49.2,
    timelineEnd: 54.6,
    status: "ghost",
    lockedByHuman: false,
  });

  expect(await toolNames(page)).not.toContain("commit_approved_plan");
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
  expect(commit.committedOverlayIds).toEqual(
    expect.arrayContaining([firstOverlayId, secondOverlayId]),
  );

  const committedTimeline = await invokeTool<TimelineResult>(
    page,
    "get_timeline",
  );
  const committedHumanEdit = committedTimeline.overlays.find(
    (overlay) => overlay.id === firstOverlayId,
  );
  const committedReplan = committedTimeline.overlays.find(
    (overlay) => overlay.id === secondOverlayId,
  );

  expect(committedTimeline.projectStatus).toBe("committed");
  expect(committedHumanEdit).toMatchObject({
    assetId: "city_reel",
    momentId: "moment_city_momentum",
    sourceStart: 74.2,
    sourceEnd: 78.4,
    timelineStart: 30.5,
    timelineEnd: 34.7,
    status: "committed",
    lockedByHuman: true,
  });
  expect(committedReplan).toMatchObject({
    momentId: "moment_product_action",
    timelineStart: 49.2,
    timelineEnd: 54.6,
    status: "committed",
    lockedByHuman: false,
  });
  await expect(firstOverlayBlock).toHaveAttribute("data-status", "committed");
  await expect(firstOverlayBlock).toHaveAttribute("data-locked", "true");
  await expect(secondOverlayBlock).toHaveAttribute("data-status", "committed");
  expect(await toolNames(page)).not.toContain("commit_approved_plan");
});
