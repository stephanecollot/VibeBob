import { useEffect, useRef, useState } from "react";
import type { AppMessage, AgentEvent } from "../types/messages";
import type { FeatureId, ChatTurn } from "../types";
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
  const scrollRef = useRef<HTMLDivElement>(null);
  const assistantBufferRef = useRef<string>("");

  useEffect(() => {
    setMessages([]);
    setErr(null);
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
    } else if (event.kind === "turn-done") {
      setBusy(false);
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
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-auto pr-1 text-xs">
        {messages.length === 0 && (
          <p className="text-neutral-500">
            New chat. Describe a change for this site.
          </p>
        )}
        {messages.map((m) => (
          <MessageView key={m.id} m={m} onRevert={onRevert} />
        ))}
        {err && <div className="rounded bg-red-950 px-2 py-1 text-red-300">{err}</div>}
      </div>
      <div className="mt-3 flex gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              onSend();
            }
          }}
          rows={2}
          placeholder="describe a tweak (⌘/Ctrl+Enter)"
          className="flex-1 rounded bg-neutral-900 px-2 py-1 text-xs"
        />
        {busy ? (
          <button
            onClick={onCancel}
            className="rounded bg-red-800 px-3 text-xs text-white hover:bg-red-700"
          >
            cancel
          </button>
        ) : (
          <button
            onClick={onSend}
            disabled={!input.trim()}
            className="rounded bg-emerald-700 px-3 text-xs text-white hover:bg-emerald-600 disabled:opacity-40"
          >
            send
          </button>
        )}
      </div>
    </div>
  );
}

function MessageView({ m, onRevert }: { m: DisplayMessage; onRevert: (oid: string) => void }) {
  if (m.role === "user") {
    return (
      <div className="rounded bg-blue-950 px-2 py-1.5 text-blue-100 whitespace-pre-wrap">
        {m.text}
      </div>
    );
  }
  if (m.role === "assistant") {
    return (
      <div className="whitespace-pre-wrap text-neutral-200">
        {m.text || (m.pending ? "…" : "")}
        {m.commit && (
          <div className="mt-1 flex items-center gap-2 text-[10px] text-neutral-500">
            <span className="font-mono">{m.commit.slice(0, 7)}</span>
            <button
              onClick={() => onRevert(m.commit!)}
              className="rounded px-1 hover:bg-neutral-800 hover:text-amber-300"
              title="revert to here"
            >
              ↶ revert here
            </button>
          </div>
        )}
      </div>
    );
  }
  return (
    <div
      className={`rounded border px-2 py-1 font-mono ${
        m.toolError ? "border-red-700 bg-red-950" : "border-neutral-800 bg-neutral-900"
      }`}
    >
      <div className="text-neutral-400">
        {m.pending ? "▶" : m.toolError ? "✕" : "✓"} {m.toolName}
      </div>
      <details className="mt-1">
        <summary className="cursor-pointer text-neutral-500">input</summary>
        <pre className="mt-1 overflow-auto text-neutral-400">
          {JSON.stringify(m.toolInput, null, 2)}
        </pre>
      </details>
      {!m.pending && (
        <details className="mt-1">
          <summary className="cursor-pointer text-neutral-500">output</summary>
          <pre className="mt-1 overflow-auto text-neutral-400">
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
