import { useEffect, useState } from "react";
import * as vfs from "../vfs";
import * as gitLayer from "../git";
import {
  createFeature,
  writeFileAndCommit,
  deleteFileAndCommit,
  deleteFeatureFully,
} from "../vfs/feature";
import type { FeatureId } from "../types";

interface FeatureState {
  files: string[];
  commits: gitLayer.CommitInfo[];
}

export function DevPanel() {
  const [features, setFeatures] = useState<FeatureId[]>([]);
  const [active, setActive] = useState<FeatureId | null>(null);
  const [state, setState] = useState<FeatureState | null>(null);
  const [filePath, setFilePath] = useState("mod.js");
  const [contents, setContents] = useState(
    "// hello\nexport function apply(){console.log('hi');}\nexport function cleanup(){}\n",
  );
  const [err, setErr] = useState<string | null>(null);

  async function refreshFeatures() {
    setFeatures(await vfs.listFeatures());
  }

  async function refreshActive(id: FeatureId) {
    const [files, commits] = await Promise.all([vfs.listFiles(id), gitLayer.log(id)]);
    setState({ files, commits });
  }

  useEffect(() => {
    refreshFeatures();
  }, []);

  useEffect(() => {
    if (active) refreshActive(active);
    else setState(null);
  }, [active]);

  async function onCreate() {
    setErr(null);
    try {
      const id = crypto.randomUUID();
      await createFeature(id);
      await writeFileAndCommit(
        id,
        "manifest.json",
        JSON.stringify(
          {
            id,
            name: "Untitled",
            description: "",
            matches: [],
            entry: "mod.js",
            version: "0.1.0",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          null,
          2,
        ),
        "init",
      );
      await refreshFeatures();
      setActive(id);
    } catch (e) {
      const message = e instanceof Error ? `${e.message}\n${e.stack ?? ""}` : String(e);
      console.error("[DevPanel.onCreate]", e);
      setErr(message);
    }
  }

  async function onWriteSafe() {
    setErr(null);
    try {
      await onWrite();
    } catch (e) {
      const message = e instanceof Error ? `${e.message}\n${e.stack ?? ""}` : String(e);
      console.error("[DevPanel.onWrite]", e);
      setErr(message);
    }
  }

  async function onWrite() {
    if (!active) return;
    await writeFileAndCommit(active, filePath, contents);
    await refreshActive(active);
  }

  async function onDeleteFile(p: string) {
    if (!active) return;
    await deleteFileAndCommit(active, p);
    await refreshActive(active);
  }

  async function onDeleteFeature(id: FeatureId) {
    await deleteFeatureFully(id);
    if (active === id) setActive(null);
    await refreshFeatures();
  }

  async function onRevert(oid: string) {
    if (!active) return;
    await gitLayer.checkout(active, oid);
    await refreshActive(active);
  }

  return (
    <div className="space-y-4 text-xs">
      {err && (
        <div className="whitespace-pre-wrap rounded bg-red-950 px-2 py-1 font-mono text-red-300">
          {err}
        </div>
      )}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-semibold uppercase tracking-wider text-neutral-400">
            features
          </h2>
          <button
            onClick={onCreate}
            className="rounded bg-emerald-700 px-2 py-1 text-white hover:bg-emerald-600"
          >
            + new
          </button>
        </div>
        <ul className="space-y-1">
          {features.length === 0 && <li className="text-neutral-500">none yet</li>}
          {features.map((id) => (
            <li key={id} className="flex items-center gap-2">
              <button
                onClick={() => setActive(id)}
                className={`flex-1 truncate rounded px-2 py-1 text-left ${
                  active === id ? "bg-neutral-800" : "bg-neutral-900 hover:bg-neutral-800"
                }`}
                title={id}
              >
                {id.slice(0, 8)}
              </button>
              <button
                onClick={() => onDeleteFeature(id)}
                className="rounded px-2 py-1 text-neutral-500 hover:bg-neutral-800 hover:text-red-400"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      </section>

      {active && state && (
        <>
          <section>
            <h2 className="mb-2 font-semibold uppercase tracking-wider text-neutral-400">
              write file
            </h2>
            <input
              value={filePath}
              onChange={(e) => setFilePath(e.target.value)}
              className="mb-2 w-full rounded bg-neutral-900 px-2 py-1 font-mono"
            />
            <textarea
              value={contents}
              onChange={(e) => setContents(e.target.value)}
              rows={6}
              className="mb-2 w-full rounded bg-neutral-900 p-2 font-mono"
            />
            <button
              onClick={onWriteSafe}
              className="rounded bg-blue-700 px-3 py-1 text-white hover:bg-blue-600"
            >
              write + commit
            </button>
          </section>

          <section>
            <h2 className="mb-2 font-semibold uppercase tracking-wider text-neutral-400">
              files
            </h2>
            <ul className="space-y-1 font-mono">
              {state.files.map((f) => (
                <li key={f} className="flex items-center gap-2">
                  <span className="flex-1 truncate">{f}</span>
                  <button
                    onClick={() => onDeleteFile(f)}
                    className="rounded px-2 text-neutral-500 hover:text-red-400"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="mb-2 font-semibold uppercase tracking-wider text-neutral-400">
              git log
            </h2>
            <ul className="space-y-1 font-mono">
              {state.commits.map((c) => (
                <li key={c.oid} className="flex items-center gap-2">
                  <span className="text-amber-400">{c.oid.slice(0, 7)}</span>
                  <span className="flex-1 truncate">{c.message}</span>
                  <button
                    onClick={() => onRevert(c.oid)}
                    className="rounded px-2 text-neutral-500 hover:text-amber-300"
                  >
                    ↶
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
