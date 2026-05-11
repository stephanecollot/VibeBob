import { useEffect, useRef, useState } from "react";
import { readFile } from "../vfs";
import { writeFileAndCommit } from "../vfs/feature";
import type { FeatureId, Manifest } from "../types";
import type { FeatureCache } from "../runtime/featureStore";

function stubManifest(id: FeatureId, name: string): Manifest {
  const now = new Date().toISOString();
  return {
    id,
    name,
    description: "",
    matches: [],
    entry: "mod.js",
    version: "0.0.1",
    createdAt: now,
    updatedAt: now,
  };
}

interface Props {
  featureId: FeatureId;
}

export function FeatureTitle({ featureId }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");

  async function syncFromStorage(): Promise<void> {
    const r = (await chrome.storage.local.get("features")) as {
      features?: Record<string, FeatureCache>;
    };
    const name = r.features?.[featureId]?.name ?? "Untitled";
    setValue(name);
  }

  useEffect(() => {
    syncFromStorage();
  }, [featureId]);

  useEffect(() => {
    const handler = (
      changes: { [k: string]: chrome.storage.StorageChange },
      area: string,
    ) => {
      if (area !== "local" || !changes.features) return;
      if (document.activeElement === inputRef.current) return;
      syncFromStorage();
    };
    chrome.storage.onChanged.addListener(handler);
    return () => chrome.storage.onChanged.removeListener(handler);
  }, [featureId]);

  async function persistTitle(next: string): Promise<void> {
    const trimmed = next.trim() || "Untitled";
    const r = (await chrome.storage.local.get("features")) as {
      features?: Record<string, FeatureCache>;
    };
    const current = r.features?.[featureId]?.name ?? "Untitled";
    if (trimmed === current) return;

    let manifest: Manifest;
    try {
      const raw = await readFile(featureId, "manifest.json");
      manifest = JSON.parse(raw) as Manifest;
      manifest.name = trimmed;
      manifest.updatedAt = new Date().toISOString();
    } catch {
      manifest = stubManifest(featureId, trimmed);
    }
    await writeFileAndCommit(
      featureId,
      "manifest.json",
      JSON.stringify(manifest, null, 2),
      `title: ${trimmed}`,
    );
    setValue(trimmed);
  }

  return (
    <input
      ref={inputRef}
      type="text"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => {
        void persistTitle(value);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.currentTarget.blur();
        }
      }}
      spellCheck={false}
      className="min-w-0 flex-1 truncate rounded-md border border-transparent bg-transparent px-2 py-1 text-lg font-semibold tracking-tight text-gray-900 outline-none hover:border-gray-200 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
      title="Modification name"
      aria-label="Modification name"
    />
  );
}
