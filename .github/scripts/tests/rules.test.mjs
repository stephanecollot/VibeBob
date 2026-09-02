import test from "node:test";
import assert from "node:assert/strict";
import {
  checkBundle,
  checkMatches,
  compareVersions,
  slugError,
  namespaceError,
  externalHosts,
} from "../../../src/marketplace/rules.mjs";
import { compileCheck } from "../lib/checks.mjs";

const GOOD_JS = `export function apply(ctx) {
  const el = document.createElement("div");
  el.className = ctx.scope;
  document.body.appendChild(el);
  ctx.onCleanup(() => el.remove());
}
export function cleanup() {}
`;

function bundle(overrides = {}) {
  const base = {
    schemaVersion: 1,
    slug: "demo-mod",
    manifest: {
      name: "Demo",
      description: "A demo mod.",
      matches: ["^https://www\\.youtube\\.com/"],
      entry: "mod.js",
      version: "1.0.0",
    },
    files: { "mod.js": GOOD_JS },
  };
  return {
    ...base,
    ...overrides,
    manifest: { ...base.manifest, ...(overrides.manifest ?? {}) },
    files: { ...base.files, ...(overrides.files ?? {}) },
  };
}

const errorsOf = (b, opts) => checkBundle(b, opts).errors.join(" | ");

test("a well-formed bundle passes with no errors", () => {
  const { errors } = checkBundle(bundle());
  assert.deepEqual(errors, []);
});

test("rejects mod.js that uses import", () => {
  const b = bundle({ files: { "mod.js": `import x from "y";\n${GOOD_JS}` } });
  assert.match(errorsOf(b), /uses import/);
});

test("a string containing the word import is not an import", () => {
  const b = bundle({ files: { "mod.js": `const msg = "import me";\n${GOOD_JS}` } });
  assert.deepEqual(checkBundle(b).errors, []);
});

test("requires cleanup()", () => {
  const b = bundle({ files: { "mod.js": "export function apply(ctx) {}\n" } });
  assert.match(errorsOf(b), /must define cleanup/);
});

test("rejects an oversized mod.js", () => {
  const b = bundle({ files: { "mod.js": GOOD_JS + "//" + "x".repeat(200 * 1024) } });
  assert.match(errorsOf(b), /over the 131072 byte limit/);
});

test("rejects files outside the allowlist, including path traversal", () => {
  const b = bundle({ files: { "../../.github/workflows/evil.yml": "on: push" } });
  assert.match(errorsOf(b), /is not allowed/);
});

test("rejects catch-all match patterns", () => {
  const b = bundle({ manifest: { matches: ["^https?://.*"] } });
  assert.match(errorsOf(b), /matches unrelated sites/);
});

test("a site-wide pattern for one host is fine", () => {
  const { errors } = checkBundle(bundle({ manifest: { matches: ["^https://.*\\.google\\.com/"] } }));
  assert.deepEqual(errors, []);
});

test("rejects an invalid regex", () => {
  assert.match(checkMatches(["^https://("]).errors.join(" "), /not a valid regex/);
});

test("requires the version to be bumped past what is published", () => {
  const b = bundle({ manifest: { version: "1.0.0" } });
  assert.match(errorsOf(b, { previousVersion: "1.0.0" }), /must be greater than the published/);
  assert.match(errorsOf(b, { previousVersion: "1.1.0" }), /must be greater than the published/);
  assert.deepEqual(checkBundle(bundle({ manifest: { version: "1.0.1" } }), { previousVersion: "1.0.0" }).errors, []);
});

test("rejects a non-semver version", () => {
  assert.match(errorsOf(bundle({ manifest: { version: "v1" } })), /is not semver/);
});

test("requires mod.css when the manifest declares styles", () => {
  assert.match(errorsOf(bundle({ manifest: { styles: "mod.css" } })), /no mod.css was included/);
});

test("compile check mirrors the loader and catches syntax errors", () => {
  assert.equal(compileCheck(GOOD_JS), null);
  assert.match(compileCheck("export function apply({"), /does not parse/);
});

test("slug and namespace shapes", () => {
  assert.equal(slugError("hide-youtube-shorts"), null);
  assert.match(slugError("Hide Shorts"), /lowercase-with-dashes/);
  assert.equal(namespaceError("octocat"), null);
  assert.match(namespaceError("official"), /reserved/);
});

test("compareVersions orders semver and rejects junk", () => {
  assert.equal(compareVersions("1.0.0", "1.0.1"), -1);
  assert.equal(compareVersions("1.2.0", "1.10.0"), -1);
  assert.equal(compareVersions("2.0.0", "2.0.0"), 0);
  assert.equal(compareVersions("nope", "1.0.0"), null);
});

test("externalHosts only reports hosts the mod does not declare", () => {
  const files = { "mod.js": 'fetch("https://evil.example/x"); img.src="https://www.youtube.com/y";' };
  assert.deepEqual(externalHosts(files, ["^https://www\\.youtube\\.com/"]), ["evil.example"]);
});

test("risky API use is a warning, never an error", () => {
  const b = bundle({ files: { "mod.js": `${GOOD_JS}\nfetch("https://api.example.com/x");` } });
  const { errors, warnings } = checkBundle(b);
  assert.deepEqual(errors, []);
  assert.match(warnings.join(" | "), /makes network requests with fetch/);
});
