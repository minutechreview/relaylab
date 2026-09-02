import { describe, expect, it, vi } from "vitest";

import { createObjectUrlRegistry } from "@/lib/media/objectUrlRegistry";

describe("local object URL ownership", () => {
  it("revokes replaced and disposed owned URLs exactly once", () => {
    let sequence = 0;
    const api = {
      createObjectURL: vi.fn(() => `blob:relaylab-${++sequence}`),
      revokeObjectURL: vi.fn(),
    };
    const registry = createObjectUrlRegistry(api);
    const first = registry.create(new Blob(["base"]));
    const second = registry.replace(first, new Blob(["replacement"]));

    expect(first).toBe("blob:relaylab-1");
    expect(second).toBe("blob:relaylab-2");
    expect(registry.owns(first)).toBe(false);
    expect(registry.owns(second)).toBe(true);
    expect(api.revokeObjectURL).toHaveBeenCalledExactlyOnceWith(first);

    registry.revoke(first);
    registry.dispose();
    registry.dispose();
    expect(api.revokeObjectURL).toHaveBeenCalledTimes(2);
    expect(api.revokeObjectURL).toHaveBeenLastCalledWith(second);
    expect(registry.owns(second)).toBe(false);
  });

  it("never revokes an external URL and rejects creation after disposal", () => {
    const api = {
      createObjectURL: vi.fn(() => "blob:owned"),
      revokeObjectURL: vi.fn(),
    };
    const registry = createObjectUrlRegistry(api);

    const owned = registry.replace("https://example.com/demo.mp4", new Blob());
    expect(owned).toBe("blob:owned");
    expect(api.revokeObjectURL).not.toHaveBeenCalled();

    registry.dispose();
    expect(() => registry.create(new Blob())).toThrow(/disposed/i);
  });
});
