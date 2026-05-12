import { useEffect, useState } from "react";
import {
  ArrowUturnLeftIcon,
  TrashIcon,
  ArrowDownTrayIcon,
} from "@heroicons/react/20/solid";
import * as vfs from "../vfs";
import * as gitLayer from "../git";
import { writeFileAndCommit, deleteFileAndCommit, deleteFeatureFully } from "../vfs/feature";
import { IconButton } from "./ui";
import type { FeatureId, Manifest } from "../types";

interface FeatureState {
  files: string[];
  commits: gitLayer.CommitInfo[];
}

function toAB(u8: Uint8Array): ArrayBuffer {
  return (u8.buffer as ArrayBuffer).slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
}

function buildZip(entries: { name: string; data: Uint8Array }[]): Blob {
  const parts: ArrayBuffer[] = [];
  const directory: { offset: number; header: ArrayBuffer }[] = [];
  let offset = 0;

  for (const { name, data } of entries) {
    const nameBytes = new TextEncoder().encode(name);
    const crc = crc32(data);

    const local = new Uint8Array(30 + nameBytes.length + data.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    local.set(data, 30 + nameBytes.length);

    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true);
    central.set(nameBytes, 46);

    parts.push(toAB(local));
    directory.push({ offset, header: toAB(central) });
    offset += local.length;
  }

  const dirStart = offset;
  let dirSize = 0;
  for (const { header } of directory) {
    parts.push(header);
    dirSize += header.byteLength;
  }

  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, directory.length, true);
  ev.setUint16(10, directory.length, true);
  ev.setUint32(12, dirSize, true);
  ev.setUint32(16, dirStart, true);
  parts.push(toAB(end));

  return new Blob(parts, { type: "application/zip" });
}

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const DEFAULT_PATH = "mod.js";

function stubManifest(id: FeatureId, name: string): Manifest {
  const now = new Date().toISOString();
  return {
    id,
    name,
    description: "",
    matches: [],
    entry: "mod.js",
    version: "0.0.1",
    createdAt: now,
    updatedAt: now,
  };
}

export function DevPanel({
  featureId,
  onDeleted,
}: {
  featureId: FeatureId;
  onDeleted?: () => void;
}) {
  const [state, setState] = useState<FeatureState | null>(null);
  const [matchesText, setMatchesText] = useState("");
  const [filePath, setFilePath] = useState(DEFAULT_PATH);
  const [contents, setContents] = useState("");
  const [diskSnapshot, setDiskSnapshot] = useState<{
    path: string;
    content: string;
  } | null>(null);
  const [openLoadingPath, setOpenLoadingPath] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [vfsMissing, setVfsMissing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [featureName, setFeatureName] = useState("Untitled");

  const dirty =
    diskSnapshot === null
      ? contents.length > 0 || filePath !== DEFAULT_PATH
      : filePath !== diskSnapshot.path || contents !== diskSnapshot.content;

  async function loadManifest(): Promise<Manifest> {
    try {
      const raw = await vfs.readFile(featureId, "manifest.json");
      return JSON.parse(raw) as Manifest;
    } catch {
      const r = (await chrome.storage.local.get("features")) as {
        features?: Record<string, { name?: string }>;
      };
      const name = r.features?.[featureId]?.name ?? "Untitled";
      return stubManifest(featureId, name);
    }
  }

  async function refresh() {
    try {
      const [files, commits, manifest] = await Promise.all([
        vfs.listFiles(featureId),
        gitLayer.log(featureId),
        loadManifest(),
      ]);
      setState({ files, commits });
      setMatchesText((manifest.matches ?? []).join("\n"));
      setFeatureName(manifest.name || "Untitled");
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error("[DevPanel.refresh]", e);
      if (message.includes("ENOENT")) {
        setVfsMissing(true);
      } else {
        setErr(e instanceof Error ? `${message}\n${e.stack ?? ""}` : message);
      }
      setState({ files: [], commits: [] });
    }
  }

  useEffect(() => {
    setFilePath(DEFAULT_PATH);
    setContents("");
    setDiskSnapshot(null);
    setErr(null);
    setOpenLoadingPath(null);
    void refresh();
  }, [featureId]);

  async function onOpenFile(p: string) {
    if (openLoadingPath) return;
    setErr(null);
    setOpenLoadingPath(p);
    try {
      const text = await vfs.readFile(featureId, p);
      setFilePath(p);
      setContents(text);
      setDiskSnapshot({ path: p, content: text });
    } catch (e) {
      const message = e instanceof Error ? `${e.message}\n${e.stack ?? ""}` : String(e);
      console.error("[DevPanel.onOpenFile]", e);
      setErr(message);
    } finally {
      setOpenLoadingPath(null);
    }
  }

  async function onWrite() {
    setErr(null);
    try {
      await writeFileAndCommit(featureId, filePath, contents);
      setDiskSnapshot({ path: filePath, content: contents });
      await refresh();
    } catch (e) {
      const message = e instanceof Error ? `${e.message}\n${e.stack ?? ""}` : String(e);
      console.error("[DevPanel.onWrite]", e);
      setErr(message);
    }
  }

  async function onDeleteFile(p: string) {
    await deleteFileAndCommit(featureId, p);
    if (p === filePath) {
      setFilePath(DEFAULT_PATH);
      setContents("");
      setDiskSnapshot(null);
    }
    await refresh();
  }

  async function onRevert(oid: string) {
    const pathBefore = filePath;
    await gitLayer.checkout(featureId, oid);
    await refresh();
    try {
      const files = await vfs.listFiles(featureId);
      if (files.includes(pathBefore)) {
        const text = await vfs.readFile(featureId, pathBefore);
        setContents(text);
        setDiskSnapshot({ path: pathBefore, content: text });
      } else if (filePath === pathBefore) {
        setFilePath(DEFAULT_PATH);
        setContents("");
        setDiskSnapshot(null);
      }
    } catch (e) {
      const message = e instanceof Error ? `${e.message}\n${e.stack ?? ""}` : String(e);
      console.error("[DevPanel.onRevert reload]", e);
      setErr(message);
    }
  }

  async function onExport() {
    setExporting(true);
    setErr(null);
    try {
      const fileList = await vfs.listFiles(featureId);
      const files: Record<string, string> = {};
      for (const f of fileList) {
        if (f === "session.jsonl") continue;
        files[f] = await vfs.readFile(featureId, f);
      }

      if (files["manifest.json"]) {
        const manifest = JSON.parse(files["manifest.json"]);
        delete manifest.id;
        delete manifest.createdAt;
        delete manifest.updatedAt;
        delete manifest.source;
        files["manifest.json"] = JSON.stringify(manifest, null, 2);
      }

      if (!files["README.md"]) {
        const manifest = files["manifest.json"]
          ? JSON.parse(files["manifest.json"])
          : {};
        files["README.md"] = `# ${manifest.name ?? "Untitled Mod"}\n\n${manifest.description ?? ""}\n`;
      }

      const slug = featureName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || "mod";

      const parts: { name: string; data: Uint8Array }[] = [];
      for (const [name, content] of Object.entries(files)) {
        parts.push({ name: `${slug}/${name}`, data: new TextEncoder().encode(content) });
      }

      const blob = buildZip(parts);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${slug}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      const message = e instanceof Error ? `${e.message}\n${e.stack ?? ""}` : String(e);
      console.error("[DevPanel.onExport]", e);
      setErr(message);
    } finally {
      setExporting(false);
    }
  }

  async function onSaveMatches() {
    const patterns = matchesText
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    for (const p of patterns) {
      try {
        new RegExp(p);
      } catch (e) {
        const detail = e instanceof Error ? e.message : String(e);
        setErr(`Invalid regex: ${p}\n${detail}`);
        return;
      }
    }
    setErr(null);
    try {
      const manifest = await loadManifest();
      manifest.matches = patterns;
      manifest.updatedAt = new Date().toISOString();
      await writeFileAndCommit(
        featureId,
        "manifest.json",
        JSON.stringify(manifest, null, 2),
        "update URL matches",
      );
      await refresh();
      if (filePath === "manifest.json") {
        const text = await vfs.readFile(featureId, "manifest.json");
        setContents(text);
        setDiskSnapshot({ path: "manifest.json", content: text });
      }
    } catch (e) {
      const message = e instanceof Error ? `${e.message}\n${e.stack ?? ""}` : String(e);
      console.error("[DevPanel.onSaveMatches]", e);
      setErr(message);
    }
  }

  return (
    <div className="space-y-5">
      {vfsMissing && (
        <div className="rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <p className="font-medium">Feature data not found</p>
          <p className="mt-1 text-amber-600">
            This feature's files were lost (likely after an extension rebuild).
            You can delete it and create a new one.
          </p>
          <button
            type="button"
            onClick={async () => {
              await deleteFeatureFully(featureId);
              onDeleted?.();
            }}
            className="mt-2 rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-red-500 transition-colors"
          >
            Delete this feature
          </button>
        </div>
      )}
      {err && (
        <div className="whitespace-pre-wrap rounded-md bg-red-50 px-3 py-2 font-mono text-[13px] text-red-600">
          {err}
        </div>
      )}

      <section>
        <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-gray-500">
          URL matches
        </h2>
        <p className="mb-2 text-[13px] text-gray-500">
          One JavaScript regex per line, tested against{' '}
          <code className="font-mono text-gray-600">location.href</code>. Leave
          empty so the mod does not auto-apply.
        </p>
        <textarea
          value={matchesText}
          onChange={(e) => setMatchesText(e.target.value)}
          spellCheck={false}
          rows={4}
          placeholder={"^https://example\\.com/.*"}
          className="mb-2 w-full rounded-md border border-gray-200 bg-white p-2 font-mono text-[13px] shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
        />
        <button
          type="button"
          onClick={() => void onSaveMatches()}
          className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-emerald-500 transition-colors"
        >
          save matches
        </button>
      </section>

      {state && (
        <>
          <section>
            <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-gray-500">
              files
            </h2>
            <p className="mb-2 text-[13px] text-gray-500">
              Click a file to load it into the editor below.
            </p>
            <ul className="space-y-1 font-mono text-[13px]">
              {state.files.map((f) => {
                const loading = openLoadingPath === f;
                const selected = filePath === f && diskSnapshot?.path === f;
                return (
                  <li key={f} className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void onOpenFile(f)}
                      className={`min-w-0 flex-1 truncate rounded-md px-1 py-1 text-left font-mono transition-colors ${
                        loading ? "cursor-wait text-gray-500" : "hover:bg-gray-100"
                      } ${selected ? "bg-blue-50 ring-1 ring-blue-200" : ""}`}
                    >
                      {f}
                      {loading ? (
                        <span className="ml-2 text-gray-400">Loading…</span>
                      ) : null}
                    </button>
                    <IconButton
                      icon={TrashIcon}
                      onClick={() => void onDeleteFile(f)}
                      title="delete file"
                      variant="danger"
                      size="sm"
                    />
                  </li>
                );
              })}
            </ul>
          </section>

          <section>
            <h2 className="mb-2 flex flex-wrap items-baseline gap-x-2 text-[12px] font-semibold uppercase tracking-wider text-gray-500">
              <span>edit file</span>
              {dirty && (
                <span className="normal-case font-normal tracking-normal text-amber-700">
                  (unsaved changes)
                </span>
              )}
            </h2>
            <p className="mb-2 text-[13px] text-gray-500">
              Path is relative to the feature folder. Save writes to disk and creates a git
              commit.
            </p>
            <input
              value={filePath}
              onChange={(e) => setFilePath(e.target.value)}
              spellCheck={false}
              className="mb-2 w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 font-mono text-[13px] shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
            <textarea
              value={contents}
              onChange={(e) => setContents(e.target.value)}
              spellCheck={false}
              rows={12}
              className="mb-2 w-full rounded-md border border-gray-200 bg-white p-2 font-mono text-[13px] shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
            <button
              type="button"
              onClick={() => void onWrite()}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-blue-500 transition-colors"
            >
              write + commit
            </button>
          </section>

          <section>
            <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-gray-500">
              git log
            </h2>
            <ul className="space-y-1 font-mono text-[13px]">
              {state.commits.map((c) => (
                <li key={c.oid} className="flex items-center gap-2">
                  <span className="shrink-0 text-amber-600">{c.oid.slice(0, 7)}</span>
                  <span className="shrink-0 text-[11px] text-gray-500 tabular-nums">
                    {new Date(c.timestamp).toLocaleString(undefined, {
                      dateStyle: "short",
                      timeStyle: "medium",
                    })}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{c.message}</span>
                  <IconButton
                    icon={ArrowUturnLeftIcon}
                    onClick={() => void onRevert(c.oid)}
                    title="revert to here"
                    variant="warning"
                    size="sm"
                  />
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-gray-500">
              export for marketplace
            </h2>
            <p className="mb-2 text-[13px] text-gray-500">
              Download this mod as a zip, then add it to the{" "}
              <code className="font-mono text-gray-600">marketplace/</code> folder
              via a pull request on GitHub.
            </p>
            <button
              type="button"
              disabled={exporting}
              onClick={() => void onExport()}
              className="inline-flex items-center gap-1.5 rounded-md bg-violet-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-violet-500 transition-colors disabled:opacity-50"
            >
              <ArrowDownTrayIcon className="h-4 w-4" />
              {exporting ? "Exporting..." : "Export zip"}
            </button>
          </section>
        </>
      )}
    </div>
  );
}
