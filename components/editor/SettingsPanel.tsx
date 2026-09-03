"use client";

import { useEffect, useRef, useState } from "react";

import { HeaderMenuPanel } from "./HeaderMenuPanel";
import { CheckIcon, CloseIcon, EyeIcon, EyeOffIcon, SettingsIcon, WarningIcon } from "./Icons";

type ProviderStatus = "checking" | "available" | "not_configured";
type TestState = "idle" | "testing" | "ok" | "failed";

interface CredentialsStatusResponse {
  ok: boolean;
  openai: { status: "available" | "not_configured" };
  fal: { status: "available" | "not_configured"; model: string | null };
}

async function fetchStatus(): Promise<CredentialsStatusResponse | null> {
  try {
    const response = await fetch("/api/ai/credentials", { method: "GET" });
    if (!response.ok) return null;
    return (await response.json()) as CredentialsStatusResponse;
  } catch {
    return null;
  }
}

/**
 * Settings panel for BYOK ("Bring Your Own Key") session credentials.
 *
 * Security note shown to the user and true of this implementation: keys are
 * held only in server memory against an httpOnly session cookie for this
 * browser session. They are lost on server restart, never written to disk,
 * never included in project export, and never exposed to the WebMCP tool
 * surface (`get_project_summary`, `get_timeline`, `search_broll`, etc. never
 * read from this module or from credential storage).
 */
export function SettingsPanel() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [openaiStatus, setOpenaiStatus] = useState<ProviderStatus>("checking");
  const [falStatus, setFalStatus] = useState<ProviderStatus>("checking");
  const [falModel, setFalModel] = useState<string | null>(null);

  const [openaiKeyInput, setOpenaiKeyInput] = useState("");
  const [openaiKeyVisible, setOpenaiKeyVisible] = useState(false);
  const [openaiTest, setOpenaiTest] = useState<TestState>("idle");
  const [openaiTestMessage, setOpenaiTestMessage] = useState<string | null>(null);
  const [openaiSaveError, setOpenaiSaveError] = useState<string | null>(null);

  const [falKeyInput, setFalKeyInput] = useState("");
  const [falModelInput, setFalModelInput] = useState("");
  const [falKeyVisible, setFalKeyVisible] = useState(false);
  const [falTest, setFalTest] = useState<TestState>("idle");
  const [falTestMessage, setFalTestMessage] = useState<string | null>(null);
  const [falSaveError, setFalSaveError] = useState<string | null>(null);

  const refreshStatus = async () => {
    const status = await fetchStatus();
    if (!status) return;
    setOpenaiStatus(status.openai.status);
    setFalStatus(status.fal.status);
    setFalModel(status.fal.model);
  };

  useEffect(() => {
    if (open) void refreshStatus();
  }, [open]);

  async function saveOpenAiKey() {
    const apiKey = openaiKeyInput.trim();
    if (!apiKey) return;
    setOpenaiSaveError(null);
    try {
      const response = await fetch("/api/ai/credentials", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider: "openai", apiKey }),
      });
      if (response.ok) {
        setOpenaiKeyInput("");
        setOpenaiTest("idle");
        setOpenaiTestMessage(null);
        await refreshStatus();
        return;
      }
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      setOpenaiSaveError(payload?.message ?? `Save failed (${response.status}).`);
    } catch {
      setOpenaiSaveError("Could not reach the credentials endpoint.");
    }
  }

  async function removeOpenAiKey() {
    await fetch("/api/ai/credentials", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider: "openai" }),
    });
    setOpenaiTest("idle");
    setOpenaiTestMessage(null);
    setOpenaiSaveError(null);
    await refreshStatus();
  }

  async function testOpenAiKey() {
    setOpenaiTest("testing");
    setOpenaiTestMessage(null);
    try {
      const response = await fetch("/api/ai/openai/test", { method: "POST" });
      const payload = (await response.json().catch(() => null)) as { ok?: boolean; message?: string } | null;
      if (response.ok && payload?.ok) {
        setOpenaiTest("ok");
      } else {
        setOpenaiTest("failed");
        setOpenaiTestMessage(payload?.message ?? "The key could not be validated.");
      }
    } catch {
      setOpenaiTest("failed");
      setOpenaiTestMessage("Could not reach the test-connection endpoint.");
    }
  }

  async function saveFalCredential() {
    const apiKey = falKeyInput.trim();
    const model = falModelInput.trim();
    if (!apiKey) return;
    setFalSaveError(null);
    try {
      const response = await fetch("/api/ai/credentials", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider: "fal", apiKey, ...(model ? { model } : {}) }),
      });
      if (response.ok) {
        setFalKeyInput("");
        setFalModelInput("");
        setFalTest("idle");
        setFalTestMessage(null);
        await refreshStatus();
        return;
      }
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      setFalSaveError(payload?.message ?? `Save failed (${response.status}).`);
    } catch {
      setFalSaveError("Could not reach the credentials endpoint.");
    }
  }

  async function removeFalCredential() {
    await fetch("/api/ai/credentials", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider: "fal" }),
    });
    setFalTest("idle");
    setFalTestMessage(null);
    setFalSaveError(null);
    await refreshStatus();
  }

  async function testFalKey() {
    setFalTest("testing");
    setFalTestMessage(null);
    try {
      const response = await fetch("/api/ai/fal/test", { method: "POST" });
      const payload = (await response.json().catch(() => null)) as { ok?: boolean; message?: string } | null;
      if (response.ok && payload?.ok) {
        setFalTest("ok");
      } else {
        setFalTest("failed");
        setFalTestMessage(payload?.message ?? "The key could not be validated.");
      }
    } catch {
      setFalTest("failed");
      setFalTestMessage("Could not reach the test-connection endpoint.");
    }
  }

  async function clearAllCredentials() {
    await fetch("/api/ai/credentials", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider: "all" }),
    });
    setOpenaiTest("idle");
    setFalTest("idle");
    setOpenaiTestMessage(null);
    setFalTestMessage(null);
    setOpenaiSaveError(null);
    setFalSaveError(null);
    await refreshStatus();
  }

  const statusBadge = (status: ProviderStatus) => (
    <span
      className={`flex items-center gap-1 rounded border px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.08em] ${
        status === "available"
          ? "border-[#345343] bg-[#16241d] text-[#83cdaa]"
          : "border-[#3a3229] bg-[#211c14] text-[#c9a25f]"
      }`}
      data-testid={`settings-status-${status}`}
    >
      {status === "checking" ? "Checking" : status === "available" ? "Configured ✓" : "Not configured"}
    </span>
  );

  return (
    <div className="relative" ref={containerRef}>
      <button
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="Open AI settings"
        className="icon-button"
        data-testid="settings-open"
        onClick={() => setOpen((current) => !current)}
        title="AI settings: bring your own OpenAI and fal.ai keys"
        type="button"
      >
        <SettingsIcon className="h-4 w-4" />
      </button>

      <HeaderMenuPanel anchorRef={containerRef} gapPx={10} isOpen={open}>
        <div
          aria-label="AI settings panel"
          className="w-[360px] overflow-hidden rounded-xl border border-[#333943] bg-[#111419] shadow-[0_24px_70px_rgba(0,0,0,.55)]"
          data-testid="settings-panel"
          role="dialog"
        >
          <div className="flex items-center justify-between border-b border-[#292e36] px-4 py-3">
            <div>
              <div className="micro-label">AI settings</div>
              <div className="mt-1 text-[10px] text-[#68717c]">Bring your own keys for this session</div>
            </div>
            <button
              aria-label="Close AI settings"
              className="rounded px-2 py-1 text-[14px] text-[#68717c] hover:bg-[#20242a] hover:text-white"
              onClick={() => setOpen(false)}
              type="button"
            >
              <CloseIcon className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="max-h-[70vh] space-y-4 overflow-y-auto px-4 py-3">
            {/* OpenAI */}
            <section className="rounded-lg border border-[#242831] bg-[#0d0f12] p-3">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#d5d8dd]">OpenAI</span>
                {statusBadge(openaiStatus)}
              </div>
              <p className="mb-2 text-[9px] leading-4 text-[#68717c]">
                Used for automatic transcription and real B-roll visual analysis.
              </p>
              <div className="flex gap-1.5">
                <div className="relative flex-1">
                  <input
                    aria-label="OpenAI API key"
                    className="w-full rounded-md border border-[#2c313a] bg-[#0b0d10] px-2 py-1.5 pr-7 text-[10px] text-[#e6e8eb] outline-none focus:border-[#4c5563]"
                    data-testid="openai-key-input"
                    onChange={(event) => setOpenaiKeyInput(event.target.value)}
                    placeholder="sk-..."
                    type={openaiKeyVisible ? "text" : "password"}
                    value={openaiKeyInput}
                  />
                  <button
                    aria-label={openaiKeyVisible ? "Hide OpenAI key" : "Show OpenAI key"}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[#68717c] hover:text-white"
                    onClick={() => setOpenaiKeyVisible((current) => !current)}
                    type="button"
                  >
                    {openaiKeyVisible ? <EyeOffIcon className="h-3.5 w-3.5" /> : <EyeIcon className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <button
                  className="rounded-md border border-[#3b4552] bg-[#161a20] px-2 py-1 text-[9px] font-semibold text-[#d5d8dd] disabled:cursor-not-allowed disabled:opacity-40"
                  data-testid="openai-save"
                  disabled={!openaiKeyInput.trim()}
                  onClick={() => void saveOpenAiKey()}
                  type="button"
                >
                  Save key
                </button>
                <button
                  className="rounded-md border border-[#3b4552] bg-[#161a20] px-2 py-1 text-[9px] font-semibold text-[#d5d8dd] disabled:cursor-not-allowed disabled:opacity-40"
                  data-testid="openai-test"
                  disabled={openaiStatus !== "available" || openaiTest === "testing"}
                  onClick={() => void testOpenAiKey()}
                  type="button"
                >
                  {openaiTest === "testing" ? "Testing…" : "Test connection"}
                </button>
                <button
                  className="rounded-md border border-[#593a37] bg-[#221614] px-2 py-1 text-[9px] font-semibold text-[#e59589] disabled:cursor-not-allowed disabled:opacity-40"
                  data-testid="openai-remove"
                  disabled={openaiStatus !== "available"}
                  onClick={() => void removeOpenAiKey()}
                  type="button"
                >
                  Remove key
                </button>
              </div>
              {openaiTest === "ok" ? (
                <div className="mt-2 flex items-center gap-1 text-[9px] text-[#83cdaa]">
                  <CheckIcon className="h-3 w-3" /> Connection verified.
                </div>
              ) : null}
              {openaiTest === "failed" ? (
                <div className="mt-2 flex items-center gap-1 text-[9px] text-[#e59589]">
                  <WarningIcon className="h-3 w-3" /> {openaiTestMessage}
                </div>
              ) : null}
              {openaiSaveError ? (
                <div className="mt-2 flex items-center gap-1 text-[9px] text-[#e59589]" data-testid="openai-save-error">
                  <WarningIcon className="h-3 w-3" /> {openaiSaveError}
                </div>
              ) : null}
            </section>

            {/* fal.ai */}
            <section className="rounded-lg border border-[#242831] bg-[#0d0f12] p-3">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#d5d8dd]">fal.ai</span>
                {statusBadge(falStatus)}
              </div>
              <p className="mb-2 text-[9px] leading-4 text-[#68717c]">
                Used only for the human-clicked Generate Clip fallback. {falModel ? `Current model: ${falModel}.` : ""}
              </p>
              <div className="space-y-1.5">
                <div className="relative">
                  <input
                    aria-label="fal.ai API key"
                    className="w-full rounded-md border border-[#2c313a] bg-[#0b0d10] px-2 py-1.5 pr-7 text-[10px] text-[#e6e8eb] outline-none focus:border-[#4c5563]"
                    data-testid="fal-key-input"
                    onChange={(event) => setFalKeyInput(event.target.value)}
                    placeholder="fal key"
                    type={falKeyVisible ? "text" : "password"}
                    value={falKeyInput}
                  />
                  <button
                    aria-label={falKeyVisible ? "Hide fal.ai key" : "Show fal.ai key"}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[#68717c] hover:text-white"
                    onClick={() => setFalKeyVisible((current) => !current)}
                    type="button"
                  >
                    {falKeyVisible ? <EyeOffIcon className="h-3.5 w-3.5" /> : <EyeIcon className="h-3.5 w-3.5" />}
                  </button>
                </div>
                <input
                  aria-label="fal.ai model ID"
                  className="w-full rounded-md border border-[#2c313a] bg-[#0b0d10] px-2 py-1.5 text-[10px] text-[#e6e8eb] outline-none focus:border-[#4c5563]"
                  data-testid="fal-model-input"
                  onChange={(event) => setFalModelInput(event.target.value)}
                  placeholder="Model ID (e.g. a current text-to-video endpoint)"
                  type="text"
                  value={falModelInput}
                />
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <button
                  className="rounded-md border border-[#3b4552] bg-[#161a20] px-2 py-1 text-[9px] font-semibold text-[#d5d8dd] disabled:cursor-not-allowed disabled:opacity-40"
                  data-testid="fal-save"
                  disabled={!falKeyInput.trim()}
                  onClick={() => void saveFalCredential()}
                  type="button"
                >
                  Save key
                </button>
                <button
                  className="rounded-md border border-[#3b4552] bg-[#161a20] px-2 py-1 text-[9px] font-semibold text-[#d5d8dd] disabled:cursor-not-allowed disabled:opacity-40"
                  data-testid="fal-test"
                  disabled={falStatus !== "available" || falTest === "testing"}
                  onClick={() => void testFalKey()}
                  type="button"
                >
                  {falTest === "testing" ? "Testing…" : "Test connection"}
                </button>
                <button
                  className="rounded-md border border-[#593a37] bg-[#221614] px-2 py-1 text-[9px] font-semibold text-[#e59589] disabled:cursor-not-allowed disabled:opacity-40"
                  data-testid="fal-remove"
                  disabled={falStatus !== "available"}
                  onClick={() => void removeFalCredential()}
                  type="button"
                >
                  Remove key
                </button>
              </div>
              {falTest === "ok" ? (
                <div className="mt-2 flex items-center gap-1 text-[9px] text-[#83cdaa]">
                  <CheckIcon className="h-3 w-3" /> Connection verified.
                </div>
              ) : null}
              {falTest === "failed" ? (
                <div className="mt-2 flex items-center gap-1 text-[9px] text-[#e59589]">
                  <WarningIcon className="h-3 w-3" /> {falTestMessage}
                </div>
              ) : null}
              {falSaveError ? (
                <div className="mt-2 flex items-center gap-1 text-[9px] text-[#e59589]" data-testid="fal-save-error">
                  <WarningIcon className="h-3 w-3" /> {falSaveError}
                </div>
              ) : null}
            </section>

            <section className="rounded-lg border border-[#242831] bg-[#0d0f12] p-3">
              <div className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-[#d5d8dd]">Privacy</div>
              <p className="text-[9px] leading-4 text-[#68717c]">
                Keys are held in server memory only, scoped to this browser session by an httpOnly cookie.
                They are lost on server restart, never written to disk, never included in your project
                export, and never exposed to the WebMCP agent tool surface.
              </p>
            </section>

            <button
              className="w-full rounded-md border border-[#593a37] bg-[#221614] px-2 py-2 text-[9px] font-semibold text-[#e59589]"
              data-testid="clear-all-credentials"
              onClick={() => void clearAllCredentials()}
              type="button"
            >
              Clear all credentials
            </button>
          </div>
        </div>
      </HeaderMenuPanel>
    </div>
  );
}
