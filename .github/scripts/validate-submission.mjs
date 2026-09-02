#!/usr/bin/env node
/**
 * Validates a mod submission issue and writes the review comment.
 *
 * Issue text arrives only through env vars — never interpolated into a shell
 * command by the workflow — because it is attacker-controlled by definition.
 *
 * env: ISSUE_BODY ISSUE_AUTHOR ISSUE_NUMBER [GITHUB_TOKEN] [GITHUB_OUTPUT]
 * out: report.md, .submission/<files>, and step outputs ok/gated/mod_id/payload_sha/version
 */
import { writeFileSync, mkdirSync, rmSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { extractPayload, decodeBundle, payloadSha, BundleError } from "./lib/bundle.mjs";
import { runChecks } from "./lib/checks.mjs";
import { checkAccountGate } from "./lib/gate.mjs";
import { renderReport, diffAgainstPublished } from "./lib/report.mjs";

const root = process.cwd();
const body = process.env.ISSUE_BODY ?? "";
const author = (process.env.ISSUE_AUTHOR ?? "").toLowerCase();
const token = process.env.GITHUB_TOKEN;

function setOutput(key, value) {
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
  console.log(`${key}=${value}`);
}

function fail(message) {
  writeFileSync(join(root, "report.md"), `### Checks failed\n\n${message}\n`);
  setOutput("ok", "false");
  setOutput("gated", "false");
  process.exit(0); // the workflow still needs to post the comment
}

let payload;
let bundle;
try {
  payload = extractPayload(body);
  bundle = decodeBundle(payload);
} catch (err) {
  if (err instanceof BundleError) fail(err.message);
  throw err;
}

const sha = payloadSha(payload);
const { errors, warnings, modId, advisory } = runChecks({ bundle, namespace: author, root });
const gate = errors.length === 0 ? await checkAccountGate(author, token) : { allowed: false, reason: "checks failed" };
const diff = advisory.isUpdate ? diffAgainstPublished(root, modId, bundle.files ?? {}) : null;

writeFileSync(
  join(root, "report.md"),
  renderReport({ modId, bundle, errors, warnings, advisory, gate, payloadSha: sha, diff, author }),
);

// Decoded source as a build artifact, so a reviewer can read it without
// trusting the rendered comment.
rmSync(join(root, ".submission"), { recursive: true, force: true });
mkdirSync(join(root, ".submission"), { recursive: true });
for (const [name, content] of Object.entries(bundle.files ?? {})) {
  if (typeof content === "string" && /^[\w.-]+$/.test(name))
    writeFileSync(join(root, ".submission", name), content);
}

setOutput("ok", String(errors.length === 0));
setOutput("gated", String(errors.length === 0 && !gate.allowed));
setOutput("mod_id", modId);
setOutput("payload_sha", sha);
setOutput("version", bundle?.manifest?.version ?? "");
