import git from "isomorphic-git";
import { lfs as fs } from "../vfs/fs";
import { featureDir, listFiles } from "../vfs";
import type { FeatureId } from "../types";

const author = { name: "claudethis", email: "agent@claudethis.local" };

export interface CommitInfo {
  oid: string;
  message: string;
  author: string;
  timestamp: number;
}

async function isRepo(id: FeatureId): Promise<boolean> {
  try {
    await fs.promises.stat(`${featureDir(id)}/.git`);
    return true;
  } catch {
    return false;
  }
}

export async function initRepo(id: FeatureId): Promise<void> {
  if (await isRepo(id)) return;
  await git.init({ fs, dir: featureDir(id), defaultBranch: "main" });
}

export async function commitAll(id: FeatureId, message: string): Promise<string | null> {
  await initRepo(id);
  const files = await listFiles(id);
  if (files.length === 0) return null;
  for (const f of files) {
    await git.add({ fs, dir: featureDir(id), filepath: f });
  }
  const removed = await git.statusMatrix({ fs, dir: featureDir(id) });
  for (const [filepath, , workdir] of removed) {
    if (workdir === 0) {
      await git.remove({ fs, dir: featureDir(id), filepath });
    }
  }
  return git.commit({
    fs,
    dir: featureDir(id),
    message,
    author,
  });
}

export async function log(id: FeatureId, depth = 50): Promise<CommitInfo[]> {
  if (!(await isRepo(id))) return [];
  const entries = await git.log({ fs, dir: featureDir(id), depth });
  return entries.map((e) => ({
    oid: e.oid,
    message: e.commit.message.trim(),
    author: e.commit.author.name,
    timestamp: e.commit.author.timestamp * 1000,
  }));
}

export async function checkout(id: FeatureId, oid: string): Promise<void> {
  await git.checkout({
    fs,
    dir: featureDir(id),
    ref: oid,
    force: true,
  });
}

export async function branchWip(id: FeatureId, fromOid: string): Promise<string> {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const ref = `wip/${ts}`;
  await git.branch({ fs, dir: featureDir(id), ref, object: fromOid, checkout: false });
  return ref;
}

export async function currentOid(id: FeatureId): Promise<string | null> {
  if (!(await isRepo(id))) return null;
  try {
    return await git.resolveRef({ fs, dir: featureDir(id), ref: "HEAD" });
  } catch {
    return null;
  }
}
