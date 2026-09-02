/**
 * The authoritative submission gate: the shared pure rules from
 * src/marketplace/rules.mjs, plus the checks that need Node (syntax compile,
 * repo state, blocklist).
 */
import vm from "node:vm";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { checkBundle, namespaceError, scanAdvisory, externalHosts } from "../../../src/marketplace/rules.mjs";
import { readBlocklist, sha256, MARKETPLACE_DIR } from "./catalog.mjs";

/**
 * Compile mod.js exactly the way src/background/bootstraps.ts does — strip
 * `export`, wrap in a function body — and never run it. Catches truncated
 * payloads and syntax errors, and proves the mod will actually load.
 */
export function compileCheck(modJs) {
  const stripped = String(modJs).replace(/^\s*export\s+/gm, "");
  try {
    new vm.Script(`(function () {\n${stripped}\n})`, { filename: "mod.js" });
    return null;
  } catch (err) {
    return `mod.js does not parse as it will be loaded: ${err.message}`;
  }
}

export function publishedVersion(root, modId) {
  const path = join(root, MARKETPLACE_DIR, modId, "manifest.json");
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")).version ?? null;
  } catch {
    return null;
  }
}

/** A blocked mod must not come back byte-identical under a fresh slug. */
export function blockedByHash(root, files) {
  const banned = new Set();
  for (const entry of readBlocklist(root)) {
    for (const h of entry.hashes ?? []) banned.add(h);
  }
  if (banned.size === 0) return null;
  for (const [name, content] of Object.entries(files ?? {})) {
    if (banned.has(sha256(Buffer.from(content, "utf8"))))
      return `${name} is byte-identical to a mod that was removed from the marketplace`;
  }
  return null;
}

export function blockedById(root, modId) {
  const entry = readBlocklist(root).find((b) => b.id === modId);
  return entry ? `${modId} was removed from the marketplace: ${entry.reason ?? "no reason given"}` : null;
}

/**
 * @param {{ bundle: object, namespace: string, root: string }} input
 * @returns {{ errors: string[], warnings: string[], modId: string, advisory: object }}
 */
export function runChecks({ bundle, namespace, root }) {
  const errors = [];
  const warnings = [];

  const nsErr = namespaceError(namespace);
  if (nsErr) errors.push(nsErr);

  const modId = `${namespace}/${bundle?.slug ?? "?"}`;
  const previousVersion = publishedVersion(root, modId);
  const shared = checkBundle(bundle, { previousVersion: previousVersion ?? undefined });
  errors.push(...shared.errors);
  warnings.push(...shared.warnings);

  if (typeof bundle?.files?.["mod.js"] === "string") {
    const compileErr = compileCheck(bundle.files["mod.js"]);
    if (compileErr) errors.push(compileErr);
  }

  const blockedHash = blockedByHash(root, bundle?.files);
  if (blockedHash) errors.push(blockedHash);
  const blockedId = blockedById(root, modId);
  if (blockedId) errors.push(blockedId);

  const advisory = {
    ...scanAdvisory(bundle?.files ?? {}),
    external: externalHosts(bundle?.files ?? {}, bundle?.manifest?.matches),
    previousVersion,
    isUpdate: previousVersion !== null,
  };

  return { errors, warnings, modId, advisory };
}
