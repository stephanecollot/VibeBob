import { useEffect, useState } from "react";
import { CheckIcon } from "@heroicons/react/20/solid";

const MODELS = [
  "claude-sonnet-4-6",
  "claude-opus-4-7",
  "claude-haiku-4-5-20251001",
];

export function Settings() {
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(MODELS[0]);
  const [screenshotEnabled, setScreenshotEnabled] = useState(true);
  const [saved, setSaved] = useState(false);
  const [keyError, setKeyError] = useState<string | null>(null);

  useEffect(() => {
    chrome.storage.local.get(["apiKey", "model", "screenshotEnabled"]).then((r) => {
      if (typeof r.apiKey === "string") setApiKey(r.apiKey);
      if (typeof r.model === "string") setModel(r.model);
      if (typeof r.screenshotEnabled === "boolean") setScreenshotEnabled(r.screenshotEnabled);
    });
  }, []);

  async function onSave() {
    if (apiKey && !apiKey.startsWith("sk-ant-")) {
      setKeyError("Key must start with sk-ant-");
      return;
    }
    setKeyError(null);
    await chrome.storage.local.set({ apiKey, model, screenshotEnabled });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
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
        <label className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wider text-gray-500">
          model
        </label>
        <select
          value={model}
          onChange={(e) => setModel(e.target.value)}
          className="w-full rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
        >
          {MODELS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
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
