/** Renders the bot comments. These are the moderation UI — optimise for skimming. */
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MARKETPLACE_DIR } from "./catalog.mjs";

const MAX_PREVIEW = 12000;

function fence(lang, body) {
  return "```" + lang + "\n" + body.replace(/```/g, "`​``") + "\n```";
}

function list(items) {
  return items.map((i) => `- ${i}`).join("\n");
}

/** Unified diff against what is currently published — the highest-value review aid. */
export function diffAgainstPublished(root, modId, files) {
  const dir = join(root, MARKETPLACE_DIR, modId);
  if (!existsSync(dir)) return null;
  const tmp = mkdtempSync(join(tmpdir(), "vb-diff-"));
  const out = [];
  for (const name of ["mod.js", "mod.css", "manifest.json"]) {
    const oldPath = join(dir, name);
    if (!existsSync(oldPath) && !files[name]) continue;
    const a = join(tmp, `old-${name}`);
    const b = join(tmp, `new-${name}`);
    writeFileSync(a, existsSync(oldPath) ? readFileSync(oldPath, "utf8") : "");
    writeFileSync(b, files[name] ?? "");
    try {
      execFileSync("diff", ["-u", "--label", `published/${name}`, "--label", `submitted/${name}`, a, b], {
        encoding: "utf8",
      });
    } catch (err) {
      if (err.stdout) out.push(err.stdout.trim());
    }
  }
  return out.length ? out.join("\n\n") : null;
}

export function renderReport({ modId, bundle, errors, warnings, advisory, gate, payloadSha, diff, author }) {
  const ok = errors.length === 0;
  const lines = [];

  lines.push(ok ? `### Checks passed — \`${modId}\`` : `### Checks failed — \`${modId}\``);
  lines.push("");
  lines.push(
    `**${bundle?.manifest?.name ?? "?"}** v${bundle?.manifest?.version ?? "?"} by @${author}` +
      (advisory?.isUpdate ? ` — update from v${advisory.previousVersion}` : " — new mod"),
  );
  lines.push("");

  if (!ok) {
    lines.push("**Fix these, then edit this issue (the checks re-run automatically):**");
    lines.push(list(errors));
    lines.push("");
  }

  lines.push("**Runs on**");
  lines.push(fence("text", (bundle?.manifest?.matches ?? []).join("\n") || "(none declared)"));

  if (advisory?.risky?.length || advisory?.external?.length) {
    lines.push("**Worth a look** (advisory — these are normal in plenty of honest mods)");
    lines.push(
      list([
        ...(advisory.risky ?? []).map((r) => `mod.js ${r}`),
        ...(advisory.external ?? []).map((h) => `references \`${h}\`, which is not a site it declares`),
      ]),
    );
    lines.push("");
  }

  if (warnings.length) {
    lines.push("**Warnings**");
    lines.push(list(warnings));
    lines.push("");
  }

  if (gate && !gate.allowed) {
    lines.push(`> **Held for review** — ${gate.reason}.`);
    lines.push("> A maintainer will take a look. Nothing else is needed from you.");
    lines.push("");
  }

  if (diff) {
    lines.push("<details><summary>Diff against the published version</summary>\n");
    lines.push(fence("diff", diff.slice(0, MAX_PREVIEW)));
    lines.push("\n</details>");
    lines.push("");
  }

  for (const name of ["mod.js", "mod.css"]) {
    const src = bundle?.files?.[name];
    if (!src) continue;
    const clipped = src.length > MAX_PREVIEW ? src.slice(0, MAX_PREVIEW) + "\n… truncated" : src;
    lines.push(`<details><summary>${name} (${src.length} bytes)</summary>\n`);
    lines.push(fence(name.endsWith(".css") ? "css" : "js", clipped));
    lines.push("\n</details>");
    lines.push("");
  }

  lines.push("---");
  lines.push(`payload sha256: \`${payloadSha}\``);
  lines.push(
    "<sub>Automated checks are mechanical, not a safety review. Mods run with full access " +
      "to the pages they match.</sub>",
  );
  return lines.join("\n");
}

export function renderPublished({ modId, version, repo }) {
  return [
    `### Published — \`${modId}\` v${version}`,
    "",
    "It's live in the marketplace. It shows up in the extension within about 5 minutes,",
    "or immediately if you hit refresh in the Marketplace tab.",
    "",
    `Source: [\`${MARKETPLACE_DIR}/${modId}\`](https://github.com/${repo}/tree/main/${MARKETPLACE_DIR}/${modId})`,
    "",
    "To ship an update: bump `version` in VibeBob and publish again.",
  ].join("\n");
}
