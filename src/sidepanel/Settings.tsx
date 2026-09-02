import { useCallback, useEffect, useState } from "react";
import { ArrowPathIcon, CheckIcon } from "@heroicons/react/20/solid";
import {
  DEFAULT_MODEL,
  FALLBACK_MODELS,
  loadModels,
  withSelected,
  type ModelOption,
} from "../agent/models";

export function Settings() {
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [models, setModels] = useState<ModelOption[]>(FALLBACK_MODELS);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [screenshotEnabled, setScreenshotEnabled] = useState(true);
  const [saved, setSaved] = useState(false);
  const [keyError, setKeyError] = useState<string | null>(null);

  const refreshModels = useCallback(async (key: string, force: boolean) => {
    setRefreshing(true);
    try {
      const result = await loadModels(key, { force });
      setModels(result.models);
      setModelsError(result.error ?? null);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    chrome.storage.local.get(["apiKey", "model", "screenshotEnabled"]).then((r) => {
      const key = typeof r.apiKey === "string" ? r.apiKey : "";
      if (key) setApiKey(key);
      if (typeof r.model === "string") setModel(r.model);
      if (typeof r.screenshotEnabled === "boolean") setScreenshotEnabled(r.screenshotEnabled);
      void refreshModels(key, false);
    });
  }, [refreshModels]);

  async function onSave() {
    if (apiKey && !apiKey.startsWith("sk-ant-")) {
      setKeyError("Key must start with sk-ant-");
      return;
    }
    setKeyError(null);
    await chrome.storage.local.set({ apiKey, model, screenshotEnabled });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
    if (apiKey) void refreshModels(apiKey, true);
  }

  return (
    <div className="space-y-5">
      <div>
        <label className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wider text-gray-500">
          Anthropic API key
        </label>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="sk-ant-..."
          className="w-full rounded-md border border-gray-200 bg-white px-3 py-1.5 font-mono text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
        />
        {keyError && <p className="mt-1.5 text-red-500">{keyError}</p>}
        <p className="mt-1.5 text-[13px] text-gray-500">
          Stored in chrome.storage.local on this device only.
        </p>
      </div>
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <label className="block text-[12px] font-semibold uppercase tracking-wider text-gray-500">
            model
          </label>
          <button
            type="button"
            onClick={() => void refreshModels(apiKey, true)}
            disabled={refreshing || !apiKey}
            title={apiKey ? "Refresh model list" : "Save an API key to refresh the model list"}
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50"
          >
            <ArrowPathIcon className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          </button>
        </div>
        <select
          value={model}
          onChange={(e) => setModel(e.target.value)}
          className="w-full rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
        >
          {withSelected(models, model).map((m) => (
            <option key={m.id} value={m.id}>
              {m.displayName}
            </option>
          ))}
        </select>
        {modelsError ? (
          <p className="mt-1.5 text-[13px] text-amber-600">
            Couldn't refresh the model list ({modelsError}) — showing the last known models.
          </p>
        ) : (
          <p className="mt-1.5 text-[13px] text-gray-500">
            <span className="font-mono">{model}</span> — list comes from the Anthropic API,
            refreshed daily.
          </p>
        )}
      </div>
      <div>
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={screenshotEnabled}
            onChange={(e) => setScreenshotEnabled(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
          />
          <span className="text-[12px] font-semibold uppercase tracking-wider text-gray-500">
            allow screenshot by default
          </span>
        </label>
        <p className="mt-1.5 text-[13px] text-gray-500">
          Default for new features until you change it in the chat panel. Each feature keeps its own setting. When enabled, the agent can capture a screenshot of the current tab.
        </p>
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={onSave}
          className="rounded-md bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-emerald-500 transition-colors"
        >
          save
        </button>
        {saved && (
          <span className="inline-flex items-center gap-1 text-sm text-emerald-600">
            <CheckIcon className="h-4 w-4" aria-hidden="true" />
            saved
          </span>
        )}
      </div>
    </div>
  );
}
