import { describe, expect, it } from "vitest";

import {
  createOpenAiVisionProvider,
  pendingMomentDescription,
} from "@/lib/analysis/describeMoment";

function fakeFetch(handler: () => Response): typeof fetch {
  return (async () => handler()) as typeof fetch;
}

describe("Phase 4 vision metadata provider", () => {
  it("returns an honest pending placeholder helper without any fabricated content", () => {
    const pending = pendingMomentDescription();
    expect(pending.description).toMatch(/pending/i);
    expect(pending.tags).toContain("unindexed");
  });

  it("returns the pending placeholder when there are no sampled frames", async () => {
    const provider = createOpenAiVisionProvider({
      apiKey: "sk-test",
      fetchImpl: fakeFetch(() => new Response("{}")),
    });

    const result = await provider.describe({ source: "blob:reel", frameTimestamps: [] });
    expect(result).toEqual(pendingMomentDescription());
  });

  it("parses a strict-JSON factual description and tags from the model response", async () => {
    const provider = createOpenAiVisionProvider({
      apiKey: "sk-test",
      fetchImpl: fakeFetch(
        () =>
          new Response(
            JSON.stringify({
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      description: "A person types on a laptop at a desk.",
                      tags: ["desk", "laptop", "typing"],
                    }),
                  },
                },
              ],
            }),
            { status: 200 },
          ),
      ),
    });

    const result = await provider.describe({
      source: "blob:reel",
      frameTimestamps: [1, 2, 3],
    });

    expect(result.description).toBe("A person types on a laptop at a desk.");
    expect(result.tags).toEqual(["desk", "laptop", "typing"]);
  });

  it("throws when no API key is configured", async () => {
    const provider = createOpenAiVisionProvider({
      apiKey: undefined,
      fetchImpl: fakeFetch(() => new Response("{}")),
    });

    await expect(
      provider.describe({ source: "blob:reel", frameTimestamps: [1] }),
    ).rejects.toThrow(/OPENAI_API_KEY/);
  });

  it("throws a clear error when the response has no content", async () => {
    const provider = createOpenAiVisionProvider({
      apiKey: "sk-test",
      fetchImpl: fakeFetch(() => new Response(JSON.stringify({ choices: [] }), { status: 200 })),
    });

    await expect(
      provider.describe({ source: "blob:reel", frameTimestamps: [1] }),
    ).rejects.toThrow(/no content/i);
  });
});
