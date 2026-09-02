import { useEffect, useState, type ReactNode } from "react";
import { XMarkIcon } from "@heroicons/react/20/solid";
import {
  listFeatureCaches,
  getApplied,
  setEnabled,
  urlMatches,
  isModdableUrl,
  type FeatureCache,
} from "../runtime/featureStore";
import { deleteFeatureFully } from "../vfs/feature";
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
          onSelect={onSelect}
          onToggle={onToggle}
          onDelete={onDelete}
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
  onSelect,
  onToggle,
  onDelete,
}: {
  feature: FeatureCache;
  active: boolean;
  onSelect: (id: FeatureId) => void;
  onToggle: (id: FeatureId, enabled: boolean) => void;
  onDelete: (id: FeatureId) => void;
}) {
  return (
    <li
      className={`rounded-lg border bg-white p-3 shadow-sm ${
        active ? "border-emerald-200" : "border-gray-200/80"
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
