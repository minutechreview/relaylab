import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

interface ToolActionResult {
  ok: boolean;
  code?: string;
  overlayId?: string;
  status?: "ghost" | "committed";
  committedOverlayIds?: string[];
  brollAudio?: "muted";
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
  brollTrack: {
    audioPolicy: "muted";
    overlayCount: number;
  };
  overlays: TimelineOverlay[];
}

interface RelayLabWebMcpTestBridge {
  names: () => string[];
  invoke: (name: string, input?: Record<string, unknown>) => Promise<unknown>;
}

type TestWindow = Window & { __relaylabWebMcp: RelayLabWebMcpTestBridge };

const PLANNING_TOOLS = [
  "find_overlay_opportunities",
  "get_project_summary",
  "get_timeline",
  "get_transcript",
  "propose_generated_broll",
  "propose_overlay",
  "remove_generated_broll_suggestion",
  "remove_overlay_proposal",
  "search_broll",
  "set_pacing_preference",
  "update_generated_broll_suggestion",
  "update_overlay_proposal",
];

const READ_ONLY_TOOLS = [
  "find_overlay_opportunities",
  "get_project_summary",
  "get_timeline",
  "get_transcript",
  "search_broll",
];

const HUMAN_ONLY_OR_FORBIDDEN_TOOLS = [
  "approve_plan",
  "lock_overlay",
  "unlock_overlay",
  "set_broll_volume",
  "enable_broll_audio",
  "mix_audio",
  "generate_video",
  "generate_broll",
];

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

test("human edits and approval dynamically gate the agent commit surface", async ({
  page,
}) => {
  await page.goto("/demo");
  await expect(page.getByTestId("webmcp-status")).toHaveAttribute(
    "data-status",
    "available",
  );

  expect(await toolNames(page)).toEqual(PLANNING_TOOLS);
  for (const forbiddenName of [
    ...HUMAN_ONLY_OR_FORBIDDEN_TOOLS,
    "commit_approved_plan",
  ]) {
    expect(await toolNames(page)).not.toContain(forbiddenName);
  }

  const proposal = await invokeTool<ToolActionResult>(page, "propose_overlay", {
    momentId: "moment_workspace_overhead",
    timelineStart: 9.5,
    duration: 4.2,
    reason: "Agent proposal for the human collaboration loop.",
  });
  expect(proposal).toMatchObject({ ok: true, status: "ghost" });
  expect(proposal.overlayId).toBeTruthy();
  const overlayId = proposal.overlayId as string;

  const overlayBlock = page.getByTestId(`overlay-${overlayId}`);
  await expect(overlayBlock).toBeVisible();
  await expect(overlayBlock).toHaveAttribute("data-status", "ghost");
  await expect(page.getByLabel("Overlay source moment")).toHaveValue(
    "moment_workspace_overhead",
  );

  await page.getByLabel("Overlay timeline start").fill("30.5");
  await expect(page.getByLabel("Overlay timeline start")).toHaveValue("30.5");

  await page
    .getByLabel("Overlay source moment")
    .selectOption("moment_city_momentum");
  await expect(page.getByLabel("Overlay source moment")).toHaveValue(
    "moment_city_momentum",
  );

  await page.getByRole("button", { name: "Lock overlay" }).click();
  await expect(overlayBlock).toHaveAttribute("data-locked", "true");
  await expect(page.getByRole("button", { name: "Unlock overlay" })).toBeVisible();
  await expect(page.getByLabel("Overlay timeline start")).toBeDisabled();
  await expect(page.getByLabel("Overlay source moment")).toBeDisabled();

  const rejectedUpdate = await invokeTool<ToolActionResult>(
    page,
    "update_overlay_proposal",
    {
      overlayId,
      timelineStart: 4,
      duration: 2,
      reason: "The agent must not override the human lock.",
    },
  );
  expect(rejectedUpdate).toMatchObject({ ok: false, code: "HUMAN_LOCKED" });

  const planningTimeline = await invokeTool<TimelineResult>(page, "get_timeline");
  const humanEditedOverlay = planningTimeline.overlays.find(
    (overlay) => overlay.id === overlayId,
  );
  expect(planningTimeline).toMatchObject({
    projectStatus: "planning",
    brollTrack: { audioPolicy: "muted" },
  });
  expect(humanEditedOverlay).toMatchObject({
    id: overlayId,
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

  await page.getByTestId("approve-plan").click();
  await expect(page.getByTestId("project-status")).toHaveAttribute(
    "data-project-status",
    "approved",
  );
  await expect
    .poll(() => toolNames(page))
    .toEqual(["commit_approved_plan", ...READ_ONLY_TOOLS].sort());
  for (const mutationName of PLANNING_TOOLS.filter(
    (name) => !READ_ONLY_TOOLS.includes(name),
  )) {
    expect(await toolNames(page)).not.toContain(mutationName);
  }

  await page.getByTestId("webmcp-status").click();
  await expect(page.getByTestId("webmcp-debug-panel")).toBeVisible();
  await expect(
    page.locator('[data-tool-name="commit_approved_plan"]'),
  ).toHaveAttribute("data-active", "true");
  await page.screenshot({
    path: path.join(process.cwd(), "cutroom-phase2.png"),
    fullPage: true,
  });

  const commit = await invokeTool<ToolActionResult>(page, "commit_approved_plan");
  expect(commit).toMatchObject({
    ok: true,
    status: "committed",
    brollAudio: "muted",
  });
  expect(commit.committedOverlayIds).toContain(overlayId);

  await expect(page.getByTestId("project-status")).toHaveAttribute(
    "data-project-status",
    "committed",
  );
  await expect.poll(() => toolNames(page)).toEqual(READ_ONLY_TOOLS.slice().sort());
  await expect(overlayBlock).toHaveAttribute("data-status", "committed");
  await expect(overlayBlock).toHaveAttribute("data-locked", "true");

  const committedTimeline = await invokeTool<TimelineResult>(page, "get_timeline");
  const committedOverlay = committedTimeline.overlays.find(
    (overlay) => overlay.id === overlayId,
  );
  expect(committedTimeline).toMatchObject({
    projectStatus: "committed",
    brollTrack: { audioPolicy: "muted" },
  });
  expect(committedOverlay).toEqual({
    ...humanEditedOverlay,
    status: "committed",
  });
  expect(await toolNames(page)).not.toContain("commit_approved_plan");
});
