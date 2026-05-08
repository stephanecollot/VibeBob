import {
  listFeatureCaches,
  getApplied,
  setApplied,
  removeAppliedForTab,
  type FeatureCache,
} from "../runtime/featureStore";
import { applyBootstrap, unapplyBootstrap } from "./bootstraps";
import type { FeatureId } from "../types";

function urlMatches(url: string, patterns: string[]): boolean {
  for (const p of patterns) {
    try {
      if (new RegExp(p).test(url)) return true;
    } catch {}
  }
  return false;
}

const evalQueue = new Map<number, Promise<void>>();

function scheduleEvaluate(tabId: number, url: string): void {
  const prev = evalQueue.get(tabId) ?? Promise.resolve();
  const next = prev
    .catch(() => {})
    .then(() => evaluateTab(tabId, url))
    .catch((e) => console.error("[claudethis/router]", e));
  evalQueue.set(tabId, next);
  next.finally(() => {
    if (evalQueue.get(tabId) === next) evalQueue.delete(tabId);
  });
}

async function evaluateTab(tabId: number, url: string): Promise<void> {
  if (!url || !(url.startsWith("http://") || url.startsWith("https://"))) return;

  const features = await listFeatureCaches();
  const matching = new Map<FeatureId, FeatureCache>();
  for (const f of features) {
    if (f.enabled && f.modJs && urlMatches(url, f.matches)) matching.set(f.id, f);
  }

  const previously = await getApplied(tabId);

  for (const id of previously) {
    if (!matching.has(id)) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId },
          world: "MAIN",
          func: unapplyBootstrap,
          args: [id],
        });
      } catch (err) {
        console.warn("[claudethis/router] unapply failed", id, err);
      }
    }
  }

  const nowApplied: FeatureId[] = [];
  for (const f of matching.values()) {
    const scope = `ct-${f.id.slice(0, 8)}`;
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        world: "MAIN",
        injectImmediately: true,
        func: applyBootstrap,
        args: [f.id, scope, f.modJs!, f.modCss ?? ""],
      });
      nowApplied.push(f.id);
    } catch (err) {
      console.warn("[claudethis/router] apply failed", f.id, err);
    }
  }
  await setApplied(tabId, nowApplied);
}

export function attachRouter(): void {
  chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
    if (info.status === "complete" && tab.url) {
      scheduleEvaluate(tabId, tab.url);
    }
  });

  chrome.webNavigation.onHistoryStateUpdated.addListener((details) => {
    if (details.frameId !== 0) return;
    scheduleEvaluate(details.tabId, details.url);
  });

  chrome.tabs.onRemoved.addListener((tabId) => {
    removeAppliedForTab(tabId).catch(() => {});
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes.features) return;
    chrome.tabs.query({}, (tabs) => {
      for (const tab of tabs) {
        if (tab.id != null && tab.url) scheduleEvaluate(tab.id, tab.url);
      }
    });
  });
}
