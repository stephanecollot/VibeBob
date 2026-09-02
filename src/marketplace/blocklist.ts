import { blockEntryFor } from "./catalog";
import type { Catalog, FeatureId } from "../types";
import type { FeatureCache } from "../runtime/featureStore";

export interface EnforcementResult {
  blocked: FeatureId[];
  cleared: FeatureId[];
}

/**
 * Applies marketplace takedowns to what is installed here.
 *
 * `critical` disables the mod: writing `features` fires the router's
 * storage listener, which unapplies it from every open tab within a second.
 * `warn` only records the reason for the banner.
 *
 * Un-blocking clears the marker but never re-enables — coming back to a mod
 * that was pulled should be the user's decision, not ours.
 */
export async function enforceBlocklist(catalog: Catalog): Promise<EnforcementResult> {
  const blockedIds: FeatureId[] = [];
  const cleared: FeatureId[] = [];

  // Re-read immediately before writing: the side panel writes this same key.
  const data = await chrome.storage.local.get("features");
  const features = (data.features ?? {}) as Record<FeatureId, FeatureCache>;
  let changed = false;

  for (const feature of Object.values(features)) {
    const entry = blockEntryFor(catalog, feature.source?.modId, feature.source?.hashes);

    if (!entry) {
      if (feature.blocked) {
        delete feature.blocked;
        cleared.push(feature.id);
        changed = true;
      }
      continue;
    }

    const severity = entry.severity === "warn" ? "warn" : "critical";
    const already = feature.blocked;
    if (already?.reason === entry.reason && already.severity === severity) continue;

    feature.blocked = {
      reason: entry.reason,
      severity,
      at: entry.addedAt,
      acknowledged: already?.acknowledged,
    };
    if (severity === "critical" && !feature.blocked.acknowledged && feature.enabled) {
      feature.enabled = false;
    }
    blockedIds.push(feature.id);
    changed = true;
  }

  if (changed) await chrome.storage.local.set({ features });
  return { blocked: blockedIds, cleared };
}

/** The user chose to keep a blocked mod. Their browser, their call — but recorded. */
export async function acknowledgeBlocked(featureId: FeatureId): Promise<void> {
  const data = await chrome.storage.local.get("features");
  const features = (data.features ?? {}) as Record<FeatureId, FeatureCache>;
  const feature = features[featureId];
  if (!feature?.blocked) return;
  feature.blocked.acknowledged = true;
  await chrome.storage.local.set({ features });
}
