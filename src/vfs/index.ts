import { pfs, ROOT, ensureDir, ensureRoot } from "./fs";
import type { FeatureId } from "../types";

export type VfsEvent =
  | { type: "write"; featureId: FeatureId; path: string }
  | { type: "delete"; featureId: FeatureId; path: string };

const target = new EventTarget();

export function on(listener: (e: VfsEvent) => void): () => void {
  const handler = (e: Event) => listener((e as CustomEvent<VfsEvent>).detail);
  target.addEventListener("vfs", handler);
  return () => target.removeEventListener("vfs", handler);
}

function emit(detail: VfsEvent): void {
  target.dispatchEvent(new CustomEvent("vfs", { detail }));
}

export function featureDir(id: FeatureId): string {
  return `${ROOT}/${id}`;
}

function abs(featureId: FeatureId, path: string): string {
  if (path.startsWith("/")) throw new Error(`path must be relative: ${path}`);
  return `${featureDir(featureId)}/${path}`;
}

export async function mkFeatureDir(id: FeatureId): Promise<void> {
  await ensureRoot();
  await ensureDir(featureDir(id));
}

export async function listFeatures(): Promise<FeatureId[]> {
  await ensureRoot();
  const entries = await pfs.readdir(ROOT);
  return entries.filter((e) => !e.startsWith("."));
}

export async function listFiles(id: FeatureId, sub = ""): Promise<string[]> {
  const dir = sub ? `${featureDir(id)}/${sub}` : featureDir(id);
  const out: string[] = [];
  async function walk(rel: string): Promise<void> {
    const here = rel ? `${dir}/${rel}` : dir;
    const names = await pfs.readdir(here);
    for (const name of names) {
      if (name === ".git") continue;
      const childRel = rel ? `${rel}/${name}` : name;
      const stat = await pfs.stat(`${here}/${name}`);
      if (stat.isDirectory()) await walk(childRel);
      else out.push(childRel);
    }
  }
  await walk("");
  return out.sort();
}

export async function readFile(id: FeatureId, path: string): Promise<string> {
  const buf = await pfs.readFile(abs(id, path), "utf8");
  return typeof buf === "string" ? buf : new TextDecoder().decode(buf);
}

export async function writeFile(
  id: FeatureId,
  path: string,
  contents: string,
): Promise<void> {
  await mkFeatureDir(id);
  const full = abs(id, path);
  const segments = path.split("/").slice(0, -1);
  let cursor = featureDir(id);
  for (const seg of segments) {
    cursor = `${cursor}/${seg}`;
    await ensureDir(cursor);
  }
  await pfs.writeFile(full, contents, "utf8");
  emit({ type: "write", featureId: id, path });
}

export async function deleteFile(id: FeatureId, path: string): Promise<void> {
  await pfs.unlink(abs(id, path));
  emit({ type: "delete", featureId: id, path });
}

export async function deleteFeature(id: FeatureId): Promise<void> {
  const dir = featureDir(id);
  async function rm(p: string): Promise<void> {
    const stat = await pfs.stat(p);
    if (stat.isDirectory()) {
      const names = await pfs.readdir(p);
      for (const n of names) await rm(`${p}/${n}`);
      await pfs.rmdir(p);
    } else {
      await pfs.unlink(p);
    }
  }
  await rm(dir);
}
