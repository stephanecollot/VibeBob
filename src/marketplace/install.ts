import { fetchModFiles, REPO } from "./catalog";
import { createFeature, writeFileAndCommit, deleteFileAndCommit } from "../vfs/feature";
import { listFiles, readFile } from "../vfs";
import type { CatalogMod, FeatureId, Manifest, MarketplaceSource } from "../types";

/** The downloaded bytes are not the bytes the catalog described. */
export class IntegrityError extends Error {
  constructor(file: string) {
    super(
      `${file} does not match what the marketplace listed. Refresh the marketplace and try again — ` +
        `nothing was installed.`,
    );
    this.name = "IntegrityError";
  }
}

function verify(mod: CatalogMod, hashes: Record<string, string>): void {
  for (const [name, hash] of Object.entries(hashes)) {
    if (mod.hashes[name] !== hash) throw new IntegrityError(name);
  }
}

function sourceFor(mod: CatalogMod, hashes: Record<string, string>): MarketplaceSource {
  return {
    github: REPO,
    path: mod.path,
    modId: mod.id,
    commit: mod.commit,
    version: mod.version,
    installedAt: new Date().toISOString(),
    hashes,
  };
}

function manifestFor(
  mod: CatalogMod,
  id: FeatureId,
  files: Record<string, string>,
  hashes: Record<string, string>,
  createdAt: string,
): Manifest {
  const remote = JSON.parse(files["manifest.json"]) as Partial<Manifest>;
  const now = new Date().toISOString();
  return {
    id,
    name: remote.name ?? mod.name,
    description: remote.description ?? mod.description,
    matches: remote.matches ?? mod.matches,
    entry: "mod.js",
    styles: files["mod.css"] ? "mod.css" : undefined,
    version: remote.version ?? mod.version,
    author: mod.author,
    createdAt,
    updatedAt: now,
    source: sourceFor(mod, hashes),
  };
}

/**
 * Downloads a mod from the commit the catalog pins, verifies every byte against
 * the catalog's hashes, and only then writes anything. A mismatch installs
 * nothing at all.
 */
export async function installFromCatalog(
  mod: CatalogMod,
  opts: { enable: boolean },
): Promise<FeatureId> {
  const { files, hashes } = await fetchModFiles(mod);
  verify(mod, hashes);

  const id = crypto.randomUUID();
  const manifest = manifestFor(mod, id, files, hashes, new Date().toISOString());

  await createFeature(id, { enabled: opts.enable });
  await writeFileAndCommit(id, "manifest.json", JSON.stringify(manifest, null, 2), "init manifest");
  await writeFileAndCommit(id, "mod.js", files["mod.js"], `install ${mod.id} v${mod.version}`);
  if (files["mod.css"]) await writeFileAndCommit(id, "mod.css", files["mod.css"], "init mod.css");
  return id;
}

/**
 * Updates in place, so the update lands as a commit in the feature's own git
 * repo and the dev panel's revert becomes the undo button.
 */
export async function updateInstalled(featureId: FeatureId, mod: CatalogMod): Promise<void> {
  const { files, hashes } = await fetchModFiles(mod);
  verify(mod, hashes);

  let createdAt = new Date().toISOString();
  try {
    createdAt = (JSON.parse(await readFile(featureId, "manifest.json")) as Manifest).createdAt ?? createdAt;
  } catch {
    // A missing or unreadable manifest is not a reason to refuse the update.
  }

  const manifest = manifestFor(mod, featureId, files, hashes, createdAt);
  const message = `update ${mod.id} to v${mod.version}`;

  await writeFileAndCommit(featureId, "mod.js", files["mod.js"], message);
  if (files["mod.css"]) {
    await writeFileAndCommit(featureId, "mod.css", files["mod.css"], message);
  } else if ((await listFiles(featureId)).includes("mod.css")) {
    await deleteFileAndCommit(featureId, "mod.css", message);
  }
  await writeFileAndCommit(featureId, "manifest.json", JSON.stringify(manifest, null, 2), message);
}
