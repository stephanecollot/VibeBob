import type { Catalog, CatalogMod, BlockEntry } from "../types";

export const REPO = "stephanecollot/VibeBob";
export const BRANCH = "main";
export const CATALOG_URL = `https://raw.githubusercontent.com/${REPO}/${BRANCH}/marketplace/catalog.json`;

const CACHE_KEY = "marketplace_catalog";
/** Below this age the cache answers without touching the network. */
const SOFT_TTL_MS = 30 * 60 * 1000;

export interface CatalogResult {
  catalog: Catalog;
  fetchedAt: number;
  /** True when the network failed and this came from cache. */
  stale: boolean;
  error?: string;
}

interface CachedCatalog {
  catalog: Catalog;
  fetchedAt: number;
}

const EMPTY: Catalog = { schemaVersion: 1, repo: REPO, mods: [], blocklist: [] };

function parseCatalog(text: string): Catalog {
  const parsed = JSON.parse(text) as Partial<Catalog>;
  if (parsed.schemaVersion !== 1)
    throw new Error(
      `this VibeBob is too old for the marketplace (catalog schema ${parsed.schemaVersion}) — update the extension`,
    );
  return {
    schemaVersion: 1,
    repo: parsed.repo ?? REPO,
    mods: Array.isArray(parsed.mods) ? parsed.mods : [],
    blocklist: Array.isArray(parsed.blocklist) ? parsed.blocklist : [],
  };
}

export async function readCatalogCache(): Promise<CachedCatalog | null> {
  try {
    const data = await chrome.storage.local.get(CACHE_KEY);
    const cached = data[CACHE_KEY] as CachedCatalog | undefined;
    if (!cached?.catalog?.mods) return null;
    return cached;
  } catch {
    return null;
  }
}

/**
 * One request for the whole marketplace. Falls back to the last good catalog
 * when the network is down — a stale list beats an empty one, and the caller
 * gets `stale` so it can say so.
 */
export async function loadCatalog(opts: { force?: boolean } = {}): Promise<CatalogResult> {
  const cached = await readCatalogCache();
  if (!opts.force && cached && Date.now() - cached.fetchedAt < SOFT_TTL_MS) {
    return { catalog: cached.catalog, fetchedAt: cached.fetchedAt, stale: false };
  }

  try {
    // "no-cache" revalidates rather than refetching: unchanged catalogs cost a 304.
    const res = await fetch(CATALOG_URL, { cache: opts.force ? "reload" : "no-cache" });
    if (!res.ok) throw new Error(`catalog fetch failed (${res.status})`);
    const catalog = parseCatalog(await res.text());
    const fetchedAt = Date.now();
    await chrome.storage.local.set({ [CACHE_KEY]: { catalog, fetchedAt } satisfies CachedCatalog });
    return { catalog, fetchedAt, stale: false };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (cached) return { catalog: cached.catalog, fetchedAt: cached.fetchedAt, stale: true, error: message };
    return { catalog: EMPTY, fetchedAt: 0, stale: true, error: message };
  }
}

/** Pinned to the mod's commit, so what the catalog describes cannot drift under us. */
export function rawUrl(mod: CatalogMod, file: string): string {
  return `https://raw.githubusercontent.com/${REPO}/${mod.commit || BRANCH}/${mod.path}/${file}`;
}

/** The same bytes, rendered on github.com for a human to read before installing. */
export function sourceUrl(mod: CatalogMod, file = "mod.js"): string {
  return `https://github.com/${REPO}/blob/${mod.commit || BRANCH}/${mod.path}/${file}`;
}

export function compareUrl(fromCommit: string, mod: CatalogMod): string {
  return `https://github.com/${REPO}/compare/${fromCommit}...${mod.commit}`;
}

export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Hashes the raw bytes, then decodes — hashing decoded text drifts on encoding edges. */
async function fetchFile(url: string): Promise<{ text: string; hash: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`could not download ${url.split("/").pop()} (${res.status})`);
  const bytes = await res.arrayBuffer();
  return { text: new TextDecoder().decode(bytes), hash: await sha256Hex(bytes) };
}

export async function fetchModFiles(
  mod: CatalogMod,
): Promise<{ files: Record<string, string>; hashes: Record<string, string> }> {
  const names = ["manifest.json", "mod.js", ...(mod.styles ? ["mod.css"] : [])];
  const results = await Promise.all(names.map((n) => fetchFile(rawUrl(mod, n))));

  const files: Record<string, string> = {};
  const hashes: Record<string, string> = {};
  names.forEach((name, i) => {
    files[name] = results[i].text;
    hashes[name] = results[i].hash;
  });
  return { files, hashes };
}

export function findMod(catalog: Catalog, modId: string): CatalogMod | undefined {
  return catalog.mods.find((m) => m.id === modId);
}

/** Matches on id, or on any installed file hash — so a renamed clone is caught too. */
export function blockEntryFor(
  catalog: Catalog,
  modId: string | undefined,
  hashes?: Record<string, string>,
): BlockEntry | undefined {
  for (const entry of catalog.blocklist) {
    if (modId && entry.id === modId) return entry;
    if (hashes && entry.hashes?.length) {
      const installed = new Set(Object.values(hashes));
      if (entry.hashes.some((h) => installed.has(h))) return entry;
    }
  }
  return undefined;
}
