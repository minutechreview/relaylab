/// <reference types="webmcp-types" />

"use client";

import { useEffect, useState } from "react";

import { useRelayLabStore, useRelayLabStoreApi } from "./EditorProvider";
import { LinkIcon } from "./Icons";
import {
  ALL_RELAYLAB_TOOL_NAMES,
  registerRelayLabTools,
  type RegistrationSnapshot,
} from "@/lib/webmcp/registerRelayLabTools";

type BridgeStatus = "checking" | "available" | "unavailable" | "error";

export function WebMcpBridge() {
  const store = useRelayLabStoreApi();
  const projectStatus = useRelayLabStore((state) => state.project.status);
  const [status, setStatus] = useState<BridgeStatus>("checking");
  const [open, setOpen] = useState(false);
  const [snapshot, setSnapshot] = useState<RegistrationSnapshot>({
    activeNames: [],
    failedNames: [],
    projectStatus,
  });

  useEffect(() => {
    if (!document.modelContext) {
      setStatus("unavailable");
      setSnapshot((current) => ({ ...current, projectStatus: store.getState().project.status }));
      return;
    }

    let active = true;
    const registration = registerRelayLabTools(document.modelContext, store, {
      onChange: (nextSnapshot) => {
        if (!active) return;
        setSnapshot(nextSnapshot);
        if (nextSnapshot.failedNames.length > 0) {
          setStatus("error");
        }
      },
    });
    void registration.ready.then((results) => {
      if (!active) return;
      setStatus(results.every((result) => result.status === "fulfilled") ? "available" : "error");
      setSnapshot((current) => ({
        ...current,
        activeNames: registration.getActiveNames(),
        projectStatus: store.getState().project.status,
      }));
    });

    return () => {
      active = false;
      registration.abort();
    };
  }, [store]);

  useEffect(() => {
    if (status === "unavailable") {
      setSnapshot((current) => ({ ...current, projectStatus }));
    }
  }, [projectStatus, status]);

  const copy = {
    checking: "Checking WebMCP",
    available: `${snapshot.activeNames.length} tool${snapshot.activeNames.length === 1 ? "" : "s"} connected`,
    unavailable: "WebMCP unavailable",
    error: "Tool registration error",
  }[status];

  return (
    <div className="relative">
      <button
        aria-label={`${copy}. Open WebMCP status.`}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="icon-button relative"
        data-status={status}
        data-testid="webmcp-status"
        onClick={() => setOpen((current) => !current)}
        title="Open the WebMCP registration debug panel"
        type="button"
      >
        <span
          className={`absolute right-1 top-1 h-1.5 w-1.5 rounded-full ring-2 ring-[#111318] ${
            status === "available"
              ? "bg-[#7ee2b8] shadow-[0_0_8px_#7ee2b8]"
              : status === "checking"
                ? "animate-pulse bg-[#f0bd6b]"
                : status === "error"
                  ? "bg-[#ee8375]"
                  : "bg-[#626a76]"
          }`}
        />
        <LinkIcon className="h-3.5 w-3.5" />
        <span className="sr-only">{copy}</span>
      </button>

      {open ? (
        <div
          aria-label="WebMCP debug panel"
          className="absolute right-0 top-[calc(100%+10px)] z-50 w-[330px] overflow-hidden rounded-xl border border-[#333943] bg-[#111419] shadow-[0_24px_70px_rgba(0,0,0,.55)]"
          data-testid="webmcp-debug-panel"
          role="dialog"
        >
          <div className="border-b border-[#292e36] px-4 py-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="micro-label">WebMCP debug</div>
                <div className="mt-1 text-[10px] text-[#68717c]">Live agent-visible tool surface</div>
              </div>
              <button
                aria-label="Close WebMCP debug panel"
                className="rounded px-2 py-1 text-[14px] text-[#68717c] hover:bg-[#20242a] hover:text-white"
                onClick={() => setOpen(false)}
                type="button"
              >
                ×
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 border-b border-[#292e36] px-4 py-3">
            <div className="rounded-lg border border-[#292f37] bg-[#0d0f12] p-2.5">
              <div className="text-[8px] font-bold uppercase tracking-[0.12em] text-[#59616c]">WebMCP</div>
              <div className="mt-1.5 flex items-center gap-1.5 text-[10px] font-semibold text-[#d5d8dd]">
                <span className={`h-1.5 w-1.5 rounded-full ${status === "available" ? "bg-[#7ee2b8]" : "bg-[#68717b]"}`} />
                {status === "available" ? "Available" : status === "checking" ? "Checking" : "Unavailable"}
              </div>
            </div>
            <div className="rounded-lg border border-[#292f37] bg-[#0d0f12] p-2.5">
              <div className="text-[8px] font-bold uppercase tracking-[0.12em] text-[#59616c]">Project</div>
              <div className="mt-1.5 text-[10px] font-semibold capitalize text-[#d5d8dd]" data-testid="debug-project-status">
                {snapshot.projectStatus}
              </div>
            </div>
          </div>

          <div className="px-4 py-3">
            <div className="mb-2 text-[8px] font-bold uppercase tracking-[0.13em] text-[#59616c]">Registered tools</div>
            <div className="space-y-1" data-testid="registered-tools">
              {ALL_RELAYLAB_TOOL_NAMES.map((name) => {
                const registered = status === "available" && snapshot.activeNames.includes(name);
                const failed = snapshot.failedNames.includes(name);
                return (
                  <div
                    className={`flex items-center justify-between rounded-md border px-2.5 py-2 font-mono text-[9px] ${
                      registered
                        ? "border-[#29483b] bg-[#12251d] text-[#9be9c7]"
                        : failed
                          ? "border-[#593a37] bg-[#281817] text-[#f0a198]"
                          : "border-[#292e35] bg-[#0d0f12] text-[#737b86]"
                    }`}
                    data-active={registered ? "true" : "false"}
                    data-tool-name={name}
                    key={name}
                  >
                    <span>{registered ? "✓" : "○"} {name}</span>
                    <span className="font-sans text-[7px] font-bold uppercase tracking-[0.08em]">
                      {registered ? "Registered" : failed ? "Failed" : "Not registered"}
                    </span>
                  </div>
                );
              })}
            </div>
            <p className="mt-3 text-[9px] leading-4 text-[#59616c]">
              Approval and lock controls stay human-only. The commit tool exists only while this project is approved.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
