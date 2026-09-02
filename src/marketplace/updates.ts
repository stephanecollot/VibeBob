import { findMod } from "./catalog";
import { compareVersions } from "./rules.mjs";
import type { Catalog, CatalogMod, FeatureId } from "../types";
import type { FeatureCache } from "../runtime/featureStore";

export interface UpdateInfo {
  featureId: FeatureId;
  mod: CatalogMod;
  fromVersion: string;
  fromCommit: string;
}

/**
 * Never applied automatically. Silently changing code that already runs on the
 * user's logged-in pages is precisely the attack that pinning prevents.
 */
export async function findUpdates(catalog: Catalog): Promise<UpdateInfo[]> {
  const data = await chrome.storage.local.get("features");
  const features = (data.features ?? {}) as Record<FeatureId, FeatureCache>;

  const updates: UpdateInfo[] = [];
  for (const feature of Object.values(features)) {
    const source = feature.source;
    if (!source?.modId) continue;
    const mod = findMod(catalog, source.modId);
    if (!mod) continue;

    const cmp = compareVersions(source.version, mod.version);
    const newer = cmp === -1 || (cmp === 0 && Boolean(source.commit) && source.commit !== mod.commit);
    if (newer)
      updates.push({
        featureId: feature.id,
        mod,
        fromVersion: source.version,
        fromCommit: source.commit,
      });
  }
  return updates;
}
