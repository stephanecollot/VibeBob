import { writeFile, readFile, listFiles } from "../vfs";
import { commitAll, log as gitLog } from "../git";
import type { FeatureId, ChatTurn } from "../types";

const FILE = "session.jsonl";

const PREVIEW_MAX = 100;
const TOOL_NAMES_MAX = 120;

function oneLine(s: string, max: number): string {
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

/** Git subject for this turn; must start with `chat:` for loadSessionWithCommits pairing. */
function gitMessageForTurn(turn: ChatTurn): string {
  if (turn.role === "user") {
    if (typeof turn.content === "string") {
      const preview = oneLine(turn.content, PREVIEW_MAX);
      return preview.length > 0 ? `chat: user — ${preview}` : "chat: user";
    }
    if (Array.isArray(turn.content)) {
      return `chat: tool results (${turn.content.length})`;
    }
    return "chat: user";
  }

  if (!Array.isArray(turn.content)) return "chat: assistant";

  const blocks = turn.content as Array<Record<string, unknown>>;
  const textBlock = blocks.find((b) => b.type === "text" && typeof b.text === "string") as
    | { text: string }
    | undefined;
  if (textBlock?.text) {
    const preview = oneLine(textBlock.text, PREVIEW_MAX);
    return preview.length > 0 ? `chat: assistant — ${preview}` : "chat: assistant";
  }

  const toolNames = blocks
    .filter((b) => b.type === "tool_use" && typeof b.name === "string")
    .map((b) => b.name as string);
  if (toolNames.length > 0) {
    let list = toolNames.join(", ");
    if (list.length > TOOL_NAMES_MAX) list = `${list.slice(0, TOOL_NAMES_MAX - 1)}…`;
    return `chat: assistant — ${list}`;
  }

  return "chat: assistant";
}

export async function appendTurn(featureId: FeatureId, turn: ChatTurn): Promise<string | null> {
  const existing = await loadJsonl(featureId);
  existing.push(turn);
  await writeFile(featureId, FILE, existing.map((t) => JSON.stringify(t)).join("\n") + "\n");
  return commitAll(featureId, gitMessageForTurn(turn));
}

export async function loadJsonl(featureId: FeatureId): Promise<ChatTurn[]> {
  let files: string[];
  try {
    files = await listFiles(featureId);
  } catch (err) {
    if ((err as { code?: string }).code === "ENOENT") return [];
    throw err;
  }
  if (!files.includes(FILE)) return [];
  const raw = await readFile(featureId, FILE);
  return raw
    .split("\n")
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l) as ChatTurn);
}

export async function loadSessionWithCommits(featureId: FeatureId): Promise<ChatTurn[]> {
  const turns = await loadJsonl(featureId);
  if (turns.length === 0) return turns;
  const commits = await gitLog(featureId).catch(() => []);
  const chatCommits = commits
    .filter((c) => c.message.startsWith("chat:"))
    .reverse();
  for (let i = 0; i < turns.length && i < chatCommits.length; i++) {
    turns[i].commit = chatCommits[i].oid;
  }
  return turns;
}
