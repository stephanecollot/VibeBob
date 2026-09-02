import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { encodeBundle, extractPayload, decodeBundle, payloadSha, BundleError } from "../lib/bundle.mjs";
import { buildCatalog, serializeCatalog } from "../lib/catalog.mjs";
import { runChecks } from "../lib/checks.mjs";
import { checkAccountGate, GATE } from "../lib/gate.mjs";

const GOOD_JS = "export function apply(ctx) {}\nexport function cleanup() {}\n";

function makeRepo() {
  const root = mkdtempSync(join(tmpdir(), "vb-repo-"));
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: root });
  execFileSync("git", ["config", "user.email", "t@t.test"], { cwd: root });
  execFileSync("git", ["config", "user.name", "t"], { cwd: root });
  const dir = join(root, "marketplace", "octocat", "demo-mod");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "manifest.json"),
    JSON.stringify(
      { name: "Demo", description: "d", matches: ["^https://example\\.com/"], version: "1.0.0", entry: "mod.js", author: "octocat", issue: 7 },
      null,
      2,
    ) + "\n",
  );
  writeFileSync(join(dir, "mod.js"), GOOD_JS);
  writeFileSync(join(root, "marketplace", "blocklist.json"), '{\n  "blocked": []\n}\n');
  execFileSync("git", ["add", "-A"], { cwd: root });
  execFileSync("git", ["commit", "-qm", "seed"], { cwd: root });
  return root;
}

test("payload survives a round trip through an issue body", () => {
  const b = { schemaVersion: 1, slug: "demo-mod", manifest: {}, files: { "mod.js": GOOD_JS } };
  const payload = encodeBundle(b);
  const body = `Some prose\n\n\`\`\`text\n${payload}\n\`\`\`\n\nMore prose.`;
  assert.equal(decodeBundle(extractPayload(body)).slug, "demo-mod");
});

test("takes the last payload when an issue has several", () => {
  const a = encodeBundle({ schemaVersion: 1, slug: "first", files: { "mod.js": GOOD_JS } });
  const b = encodeBundle({ schemaVersion: 1, slug: "second", files: { "mod.js": GOOD_JS + "// v2\n" } });
  const body = `\`\`\`text\n${a}\n\`\`\`\n\nedited:\n\n\`\`\`text\n${b}\n\`\`\``;
  assert.equal(decodeBundle(extractPayload(body)).slug, "second");
});

test("a missing payload fails with an actionable message", () => {
  assert.throws(() => extractPayload("I would like to submit my mod please"), BundleError);
});

test("a truncated payload fails with an actionable message", () => {
  const payload = encodeBundle({ schemaVersion: 1, slug: "demo", files: { "mod.js": GOOD_JS } });
  assert.throws(() => decodeBundle(payload.slice(0, payload.length - 20)), /corrupt or truncated/);
});

test("payloadSha ignores whitespace GitHub may reflow", () => {
  const payload = encodeBundle({ schemaVersion: 1, slug: "demo", files: { "mod.js": GOOD_JS } });
  assert.equal(payloadSha(payload), payloadSha(payload.replace(/(.{40})/g, "$1\n")));
});

test("catalog generation is deterministic", () => {
  const root = makeRepo();
  try {
    assert.equal(serializeCatalog(buildCatalog(root)), serializeCatalog(buildCatalog(root)));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("catalog pins each mod to the commit that last touched it", () => {
  const root = makeRepo();
  try {
    const [mod] = buildCatalog(root).mods;
    assert.equal(mod.id, "octocat/demo-mod");
    assert.match(mod.commit, /^[0-9a-f]{40}$/);
    assert.match(mod.hashes["mod.js"], /^[0-9a-f]{64}$/);
    assert.equal(mod.issue, 7);
    assert.equal(mod.official, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("blocked mods leave the catalog but stay on disk", () => {
  const root = makeRepo();
  try {
    execFileSync(process.execPath, [join(process.cwd(), ".github/scripts/takedown.mjs")], {
      cwd: root,
      env: { ...process.env, MOD_ID: "octocat/demo-mod", REASON: "test", SEVERITY: "critical" },
    });
    const catalog = buildCatalog(root);
    assert.deepEqual(catalog.mods, []);
    assert.equal(catalog.blocklist[0].id, "octocat/demo-mod");
    assert.equal(catalog.blocklist[0].severity, "critical");
    assert.ok(catalog.blocklist[0].hashes.length > 0);
    assert.ok(readFileSync(join(root, "marketplace/octocat/demo-mod/mod.js"), "utf8"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a blocked mod cannot be resubmitted byte-identical under a new slug", () => {
  const root = makeRepo();
  try {
    execFileSync(process.execPath, [join(process.cwd(), ".github/scripts/takedown.mjs")], {
      cwd: root,
      env: { ...process.env, MOD_ID: "octocat/demo-mod", REASON: "test" },
    });
    const { errors } = runChecks({
      bundle: {
        schemaVersion: 1,
        slug: "innocent-name",
        manifest: { name: "N", description: "d", matches: ["^https://example\\.com/"], version: "1.0.0" },
        files: { "mod.js": GOOD_JS },
      },
      namespace: "someoneelse",
      root,
    });
    assert.match(errors.join(" | "), /byte-identical to a mod that was removed/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("re-publishing without a version bump is refused", () => {
  const root = makeRepo();
  try {
    const { errors } = runChecks({
      bundle: {
        schemaVersion: 1,
        slug: "demo-mod",
        manifest: { name: "Demo", description: "d", matches: ["^https://example\\.com/"], version: "1.0.0" },
        files: { "mod.js": GOOD_JS + "// changed\n" },
      },
      namespace: "octocat",
      root,
    });
    assert.match(errors.join(" | "), /must be greater than the published 1.0.0/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the account gate holds new accounts and passes established ones", async () => {
  const realFetch = globalThis.fetch;
  const at = (days) => new Date(Date.now() - days * 86400000).toISOString();
  try {
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ created_at: at(3) }) });
    const young = await checkAccountGate("newbie");
    assert.equal(young.allowed, false);
    assert.match(young.reason, new RegExp(`${GATE.minAccountAgeDays}\\+`));

    globalThis.fetch = async () => ({ ok: true, json: async () => ({ created_at: at(400) }) });
    assert.equal((await checkAccountGate("veteran")).allowed, true);

    // A GitHub outage must not silently freeze publishing.
    globalThis.fetch = async () => ({ ok: false, status: 503, json: async () => ({}) });
    assert.equal((await checkAccountGate("anyone")).allowed, true);
  } finally {
    globalThis.fetch = realFetch;
  }
});
