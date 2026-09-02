/**
 * Decodes the mod bundle a submitter pasted into their issue.
 *
 * The human-readable form fields exist for the reviewer; the payload is the
 * authority. That keeps this parser from needing to understand issue-form
 * markdown beyond "find the base64 blob".
 */
import { gunzipSync, gzipSync } from "node:zlib";
import { createHash } from "node:crypto";

const FENCE = /```(?:[a-zA-Z]*)\n([\s\S]*?)```/g;
const BASE64_ONLY = /^[A-Za-z0-9+/=\s]+$/;

export class BundleError extends Error {}

/** The last base64-looking fenced block, else the longest base64 run in the body. */
export function extractPayload(body) {
  if (typeof body !== "string" || !body.trim()) throw new BundleError("the issue body is empty");

  const candidates = [];
  for (const m of body.matchAll(FENCE)) {
    const inner = m[1].trim();
    if (inner.length >= 100 && BASE64_ONLY.test(inner)) candidates.push(inner);
  }
  if (candidates.length > 0) return candidates[candidates.length - 1].replace(/\s+/g, "");

  const loose = body.match(/[A-Za-z0-9+/=]{100,}/g);
  if (loose) return loose.sort((a, b) => b.length - a.length)[0];

  throw new BundleError(
    "no bundle payload found in the issue body — publish from inside VibeBob, " +
      "or paste the payload VibeBob copied to your clipboard into the Bundle payload box",
  );
}

export function decodeBundle(payload) {
  let raw;
  try {
    raw = gunzipSync(Buffer.from(payload, "base64"));
  } catch (err) {
    throw new BundleError(
      `the bundle payload is corrupt or truncated (${err.message}) — republish from VibeBob`,
    );
  }
  let bundle;
  try {
    bundle = JSON.parse(raw.toString("utf8"));
  } catch (err) {
    throw new BundleError(`the bundle payload is not valid JSON (${err.message})`);
  }
  return bundle;
}

export function encodeBundle(bundle) {
  return gzipSync(Buffer.from(JSON.stringify(bundle), "utf8")).toString("base64");
}

/** Identifies the exact reviewed bytes, so an edit after review is detectable. */
export function payloadSha(payload) {
  return createHash("sha256").update(payload.replace(/\s+/g, ""), "utf8").digest("hex");
}
