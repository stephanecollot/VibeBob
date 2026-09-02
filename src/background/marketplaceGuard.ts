import { loadCatalog } from "../marketplace/catalog";
import { enforceBlocklist, type EnforcementResult } from "../marketplace/blocklist";
import type { FeatureId } from "../types";
import type { FeatureCache } from "../runtime/featureStore";

/**
 * Enforcement lives in the service worker rather than the side panel, so it
 * still runs for someone who installed a mod long ago and rarely opens the
 * panel. It is driven by the extension waking up — browser start, service
 * worker start, and the panel opening — rather than a scheduled alarm, which
 * would cost users an `alarms` permission for a background timer.
 *
 * loadCatalog's soft TTL means frequent wakes cost nothing: at most one network
 * request per 30 minutes.
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
  chrome.runtime.onStartup.addListener(() => {
    void refreshAndEnforce();
  });

  // Keep the badge honest when features change from anywhere else.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.features) void updateBadge();
  });

  void refreshAndEnforce();
}
