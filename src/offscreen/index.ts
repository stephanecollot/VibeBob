import "../polyfills";
import { runTurn } from "../agent/loop";
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
console.log("[claudethis/offscreen] booted at", new Date().toISOString());

const inflight = new Map<FeatureId, AbortController>();

function send(featureId: FeatureId, event: AgentEvent): void {
  const msg: AppMessage = { type: "agent.event", target: "sidepanel", featureId, event };
  chrome.runtime.sendMessage(msg).catch((e) => {
    console.warn("[claudethis/offscreen] send failed", e);
  });
}

chrome.runtime.onMessage.addListener((raw: AppMessage, _sender, sendResponse) => {
  if (!raw || typeof raw !== "object" || raw.target !== "offscreen") return false;
  console.log("[claudethis/offscreen] received", raw.type);

  if (raw.type === "agent.startTurn") {
    const ctrl = new AbortController();
    inflight.get(raw.featureId)?.abort();
    inflight.set(raw.featureId, ctrl);

    (async () => {
      try {
        if (!raw.apiKey) throw new Error("no API key — open Settings and save");
        console.log("[claudethis/offscreen] starting turn", {
          model: raw.model,
          featureId: raw.featureId,
        });
        await runTurn({
          featureId: raw.featureId,
          userMessage: raw.userMessage,
          apiKey: raw.apiKey,
          model: raw.model,
          emit: (event) => send(raw.featureId, event),
          signal: ctrl.signal,
        });
        console.log("[claudethis/offscreen] turn complete");
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("[claudethis/offscreen] turn failed", err);
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
        console.error("[claudethis/offscreen] loadSession failed", err);
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
        console.error("[claudethis/offscreen] revert failed", err);
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
