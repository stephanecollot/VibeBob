import { useEffect, useState, useMemo } from "react";
import {
  ArrowDownTrayIcon,
  CheckCircleIcon,
  ArrowPathIcon,
  MagnifyingGlassIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/20/solid";
import { loadCatalog } from "../marketplace/catalog";
import { installFromCatalog } from "../marketplace/install";
import { InstallConsent } from "./InstallConsent";
import type { FeatureId, CatalogMod } from "../types";
import type { FeatureCache } from "../runtime/featureStore";

interface Props {
  onInstalled: (id: FeatureId) => void;
}

/** Which catalog mods are already installed, keyed by the pin each install kept. */
async function loadInstalledIds(): Promise<Set<string>> {
  try {
    const data = await chrome.storage.local.get("features");
    const features = (data.features ?? {}) as Record<FeatureId, FeatureCache>;
    return new Set(
      Object.values(features)
        .map((f) => f.source?.modId)
        .filter((id): id is string => Boolean(id)),
    );
  } catch {
    return new Set();
  }
}

function ago(ts: number): string {
  const mins = Math.round((Date.now() - ts) / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  return hours < 24 ? `${hours}h ago` : `${Math.round(hours / 24)}d ago`;
}

export function Marketplace({ onInstalled }: Props) {
  const [mods, setMods] = useState<CatalogMod[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [staleSince, setStaleSince] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [nsFilter, setNsFilter] = useState<string | null>(null);
  const [installedIds, setInstalledIds] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<CatalogMod | null>(null);
  const [installing, setInstalling] = useState(false);
  const [installError, setInstallError] = useState<string | null>(null);

  async function load(force = false) {
    setLoading(true);
    setError(null);
    try {
      const [result, installed] = await Promise.all([loadCatalog({ force }), loadInstalledIds()]);
      setMods(result.catalog.mods);
      setInstalledIds(installed);
      setStaleSince(result.stale && result.fetchedAt ? result.fetchedAt : null);
      // An empty catalog with no cache to fall back on is a real error, not an empty market.
      if (result.stale && !result.fetchedAt) setError(result.error ?? "could not reach the marketplace");
      // A refresh is also the cheapest moment to act on new takedowns.
      chrome.runtime
        .sendMessage({ target: "background", type: "marketplace.enforce", force })
        .catch(() => {});
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
          m.name.toLowerCase().includes(q) ||
          m.description.toLowerCase().includes(q) ||
          m.id.toLowerCase().includes(q),
      );
    }
    return list;
  }, [mods, nsFilter, search]);

  async function onConfirmInstall(enable: boolean) {
    if (!pending) return;
    setInstalling(true);
    setInstallError(null);
    try {
      const id = await installFromCatalog(pending, { enable });
      setInstalledIds((prev) => new Set([...prev, pending.id]));
      setPending(null);
      onInstalled(id);
    } catch (e) {
      setInstallError(e instanceof Error ? e.message : String(e));
    } finally {
      setInstalling(false);
    }
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
          <ArrowPathIcon className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
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
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>
      )}

      {staleSince && (
        <div className="flex items-center gap-1.5 rounded-md bg-amber-50 px-3 py-2 text-[13px] text-amber-700">
          <ExclamationTriangleIcon className="h-4 w-4 shrink-0" />
          Offline — showing the catalog from {ago(staleSince)}.
        </div>
      )}

      {loading && mods.length === 0 && (
        <div className="py-8 text-center text-sm text-gray-400">Loading marketplace...</div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="py-8 text-center text-sm text-gray-400">
          {mods.length === 0 ? "No mods available yet." : "No mods match your search."}
        </div>
      )}

      <ul className="space-y-2.5">
        {filtered.map((mod) => {
          const installed = installedIds.has(mod.id);
          return (
            <li
              key={mod.id}
              className="rounded-lg border border-gray-200/80 bg-white p-3 shadow-sm"
            >
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-900">{mod.name}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        mod.official
                          ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/70"
                          : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {mod.namespace}
                    </span>
                    <span className="text-[11px] text-gray-400">v{mod.version}</span>
                  </div>
                  <p className="mt-0.5 text-[13px] text-gray-500">{mod.description}</p>
                  {mod.matches.length > 0 && (
                    <p className="mt-1 truncate font-mono text-[11px] text-gray-400">
                      {mod.matches.join(" ")}
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
                      onClick={() => {
                        setInstallError(null);
                        setPending(mod);
                      }}
                      className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white shadow-sm transition-colors hover:bg-emerald-500"
                    >
                      <ArrowDownTrayIcon className="h-3.5 w-3.5" />
                      Install
                    </button>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {pending && (
        <InstallConsent
          mod={pending}
          busy={installing}
          error={installError}
          onCancel={() => setPending(null)}
          onInstall={(enable) => void onConfirmInstall(enable)}
        />
      )}
    </div>
  );
}
