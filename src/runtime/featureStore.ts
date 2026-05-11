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
  featureScreenshot?: Record<FeatureId, boolean>;
}

async function readAll(): Promise<{
  features: Record<FeatureId, FeatureCache>;
  appliedTabs: Record<string, FeatureId[]>;
}> {
  const r = (await chrome.storage.local.get(["features", "appliedTabs"])) as Stored;
  return { features: r.features ?? {}, appliedTabs: r.appliedTabs ?? {} };
}

async function readScreenshotMap(): Promise<Record<FeatureId, boolean>> {
  const r = (await chrome.storage.local.get("featureScreenshot")) as Stored;
  return r.featureScreenshot ?? {};
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
    await chrome.storage.local.set({ features });
    return;
  }
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
  await chrome.storage.local.set({ features });
}

export async function setEnabled(featureId: FeatureId, enabled: boolean): Promise<void> {
  const { features } = await readAll();
  if (features[featureId]) {
    features[featureId].enabled = enabled;
    await chrome.storage.local.set({ features });
  }
}

export async function getFeatureScreenshotEnabled(
  featureId: FeatureId,
): Promise<boolean> {
  const r = (await chrome.storage.local.get([
    "featureScreenshot",
    "screenshotEnabled",
  ])) as Stored & { screenshotEnabled?: boolean };
  const per = r.featureScreenshot?.[featureId];
  if (typeof per === "boolean") return per;
  return typeof r.screenshotEnabled === "boolean" ? r.screenshotEnabled : true;
}

export async function setFeatureScreenshotEnabled(
  featureId: FeatureId,
  enabled: boolean,
): Promise<void> {
  const map = await readScreenshotMap();
  map[featureId] = enabled;
  await chrome.storage.local.set({ featureScreenshot: map });
}

/** Call when a feature is permanently removed (not on transient sync failures). */
export async function removeFeatureScreenshotPreference(
  featureId: FeatureId,
): Promise<void> {
  const map = await readScreenshotMap();
  if (!(featureId in map)) return;
  delete map[featureId];
  await chrome.storage.local.set({ featureScreenshot: map });
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
