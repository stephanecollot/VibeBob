import { useState } from "react";
import {
  ArrowDownTrayIcon,
  ArrowTopRightOnSquareIcon,
  ClipboardDocumentIcon,
  ExclamationTriangleIcon,
  PaperAirplaneIcon,
} from "@heroicons/react/20/solid";
import { planSubmission, openSubmission, type SubmitPlan } from "../marketplace/submit";
import type { FeatureId } from "../types";

interface Props {
  featureId: FeatureId;
  exporting: boolean;
  onExportZip: () => void;
}

/**
 * Publishing is a prefilled GitHub issue: no OAuth, no token, nothing stored.
 * The same checks the Action will run happen here first, so problems surface
 * before the submitter ever opens a tab.
 */
export function PublishMod({ featureId, exporting, onExportZip }: Props) {
  const [plan, setPlan] = useState<SubmitPlan | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [opened, setOpened] = useState<{ copied: boolean } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function onPrepare() {
    setPreparing(true);
    setErr(null);
    setOpened(null);
    try {
      setPlan(await planSubmission(featureId));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setPreparing(false);
    }
  }

  async function onOpen() {
    if (!plan) return;
    try {
      setOpened(await openSubmission(plan));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <section>
      <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-gray-500">
        publish to marketplace
      </h2>

      {!plan && (
        <>
          <p className="mb-2 text-[13px] text-gray-500">
            Share this mod so anyone can install it. It gets published under your GitHub
            username, and the source becomes public.
          </p>
          <button
            type="button"
            disabled={preparing}
            onClick={() => void onPrepare()}
            className="inline-flex items-center gap-1.5 rounded-md bg-violet-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-violet-500 disabled:opacity-50"
          >
            <PaperAirplaneIcon className="h-4 w-4" />
            {preparing ? "Checking..." : "Publish to marketplace"}
          </button>
        </>
      )}

      {err && (
        <div className="mt-2 rounded-md bg-red-50 px-3 py-2 text-[13px] text-red-600">{err}</div>
      )}

      {plan && (
        <div className="space-y-2.5">
          <div className="rounded-lg border border-gray-200/80 bg-white p-3 shadow-sm">
            <div className="flex items-baseline gap-2">
              <span className="min-w-0 flex-1 truncate font-semibold text-gray-900">
                {plan.bundle.manifest.name}
              </span>
              <span className="text-[11px] text-gray-400">v{plan.bundle.manifest.version}</span>
            </div>
            <p className="mt-0.5 font-mono text-[11px] text-gray-400">
              {plan.bundle.slug} · {Math.max(1, Math.round(plan.bytes.source / 1024))} KB ·{" "}
              {Object.keys(plan.bundle.files).join(", ")}
            </p>
          </div>

          {plan.problems.length > 0 && (
            <div className="rounded-md bg-red-50 p-3 ring-1 ring-red-200">
              <p className="text-[13px] font-semibold text-red-700">
                Fix these before publishing
              </p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[13px] text-red-600">
                {plan.problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          )}

          {plan.warnings.length > 0 && plan.problems.length === 0 && (
            <div className="rounded-md bg-amber-50 p-3 ring-1 ring-amber-200">
              <p className="flex items-center gap-1.5 text-[13px] font-semibold text-amber-800">
                <ExclamationTriangleIcon className="h-4 w-4" />
                Reviewers will see these
              </p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[13px] text-amber-700">
                {plan.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
              <p className="mt-1.5 text-[12px] text-amber-700">
                Not blocking — they are normal in plenty of honest mods.
              </p>
            </div>
          )}

          {plan.mode === "too-large" && (
            <div className="rounded-md bg-gray-50 p-3 ring-1 ring-gray-200">
              <p className="text-[13px] text-gray-600">
                This mod is too big to publish in one click. Export the zip and open a pull
                request against <code className="font-mono">marketplace/</code> instead.
              </p>
              <button
                type="button"
                disabled={exporting}
                onClick={onExportZip}
                className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-violet-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-violet-500 disabled:opacity-50"
              >
                <ArrowDownTrayIcon className="h-4 w-4" />
                {exporting ? "Exporting..." : "Export zip"}
              </button>
            </div>
          )}

          {plan.problems.length === 0 && plan.mode !== "too-large" && !opened && (
            <>
              <p className="text-[13px] text-gray-500">
                This opens a GitHub issue with everything filled in. Tick the two boxes and
                submit — the checks run within a minute and it publishes itself. You need a
                GitHub account.
              </p>
              <button
                type="button"
                onClick={() => void onOpen()}
                className="inline-flex items-center gap-1.5 rounded-md bg-violet-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-violet-500"
              >
                <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                Open the GitHub issue
              </button>
            </>
          )}

          {opened && (
            <div className="rounded-md bg-emerald-50 p-3 text-[13px] text-emerald-800 ring-1 ring-emerald-200">
              <p className="font-semibold">Opened GitHub in a new tab.</p>
              {plan.mode === "clipboard" ? (
                <p className="mt-1 flex items-start gap-1.5">
                  <ClipboardDocumentIcon className="mt-0.5 h-4 w-4 shrink-0" />
                  This mod is too big to fit in the link, so paste the payload
                  {opened.copied ? " (already on your clipboard)" : ""} into the{" "}
                  <strong>Bundle payload</strong> box before submitting.
                </p>
              ) : (
                <p className="mt-1">
                  Tick the two declaration boxes and hit <strong>Create</strong>. A bot replies
                  with the check results, and it goes live automatically.
                </p>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              setPlan(null);
              setOpened(null);
            }}
            className="text-[13px] text-gray-400 underline decoration-gray-300 hover:text-gray-600"
          >
            cancel
          </button>
        </div>
      )}
    </section>
  );
}
