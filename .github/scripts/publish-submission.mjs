#!/usr/bin/env node
/**
 * Commits a validated submission into marketplace/<namespace>/<slug>/.
 *
 * Re-validates from scratch rather than trusting the earlier validate job: the
 * issue may have been edited in between. On the owner-approved path it also
 * refuses when the payload no longer matches the one the owner reviewed.
 *
 * env: ISSUE_BODY ISSUE_AUTHOR ISSUE_NUMBER REPO [APPROVED_PATH] [GITHUB_TOKEN]
 * out: marketplace files, published.md, step outputs mod_id/namespace/slug/version
 */
import { writeFileSync, mkdirSync, appendFileSync, rmSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { extractPayload, decodeBundle, payloadSha } from "./lib/bundle.mjs";
import { runChecks } from "./lib/checks.mjs";
import { githubJson } from "./lib/gate.mjs";
import { renderPublished } from "./lib/report.mjs";
import { MARKETPLACE_DIR } from "./lib/catalog.mjs";
import { ALLOWED_FILES } from "../../src/marketplace/rules.mjs";

const root = process.cwd();
const body = process.env.ISSUE_BODY ?? "";
const author = (process.env.ISSUE_AUTHOR ?? "").toLowerCase();
const issueNumber = Number(process.env.ISSUE_NUMBER);
const repo = process.env.REPO ?? "stephanecollot/VibeBob";
const token = process.env.GITHUB_TOKEN;

function setOutput(key, value) {
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
  console.log(`${key}=${value}`);
}

function die(message) {
  console.error(`::error::${message}`);
  writeFileSync(join(root, "published.md"), `### Not published\n\n${message}\n`);
  process.exit(1);
}

const payload = extractPayload(body);
const bundle = decodeBundle(payload);
const sha = payloadSha(payload);

// TOCTOU guard: an approval applies to the bytes the owner read, not to
// whatever the issue says now.
if (process.env.APPROVED_PATH === "true") {
  let reviewed = null;
  try {
    const comments = await githubJson(`/repos/${repo}/issues/${issueNumber}/comments?per_page=100`, token);
    for (const c of comments) {
      const m = /payload sha256: `([0-9a-f]{64})`/.exec(c.body ?? "");
      if (m) reviewed = m[1];
    }
  } catch (err) {
    die(`could not read the review comments to verify the payload (${err.message})`);
  }
  if (reviewed && reviewed !== sha)
    die(
      "this issue was edited after it was reviewed — the payload no longer matches. " +
        "Remove and re-add the `approved` label once you have read the current version.",
    );
}

const { errors, modId } = runChecks({ bundle, namespace: author, root });
if (errors.length) die(`re-validation failed:\n- ${errors.join("\n- ")}`);

const dir = join(root, MARKETPLACE_DIR, author, bundle.slug);
// Replace wholesale so a file dropped from an update does not linger.
if (existsSync(dir)) {
  for (const f of readdirSync(dir)) rmSync(join(dir, f), { recursive: true, force: true });
}
mkdirSync(dir, { recursive: true });

const manifest = {
  name: bundle.manifest.name,
  description: bundle.manifest.description,
  matches: bundle.manifest.matches,
  version: bundle.manifest.version,
  entry: "mod.js",
  ...(bundle.files["mod.css"] && bundle.manifest.styles === "mod.css" ? { styles: "mod.css" } : {}),
  author,
  issue: issueNumber,
};
writeFileSync(join(dir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");

for (const name of ALLOWED_FILES) {
  if (name === "manifest.json") continue;
  const content = bundle.files[name];
  if (typeof content === "string") writeFileSync(join(dir, name), content);
}
if (!bundle.files["README.md"]) {
  writeFileSync(
    join(dir, "README.md"),
    `# ${manifest.name}\n\n${manifest.description}\n\nBy [@${author}](https://github.com/${author}).\n`,
  );
}

writeFileSync(join(root, "published.md"), renderPublished({ modId, version: manifest.version, repo }));

setOutput("mod_id", modId);
setOutput("namespace", author);
setOutput("slug", bundle.slug);
setOutput("version", manifest.version);
