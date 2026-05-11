import { useEffect, useRef, useState } from "react";
import {
  ArrowUturnLeftIcon,
  CheckIcon,
  PaperAirplaneIcon,
  PlayIcon,
  StopIcon,
  XMarkIcon,
} from "@heroicons/react/20/solid";
import type { AppMessage, AgentEvent } from "../types/messages";
import type { FeatureId, ChatTurn } from "../types";
import {
  getFeatureScreenshotEnabled,
  setFeatureScreenshotEnabled,
} from "../runtime/featureStore";
import { sendToOffscreen } from "./sendToOffscreen";

interface DisplayMessage {
  id: string;
  role: "user" | "assistant" | "tool";
  text: string;
  pending?: boolean;
  toolName?: string;
  toolInput?: unknown;
  toolOutput?: unknown;
  toolError?: boolean;
  commit?: string;
}

interface Props {
  featureId: FeatureId;
}

export function Chat({ featureId }: Props) {
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [maxStepsPrompt, setMaxStepsPrompt] = useState<number | null>(null);
  const [screenshotEnabled, setScreenshotEnabled] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const assistantBufferRef = useRef<string>("");

  useEffect(() => {
    let cancelled = false;
    getFeatureScreenshotEnabled(featureId).then((v) => {
      if (!cancelled) setScreenshotEnabled(v);
    });
    const handler = (
      changes: { [k: string]: chrome.storage.StorageChange },
      area: string,
    ) => {
      if (area !== "local") return;
      if (!changes.featureScreenshot && !changes.screenshotEnabled) return;
      getFeatureScreenshotEnabled(featureId).then((v) => {
        if (!cancelled) setScreenshotEnabled(v);
      });
    };
    chrome.storage.onChanged.addListener(handler);
    return () => {
      cancelled = true;
      chrome.storage.onChanged.removeListener(handler);
    };
  }, [featureId]);

  useEffect(() => {
    setMessages([]);
    setErr(null);
    setMaxStepsPrompt(null);
    assistantBufferRef.current = "";

    sendToOffscreen({
      type: "agent.loadSession",
      target: "offscreen",
      featureId,
    } satisfies AppMessage);

    const onMsg = (msg: AppMessage) => {
      if (!msg || typeof msg !== "object" || msg.target !== "sidepanel") return;
      if (msg.featureId !== featureId) return;

      if (msg.type === "agent.session") {
        setMessages(turnsToDisplay(msg.turns));
        return;
      }
      if (msg.type === "agent.event") {
        applyEvent(msg.event);
      }
    };

    chrome.runtime.onMessage.addListener(onMsg);
    return () => chrome.runtime.onMessage.removeListener(onMsg);
  }, [featureId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  function applyEvent(event: AgentEvent) {
    if (event.kind === "turn-start") {
      assistantBufferRef.current = "";
      setMessages((m) => [
        ...m,
        { id: `a-${Date.now()}`, role: "assistant", text: "", pending: true },
      ]);
    } else if (event.kind === "text-delta") {
      assistantBufferRef.current += event.text;
      const text = assistantBufferRef.current;
      setMessages((m) => {
        const last = m[m.length - 1];
        if (!last || last.role !== "assistant" || !last.pending) return m;
        const next = m.slice(0, -1);
        next.push({ ...last, text });
        return next;
      });
    } else if (event.kind === "text-block-end") {
      assistantBufferRef.current = "";
    } else if (event.kind === "tool-call") {
      setMessages((m) => [
        ...m,
        {
          id: event.id,
          role: "tool",
          text: "",
          toolName: event.name,
          toolInput: event.input,
          pending: true,
        },
      ]);
    } else if (event.kind === "tool-result") {
      setMessages((m) =>
        m.map((d) =>
          d.id === event.id
            ? {
                ...d,
                pending: false,
                toolOutput: event.output,
                toolError: event.isError,
              }
            : d,
        ),
      );
    } else if (event.kind === "max-steps") {
      setBusy(false);
      setMaxStepsPrompt(event.steps);
      setMessages((m) =>
        m.map((d) => (d.pending ? { ...d, pending: false } : d)),
      );
    } else if (event.kind === "turn-done") {
      setBusy(false);
      setMaxStepsPrompt(null);
      const commit = event.assistantCommit;
      setMessages((m) => {
        let attached = false;
        const next = [...m].reverse().map((d) => {
          if (!attached && d.role === "assistant") {
            attached = true;
            return { ...d, pending: false, commit: commit ?? d.commit };
          }
          if (d.pending) return { ...d, pending: false };
          return d;
        });
        return next.reverse();
      });
    } else if (event.kind === "error") {
      setBusy(false);
      setMaxStepsPrompt(null);
      setErr(event.message);
      setMessages((m) =>
        m.map((d) => (d.pending ? { ...d, pending: false } : d)),
      );
    }
  }

  async function onSend() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setErr(null);
    setMaxStepsPrompt(null);
    setBusy(true);
    setMessages((m) => [
      ...m,
      { id: `u-${Date.now()}`, role: "user", text },
    ]);
    const { apiKey, model } = await chrome.storage.local.get(["apiKey", "model"]);
    if (typeof apiKey !== "string" || apiKey.length === 0) {
      setBusy(false);
      setErr("No API key set — open Settings and save your Anthropic API key.");
      return;
    }
    sendToOffscreen({
      type: "agent.startTurn",
      target: "offscreen",
      featureId,
      userMessage: text,
      apiKey,
      model: typeof model === "string" ? model : undefined,
      screenshotEnabled,
    } satisfies AppMessage);
  }

  function onCancel() {
    sendToOffscreen({
      type: "agent.cancelTurn",
      target: "offscreen",
      featureId,
    } satisfies AppMessage);
    setBusy(false);
  }

  async function onContinueMaxSteps() {
    if (busy || maxStepsPrompt === null) return;
    setMaxStepsPrompt(null);
    setErr(null);
    setBusy(true);
    const { apiKey, model } = await chrome.storage.local.get(["apiKey", "model"]);
    if (typeof apiKey !== "string" || apiKey.length === 0) {
      setBusy(false);
      setErr("No API key set — open Settings and save your Anthropic API key.");
      return;
    }
    sendToOffscreen({
      type: "agent.continueTurn",
      target: "offscreen",
      featureId,
      apiKey,
      model: typeof model === "string" ? model : undefined,
      screenshotEnabled,
    } satisfies AppMessage);
  }

  async function onRevert(oid: string) {
    if (!confirm(`Revert to commit ${oid.slice(0, 7)}? Later turns are saved on a wip branch.`)) return;
    await sendToOffscreen({
      type: "agent.revert",
      target: "offscreen",
      featureId,
      oid,
    });
  }

  return (
    <div className="flex h-full flex-col">
      <div
        ref={scrollRef}
        className="flex-1 space-y-4 overflow-auto pr-1 text-[15px] leading-relaxed"
      >
        {messages.length === 0 && (
          <p className="text-gray-400">
            New chat. Describe a change for this site.
          </p>
        )}
        {messages.map((m) => (
          <MessageView key={m.id} m={m} onRevert={onRevert} />
        ))}
        {maxStepsPrompt !== null && (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-amber-950">
            <p className="text-[15px] leading-snug">
              The agent used {maxStepsPrompt} tool rounds (the maximum per run).
              Continue so it can keep working?
            </p>
            <button
              type="button"
              onClick={() => void onContinueMaxSteps()}
              disabled={busy}
              className="mt-2 inline-flex items-center gap-1 rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-amber-500 disabled:opacity-40 transition-colors"
            >
              <PlayIcon className="h-4 w-4" aria-hidden="true" />
              Continue
            </button>
          </div>
        )}
        {err && (
          <div className="rounded-md bg-red-50 px-3 py-2 text-red-600">
            {err}
          </div>
        )}
      </div>
      <div className="mt-3 flex items-center gap-2 text-[13px] text-gray-500">
        <input
          type="checkbox"
          id="screenshot-toggle"
          checked={screenshotEnabled}
          onChange={(e) => {
            const next = e.target.checked;
            setScreenshotEnabled(next);
            setFeatureScreenshotEnabled(featureId, next).catch((err) => {
              console.error("[claudethis/chat] persist screenshot failed", err);
            });
          }}
          className="h-3.5 w-3.5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
        />
        <label
          htmlFor="screenshot-toggle"
          className="cursor-pointer select-none"
        >
          Allow screenshot
        </label>
      </div>
      <div className="mt-1.5 flex gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSend();
            }
          }}
          rows={2}
          placeholder="describe a tweak (Shift+Enter for newline)"
          className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
        />
        {busy ? (
          <button
            onClick={onCancel}
            className="inline-flex items-center gap-1 rounded-lg bg-red-500 px-3 text-sm font-medium text-white shadow-sm hover:bg-red-400 transition-colors"
          >
            <StopIcon className="h-4 w-4" aria-hidden="true" />
            cancel
          </button>
        ) : (
          <button
            onClick={onSend}
            disabled={!input.trim()}
            className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 text-sm font-medium text-white shadow-sm hover:bg-emerald-500 disabled:opacity-40 disabled:hover:bg-emerald-600 transition-colors"
          >
            <PaperAirplaneIcon className="h-4 w-4" aria-hidden="true" />
            send
          </button>
        )}
      </div>
    </div>
  );
}

function MessageView({
  m,
  onRevert,
}: {
  m: DisplayMessage;
  onRevert: (oid: string) => void;
}) {
  if (m.role === "user") {
    return (
      <div className="rounded-lg bg-blue-50 px-3 py-2 text-blue-900 whitespace-pre-wrap">
        {m.text}
      </div>
    );
  }
  if (m.role === "assistant") {
    return (
      <div className="whitespace-pre-wrap text-gray-800">
        {m.text || (m.pending ? "…" : "")}
        {m.commit && (
          <div className="mt-1.5 flex items-center gap-2 text-xs text-gray-400">
            <span className="font-mono">{m.commit.slice(0, 7)}</span>
            <button
              onClick={() => onRevert(m.commit!)}
              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-amber-50 hover:text-amber-600 transition-colors"
              title="revert to here"
            >
              <ArrowUturnLeftIcon className="h-3.5 w-3.5" aria-hidden="true" />
              revert here
            </button>
          </div>
        )}
      </div>
    );
  }
  const StatusIcon = m.pending ? PlayIcon : m.toolError ? XMarkIcon : CheckIcon;
  return (
    <div
      className={`rounded-md border px-2.5 py-1.5 font-mono text-[13px] ${
        m.toolError ? "border-red-200 bg-red-50" : "border-gray-200 bg-gray-50"
      }`}
    >
      <div
        className={`flex items-center gap-1.5 ${
          m.toolError ? "text-red-600" : "text-gray-600"
        }`}
      >
        <StatusIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="truncate">{m.toolName}</span>
      </div>
      <details className="mt-1.5">
        <summary className="cursor-pointer text-gray-400 hover:text-gray-600">
          input
        </summary>
        <pre className="mt-1 overflow-auto text-xs text-gray-500">
          {JSON.stringify(m.toolInput, null, 2)}
        </pre>
      </details>
      {!m.pending && (
        <details className="mt-1.5">
          <summary className="cursor-pointer text-gray-400 hover:text-gray-600">
            output
          </summary>
          <pre className="mt-1 overflow-auto text-xs text-gray-500">
            {typeof m.toolOutput === "string"
              ? m.toolOutput
              : JSON.stringify(m.toolOutput, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}

function turnsToDisplay(turns: ChatTurn[]): DisplayMessage[] {
  const out: DisplayMessage[] = [];
  for (let i = 0; i < turns.length; i++) {
    const t = turns[i];
    if (t.role === "user" && typeof t.content === "string") {
      out.push({ id: `t-${i}`, role: "user", text: t.content });
    } else if (t.role === "assistant" && Array.isArray(t.content)) {
      const blocks = t.content as Array<Record<string, unknown>>;
      let firstTextEmitted = false;
      for (const b of blocks) {
        if (b.type === "text" && typeof b.text === "string") {
          const display: DisplayMessage = {
            id: `t-${i}-${out.length}`,
            role: "assistant",
            text: b.text,
          };
          if (!firstTextEmitted) {
            display.commit = t.commit;
            firstTextEmitted = true;
          }
          out.push(display);
        } else if (
          b.type === "tool_use" &&
          typeof b.id === "string" &&
          typeof b.name === "string"
        ) {
          out.push({
            id: b.id,
            role: "tool",
            text: "",
            toolName: b.name,
            toolInput: b.input,
            pending: true,
          });
        }
      }
    } else if (t.role === "user" && Array.isArray(t.content)) {
      const blocks = t.content as Array<Record<string, unknown>>;
      for (const r of blocks) {
        const useId = typeof r.tool_use_id === "string" ? r.tool_use_id : undefined;
        if (r.type === "tool_result" && useId) {
          const idx = out.findIndex((d) => d.id === useId);
          if (idx >= 0) {
            out[idx] = {
              ...out[idx],
              pending: false,
              toolOutput: r.content,
              toolError: r.is_error === true,
            };
          }
        }
      }
    }
  }
  return out;
}
