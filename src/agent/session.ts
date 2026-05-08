import { writeFile, readFile, listFiles } from "../vfs";
import { commitAll, log as gitLog } from "../git";
import type { FeatureId, ChatTurn } from "../types";

const FILE = "session.jsonl";

export async function appendTurn(featureId: FeatureId, turn: ChatTurn): Promise<string | null> {
  const existing = await loadJsonl(featureId);
  existing.push(turn);
  await writeFile(featureId, FILE, existing.map((t) => JSON.stringify(t)).join("\n") + "\n");
  return commitAll(featureId, `chat: ${turn.role}`);
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
