"use client";

import { createContext, useContext, useRef, type ReactNode } from "react";
import { useStore } from "zustand";

import { LocalMediaProvider } from "./LocalMediaProvider";
import { createDemoProject } from "@/lib/demo/project";
import { createBlankProject } from "@/lib/editor/blankProject";
import {
  createRelayLabStore,
  type RelayLabState,
  type RelayLabStoreApi,
} from "@/lib/editor/store";

const RelayLabStoreContext = createContext<RelayLabStoreApi | null>(null);

export type EditorProjectKind = "blank" | "demo";

export function EditorProvider({
  children,
  projectKind = "demo",
}: {
  children: ReactNode;
  projectKind?: EditorProjectKind;
}) {
  const storeRef = useRef<RelayLabStoreApi | null>(null);
  if (!storeRef.current) {
    const initialProject =
      projectKind === "blank" ? createBlankProject() : createDemoProject();
    storeRef.current = createRelayLabStore(initialProject);
  }

  return (
    <RelayLabStoreContext.Provider value={storeRef.current}>
      <LocalMediaProvider store={storeRef.current}>{children}</LocalMediaProvider>
    </RelayLabStoreContext.Provider>
  );
}

export function useRelayLabStoreApi(): RelayLabStoreApi {
  const store = useContext(RelayLabStoreContext);
  if (!store) {
    throw new Error("useRelayLabStoreApi must be used inside EditorProvider.");
  }
  return store;
}

export function useRelayLabStore<T>(selector: (state: RelayLabState) => T): T {
  return useStore(useRelayLabStoreApi(), selector);
}
