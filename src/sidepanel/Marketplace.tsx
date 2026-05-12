import { useEffect, useState, useMemo } from "react";
import {
  ArrowDownTrayIcon,
  CheckCircleIcon,
  ArrowPathIcon,
  MagnifyingGlassIcon,
} from "@heroicons/react/20/solid";
import { fetchCatalog } from "../marketplace/github";
import { installFromMarketplace } from "../vfs/feature";
import * as vfs from "../vfs";
import type { FeatureId, MarketplaceMod, Manifest } from "../types";

interface Props {
  onInstalled: (id: FeatureId) => void;
}

export function Marketplace({ onInstalled }: Props) {
  const [mods, setMods] = useState<MarketplaceMod[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [nsFilter, setNsFilter] = useState<string | null>(null);
  const [installedPaths, setInstalledPaths] = useState<Set<string>>(new Set());
  const [installing, setInstalling] = useState<string | null>(null);

  async function loadInstalledPaths(): Promise<Set<string>> {
    const paths = new Set<string>();
    try {
      const featureIds = await vfs.listFeatures();
      for (const fid of featureIds) {
        try {
          const raw = await vfs.readFile(fid, "manifest.json");
          const manifest = JSON.parse(raw) as Manifest;
          if (manifest.source?.path) paths.add(manifest.source.path);
        } catch {
          // skip
        }
      }
    } catch {
      // skip
    }
    return paths;
  }

  async function load(force = false) {
    setLoading(true);
    setError(null);
    try {
      const [catalog, paths] = await Promise.all([
        fetchCatalog(force),
        loadInstalledPaths(),
      ]);
      setMods(catalog);
      setInstalledPaths(paths);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const namespaces = useMemo(
    () => [...new Set(mods.map((m) => m.namespace))].sort(),
    [mods],
  );

  const filtered = useMemo(() => {
    let list = mods;
    if (nsFilter) list = list.filter((m) => m.namespace === nsFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (m) =>
          m.manifest.name.toLowerCase().includes(q) ||
          m.manifest.description.toLowerCase().includes(q) ||
          m.slug.toLowerCase().includes(q),
      );
    }
    return list;
  }, [mods, nsFilter, search]);

  async function onInstall(mod: MarketplaceMod) {
    const key = `marketplace/${mod.namespace}/${mod.slug}`;
    setInstalling(key);
    try {
      const id = await installFromMarketplace(mod);
      setInstalledPaths((prev) => new Set([...prev, key]));
      onInstalled(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setInstalling(null);
    }
  }

  function isInstalled(mod: MarketplaceMod): boolean {
    return installedPaths.has(`marketplace/${mod.namespace}/${mod.slug}`);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <MagnifyingGlassIcon className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search mods..."
            className="w-full rounded-md border border-gray-200 bg-white py-1.5 pl-8 pr-3 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>
        <button
          type="button"
          onClick={() => void load(true)}
          disabled={loading}
          title="Refresh catalog"
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50"
        >
          <ArrowPathIcon
            className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
          />
        </button>
      </div>

      {namespaces.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setNsFilter(null)}
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
              nsFilter === null
                ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            all
          </button>
          {namespaces.map((ns) => (
            <button
              key={ns}
              onClick={() => setNsFilter(nsFilter === ns ? null : ns)}
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
                nsFilter === ns
                  ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {ns}
            </button>
          ))}
        </div>
      )}

      {error && (
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
          {error}
        </div>
      )}

      {loading && mods.length === 0 && (
        <div className="py-8 text-center text-sm text-gray-400">
          Loading marketplace...
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="py-8 text-center text-sm text-gray-400">
          {mods.length === 0
            ? "No mods available yet."
            : "No mods match your search."}
        </div>
      )}

      <ul className="space-y-2.5">
        {filtered.map((mod) => {
          const key = `marketplace/${mod.namespace}/${mod.slug}`;
          const installed = isInstalled(mod);
          const busy = installing === key;
          return (
            <li
              key={key}
              className="rounded-lg border border-gray-200/80 bg-white p-3 shadow-sm"
            >
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-900">
                      {mod.manifest.name}
                    </span>
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500">
                      {mod.namespace}
                    </span>
                    {mod.manifest.version && (
                      <span className="text-[11px] text-gray-400">
                        v{mod.manifest.version}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-[13px] text-gray-500">
                    {mod.manifest.description}
                  </p>
                  {mod.manifest.matches.length > 0 && (
                    <p className="mt-1 font-mono text-[11px] text-gray-400">
                      {mod.manifest.matches.join(" ")}
                    </p>
                  )}
                </div>
                <div className="shrink-0">
                  {installed ? (
                    <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">
                      <CheckCircleIcon className="h-3.5 w-3.5" />
                      Installed
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void onInstall(mod)}
                      disabled={busy}
                      className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white shadow-sm transition-colors hover:bg-emerald-500 disabled:opacity-50"
                    >
                      {busy ? (
                        <ArrowPathIcon className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <ArrowDownTrayIcon className="h-3.5 w-3.5" />
                      )}
                      Install
                    </button>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
