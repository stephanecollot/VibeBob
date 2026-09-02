#!/usr/bin/env node
/**
 * Regenerates marketplace/catalog.json. Writes nothing when the bytes are
 * unchanged, so callers can run it unconditionally and `git commit` only when
 * there is something to commit.
 *
 *   node .github/scripts/build-catalog.mjs [--check]
 *
 * --check exits 1 if the committed catalog is stale (used by CI).
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { buildCatalog, serializeCatalog, CATALOG_PATH } from "./lib/catalog.mjs";

const root = process.cwd();
const check = process.argv.includes("--check");
const path = join(root, CATALOG_PATH);

const next = serializeCatalog(buildCatalog(root));
const current = existsSync(path) ? readFileSync(path, "utf8") : null;

if (current === next) {
  console.log(`${CATALOG_PATH} is up to date`);
  process.exit(0);
}
if (check) {
  console.error(`${CATALOG_PATH} is stale — run: node .github/scripts/build-catalog.mjs`);
  process.exit(1);
}

writeFileSync(path, next);
const { mods, blocklist } = JSON.parse(next);
console.log(`wrote ${CATALOG_PATH}: ${mods.length} mods, ${blocklist.length} blocked`);
