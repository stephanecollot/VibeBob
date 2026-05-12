import { writeFile, deleteFile, mkFeatureDir, listFiles, readFile, deleteFeature } from "./index";
import { commitAll, initRepo } from "../git";
import { removeFeatureScreenshotPreference } from "../runtime/featureStore";
import type { FeatureId, Manifest, MarketplaceMod } from "../types";
import type { AppMessage } from "../types/messages";
import { fetchModFiles, getMarketplacePath } from "../marketplace/github";

async function packFeature(id: FeatureId): Promise<{
  exists: boolean;
  manifestJson?: string;
  modJs?: string;
  modCss?: string;
}> {
  try {
    const files = await listFiles(id);
    let manifestJson: string | undefined;
    let modJs: string | undefined;
    let modCss: string | undefined;
    if (files.includes("manifest.json")) manifestJson = await readFile(id, "manifest.json");
    if (files.includes("mod.js")) modJs = await readFile(id, "mod.js");
    if (files.includes("mod.css")) modCss = await readFile(id, "mod.css");
    return { exists: true, manifestJson, modJs, modCss };
  } catch {
    return { exists: false };
  }
}

async function notifyFeatureChanged(id: FeatureId): Promise<void> {
  const data = await packFeature(id);
  const msg: AppMessage = {
    target: "background",
    type: "feature.sync",
    featureId: id,
    ...data,
  };
  try {
    await chrome.runtime.sendMessage(msg);
  } catch (err) {
    console.warn("[vibebob/vfs] feature.sync failed", err);
  }
}

export async function createFeature(id: FeatureId): Promise<void> {
  await mkFeatureDir(id);
  await initRepo(id);
  await notifyFeatureChanged(id);
}

export async function writeFileAndCommit(
  id: FeatureId,
  path: string,
  contents: string,
  message?: string,
): Promise<string | null> {
  await writeFile(id, path, contents);
  const oid = await commitAll(id, message ?? `write: ${path}`);
  await notifyFeatureChanged(id);
  return oid;
}

export async function deleteFileAndCommit(
  id: FeatureId,
  path: string,
  message?: string,
): Promise<string | null> {
  await deleteFile(id, path);
  const oid = await commitAll(id, message ?? `delete: ${path}`);
  await notifyFeatureChanged(id);
  return oid;
}

export async function deleteFeatureFully(id: FeatureId): Promise<void> {
  await deleteFeature(id);
  await removeFeatureScreenshotPreference(id);
  await notifyFeatureChanged(id);
}

export async function installFromMarketplace(
  mod: MarketplaceMod,
): Promise<FeatureId> {
  const id = crypto.randomUUID();
  const { modJs, modCss, manifestJson } = await fetchModFiles(mod);

  const now = new Date().toISOString();
  const remoteManifest = JSON.parse(manifestJson);
  const manifest: Manifest = {
    id,
    name: remoteManifest.name ?? mod.slug,
    description: remoteManifest.description ?? "",
    matches: remoteManifest.matches ?? [],
    entry: "mod.js",
    styles: modCss ? "mod.css" : undefined,
    version: remoteManifest.version ?? "0.0.1",
    author: remoteManifest.author,
    createdAt: now,
    updatedAt: now,
    source: {
      github: "stephanecollot/VibeBob",
      path: getMarketplacePath(mod),
    },
  };

  await mkFeatureDir(id);
  await initRepo(id);
  await writeFile(id, "manifest.json", JSON.stringify(manifest, null, 2));
  await writeFile(id, "mod.js", modJs);
  if (modCss) await writeFile(id, "mod.css", modCss);
  await commitAll(id, `install from marketplace: ${mod.namespace}/${mod.slug}`);
  await notifyFeatureChanged(id);
  return id;
}

export async function exportForPublish(
  featureId: FeatureId,
): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  const fileList = await listFiles(featureId);
  for (const f of fileList) {
    if (f === "session.jsonl") continue;
    files[f] = await readFile(featureId, f);
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

  return files;
}
