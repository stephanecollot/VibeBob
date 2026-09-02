/**
 * Builds marketplace/catalog.json from the marketplace/ tree.
 *
 * Determinism is the point: the same tree must always produce byte-identical
 * output, so a rebuild that changes nothing produces no commit and every real
 * diff is reviewable. Sorted keys, sorted mods, fixed indent, trailing newline.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { ALLOWED_FILES, externalHosts } from "../../../src/marketplace/rules.mjs";

export const MARKETPLACE_DIR = "marketplace";
export const CATALOG_PATH = `${MARKETPLACE_DIR}/catalog.json`;
export const BLOCKLIST_PATH = `${MARKETPLACE_DIR}/blocklist.json`;
export const REPO = "stephanecollot/VibeBob";
export const OWNER = REPO.split("/")[0];

export function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

function git(root, args) {
  try {
    return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

function dirs(path) {
  if (!existsSync(path)) return [];
  return readdirSync(path, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith("."))
    .map((e) => e.name)
    .sort();
}

export function readBlocklist(root) {
  const path = join(root, BLOCKLIST_PATH);
  if (!existsSync(path)) return [];
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    const list = Array.isArray(parsed) ? parsed : parsed.blocked;
    return Array.isArray(list) ? list : [];
  } catch (err) {
    throw new Error(`${BLOCKLIST_PATH} is not valid JSON: ${err.message}`);
  }
}

function readMod(root, namespace, slug) {
  const rel = `${MARKETPLACE_DIR}/${namespace}/${slug}`;
  const abs = join(root, rel);
  const manifestPath = join(abs, "manifest.json");
  if (!existsSync(manifestPath)) return null;

  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (err) {
    throw new Error(`${rel}/manifest.json is not valid JSON: ${err.message}`);
  }

  const files = {};
  const hashes = {};
  const sizeBytes = {};
  for (const name of ALLOWED_FILES) {
    const p = join(abs, name);
    if (!existsSync(p) || !statSync(p).isFile()) continue;
    const buf = readFileSync(p);
    files[name] = buf.toString("utf8");
    hashes[name] = sha256(buf);
    sizeBytes[name] = buf.length;
  }
  if (!files["mod.js"]) throw new Error(`${rel} has no mod.js`);

  // Pin to the last commit that touched this mod: installs fetch from this sha,
  // so what the catalog describes cannot drift from what a user receives.
  const commit = git(root, ["log", "-1", "--format=%H", "--", rel]);
  const updatedAt = git(root, ["log", "-1", "--format=%cI", "--", rel]);

  const mod = {
    id: `${namespace}/${slug}`,
    namespace,
    slug,
    path: rel,
    name: typeof manifest.name === "string" ? manifest.name : slug,
    description: typeof manifest.description === "string" ? manifest.description : "",
    matches: Array.isArray(manifest.matches) ? manifest.matches : [],
    entry: "mod.js",
    version: typeof manifest.version === "string" ? manifest.version : "0.0.0",
    author:
      typeof manifest.author === "string"
        ? manifest.author
        : namespace === "official"
          ? OWNER
          : namespace,
    commit,
    updatedAt,
    sizeBytes,
    hashes,
    externalHosts: externalHosts(files, manifest.matches),
    official: namespace === "official",
  };
  if (files["mod.css"] && manifest.styles === "mod.css") mod.styles = "mod.css";
  if (Number.isInteger(manifest.issue)) mod.issue = manifest.issue;
  return mod;
}

export function buildCatalog(root = process.cwd()) {
  const blocklist = readBlocklist(root);
  const blockedIds = new Set(blocklist.map((b) => b.id));

  const mods = [];
  for (const namespace of dirs(join(root, MARKETPLACE_DIR))) {
    for (const slug of dirs(join(root, MARKETPLACE_DIR, namespace))) {
      const mod = readMod(root, namespace, slug);
      // Blocked mods stay on disk (git history is permanent anyway) but leave
      // the catalog, which makes a takedown a reversible one-label toggle.
      if (mod && !blockedIds.has(mod.id)) mods.push(mod);
    }
  }
  mods.sort((a, b) => a.id.localeCompare(b.id));

  return {
    schemaVersion: 1,
    repo: REPO,
    mods,
    blocklist: [...blocklist].sort((a, b) => String(a.id).localeCompare(String(b.id))),
  };
}

export function serializeCatalog(catalog) {
  return JSON.stringify(catalog, null, 2) + "\n";
}
