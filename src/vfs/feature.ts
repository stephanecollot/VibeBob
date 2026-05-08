import { writeFile, deleteFile, mkFeatureDir, listFiles, readFile, deleteFeature } from "./index";
import { commitAll, initRepo } from "../git";
import type { FeatureId } from "../types";
import type { AppMessage } from "../types/messages";

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
    console.warn("[claudethis/vfs] feature.sync failed", err);
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
  const oid = await commitAll(id, message ?? `update ${path}`);
  await notifyFeatureChanged(id);
  return oid;
}

export async function deleteFileAndCommit(
  id: FeatureId,
  path: string,
  message?: string,
): Promise<string | null> {
  await deleteFile(id, path);
  const oid = await commitAll(id, message ?? `delete ${path}`);
  await notifyFeatureChanged(id);
  return oid;
}

export async function deleteFeatureFully(id: FeatureId): Promise<void> {
  await deleteFeature(id);
  await notifyFeatureChanged(id);
}
