export interface ObjectUrlApi {
  createObjectURL(blob: Blob): string;
  revokeObjectURL(url: string): void;
}

export interface ObjectUrlRegistry {
  create(blob: Blob): string;
  replace(previousUrl: string | null, blob: Blob): string;
  revoke(url: string | null): void;
  owns(url: string | null): boolean;
  dispose(): void;
}

export function createObjectUrlRegistry(
  api: ObjectUrlApi = URL,
): ObjectUrlRegistry {
  const ownedUrls = new Set<string>();
  let disposed = false;

  const create = (blob: Blob): string => {
    if (disposed) {
      throw new Error("Cannot create an object URL after the registry is disposed.");
    }
    const url = api.createObjectURL(blob);
    ownedUrls.add(url);
    return url;
  };

  const revoke = (url: string | null) => {
    if (!url || !ownedUrls.delete(url)) return;
    api.revokeObjectURL(url);
  };

  return {
    create,
    replace: (previousUrl, blob) => {
      const nextUrl = create(blob);
      revoke(previousUrl);
      return nextUrl;
    },
    revoke,
    owns: (url) => Boolean(url && ownedUrls.has(url)),
    dispose: () => {
      if (disposed) return;
      disposed = true;
      [...ownedUrls].forEach(revoke);
    },
  };
}
