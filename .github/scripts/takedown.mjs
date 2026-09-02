#!/usr/bin/env node
/**
 * Blocks or unblocks a mod.
 *
 * Blocking removes it from the catalog AND force-disables it on every machine
 * that already installed it (the extension enforces catalog.blocklist in its
 * service worker). Files stay in the repo, so this is a reversible toggle.
 *
 * env: MOD_ID [REASON] [SEVERITY=critical|warn] [MODE=block|unblock]
 */
import { readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { sha256, readBlocklist, BLOCKLIST_PATH, MARKETPLACE_DIR } from "./lib/catalog.mjs";
import { ALLOWED_FILES } from "../../src/marketplace/rules.mjs";

const root = process.cwd();
const modId = (process.env.MOD_ID ?? "").trim();
const mode = (process.env.MODE ?? "block").trim();
const severity = (process.env.SEVERITY ?? "critical").trim();
const reason = (process.env.REASON ?? "").trim() || "Removed by the maintainer.";

if (!/^[a-z0-9-]+\/[a-z0-9-]+$/.test(modId)) {
  console.error(`::error::MOD_ID must look like "namespace/slug", got ${JSON.stringify(modId)}`);
  process.exit(1);
}
if (!["critical", "warn"].includes(severity)) {
  console.error(`::error::SEVERITY must be "critical" or "warn", got ${JSON.stringify(severity)}`);
  process.exit(1);
}

const blocked = readBlocklist(root);
const existing = blocked.findIndex((b) => b.id === modId);

if (mode === "unblock") {
  if (existing === -1) {
    console.log(`${modId} is not blocked — nothing to do`);
    process.exit(0);
  }
  blocked.splice(existing, 1);
  console.log(`unblocked ${modId}`);
} else {
  // Hash the current files so a byte-identical re-upload under a new slug is
  // rejected at submission time.
  const dir = join(root, MARKETPLACE_DIR, modId);
  const hashes = [];
  for (const name of ALLOWED_FILES) {
    const p = join(dir, name);
    if (existsSync(p) && statSync(p).isFile()) hashes.push(sha256(readFileSync(p)));
  }
  if (hashes.length === 0)
    console.log(`::warning::no files found at ${MARKETPLACE_DIR}/${modId} — blocking by id only`);

  const entry = {
    id: modId,
    reason,
    severity,
    addedAt: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    hashes,
  };
  if (existing === -1) blocked.push(entry);
  else blocked[existing] = { ...blocked[existing], ...entry, addedAt: blocked[existing].addedAt };
  console.log(`blocked ${modId} (${severity}): ${reason}`);
}

blocked.sort((a, b) => String(a.id).localeCompare(String(b.id)));
writeFileSync(join(root, BLOCKLIST_PATH), JSON.stringify({ blocked }, null, 2) + "\n");
