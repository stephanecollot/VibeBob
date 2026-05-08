import type { FeatureId, Manifest } from "../types";

export interface FeatureCache {
  id: FeatureId;
  name: string;
  matches: string[];
  enabled: boolean;
  modJs?: string;
  modCss?: string;
  broken?: boolean;
}

interface Stored {
  features?: Record<FeatureId, FeatureCache>;
  appliedTabs?: Record<string, FeatureId[]>;
}

async function readAll(): Promise<{
  features: Record<FeatureId, FeatureCache>;
  appliedTabs: Record<string, FeatureId[]>;
}> {
  const r = (await chrome.storage.local.get(["features", "appliedTabs"])) as Stored;
  return { features: r.features ?? {}, appliedTabs: r.appliedTabs ?? {} };
}

export async function applySyncMessage(input: {
  featureId: FeatureId;
  exists: boolean;
  manifestJson?: string;
  modJs?: string;
  modCss?: string;
}): Promise<void> {
  const { features } = await readAll();
  if (!input.exists) {
    delete features[input.featureId];
  } else {
    let manifest: Manifest | null = null;
    if (input.manifestJson) {
      try {
        manifest = JSON.parse(input.manifestJson) as Manifest;
      } catch {}
    }
    const existing = features[input.featureId];
    features[input.featureId] = {
      id: input.featureId,
      name: manifest?.name ?? existing?.name ?? "Untitled",
      matches: manifest?.matches ?? existing?.matches ?? [],
      enabled: existing?.enabled ?? true,
      modJs: input.modJs,
      modCss: input.modCss,
      broken: existing?.broken,
    };
  }
  await chrome.storage.local.set({ features });
}

export async function setEnabled(featureId: FeatureId, enabled: boolean): Promise<void> {
  const { features } = await readAll();
  if (features[featureId]) {
    features[featureId].enabled = enabled;
    await chrome.storage.local.set({ features });
  }
}

export async function listFeatureCaches(): Promise<FeatureCache[]> {
  const { features } = await readAll();
  return Object.values(features);
}

export async function getApplied(tabId: number): Promise<FeatureId[]> {
  const { appliedTabs } = await readAll();
  return appliedTabs[String(tabId)] ?? [];
}

export async function setApplied(tabId: number, ids: FeatureId[]): Promise<void> {
  const { appliedTabs } = await readAll();
  if (ids.length === 0) delete appliedTabs[String(tabId)];
  else appliedTabs[String(tabId)] = ids;
  await chrome.storage.local.set({ appliedTabs });
}

export async function removeAppliedForTab(tabId: number): Promise<void> {
  const { appliedTabs } = await readAll();
  delete appliedTabs[String(tabId)];
  await chrome.storage.local.set({ appliedTabs });
}
