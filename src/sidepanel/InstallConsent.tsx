import { useState } from "react";
import {
  ArrowTopRightOnSquareIcon,
  ExclamationTriangleIcon,
  GlobeAltIcon,
} from "@heroicons/react/20/solid";
import { describeMatches } from "../marketplace/matches";
import { sourceUrl } from "../marketplace/catalog";
import type { CatalogMod } from "../types";

interface Props {
  mod: CatalogMod;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onInstall: (enable: boolean) => void;
}

function totalBytes(mod: CatalogMod): string {
  const bytes = Object.values(mod.sizeBytes ?? {}).reduce((a, b) => a + b, 0);
  return bytes >= 1024 ? `${Math.round(bytes / 1024)} KB` : `${bytes} bytes`;
}

/**
 * Shown before anything is written. Mods are published without human review, so
 * the honest thing to lead with is the blast radius: which sites this code will
 * run on. No badge here ever says "safe" or "verified".
 */
export function InstallConsent({ mod, busy, error, onCancel, onInstall }: Props) {
  const [enable, setEnable] = useState(true);
  const sites = describeMatches(mod.matches);
  const catchAll = sites.some((s) => s.catchAll);

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-gray-900/40 p-3 sm:items-center">
      <div className="max-h-full w-full overflow-y-auto rounded-xl bg-white p-4 shadow-xl">
        <div className="flex items-baseline gap-2">
          <h2 className="min-w-0 flex-1 truncate text-base font-semibold text-gray-900">
            {mod.name}
          </h2>
          <span className="shrink-0 text-[11px] text-gray-400">v{mod.version}</span>
        </div>
        <p className="mt-0.5 text-[13px] text-gray-500">{mod.description}</p>

        <p className="mt-1 text-[12px] text-gray-500">
          by{" "}
          <a
            href={`https://github.com/${mod.author}`}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-gray-700 underline decoration-gray-300 hover:text-emerald-700"
          >
            @{mod.author}
          </a>
          {mod.official ? (
            <span className="ml-1.5 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-emerald-200/70">
              official
            </span>
          ) : (
            <span className="ml-1.5 rounded-full bg-gray-100 px-1.5 py-0.5 text-[11px] font-medium text-gray-500">
              community
            </span>
          )}
        </p>

        <section
          className={`mt-3 rounded-lg p-3 ring-1 ${
            catchAll ? "bg-red-50 ring-red-200" : "bg-gray-50 ring-gray-200"
          }`}
        >
          <h3
            className={`flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wider ${
              catchAll ? "text-red-700" : "text-gray-500"
            }`}
          >
            {catchAll ? (
              <ExclamationTriangleIcon className="h-3.5 w-3.5" />
            ) : (
              <GlobeAltIcon className="h-3.5 w-3.5" />
            )}
            runs on
          </h3>
          <ul className="mt-1.5 space-y-1">
            {sites.map((s) => (
              <li key={s.pattern} className="text-[13px]">
                {s.catchAll ? (
                  <span className="font-semibold text-red-700">
                    Every website you visit
                  </span>
                ) : (
                  <span className="font-medium text-gray-800">{s.label}</span>
                )}
                <div className="truncate font-mono text-[11px] text-gray-400" title={s.pattern}>
                  {s.pattern}
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[12px] text-gray-500">
            It runs with the same access to those pages as the site itself, including anything
            you are signed into.
          </p>
        </section>

        <dl className="mt-3 space-y-1 text-[12px] text-gray-500">
          <div className="flex gap-2">
            <dt className="w-20 shrink-0 text-gray-400">contacts</dt>
            <dd>
              {mod.externalHosts.length === 0 ? (
                "no other hosts detected"
              ) : (
                <span className="font-mono text-amber-700">{mod.externalHosts.join(", ")}</span>
              )}
              <span className="text-gray-400"> · from a static scan, not a guarantee</span>
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-20 shrink-0 text-gray-400">size</dt>
            <dd>{totalBytes(mod)}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-20 shrink-0 text-gray-400">updated</dt>
            <dd>{mod.updatedAt ? mod.updatedAt.slice(0, 10) : "unknown"}</dd>
          </div>
        </dl>

        <a
          href={sourceUrl(mod)}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-flex items-center gap-1 text-[13px] font-medium text-emerald-700 hover:text-emerald-600"
        >
          Read the source before installing
          <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />
        </a>

        {error && (
          <div className="mt-3 rounded-md bg-red-50 px-3 py-2 text-[13px] text-red-600">{error}</div>
        )}

        <label className="mt-3 flex items-center gap-2 text-[13px] text-gray-600">
          <input
            type="checkbox"
            checked={enable}
            onChange={(e) => setEnable(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
          />
          Turn it on right away
        </label>

        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="flex-1 rounded-md border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onInstall(enable)}
            disabled={busy}
            className="flex-1 rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-500 disabled:opacity-50"
          >
            {busy ? "Installing..." : "Install"}
          </button>
        </div>
      </div>
    </div>
  );
}
