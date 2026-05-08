import { useEffect, useState } from "react";
import { DevPanel } from "./DevPanel";
import { Chat } from "./Chat";
import { Settings } from "./Settings";
import { FeatureList } from "./FeatureList";
import * as vfs from "../vfs";
import { createFeature } from "../vfs/feature";
import type { FeatureId } from "../types";

type Tab = "chat" | "features" | "dev" | "settings";

export function App() {
  const [tab, setTab] = useState<Tab>("chat");
  const [features, setFeatures] = useState<FeatureId[]>([]);
  const [active, setActive] = useState<FeatureId | null>(null);

  async function refresh() {
    const list = await vfs.listFeatures();
    setFeatures(list);
    setActive((cur) => cur && list.includes(cur) ? cur : list[0] ?? null);
  }

  useEffect(() => {
    refresh();
  }, []);

  async function onNew() {
    const id = crypto.randomUUID();
    await createFeature(id);
    await refresh();
    setActive(id);
    setTab("chat");
  }

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-neutral-800 px-3 py-2">
        <div className="flex items-center justify-between">
          <h1 className="text-sm font-semibold tracking-tight">ClaudeThis</h1>
          <div className="flex gap-1 text-xs">
            {(["chat", "features", "dev", "settings"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`rounded px-2 py-0.5 ${
                  tab === t ? "bg-neutral-800 text-white" : "text-neutral-400 hover:text-neutral-200"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
        {tab === "chat" && (
          <div className="mt-2 flex items-center gap-2 text-xs">
            <select
              value={active ?? ""}
              onChange={(e) => setActive(e.target.value || null)}
              className="flex-1 rounded bg-neutral-900 px-2 py-1"
            >
              {features.length === 0 && <option value="">no features</option>}
              {features.map((id) => (
                <option key={id} value={id}>
                  {id.slice(0, 8)}
                </option>
              ))}
            </select>
            <button
              onClick={onNew}
              className="rounded bg-emerald-700 px-2 py-1 text-white hover:bg-emerald-600"
            >
              + new
            </button>
          </div>
        )}
      </header>
      <main className="flex-1 overflow-hidden p-3 text-neutral-300">
        {tab === "chat" &&
          (active ? (
            <Chat featureId={active} />
          ) : (
            <p className="text-xs text-neutral-500">
              No feature selected. Click "+ new" to start.
            </p>
          ))}
        {tab === "features" && (
          <FeatureList
            active={active}
            onSelect={(id) => {
              setActive(id);
              setTab("chat");
            }}
          />
        )}
        {tab === "dev" && <DevPanel />}
        {tab === "settings" && <Settings />}
      </main>
    </div>
  );
}
