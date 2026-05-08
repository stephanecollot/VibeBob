import { useEffect, useState } from "react";
import {
  listFeatureCaches,
  setEnabled,
  type FeatureCache,
} from "../runtime/featureStore";
import { deleteFeatureFully } from "../vfs/feature";
import type { FeatureId } from "../types";

interface Props {
  active: FeatureId | null;
  onSelect: (id: FeatureId) => void;
}

export function FeatureList({ active, onSelect }: Props) {
  const [features, setFeatures] = useState<FeatureCache[]>([]);

  async function refresh() {
    setFeatures(await listFeatureCaches());
  }

  useEffect(() => {
    refresh();
    const handler = (changes: { [k: string]: chrome.storage.StorageChange }, area: string) => {
      if (area === "local" && changes.features) refresh();
    };
    chrome.storage.onChanged.addListener(handler);
    return () => chrome.storage.onChanged.removeListener(handler);
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
      <p className="text-xs text-neutral-500">
        No features yet. Open the chat tab and click + new.
      </p>
    );
  }

  return (
    <ul className="space-y-2 text-xs">
      {features.map((f) => (
        <li
          key={f.id}
          className={`rounded border p-2 ${
            active === f.id ? "border-emerald-700 bg-neutral-900" : "border-neutral-800 bg-neutral-900/50"
          }`}
        >
          <div className="flex items-center gap-2">
            <button
              onClick={() => onSelect(f.id)}
              className="flex-1 truncate text-left font-semibold"
              title={f.id}
            >
              {f.name}
            </button>
            <label className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={f.enabled}
                onChange={(e) => onToggle(f.id, e.target.checked)}
              />
              <span className="text-neutral-400">on</span>
            </label>
            <button
              onClick={() => onDelete(f.id)}
              className="rounded px-2 text-neutral-500 hover:bg-neutral-800 hover:text-red-400"
              title="delete"
            >
              ✕
            </button>
          </div>
          <div className="mt-1 text-neutral-500">
            {f.matches.length === 0 ? (
              <em>no URL match — won't auto-apply</em>
            ) : (
              <span className="font-mono">{f.matches.join(" ")}</span>
            )}
          </div>
          {f.broken && <div className="mt-1 text-red-400">broken</div>}
        </li>
      ))}
    </ul>
  );
}
