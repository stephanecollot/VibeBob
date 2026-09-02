import { GlobeAltIcon } from "@heroicons/react/20/solid";

export interface TabInfo {
  id: number;
  title: string;
  url: string;
}

export function tabLabel(tab: TabInfo): string {
  if (tab.title) return tab.title;
  try {
    return new URL(tab.url).hostname;
  } catch {
    return tab.url || "this tab";
  }
}

/** Short, stable name for the page — used where a full title would crowd the row. */
export function tabHost(tab: TabInfo): string {
  try {
    return new URL(tab.url).hostname.replace(/^www\./, "");
  } catch {
    return "this page";
  }
}

/** The tab the side panel is looking at — a run is pinned to it when you hit send. */
export async function readActiveTab(): Promise<TabInfo | null> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id == null) return null;
    return { id: tab.id, title: tab.title ?? "", url: tab.url ?? "" };
  } catch {
    return null;
  }
}

/**
 * Which page the agent is (or will be) working on. A run stays pinned to the tab it
 * started on, so switching tabs mid-run is safe — except for screenshots, which Chrome
 * can only take of the visible tab.
 */
export function TabBar({
  tab,
  pinned,
  liveTab,
  needsVisible,
}: {
  tab: TabInfo | null;
  pinned: TabInfo | null;
  liveTab: TabInfo | null;
  needsVisible: boolean;
}) {
  if (!tab) return null;
  const awayFromPin = pinned !== null && liveTab !== null && pinned.id !== liveTab.id;
  const alert = needsVisible && awayFromPin;

  return (
    <div
      className={`mt-3 flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-[13px] ${
        alert
          ? "border-amber-200 bg-amber-50 text-amber-800"
          : awayFromPin
            ? "border-gray-200 bg-gray-50 text-gray-500"
            : "border-transparent bg-gray-50 text-gray-500"
      }`}
    >
      <GlobeAltIcon className="h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate" title={tab.url}>
        {pinned ? "running on" : "will run on"}{" "}
        <span className="font-medium text-gray-700">{tabLabel(tab)}</span>
      </span>
      {awayFromPin && (
        <button
          type="button"
          onClick={() => {
            chrome.tabs.update(pinned.id, { active: true }).catch(() => {});
          }}
          className={`shrink-0 rounded px-2 py-0.5 font-medium transition-colors ${
            alert
              ? "bg-amber-600 text-white shadow-sm hover:bg-amber-500"
              : "text-emerald-700 hover:bg-emerald-50"
          }`}
        >
          switch back
        </button>
      )}
    </div>
  );
}

/** Explains the one thing that does break when you leave the pinned tab. */
export function TabHint({ awayFromPin, needsVisible }: { awayFromPin: boolean; needsVisible: boolean }) {
  if (!awayFromPin) return null;
  return (
    <p className={`mt-1.5 text-[13px] ${needsVisible ? "text-amber-700" : "text-gray-400"}`}>
      {needsVisible
        ? "The agent could not bring the pinned page to the front for a screenshot. Switch back and it can see the page again."
        : "You're on another tab — the agent keeps working on the pinned page, and flips to it for a moment if it needs a screenshot."}
    </p>
  );
}
