import type { MarketplaceMod, MarketplaceCatalog } from "../types";

const REPO = "stephanecollot/VibeBob";
const BRANCH = "main";
const API = "https://api.github.com";
const RAW = "https://raw.githubusercontent.com";
const CACHE_KEY = "marketplace_catalog";
const CACHE_TTL_MS = 5 * 60 * 1000;

interface GitHubContent {
  name: string;
  type: "file" | "dir";
  path: string;
}

async function ghFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: { Accept: "application/vnd.github.v3+json" },
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status}: ${path}`);
  return res.json() as Promise<T>;
}

async function rawFetch(path: string): Promise<string> {
  const res = await fetch(`${RAW}/${REPO}/${BRANCH}/${path}`);
  if (!res.ok) throw new Error(`Raw fetch ${res.status}: ${path}`);
  return res.text();
}

async function getCachedCatalog(): Promise<MarketplaceCatalog | null> {
  const data = await chrome.storage.local.get(CACHE_KEY);
  const catalog = data[CACHE_KEY] as MarketplaceCatalog | undefined;
  if (!catalog) return null;
  if (Date.now() - catalog.fetchedAt > CACHE_TTL_MS) return null;
  return catalog;
}

async function setCachedCatalog(catalog: MarketplaceCatalog): Promise<void> {
  await chrome.storage.local.set({ [CACHE_KEY]: catalog });
}

export async function fetchCatalog(
  forceRefresh = false,
): Promise<MarketplaceMod[]> {
  if (!forceRefresh) {
    const cached = await getCachedCatalog();
    if (cached) return cached.mods;
  }

  const namespaces = await ghFetch<GitHubContent[]>(
    `/repos/${REPO}/contents/marketplace?ref=${BRANCH}`,
  );

  const nsDirs = namespaces.filter(
    (e) => e.type === "dir" && !e.name.startsWith("."),
  );

  const mods: MarketplaceMod[] = [];

  const nsResults = await Promise.all(
    nsDirs.map(async (ns) => {
      try {
        const entries = await ghFetch<GitHubContent[]>(
          `/repos/${REPO}/contents/${ns.path}?ref=${BRANCH}`,
        );
        return { ns: ns.name, entries: entries.filter((e) => e.type === "dir") };
      } catch {
        return { ns: ns.name, entries: [] };
      }
    }),
  );

  const manifestFetches = nsResults.flatMap(({ ns, entries }) =>
    entries.map(async (mod) => {
      try {
        const raw = await rawFetch(`${mod.path}/manifest.json`);
        const manifest = JSON.parse(raw);
        mods.push({
          namespace: ns,
          slug: mod.name,
          manifest: {
            name: manifest.name ?? mod.name,
            description: manifest.description ?? "",
            matches: manifest.matches ?? [],
            entry: manifest.entry ?? "mod.js",
            styles: manifest.styles,
            version: manifest.version ?? "0.0.0",
            author: manifest.author,
          },
        });
      } catch {
        // skip mods with invalid manifests
      }
    }),
  );

  await Promise.all(manifestFetches);

  mods.sort((a, b) => `${a.namespace}/${a.slug}`.localeCompare(`${b.namespace}/${b.slug}`));

  const catalog: MarketplaceCatalog = { mods, fetchedAt: Date.now() };
  await setCachedCatalog(catalog);
  return mods;
}

export async function fetchModFiles(
  mod: MarketplaceMod,
): Promise<{ modJs: string; modCss?: string; manifestJson: string }> {
  const base = `marketplace/${mod.namespace}/${mod.slug}`;
  const [modJs, manifestJson] = await Promise.all([
    rawFetch(`${base}/${mod.manifest.entry}`),
    rawFetch(`${base}/manifest.json`),
  ]);
  let modCss: string | undefined;
  if (mod.manifest.styles) {
    try {
      modCss = await rawFetch(`${base}/${mod.manifest.styles}`);
    } catch {
      // CSS is optional
    }
  }
  return { modJs, modCss, manifestJson };
}

export function getMarketplacePath(mod: MarketplaceMod): string {
  return `marketplace/${mod.namespace}/${mod.slug}`;
}
