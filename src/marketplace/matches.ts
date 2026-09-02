import { checkMatches } from "./rules.mjs";

export interface MatchDescription {
  /** A human-readable site, e.g. "www.youtube.com". Falls back to the raw regex. */
  label: string;
  /** True when the pattern reaches unrelated sites — a different trust class. */
  catchAll: boolean;
  /** The original pattern, always shown somewhere so nothing is hidden. */
  pattern: string;
}

const SCHEME_PREFIXES = [
  /^\^?\(\?:https\?:\/\/\)\??/,
  /^\^?https\?:\/\//,
  /^\^?https:\/\//,
  /^\^?http:\/\//,
  /^\^/,
];

const OPTIONAL_WWW = /^\(\??:?www\\?\.\)\?/;

/** Longest leading run of literal characters, unescaping as it goes. */
function literalPrefix(pattern: string): string {
  let out = "";
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === "\\") {
      const next = pattern[i + 1];
      if (next === undefined) break;
      out += next;
      i++;
      continue;
    }
    if ("([{*+?|$.".includes(c)) break;
    out += c;
  }
  return out;
}

/**
 * Best-effort humanising for the install consent sheet. Never guesses: if the
 * pattern is not obviously a site, the raw regex is shown instead.
 */
export function describeMatch(pattern: string): MatchDescription {
  const catchAll = checkMatches([pattern]).tooBroad.length > 0;

  let rest = pattern;
  for (const re of SCHEME_PREFIXES) {
    const stripped = rest.replace(re, "");
    if (stripped !== rest) {
      rest = stripped;
      break;
    }
  }
  rest = rest.replace(OPTIONAL_WWW, "");

  const literal = literalPrefix(rest).replace(/[./-]+$/, "");
  const looksLikeHost = literal.length >= 4 && literal.includes(".");
  return { label: looksLikeHost ? literal : pattern, catchAll, pattern };
}

export function describeMatches(patterns: string[]): MatchDescription[] {
  return patterns.map(describeMatch);
}
