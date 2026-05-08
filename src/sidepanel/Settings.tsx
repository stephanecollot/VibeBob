import { useEffect, useState } from "react";

const MODELS = [
  "claude-sonnet-4-6",
  "claude-opus-4-7",
  "claude-haiku-4-5-20251001",
];

export function Settings() {
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(MODELS[0]);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    chrome.storage.local.get(["apiKey", "model"]).then((r) => {
      if (typeof r.apiKey === "string") setApiKey(r.apiKey);
      if (typeof r.model === "string") setModel(r.model);
    });
  }, []);

  async function onSave() {
    await chrome.storage.local.set({ apiKey, model });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <div className="space-y-4 text-xs">
      <div>
        <label className="mb-1 block font-semibold uppercase tracking-wider text-neutral-400">
          Anthropic API key
        </label>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="sk-ant-..."
          className="w-full rounded bg-neutral-900 px-2 py-1 font-mono"
        />
        <p className="mt-1 text-neutral-500">
          Stored in chrome.storage.local on this device only.
        </p>
      </div>
      <div>
        <label className="mb-1 block font-semibold uppercase tracking-wider text-neutral-400">
          model
        </label>
        <select
          value={model}
          onChange={(e) => setModel(e.target.value)}
          className="w-full rounded bg-neutral-900 px-2 py-1"
        >
          {MODELS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>
      <button
        onClick={onSave}
        className="rounded bg-emerald-700 px-3 py-1 text-white hover:bg-emerald-600"
      >
        save
      </button>
      {saved && <span className="ml-2 text-emerald-400">saved</span>}
    </div>
  );
}
