/**
 * The single source of truth for marketplace submission rules.
 *
 * Imported by BOTH the extension (bundled by Vite, for instant client-side
 * feedback) and .github/scripts (for the authoritative server-side gate).
 * Keep it dependency-free and side-effect-free so both can use it: no fs, no
 * vm, no chrome.*, no DOM. Node-only checks (syntax compile) live in
 * .github/scripts/lib/checks.mjs instead.
 */

export const ALLOWED_FILES = ["manifest.json", "mod.js", "mod.css", "README.md"];

/** `official` is hand-committed only; the rest are shaped like GitHub logins. */
export const RESERVED_NAMESPACES = ["official", "vibebob", "admin", "support"];

export const LIMITS = {
  "mod.js": 128 * 1024,
  "mod.css": 64 * 1024,
  "README.md": 32 * 1024,
  "manifest.json": 8 * 1024,
  total: 256 * 1024,
  matchPattern: 200,
  matchCount: 20,
  name: 80,
  description: 300,
};

/**
 * Unrelated hosts used to detect over-broad match patterns. A pattern that
 * matches two or more of these is matching the whole web, not a site — which
 * is a different trust class than "this mod tweaks YouTube".
 */
const SENTINEL_URLS = [
  "https://example.com/",
  "https://bank.example.org/login",
  "http://intranet.test/page",
  "https://mail.google.com/mail/u/0",
  "https://github.com/octocat/hello",
];

/** Advisory only — surfaced to the reviewer, never used to reject. */
const RISKY_PATTERNS = [
  [/\beval\s*\(/, "calls eval()"],
  [/\bnew\s+Function\s*\(/, "builds code with new Function()"],
  [/\bfetch\s*\(/, "makes network requests with fetch()"],
  [/\bXMLHttpRequest\b/, "makes network requests with XMLHttpRequest"],
  [/\bsendBeacon\s*\(/, "sends data with navigator.sendBeacon()"],
  [/\bnew\s+WebSocket\b/, "opens a WebSocket"],
  [/\bdocument\s*\.\s*cookie\b/, "reads or writes document.cookie"],
  [/\blocalStorage\b|\bsessionStorage\b/, "uses browser storage"],
  [/\.innerHTML\s*=/, "assigns innerHTML"],
  [/\batob\s*\(|\bbtoa\s*\(/, "encodes or decodes base64"],
  [/\bconstructor\s*\[\s*["']constructor/, "reaches the Function constructor indirectly"],
];

const URL_LITERAL = /https?:\/\/([a-z0-9.-]+\.[a-z]{2,})(?:[/:?#][^\s"'`]*)?/gi;

export function slugError(slug) {
  if (typeof slug !== "string" || slug.length === 0) return "slug is required";
  if (slug.length > 60) return "slug must be 60 characters or fewer";
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))
    return `slug "${slug}" must be lowercase-with-dashes (letters, digits, single dashes)`;
  return null;
}

export function namespaceError(namespace, { allowReserved = false } = {}) {
  if (typeof namespace !== "string" || namespace.length === 0)
    return "namespace is required";
  if (!/^[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?$/.test(namespace))
    return `namespace "${namespace}" is not a valid GitHub login`;
  if (!allowReserved && RESERVED_NAMESPACES.includes(namespace))
    return `namespace "${namespace}" is reserved`;
  return null;
}

/** @returns {{ errors: string[], tooBroad: string[] }} */
export function checkMatches(matches) {
  const errors = [];
  const tooBroad = [];
  if (!Array.isArray(matches) || matches.length === 0) {
    errors.push("manifest.matches must be a non-empty array of URL regexes");
    return { errors, tooBroad };
  }
  if (matches.length > LIMITS.matchCount)
    errors.push(`too many match patterns (${matches.length} > ${LIMITS.matchCount})`);

  for (const p of matches) {
    if (typeof p !== "string" || p.length === 0) {
      errors.push("every match pattern must be a non-empty string");
      continue;
    }
    if (p.length > LIMITS.matchPattern) {
      errors.push(`match pattern is longer than ${LIMITS.matchPattern} characters`);
      continue;
    }
    let re;
    try {
      re = new RegExp(p);
    } catch (err) {
      errors.push(`match pattern ${JSON.stringify(p)} is not a valid regex: ${err.message}`);
      continue;
    }
    const hosts = new Set();
    for (const url of SENTINEL_URLS) {
      if (re.test(url)) hosts.add(new URL(url).hostname);
    }
    if (hosts.size > 1) {
      tooBroad.push(p);
      errors.push(
        `match pattern ${JSON.stringify(p)} matches unrelated sites ` +
          `(${[...hosts].join(", ")}) — scope it to the site your mod is for`,
      );
    }
  }
  return { errors, tooBroad };
}

export function checkManifest(manifest) {
  const errors = [];
  if (!manifest || typeof manifest !== "object") return ["manifest is missing"];

  if (typeof manifest.name !== "string" || !manifest.name.trim())
    errors.push("manifest.name is required");
  else if (manifest.name.length > LIMITS.name)
    errors.push(`manifest.name must be ${LIMITS.name} characters or fewer`);

  if (typeof manifest.description !== "string" || !manifest.description.trim())
    errors.push("manifest.description is required");
  else if (manifest.description.length > LIMITS.description)
    errors.push(`manifest.description must be ${LIMITS.description} characters or fewer`);

  if (manifest.entry !== undefined && manifest.entry !== "mod.js")
    errors.push('manifest.entry must be "mod.js"');
  if (manifest.styles !== undefined && manifest.styles !== "mod.css")
    errors.push('manifest.styles must be "mod.css" or omitted');
  if (parseVersion(manifest.version) === null)
    errors.push(`manifest.version ${JSON.stringify(manifest.version)} is not semver (e.g. 1.0.0)`);

  errors.push(...checkMatches(manifest.matches).errors);
  return errors;
}

export function checkFiles(files) {
  const errors = [];
  if (!files || typeof files !== "object") return ["bundle.files is missing"];

  let total = 0;
  for (const [name, content] of Object.entries(files)) {
    if (!ALLOWED_FILES.includes(name)) {
      errors.push(
        `file ${JSON.stringify(name)} is not allowed — only ${ALLOWED_FILES.join(", ")}`,
      );
      continue;
    }
    if (typeof content !== "string") {
      errors.push(`file ${name} must be a string`);
      continue;
    }
    const bytes = byteLength(content);
    total += bytes;
    const limit = LIMITS[name];
    if (limit && bytes > limit)
      errors.push(`${name} is ${bytes} bytes, over the ${limit} byte limit`);
  }
  if (!files["mod.js"]) errors.push("mod.js is required");
  if (total > LIMITS.total)
    errors.push(`bundle is ${total} bytes, over the ${LIMITS.total} byte limit`);
  return errors;
}

/**
 * Structural checks on mod.js. These are correctness checks against the loader
 * in src/background/bootstraps.ts, not a security scan — see scanAdvisory.
 */
export function checkModSource(src) {
  const errors = [];
  if (typeof src !== "string" || !src.trim()) return ["mod.js is empty"];

  const code = stripCommentsAndStrings(src);
  if (/^\s*import\s|[^.\w]import\s*\(/m.test(code))
    errors.push(
      "mod.js uses import — the loader inlines mod source into a function body, " +
        "so imports cannot resolve at runtime",
    );
  if (!/\bfunction\s+apply\b|\bapply\s*=/.test(code))
    errors.push("mod.js must define apply(ctx)");
  if (!/\bfunction\s+cleanup\b|\bcleanup\s*=/.test(code))
    errors.push("mod.js must define cleanup() to undo what apply() did");
  return errors;
}

/** @returns {{ risky: string[], hosts: string[] }} advisory signals for the reviewer. */
export function scanAdvisory(files) {
  const risky = [];
  const hosts = new Set();
  for (const name of ["mod.js", "mod.css"]) {
    const src = files?.[name];
    if (typeof src !== "string") continue;
    const code = name === "mod.js" ? stripComments(src) : src;
    for (const [re, label] of RISKY_PATTERNS) {
      if (re.test(code) && !risky.includes(label)) risky.push(label);
    }
    for (const m of src.matchAll(URL_LITERAL)) hosts.add(m[1].toLowerCase());
  }
  return { risky, hosts: [...hosts].sort() };
}

/** Hosts a mod contacts that are not sites it declares a match for. */
export function externalHosts(files, matches) {
  const { hosts } = scanAdvisory(files);
  const patterns = Array.isArray(matches) ? matches : [];
  return hosts.filter((host) => {
    for (const p of patterns) {
      try {
        if (new RegExp(p).test(`https://${host}/`)) return false;
      } catch {}
    }
    return true;
  });
}

export function parseVersion(v) {
  if (typeof v !== "string") return null;
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v.trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** @returns -1 | 0 | 1, or null when either side is not semver. */
export function compareVersions(a, b) {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (!pa || !pb) return null;
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1;
  }
  return 0;
}

/**
 * The full hard gate. Pure, so the side panel runs the identical rules before
 * opening the issue and the Action runs them again as the authority.
 * @returns {{ errors: string[], warnings: string[] }}
 */
export function checkBundle(bundle, opts = {}) {
  const errors = [];
  const warnings = [];

  if (!bundle || typeof bundle !== "object") return { errors: ["bundle is not an object"], warnings };
  if (bundle.schemaVersion !== 1)
    errors.push(`unsupported bundle schemaVersion ${JSON.stringify(bundle.schemaVersion)}`);

  const slugErr = slugError(bundle.slug);
  if (slugErr) errors.push(slugErr);

  errors.push(...checkManifest(bundle.manifest));
  errors.push(...checkFiles(bundle.files));
  if (typeof bundle.files?.["mod.js"] === "string")
    errors.push(...checkModSource(bundle.files["mod.js"]));

  const declaresStyles = bundle.manifest?.styles === "mod.css";
  if (declaresStyles && !bundle.files?.["mod.css"])
    errors.push('manifest declares styles: "mod.css" but no mod.css was included');
  if (!declaresStyles && bundle.files?.["mod.css"])
    warnings.push("mod.css was included but the manifest does not declare it — it will be ignored");

  if (opts.previousVersion) {
    const cmp = compareVersions(bundle.manifest?.version, opts.previousVersion);
    if (cmp !== null && cmp <= 0)
      errors.push(
        `version ${bundle.manifest.version} must be greater than the published ` +
          `${opts.previousVersion} — bump it and resubmit`,
      );
  }

  const { risky, hosts } = scanAdvisory(bundle.files ?? {});
  for (const r of risky) warnings.push(`mod.js ${r}`);
  const external = externalHosts(bundle.files ?? {}, bundle.manifest?.matches);
  for (const h of external) warnings.push(`references external host ${h}`);

  return { errors: errors.filter(Boolean), warnings };
}

export function byteLength(s) {
  return new TextEncoder().encode(s).length;
}

/** Crude but adequate: keeps scans from firing on words inside comments. */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
}

/** Also blanks string bodies, so `"import"` in a message doesn't trip checkModSource. */
function stripCommentsAndStrings(src) {
  return stripComments(src)
    .replace(/`(?:\\.|[^`\\])*`/g, '""')
    .replace(/'(?:\\.|[^'\\\n])*'/g, '""')
    .replace(/"(?:\\.|[^"\\\n])*"/g, '""');
}
