import Anthropic from "@anthropic-ai/sdk";
import type { AnthropicBeta } from "@anthropic-ai/sdk/resources/beta/beta.js";
import type {
  BetaMessage,
  BetaMessageParam,
  BetaToolResultBlockParam,
  BetaToolUseBlock,
} from "@anthropic-ai/sdk/resources/beta/messages/messages.js";
import { SYSTEM_PROMPT } from "./systemPrompt";
import { getToolDefinitions, dispatchTool, setCurrentFeature } from "./tools";
import { appendTurn, loadJsonl } from "./session";
import type { AgentEvent } from "../types/messages";
import type { FeatureId, ChatTurn } from "../types";

const DEFAULT_MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 4096;
export const MAX_AGENT_STEPS = 50;

/** Beta header for server-side context compaction (see Anthropic compaction docs). */
const COMPACTION_BETAS: AnthropicBeta[] = ["compact-2026-01-12"];

/** Compact before input approaches the ~1M hard cap; API minimum trigger is 50k tokens. */
const COMPACTION_TRIGGER_INPUT_TOKENS = 700_000;

const MAX_TOOL_RESULT_CHARS = 120_000;

export interface RunTurnOpts {
  featureId: FeatureId;
  userMessage: string;
  apiKey: string;
  model?: string;
  screenshotEnabled?: boolean;
  emit: (event: AgentEvent) => void;
  signal?: AbortSignal;
}

export type RunContinueOpts = Omit<RunTurnOpts, "userMessage">;

type LoopOpts = RunContinueOpts & { client: Anthropic };

export async function runTurn(opts: RunTurnOpts): Promise<void> {
  const client = new Anthropic({ apiKey: opts.apiKey, dangerouslyAllowBrowser: true });

  setCurrentFeature(opts.featureId);
  try {
    await runTurnInner(opts, client);
  } finally {
    setCurrentFeature(null);
  }
}

export async function runContinueTurn(opts: RunContinueOpts): Promise<void> {
  const client = new Anthropic({ apiKey: opts.apiKey, dangerouslyAllowBrowser: true });

  setCurrentFeature(opts.featureId);
  try {
    await runContinueInner(opts, client);
  } finally {
    setCurrentFeature(null);
  }
}

async function runTurnInner(opts: RunTurnOpts, client: Anthropic): Promise<void> {
  const turns = await loadJsonl(opts.featureId);
  const apiMessages = toApiMessages(turns);
  apiMessages.push({ role: "user", content: opts.userMessage });

  await appendTurn(opts.featureId, {
    role: "user",
    content: opts.userMessage,
    ts: new Date().toISOString(),
  });

  opts.emit({ kind: "turn-start" });

  await runAgentLoop({ ...opts, client }, apiMessages);
}

async function runContinueInner(opts: RunContinueOpts, client: Anthropic): Promise<void> {
  const turns = await loadJsonl(opts.featureId);
  const apiMessages = toApiMessages(turns);

  opts.emit({ kind: "turn-start" });

  await runAgentLoop({ ...opts, client }, apiMessages);
}

async function runAgentLoop(opts: LoopOpts, apiMessages: BetaMessageParam[]): Promise<void> {
  const { client } = opts;
  let lastAssistantOid: string | null = null;

  const tools = getToolDefinitions().filter(
    (t) => t.name !== "screenshot" || (opts.screenshotEnabled ?? true),
  );

  for (let step = 0; step < MAX_AGENT_STEPS; step++) {
    if (opts.signal?.aborted) {
      opts.emit({ kind: "error", message: "cancelled" });
      return;
    }

    let finalMessage: BetaMessage;
    let compactionPasses = 0;

    do {
      if (opts.signal?.aborted) {
        opts.emit({ kind: "error", message: "cancelled" });
        return;
      }

      const stream = client.beta.messages.stream(
        {
          model: opts.model ?? DEFAULT_MODEL,
          max_tokens: MAX_TOKENS,
          betas: COMPACTION_BETAS,
          context_management: {
            edits: [
              {
                type: "compact_20260112",
                trigger: {
                  type: "input_tokens",
                  value: COMPACTION_TRIGGER_INPUT_TOKENS,
                },
                pause_after_compaction: false,
              },
            ],
          },
          system: [
            {
              type: "text",
              text: SYSTEM_PROMPT,
              cache_control: { type: "ephemeral" },
            },
          ],
          tools,
          messages: apiMessages,
        },
        { signal: opts.signal },
      );

      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          opts.emit({ kind: "text-delta", text: event.delta.text });
        } else if (event.type === "content_block_stop") {
          opts.emit({ kind: "text-block-end" });
        }
      }

      finalMessage = await stream.finalMessage();
      compactionPasses++;

      if (finalMessage.stop_reason === "model_context_window_exceeded") {
        opts.emit({
          kind: "error",
          message:
            "The model context window was exceeded. Start a new feature or shorten the session.",
        });
        return;
      }

      if (compactionPasses > 24) {
        opts.emit({
          kind: "error",
          message: "Compaction loop limit exceeded — try a new session or smaller task.",
        });
        return;
      }

      apiMessages.push({ role: "assistant", content: finalMessage.content });

      const oid = await appendTurn(opts.featureId, {
        role: "assistant",
        content: finalMessage.content,
        ts: new Date().toISOString(),
      });
      if (oid) lastAssistantOid = oid;
    } while (finalMessage.stop_reason === "compaction");

    const toolUses = finalMessage.content.filter((b): b is BetaToolUseBlock => b.type === "tool_use");

    if (toolUses.length === 0 || finalMessage.stop_reason !== "tool_use") {
      opts.emit({
        kind: "turn-done",
        usage: finalMessage.usage,
        assistantCommit: lastAssistantOid ?? undefined,
      });
      return;
    }

    const toolResults: BetaToolResultBlockParam[] = [];
    for (const tu of toolUses) {
      opts.emit({ kind: "tool-call", id: tu.id, name: tu.name, input: tu.input });
      try {
        const output = await dispatchTool(tu.name, tu.input);
        toolResults.push({
          type: "tool_result",
          tool_use_id: tu.id,
          content: stringify(output),
        });
        opts.emit({ kind: "tool-result", id: tu.id, output });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        toolResults.push({
          type: "tool_result",
          tool_use_id: tu.id,
          content: message,
          is_error: true,
        });
        opts.emit({ kind: "tool-result", id: tu.id, output: message, isError: true });
      }
    }
    apiMessages.push({ role: "user", content: toolResults });
    await appendTurn(opts.featureId, {
      role: "user",
      content: toolResults,
      ts: new Date().toISOString(),
    });
  }

  opts.emit({ kind: "max-steps", steps: MAX_AGENT_STEPS });
}

function stringify(v: unknown): string {
  if (typeof v === "string") {
    return truncateToolString(v);
  }
  if (v === undefined) return "undefined";
  try {
    const s = JSON.stringify(v);
    if (s !== undefined) return truncateToolString(s);
  } catch {
    /* fall through */
  }
  return truncateToolString(String(v));
}

function truncateToolString(s: string): string {
  if (s.length <= MAX_TOOL_RESULT_CHARS) return s;
  return `${s.slice(0, MAX_TOOL_RESULT_CHARS - 80)}\n\n… [truncated]`;
}

/**
 * Convert persisted turns to API messages, inserting synthetic tool_result
 * blocks wherever an assistant turn with tool_use is not immediately followed
 * by a user turn containing matching tool_result blocks.
 */
function toApiMessages(turns: ChatTurn[]): BetaMessageParam[] {
  const out: BetaMessageParam[] = [];

  for (let i = 0; i < turns.length; i++) {
    const t = turns[i];
    out.push({ role: t.role, content: t.content as BetaMessageParam["content"] });

    if (t.role !== "assistant" || !Array.isArray(t.content)) continue;

    const toolUseIds = (t.content as Array<Record<string, unknown>>)
      .filter((b) => b.type === "tool_use" && typeof b.id === "string")
      .map((b) => b.id as string);
    if (toolUseIds.length === 0) continue;

    const next = turns[i + 1];
    const coveredIds = new Set<string>();
    if (next?.role === "user" && Array.isArray(next.content)) {
      for (const b of next.content as Array<Record<string, unknown>>) {
        if (b.type === "tool_result" && typeof b.tool_use_id === "string") {
          coveredIds.add(b.tool_use_id);
        }
      }
    }

    const missing = toolUseIds.filter((id) => !coveredIds.has(id));
    if (missing.length > 0) {
      const repairs: BetaToolResultBlockParam[] = missing.map((id) => ({
        type: "tool_result" as const,
        tool_use_id: id,
        content: "Tool execution was interrupted (cancelled or crashed).",
        is_error: true,
      }));
      out.push({ role: "user", content: repairs });
    }
  }

  return out;
}
