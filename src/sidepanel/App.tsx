import { useState } from "react";
import {
  ArrowLeftIcon,
  Cog6ToothIcon,
  PlusIcon,
} from "@heroicons/react/24/outline";
import { DevPanel } from "./DevPanel";
import { Chat } from "./Chat";
import { Settings } from "./Settings";
import { FeatureList } from "./FeatureList";
import { FeatureTitle } from "./FeatureTitle";
import { IconButton } from "./ui";
import { createFeature } from "../vfs/feature";
import type { FeatureId } from "../types";

type View = "home" | "workspace" | "settings";
type WorkspaceTab = "chat" | "dev";

export function App() {
  const [view, setView] = useState<View>("home");
  const [prevView, setPrevView] = useState<View>("home");
  const [wsTab, setWsTab] = useState<WorkspaceTab>("chat");
  const [active, setActive] = useState<FeatureId | null>(null);

  function goSettings() {
    setPrevView(view);
    setView("settings");
  }

  function goBack() {
    setView(view === "settings" ? prevView : "home");
  }

  async function onNew() {
    const id = crypto.randomUUID();
    await createFeature(id);
    setActive(id);
    setWsTab("chat");
    setView("workspace");
  }

  function onSelect(id: FeatureId) {
    setActive(id);
    setWsTab("chat");
    setView("workspace");
  }

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-gray-200 px-4 py-3">
        {view === "home" && (
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-semibold tracking-tight text-gray-900">
              ClaudeThis
            </h1>
            <div className="flex items-center gap-2">
              <button
                onClick={onNew}
                className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-emerald-500 transition-colors"
              >
                <PlusIcon className="h-4 w-4" aria-hidden="true" />
                new
              </button>
              <IconButton
                icon={Cog6ToothIcon}
                onClick={goSettings}
                title="settings"
              />
            </div>
          </div>
        )}
        {view === "workspace" && active && (
          <div className="flex flex-col gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <IconButton icon={ArrowLeftIcon} onClick={goBack} title="back" />
              <FeatureTitle featureId={active} />
              <IconButton
                icon={Cog6ToothIcon}
                onClick={goSettings}
                title="settings"
              />
            </div>
            <div className="flex justify-center gap-1">
              {(["chat", "dev"] as WorkspaceTab[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setWsTab(t)}
                  className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
                    wsTab === t
                      ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                      : "text-gray-500 hover:bg-gray-100 hover:text-gray-800"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        )}
        {view === "settings" && (
          <div className="flex items-center gap-2">
            <IconButton icon={ArrowLeftIcon} onClick={goBack} title="back" />
            <h1 className="text-lg font-semibold tracking-tight text-gray-900">
              Settings
            </h1>
          </div>
        )}
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto p-4 text-gray-700">
        {view === "home" && <FeatureList onSelect={onSelect} />}
        {view === "workspace" && active && wsTab === "chat" && (
          <Chat featureId={active} />
        )}
        {view === "workspace" && active && wsTab === "dev" && (
          <DevPanel featureId={active} />
        )}
        {view === "settings" && <Settings />}
      </main>
    </div>
  );
}
