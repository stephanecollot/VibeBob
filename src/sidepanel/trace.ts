import type { DisplayMessage } from "./Chat";
import type { TabInfo } from "./TabBar";
import type { FeatureId } from "../types";

/** Screenshots come back as multi-MB base64 data URLs — useless in a pasted trace. */
const DATA_URL_RE = /data:([\w./+-]+);base64,[A-Za-z0-9+/=]+/g;

function elideDataUrls(text: string): string {
  return text.replace(
    DATA_URL_RE,
    (match, mime: string) => `data:${mime};base64,<${match.length} chars elided>`,
  );
}

function render(value: unknown): string {
  if (value === undefined) return "(none)";
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return elideDataUrls(text ?? String(value));
}

async function activeTabUrl(): Promise<string> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab?.url ?? "unknown";
  } catch {
    return "unknown";
  }
}

function messageToTrace(m: DisplayMessage): string {
  if (m.role === "user") return `## user\n${m.text}`;
  if (m.role === "assistant") {
    const commit = m.commit ? ` (commit ${m.commit.slice(0, 7)})` : "";
    return `## assistant${commit}\n${m.text || "(empty)"}`;
  }
  const status = m.pending ? "pending" : m.toolError ? "ERROR" : m.toolNote ? "skipped" : "ok";
  return [
    `## tool ${m.toolName} [${status}]`,
    "input:",
    render(m.toolInput),
    "output:",
    render(m.toolOutput),
  ].join("\n");
}

/**
 * The whole chat as plain text — header, every turn, every tool input/output, and the
 * last error — for pasting into a bug report. Never includes the API key.
 */
export async function buildTrace(
  featureId: FeatureId,
  messages: DisplayMessage[],
  err: string | null,
  pinnedTab?: TabInfo | null,
): Promise<string> {
  const { model } = await chrome.storage.local.get(["model"]);
  const header = [
    `VibeBob ${chrome.runtime.getManifest().version} trace`,
    `time: ${new Date().toISOString()}`,
    `feature: ${featureId}`,
    `model: ${typeof model === "string" ? model : "(default)"}`,
    `page: ${await activeTabUrl()}`,
    `run pinned to: ${pinnedTab ? `${pinnedTab.url} (tab ${pinnedTab.id})` : "(not pinned)"}`,
    `messages: ${messages.length}`,
    `userAgent: ${navigator.userAgent}`,
  ].join("\n");

  const body = messages.map(messageToTrace).join("\n\n");
  const footer = err ? `\n\n## error\n${elideDataUrls(err)}` : "";
  return `${header}\n\n${body}${footer}\n`;
}

/** clipboard.writeText needs a focused document; fall back to a scratch textarea. */
export async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    if (!ok) throw new Error("clipboard write was blocked");
  }
}
