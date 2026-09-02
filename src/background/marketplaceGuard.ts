import { loadCatalog } from "../marketplace/catalog";
import { enforceBlocklist, type EnforcementResult } from "../marketplace/blocklist";
import type { FeatureId } from "../types";
import type { FeatureCache } from "../runtime/featureStore";

const ALARM = "marketplace-refresh";
const PERIOD_MINUTES = 360;

/**
 * Enforcement lives in the service worker, not the side panel: a takedown has
 * to reach someone who installed a mod months ago and never opens the panel
 * again.
 */
export async function refreshAndEnforce(force = false): Promise<EnforcementResult | null> {
  try {
    const { catalog, stale, error } = await loadCatalog({ force });
    // An offline empty catalog must not look like "everything was un-blocked".
    if (stale && catalog.mods.length === 0 && catalog.blocklist.length === 0) {
      console.warn("[vibebob/marketplace] catalog unavailable, keeping current state", error);
      return null;
    }
    const result = await enforceBlocklist(catalog);
    if (result.blocked.length)
      console.warn("[vibebob/marketplace] disabled by takedown", result.blocked);
    await updateBadge();
    return result;
  } catch (err) {
    console.warn("[vibebob/marketplace] enforcement failed", err);
    return null;
  }
}

async function updateBadge(): Promise<void> {
  const data = await chrome.storage.local.get("features");
  const features = (data.features ?? {}) as Record<FeatureId, FeatureCache>;
  const count = Object.values(features).filter((f) => f.blocked && !f.blocked.acknowledged).length;
  await chrome.action.setBadgeText({ text: count > 0 ? "!" : "" });
  if (count > 0) {
    await chrome.action.setBadgeBackgroundColor({ color: "#dc2626" });
    await chrome.action.setTitle({
      title: `VibeBob — ${count} mod${count === 1 ? " was" : "s were"} removed from the marketplace`,
    });
  } else {
    await chrome.action.setTitle({ title: "VibeBob" });
  }
}

export function attachMarketplaceGuard(): void {
  // Only create it when missing: chrome.alarms.create replaces an existing
  // alarm, so recreating on every service-worker wake would push the next
  // check back forever and the periodic refresh would never fire.
  void chrome.alarms.get(ALARM).then((existing) => {
    if (!existing) chrome.alarms.create(ALARM, { periodInMinutes: PERIOD_MINUTES });
  });

  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARM) void refreshAndEnforce();
  });

  chrome.runtime.onStartup.addListener(() => {
    void refreshAndEnforce();
  });

  // Keep the badge honest when features change from anywhere else.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.features) void updateBadge();
  });

  void refreshAndEnforce();
}
