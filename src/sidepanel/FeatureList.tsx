import { useEffect, useState, type ReactNode } from "react";
import { XMarkIcon, ArrowUpCircleIcon, ShieldExclamationIcon } from "@heroicons/react/20/solid";
import {
  listFeatureCaches,
  getApplied,
  setEnabled,
  urlMatches,
  isModdableUrl,
  type FeatureCache,
} from "../runtime/featureStore";
import { deleteFeatureFully } from "../vfs/feature";
import { loadCatalog, compareUrl } from "../marketplace/catalog";
import { findUpdates, type UpdateInfo } from "../marketplace/updates";
import { updateInstalled } from "../marketplace/install";
import { acknowledgeBlocked } from "../marketplace/blocklist";
import { readActiveTab, tabHost, type TabInfo } from "./TabBar";
import { IconButton } from "./ui";
import type { FeatureId } from "../types";

interface Props {
  onSelect: (id: FeatureId) => void;
}

export function FeatureList({ onSelect }: Props) {
  const [features, setFeatures] = useState<FeatureCache[]>([]);
  const [tab, setTab] = useState<TabInfo | null>(null);
  const [applied, setApplied] = useState<Set<FeatureId>>(new Set());
  const [updates, setUpdates] = useState<Map<FeatureId, UpdateInfo>>(new Map());
  const [updating, setUpdating] = useState<FeatureId | null>(null);

  useEffect(() => {
    const refresh = () => {
      listFeatureCaches().then(setFeatures);
    };
    refresh();
    const handler = (
      changes: { [k: string]: chrome.storage.StorageChange },
      area: string,
    ) => {
      if (area === "local" && changes.features) refresh();
    };
    chrome.storage.onChanged.addListener(handler);
    return () => chrome.storage.onChanged.removeListener(handler);
  }, []);

  // Reads the cached catalog, so this costs nothing on most opens. Updates are
  // only ever offered, never applied on their own.
  useEffect(() => {
    let cancelled = false;
    loadCatalog()
      .then(({ catalog }) => findUpdates(catalog))
      .then((list) => {
        if (!cancelled) setUpdates(new Map(list.map((u) => [u.featureId, u])));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [features.length]);

  // The router records what it injected per tab, so "applied" is what is actually
  // running on the page — not just what would match its URL.
  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      const t = await readActiveTab();
      if (cancelled) return;
      setTab(t);
      const ids = t ? await getApplied(t.id) : [];
      if (cancelled) return;
      // The router rewrites appliedTabs on every navigation; keep the old Set when
      // nothing changed so the list does not re-render (and regroup) needlessly.
      setApplied((prev) =>
        prev.size === ids.length && ids.every((id) => prev.has(id))
          ? prev
          : new Set(ids),
      );
    };
    refresh();
    const onUpdated = (_id: number, info: chrome.tabs.TabChangeInfo) => {
      if (info.status === "complete" || info.url) refresh();
    };
    const onStorage = (
      changes: { [k: string]: chrome.storage.StorageChange },
      area: string,
    ) => {
      if (area === "local" && changes.appliedTabs) refresh();
    };
    chrome.tabs.onActivated.addListener(refresh);
    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.storage.onChanged.addListener(onStorage);
    return () => {
      cancelled = true;
      chrome.tabs.onActivated.removeListener(refresh);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      chrome.storage.onChanged.removeListener(onStorage);
    };
  }, []);

  async function onToggle(id: FeatureId, enabled: boolean) {
    await setEnabled(id, enabled);
  }

  async function onDelete(id: FeatureId) {
    if (!confirm("Delete this feature and all its files?")) return;
    await deleteFeatureFully(id);
  }

  async function onKeepBlocked(id: FeatureId) {
    if (
      !confirm(
        "This mod was removed from the marketplace, usually because it was unsafe.\n\n" +
          "Keep it anyway? You will have to switch it back on yourself.",
      )
    )
      return;
    await acknowledgeBlocked(id);
    setFeatures(await listFeatureCaches());
  }

  async function onUpdate(info: UpdateInfo) {
    if (
      !confirm(
        `Update "${info.mod.name}" from v${info.fromVersion} to v${info.mod.version}?\n\n` +
          "The current version is kept in this mod's history, so you can revert from the dev tab.",
      )
    )
      return;
    setUpdating(info.featureId);
    try {
      await updateInstalled(info.featureId, info.mod);
      setUpdates((prev) => {
        const next = new Map(prev);
        next.delete(info.featureId);
        return next;
      });
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setUpdating(null);
    }
  }

  if (features.length === 0) {
    return (
      <p className="text-gray-400">
        No features yet. Click "new" to create your first feature. Or click "market" to browse the marketplace and install a feature.
      </p>
    );
  }

  // "On this page" is about the mod's URL patterns, so a matching mod still shows up
  // here when it is switched off — that is exactly where you go to switch it back on.
  const matchesHere = (f: FeatureCache) =>
    tab !== null && isModdableUrl(tab.url) && urlMatches(tab.url, f.matches);

  const onPage = features
    .filter(matchesHere)
    // Whatever is actually running goes first; the rest keep their existing order.
    .sort((a, b) => Number(applied.has(b.id)) - Number(applied.has(a.id)));
  const rest = features.filter((f) => !matchesHere(f));

  const rows = (list: FeatureCache[]) => (
    <ul className="space-y-2.5">
      {list.map((f) => (
        <FeatureRow
          key={f.id}
          feature={f}
          active={applied.has(f.id)}
          update={updates.get(f.id)}
          updating={updating === f.id}
          onSelect={onSelect}
          onToggle={onToggle}
          onDelete={onDelete}
          onKeepBlocked={onKeepBlocked}
          onUpdate={onUpdate}
        />
      ))}
    </ul>
  );

  if (onPage.length === 0) return rows(rest);

  return (
    <div className="space-y-5">
      <section>
        <Heading>
          on this page{" "}
          {tab && <span className="font-normal text-gray-400">· {tabHost(tab)}</span>}
        </Heading>
        {rows(onPage)}
      </section>
      {rest.length > 0 && (
        <section>
          <Heading>other mods</Heading>
          {rows(rest)}
        </section>
      )}
    </div>
  );
}

function Heading({ children }: { children: ReactNode }) {
  return (
    <h2 className="mb-2 px-0.5 text-[12px] font-semibold text-gray-500">{children}</h2>
  );
}

function FeatureRow({
  feature: f,
  active,
  update,
  updating,
  onSelect,
  onToggle,
  onDelete,
  onKeepBlocked,
  onUpdate,
}: {
  feature: FeatureCache;
  active: boolean;
  update?: UpdateInfo;
  updating: boolean;
  onSelect: (id: FeatureId) => void;
  onToggle: (id: FeatureId, enabled: boolean) => void;
  onDelete: (id: FeatureId) => void;
  onKeepBlocked: (id: FeatureId) => void;
  onUpdate: (info: UpdateInfo) => void;
}) {
  const blocked = f.blocked;
  return (
    <li
      className={`rounded-lg border bg-white p-3 shadow-sm ${
        blocked ? "border-red-200" : active ? "border-emerald-200" : "border-gray-200/80"
      }`}
    >
      <div className="flex items-center gap-2">
        <button
          onClick={() => onSelect(f.id)}
          className="min-w-0 flex-1 truncate text-left text-base font-semibold text-gray-900 hover:text-emerald-700"
          title={f.id}
        >
          {f.name}
        </button>
        {active && (
          <span
            className="shrink-0 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-emerald-200/70"
            title="running on the current tab"
          >
            active
          </span>
        )}
        <Switch
          checked={f.enabled}
          onChange={(v) => onToggle(f.id, v)}
          title={f.enabled ? "disable" : "enable"}
        />
        <IconButton
          icon={XMarkIcon}
          onClick={() => onDelete(f.id)}
          title="delete"
          variant="danger"
          size="sm"
        />
      </div>
      <div className="mt-1.5 text-[13px] text-gray-500">
        {f.matches.length === 0 ? (
          <em>no URL match — won't auto-apply</em>
        ) : (
          <span className="font-mono">{f.matches.join(" ")}</span>
        )}
      </div>
      {f.broken && <div className="mt-1 text-[13px] text-red-500">broken</div>}

      {blocked && (
        <div className="mt-2 rounded-md bg-red-50 p-2.5 ring-1 ring-red-200">
          <div className="flex items-start gap-1.5">
            <ShieldExclamationIcon className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-red-700">
                {blocked.severity === "critical" && !blocked.acknowledged
                  ? "Removed from the marketplace — switched off"
                  : "Removed from the marketplace"}
              </p>
              <p className="mt-0.5 text-[13px] text-red-600">{blocked.reason}</p>
              {!blocked.acknowledged && (
                <div className="mt-1.5 flex gap-2">
                  <button
                    type="button"
                    onClick={() => onDelete(f.id)}
                    className="rounded-md bg-red-600 px-2 py-1 text-xs font-medium text-white shadow-sm transition-colors hover:bg-red-500"
                  >
                    Delete it
                  </button>
                  <button
                    type="button"
                    onClick={() => onKeepBlocked(f.id)}
                    className="rounded-md border border-red-200 px-2 py-1 text-xs font-medium text-red-700 transition-colors hover:bg-red-100"
                  >
                    Keep anyway
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {update && !blocked && (
        <div className="mt-2 flex items-center gap-2 rounded-md bg-amber-50 px-2.5 py-1.5 ring-1 ring-amber-200">
          <ArrowUpCircleIcon className="h-4 w-4 shrink-0 text-amber-600" />
          <span className="min-w-0 flex-1 text-[13px] text-amber-800">
            v{update.mod.version} is available
            {update.fromCommit && (
              <>
                {" · "}
                <a
                  href={compareUrl(update.fromCommit, update.mod)}
                  target="_blank"
                  rel="noreferrer"
                  className="underline decoration-amber-300 hover:text-amber-900"
                >
                  what changed
                </a>
              </>
            )}
          </span>
          <button
            type="button"
            disabled={updating}
            onClick={() => onUpdate(update)}
            className="shrink-0 rounded-md bg-amber-600 px-2 py-1 text-xs font-medium text-white shadow-sm transition-colors hover:bg-amber-500 disabled:opacity-50"
          >
            {updating ? "Updating..." : "Update"}
          </button>
        </div>
      )}
    </li>
  );
}

function Switch({
  checked,
  onChange,
  title,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      title={title}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-[18px] w-8 shrink-0 items-center rounded-full transition-colors ${
        checked ? "bg-emerald-600" : "bg-gray-300"
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-[14px]" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}
