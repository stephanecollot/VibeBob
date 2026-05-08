import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM_PROMPT } from "./systemPrompt";
import { getToolDefinitions, dispatchTool, setCurrentFeature } from "./tools";
import { appendTurn, loadJsonl } from "./session";
import type { AgentEvent } from "../types/messages";
import type { FeatureId, ChatTurn } from "../types";

const DEFAULT_MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 4096;
const MAX_STEPS = 12;

export interface RunTurnOpts {
  featureId: FeatureId;
  userMessage: string;
  apiKey: string;
  model?: string;
  emit: (event: AgentEvent) => void;
  signal?: AbortSignal;
}

export async function runTurn(opts: RunTurnOpts): Promise<void> {
  const client = new Anthropic({ apiKey: opts.apiKey, dangerouslyAllowBrowser: true });

  setCurrentFeature(opts.featureId);
  try {
    await runTurnInner(opts, client);
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

  let lastAssistantOid: string | null = null;

  for (let step = 0; step < MAX_STEPS; step++) {
    if (opts.signal?.aborted) {
      opts.emit({ kind: "error", message: "cancelled" });
      return;
    }

    const stream = client.messages.stream(
      {
        model: opts.model ?? DEFAULT_MODEL,
        max_tokens: MAX_TOKENS,
        system: [
          {
            type: "text",
            text: SYSTEM_PROMPT,
            cache_control: { type: "ephemeral" },
          },
        ],
        tools: getToolDefinitions(),
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

    const finalMessage = await stream.finalMessage();
    apiMessages.push({ role: "assistant", content: finalMessage.content });

    const oid = await appendTurn(opts.featureId, {
      role: "assistant",
      content: finalMessage.content,
      ts: new Date().toISOString(),
    });
    if (oid) lastAssistantOid = oid;

    const toolUses = finalMessage.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );

    if (toolUses.length === 0 || finalMessage.stop_reason !== "tool_use") {
      opts.emit({
        kind: "turn-done",
        usage: finalMessage.usage,
        assistantCommit: lastAssistantOid ?? undefined,
      });
      return;
    }

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
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

  opts.emit({ kind: "error", message: `exceeded MAX_STEPS=${MAX_STEPS}` });
}

function stringify(v: unknown): string {
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function toApiMessages(turns: ChatTurn[]): Anthropic.MessageParam[] {
  return turns.map((t) => ({
    role: t.role,
    content: t.content as Anthropic.MessageParam["content"],
  }));
}
