import { useEffect, useState } from "react";
import { XMarkIcon } from "@heroicons/react/20/solid";
import {
  listFeatureCaches,
  setEnabled,
  type FeatureCache,
} from "../runtime/featureStore";
import { deleteFeatureFully } from "../vfs/feature";
import { IconButton } from "./ui";
import type { FeatureId } from "../types";

interface Props {
  onSelect: (id: FeatureId) => void;
}

export function FeatureList({ onSelect }: Props) {
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
      <p className="text-gray-400">
        No features yet. Click "new" to start.
      </p>
    );
  }

  return (
    <ul className="space-y-2.5">
      {features.map((f) => (
        <li
          key={f.id}
          className="rounded-lg border border-gray-200/80 bg-white p-3 shadow-sm"
        >
          <div className="flex items-center gap-2">
            <button
              onClick={() => onSelect(f.id)}
              className="flex-1 truncate text-left text-base font-semibold text-gray-900 hover:text-emerald-700"
              title={f.id}
            >
              {f.name}
            </button>
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
          {f.broken && (
            <div className="mt-1 text-[13px] text-red-500">broken</div>
          )}
        </li>
      ))}
    </ul>
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
