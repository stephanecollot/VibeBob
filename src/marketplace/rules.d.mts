/** Types for rules.mjs — hand-written so TS can read the shared rule set without allowJs. */

export declare const ALLOWED_FILES: string[];
export declare const RESERVED_NAMESPACES: string[];
export declare const LIMITS: {
  "mod.js": number;
  "mod.css": number;
  "README.md": number;
  "manifest.json": number;
  total: number;
  matchPattern: number;
  matchCount: number;
  name: number;
  description: number;
};

export interface BundleManifest {
  name: string;
  description: string;
  matches: string[];
  entry?: string;
  styles?: string;
  version: string;
}

export interface SubmitBundle {
  schemaVersion: 1;
  slug: string;
  manifest: BundleManifest;
  files: Record<string, string>;
  meta?: { extensionVersion?: string; createdAt?: string };
}

export declare function slugError(slug: unknown): string | null;
export declare function namespaceError(
  namespace: unknown,
  opts?: { allowReserved?: boolean },
): string | null;
export declare function checkMatches(matches: unknown): { errors: string[]; tooBroad: string[] };
export declare function checkManifest(manifest: unknown): string[];
export declare function checkFiles(files: unknown): string[];
export declare function checkModSource(src: unknown): string[];
export declare function scanAdvisory(files: Record<string, string>): {
  risky: string[];
  hosts: string[];
};
export declare function externalHosts(files: Record<string, string>, matches: unknown): string[];
export declare function parseVersion(v: unknown): [number, number, number] | null;
export declare function compareVersions(a: unknown, b: unknown): -1 | 0 | 1 | null;
export declare function checkBundle(
  bundle: unknown,
  opts?: { previousVersion?: string },
): { errors: string[]; warnings: string[] };
export declare function byteLength(s: string): number;
