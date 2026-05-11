import "../polyfills";
import { APIError } from "@anthropic-ai/sdk";
import { runContinueTurn, runTurn } from "../agent/loop";
import { loadSessionWithCommits } from "../agent/session";
import { registerBrowserTools } from "../agent/browserTools";
import { registerFsTools } from "../agent/fsTools";
import { registerRuntimeTools } from "../agent/runtimeTools";
import { branchWip, checkout, currentOid } from "../git";
import { deleteFileAndCommit } from "../vfs/feature";
import * as vfs from "../vfs";
import type { AppMessage, AgentEvent } from "../types/messages";
import type { FeatureId } from "../types";

registerBrowserTools();
registerFsTools();
registerRuntimeTools();
console.log("[vibebob/offscreen] booted at", new Date().toISOString());

const inflight = new Map<FeatureId, AbortController>();

function send(featureId: FeatureId, event: AgentEvent): void {
  const msg: AppMessage = { type: "agent.event", target: "sidepanel", featureId, event };
  chrome.runtime.sendMessage(msg).catch((e) => {
    console.warn("[vibebob/offscreen] send failed", e instanceof Error ? e.message : String(e));
  });
}

function formatAgentError(err: unknown): string {
  const fallback = err instanceof Error ? err.message : String(err);
  if (!(err instanceof APIError)) return fallback;
  const lower = fallback.toLowerCase();
  if (err.status === 400 && lower.includes("prompt is too long")) {
    return "The conversation hit the API input size limit. Try a new feature or a shorter thread.";
  }
  return fallback;
}

chrome.runtime.onMessage.addListener((raw: AppMessage, _sender, sendResponse) => {
  if (!raw || typeof raw !== "object" || raw.target !== "offscreen") return false;
  console.log("[vibebob/offscreen] received", raw.type);

  if (raw.type === "agent.startTurn") {
    const ctrl = new AbortController();
    inflight.get(raw.featureId)?.abort();
    inflight.set(raw.featureId, ctrl);

    (async () => {
      try {
        const { apiKey, screenshotEnabled: screenshotEnabledFromMsg } = raw;
        if (!apiKey) throw new Error("no API key — open Settings and save");
        console.log("[vibebob/offscreen] starting turn", {
          model: raw.model,
          featureId: raw.featureId,
          screenshotEnabled: screenshotEnabledFromMsg,
        });
        await runTurn({
          featureId: raw.featureId,
          userMessage: raw.userMessage,
          apiKey,
          model: raw.model,
          screenshotEnabled: screenshotEnabledFromMsg ?? true,
          emit: (event) => send(raw.featureId, event),
          signal: ctrl.signal,
        });
        console.log("[vibebob/offscreen] turn complete");
      } catch (err) {
        const message = formatAgentError(err);
        console.error("[vibebob/offscreen] turn failed", message);
        send(raw.featureId, { kind: "error", message });
      } finally {
        inflight.delete(raw.featureId);
      }
    })();
    sendResponse({ ok: true });
    return false;
  }

  if (raw.type === "agent.continueTurn") {
    const ctrl = new AbortController();
    inflight.get(raw.featureId)?.abort();
    inflight.set(raw.featureId, ctrl);

    (async () => {
      try {
        const { apiKey, screenshotEnabled: screenshotEnabledFromMsg } = raw;
        if (!apiKey) throw new Error("no API key — open Settings and save");
        console.log("[vibebob/offscreen] continuing turn", {
          model: raw.model,
          featureId: raw.featureId,
          screenshotEnabled: screenshotEnabledFromMsg,
        });
        await runContinueTurn({
          featureId: raw.featureId,
          apiKey,
          model: raw.model,
          screenshotEnabled: screenshotEnabledFromMsg ?? true,
          emit: (event) => send(raw.featureId, event),
          signal: ctrl.signal,
        });
        console.log("[vibebob/offscreen] continue complete");
      } catch (err) {
        const message = formatAgentError(err);
        console.error("[vibebob/offscreen] continue failed", message);
        send(raw.featureId, { kind: "error", message });
      } finally {
        inflight.delete(raw.featureId);
      }
    })();
    sendResponse({ ok: true });
    return false;
  }

  if (raw.type === "agent.cancelTurn") {
    inflight.get(raw.featureId)?.abort();
    sendResponse({ ok: true });
    return false;
  }

  if (raw.type === "agent.loadSession") {
    (async () => {
      try {
        const turns = await loadSessionWithCommits(raw.featureId);
        const reply: AppMessage = {
          type: "agent.session",
          target: "sidepanel",
          featureId: raw.featureId,
          turns,
        };
        chrome.runtime.sendMessage(reply).catch(() => {});
      } catch (err) {
        console.error("[vibebob/offscreen] loadSession failed", err instanceof Error ? err.message : String(err));
      }
    })();
    sendResponse({ ok: true });
    return false;
  }

  if (raw.type === "agent.revert") {
    (async () => {
      try {
        const head = await currentOid(raw.featureId);
        if (head && head !== raw.oid) {
          await branchWip(raw.featureId, head).catch(() => {});
        }
        await checkout(raw.featureId, raw.oid);
        const data = await vfs.listFiles(raw.featureId).then(
          async (files) => ({
            exists: true,
            manifestJson: files.includes("manifest.json")
              ? await vfs.readFile(raw.featureId, "manifest.json")
              : undefined,
            modJs: files.includes("mod.js")
              ? await vfs.readFile(raw.featureId, "mod.js")
              : undefined,
            modCss: files.includes("mod.css")
              ? await vfs.readFile(raw.featureId, "mod.css")
              : undefined,
          }),
        ).catch(() => ({ exists: false } as const));
        await chrome.runtime.sendMessage({
          target: "background",
          type: "feature.sync",
          featureId: raw.featureId,
          ...data,
        } satisfies AppMessage);
        const turns = await loadSessionWithCommits(raw.featureId);
        chrome.runtime
          .sendMessage({
            type: "agent.session",
            target: "sidepanel",
            featureId: raw.featureId,
            turns,
          } satisfies AppMessage)
          .catch(() => {});
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("[vibebob/offscreen] revert failed", err instanceof Error ? err.message : String(err));
        send(raw.featureId, { kind: "error", message });
      }
    })();
    sendResponse({ ok: true });
    return false;
  }

  return false;
});

// keep deleteFileAndCommit referenced so it's not tree-shaken
void deleteFileAndCommit;
