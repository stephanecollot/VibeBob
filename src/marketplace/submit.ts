import { listFiles, readFile } from "../vfs";
import { REPO } from "./catalog";
import { checkBundle, slugError, byteLength } from "./rules.mjs";
import type { SubmitBundle } from "./rules.mjs";
import type { FeatureId, Manifest } from "../types";

/**
 * Measured against github.com/…/issues/new: URLs up to ~6985 characters load,
 * ~7085 returns 500, and past ~8300 it is a 414. 6800 keeps a little headroom
 * below the cliff; anything longer takes the clipboard path instead.
 */
export const MAX_URL_LEN = 6800;
/** GitHub's issue body limit is 65536 characters. */
export const MAX_PAYLOAD_CHARS = 60000;

const ISSUE_URL = `https://github.com/${REPO}/issues/new`;

export interface SubmitPlan {
  bundle: SubmitBundle;
  payload: string;
  url: string;
  /** "prefill" fills every field; "clipboard" leaves the payload to be pasted. */
  mode: "prefill" | "clipboard" | "too-large";
  bytes: { source: number; payload: number; url: number };
  problems: string[];
  warnings: string[];
}

export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60)
      .replace(/-$/, "") || "mod"
  );
}

async function gzip(text: string): Promise<Uint8Array> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Chunked so a large mod does not blow the argument limit in String.fromCharCode. */
function toBase64(bytes: Uint8Array): string {
  const CHUNK = 8192;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/**
 * Reads the feature out of the VFS and strips everything local: the feature id,
 * timestamps, marketplace provenance, and the chat transcript. Publishing a mod
 * should not publish the conversation that produced it.
 */
export async function buildBundle(featureId: FeatureId): Promise<SubmitBundle> {
  const names = await listFiles(featureId);
  const files: Record<string, string> = {};
  for (const name of ["mod.js", "mod.css", "README.md"]) {
    if (names.includes(name)) files[name] = await readFile(featureId, name);
  }

  const manifest = JSON.parse(await readFile(featureId, "manifest.json")) as Manifest;
  const slug = slugify(manifest.name ?? "mod");

  const bundle: SubmitBundle = {
    schemaVersion: 1,
    slug,
    manifest: {
      name: manifest.name ?? slug,
      description: manifest.description ?? "",
      matches: manifest.matches ?? [],
      entry: "mod.js",
      version: manifest.version ?? "0.1.0",
      ...(files["mod.css"] ? { styles: "mod.css" } : {}),
    },
    files,
    meta: {
      extensionVersion: chrome.runtime.getManifest().version,
      createdAt: new Date().toISOString(),
    },
  };

  if (!files["README.md"]) {
    bundle.files["README.md"] = `# ${bundle.manifest.name}\n\n${bundle.manifest.description}\n`;
  }
  return bundle;
}

export async function encodePayload(bundle: SubmitBundle): Promise<string> {
  return toBase64(await gzip(JSON.stringify(bundle)));
}

function issueUrl(bundle: SubmitBundle, payload: string | null): string {
  const params = new URLSearchParams({
    template: "submit-mod.yml",
    title: `[mod] ${bundle.slug}`,
    "mod-name": bundle.manifest.name,
    "mod-slug": bundle.slug,
    "mod-description": bundle.manifest.description,
    "mod-matches": bundle.manifest.matches.join("\n"),
  });
  if (payload) params.set("payload", payload);
  return `${ISSUE_URL}?${params.toString()}`;
}

/**
 * Everything needed to decide how to open the submission, including the same
 * hard checks the Action runs — so a submitter sees a problem now rather than
 * 60 seconds after opening an issue.
 */
export async function planSubmission(featureId: FeatureId): Promise<SubmitPlan> {
  const bundle = await buildBundle(featureId);
  const payload = await encodePayload(bundle);
  const url = issueUrl(bundle, payload);

  const { errors, warnings } = checkBundle(bundle);
  const problems = [...errors];
  const slugErr = slugError(bundle.slug);
  if (slugErr) problems.push(slugErr);

  const source = Object.values(bundle.files).reduce((n, f) => n + byteLength(f), 0);
  const mode =
    payload.length > MAX_PAYLOAD_CHARS
      ? "too-large"
      : url.length > MAX_URL_LEN
        ? "clipboard"
        : "prefill";

  return {
    bundle,
    payload,
    url: mode === "clipboard" ? issueUrl(bundle, null) : url,
    mode,
    bytes: { source, payload: payload.length, url: url.length },
    problems,
    warnings,
  };
}

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Clipboard permission can be refused in the side panel; fall back.
    try {
      const el = document.createElement("textarea");
      el.value = text;
      el.style.position = "fixed";
      el.style.opacity = "0";
      document.body.appendChild(el);
      el.select();
      const ok = document.execCommand("copy");
      el.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

/**
 * Opens GitHub's own issue form with the submission filled in. The payload goes
 * to the clipboard first either way, so a mangled prefill is never a dead end.
 */
export async function openSubmission(plan: SubmitPlan): Promise<{ copied: boolean }> {
  const copied = await copy(plan.payload);
  await chrome.tabs.create({ url: plan.url });
  return { copied };
}
