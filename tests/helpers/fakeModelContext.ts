export interface TestToolDefinition {
  name: string;
  title?: string;
  description: string;
  inputSchema?: Record<string, unknown>;
  annotations?: Record<string, unknown>;
  execute: (
    input: Record<string, unknown>,
    context?: { signal: AbortSignal },
  ) => unknown | Promise<unknown>;
}

export interface TestRegisterToolOptions {
  signal?: AbortSignal;
  exposedTo?: string[];
}

export interface RegistrationCall {
  tool: TestToolDefinition;
  options: TestRegisterToolOptions | undefined;
}

/**
 * Small behavioral fake for the current imperative WebMCP producer API.
 *
 * It intentionally models registration ownership with AbortSignal. There is
 * no `unregisterTool` escape hatch in the current document.modelContext API;
 * aborting the registration signal is what removes a tool.
 */
export class FakeModelContext extends EventTarget {
  readonly registrationCalls: RegistrationCall[] = [];
  readonly invocationSignals: AbortSignal[] = [];

  private readonly tools = new Map<string, TestToolDefinition>();

  async registerTool(
    tool: TestToolDefinition,
    options?: TestRegisterToolOptions,
  ): Promise<void> {
    this.registrationCalls.push({ tool, options });

    if (options?.signal?.aborted) {
      throw options.signal.reason ?? new DOMException("Aborted", "AbortError");
    }

    if (this.tools.has(tool.name)) {
      throw new DOMException(
        `A tool named ${tool.name} is already registered.`,
        "InvalidStateError",
      );
    }

    this.tools.set(tool.name, tool);
    this.dispatchEvent(new Event("toolchange"));

    options?.signal?.addEventListener(
      "abort",
      () => {
        // Do not let an old StrictMode registration abort a newer tool with
        // the same name.
        if (this.tools.get(tool.name) === tool && this.tools.delete(tool.name)) {
          this.dispatchEvent(new Event("toolchange"));
        }
      },
      { once: true },
    );
  }

  async getTools(): Promise<TestToolDefinition[]> {
    return [...this.tools.values()];
  }

  get registeredToolNames(): string[] {
    return [...this.tools.keys()].sort();
  }

  async invoke(
    name: string,
    input: Record<string, unknown> = {},
    signal = new AbortController().signal,
  ): Promise<unknown> {
    const tool = this.tools.get(name);

    if (!tool) {
      throw new DOMException(`Tool not found: ${name}`, "NotFoundError");
    }

    const jsonInput = JSON.parse(JSON.stringify(input)) as Record<
      string,
      unknown
    >;
    this.invocationSignals.push(signal);
    const result = await tool.execute(jsonInput, { signal });

    // Native tool boundaries are JSON-shaped. Round-tripping catches tests
    // that accidentally rely on functions, class instances, or undefined.
    return JSON.parse(JSON.stringify(result)) as unknown;
  }
}

/** Accept either a plain JSON result or the MCP content envelope. */
export function unwrapToolResult<T>(result: unknown): T {
  if (
    result &&
    typeof result === "object" &&
    "structuredContent" in result
  ) {
    return (result as { structuredContent: T }).structuredContent;
  }

  if (result && typeof result === "object" && "content" in result) {
    const content = (result as { content?: unknown }).content;

    if (Array.isArray(content)) {
      const textBlock = content.find(
        (block): block is { type: "text"; text: string } =>
          Boolean(
            block &&
              typeof block === "object" &&
              "type" in block &&
              block.type === "text" &&
              "text" in block &&
              typeof block.text === "string",
          ),
      );

      if (textBlock) {
        return JSON.parse(textBlock.text) as T;
      }
    }
  }

  return result as T;
}
