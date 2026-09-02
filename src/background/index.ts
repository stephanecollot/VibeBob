import { ensureOffscreen } from "./offscreenManager";
import { applyBootstrap, unapplyBootstrap } from "./bootstraps";
import { evaluateJsMain } from "./evaluateJsMain";
import { attachRouter } from "./router";
import { applySyncMessage } from "../runtime/featureStore";
import { TAB_NOT_VISIBLE, type AppMessage } from "../types/messages";

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((err) => console.error("[vibebob] sidePanel.setPanelBehavior", err));
});

attachRouter();

async function activeTab(): Promise<chrome.tabs.Tab> {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab?.id) throw new Error("no active tab — focus a tab and try again");
  return tab;
}

/** The tab a run was pinned to, or the active one for calls that carry no tab. */
async function targetTab(tabId: number | undefined): Promise<chrome.tabs.Tab> {
  if (tabId == null) return activeTab();
  try {
    return await chrome.tabs.get(tabId);
  } catch {
    throw new Error(
      `the tab this run started on is gone (id ${tabId}) — reopen the page and send your message again`,
    );
  }
}

function assertInjectablePage(url: string | undefined): void {
  if (
    !url ||
    url.startsWith("chrome://") ||
    url.startsWith("edge://") ||
    url.startsWith("about:") ||
    url.startsWith("chrome-extension://") ||
    url.startsWith("https://chrome.google.com/webstore") ||
    url.startsWith("https://chromewebstore.google.com")
  ) {
    throw new Error(
      `content scripts cannot run on this page (${url ?? "unknown"}). ` +
        `Navigate to a regular http(s) page and try again.`,
    );
  }
}

async function ensureContentScript(tabId: number, url: string | undefined): Promise<void> {
  assertInjectablePage(url);
  const cs = chrome.runtime.getManifest().content_scripts?.[0];
  const files = cs?.js ?? [];
  if (files.length === 0) throw new Error("no content script files in manifest");
  await chrome.scripting.executeScript({ target: { tabId }, files });
}

async function sendToContent(
  tab: chrome.tabs.Tab,
  payload: AppMessage,
): Promise<unknown> {
  try {
    return await chrome.tabs.sendMessage(tab.id!, payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!message.includes("Receiving end does not exist")) throw err;
    await ensureContentScript(tab.id!, tab.url);
    return chrome.tabs.sendMessage(tab.id!, payload);
  }
}


async function applyMod(
  tab: chrome.tabs.Tab,
  input: { featureId: string; modJs: string; modCss?: string },
): Promise<{ ok: true; scope: string }> {
  const scope = `ct-${input.featureId.slice(0, 8)}`;
  await sendToContent(tab, {
    target: "content",
    type: "content.tool",
    tool: "_track_apply",
    input: { featureId: input.featureId },
  } satisfies AppMessage);
  const [result] = await chrome.scripting.executeScript({
    target: { tabId: tab.id! },
    world: "MAIN",
    injectImmediately: true,
    func: applyBootstrap,
    args: [input.featureId, scope, input.modJs, input.modCss ?? ""],
  });
  if (!result || (result.result as { ok?: boolean })?.ok !== true) {
    throw new Error("apply_mod bootstrap returned no result");
  }
  return result.result as { ok: true; scope: string };
}

async function unapplyMod(
  tab: chrome.tabs.Tab,
  input: { featureId: string },
): Promise<{ ok: true }> {
  await chrome.scripting.executeScript({
    target: { tabId: tab.id! },
    world: "MAIN",
    injectImmediately: true,
    func: unapplyBootstrap,
    args: [input.featureId],
  });
  return { ok: true };
}

const CAPTURE_PAINT_MS = 150;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * captureVisibleTab can only photograph a window's visible tab. When the user has tabbed
 * away from a pinned run, briefly bring its tab forward and put theirs back afterwards —
 * a short flicker beats either failing or silently photographing the wrong page.
 */
async function captureTab(tab: chrome.tabs.Tab): Promise<{ dataUrl: string }> {
  const windowId = tab.windowId!;
  const capture = () => chrome.tabs.captureVisibleTab(windowId, { format: "png" });

  if (tab.active) return { dataUrl: await capture() };

  const [previous] = await chrome.tabs.query({ active: true, windowId });
  try {
    await chrome.tabs.update(tab.id!, { active: true });
  } catch {
    throw new Error(
      `${TAB_NOT_VISIBLE}: cannot screenshot because the page this run started on could not ` +
        "be brought to the front. Ask the user to switch back to it, or use inspect_dom / get_html.",
    );
  }
  try {
    await wait(CAPTURE_PAINT_MS);
    return { dataUrl: await capture() };
  } finally {
    if (previous?.id != null && previous.id !== tab.id) {
      await chrome.tabs.update(previous.id, { active: true }).catch(() => {});
    }
  }
}

async function handleBrowserTool(msg: AppMessage & { type: "browser.tool" }): Promise<unknown> {
  const tab = await targetTab(msg.tabId);
  if (msg.tool === "screenshot") {
    if (tab.windowId == null) throw new Error("active tab has no window id");
    return captureTab(tab);
  }
  if (msg.tool === "apply_mod") {
    return applyMod(tab, msg.input as { featureId: string; modJs: string; modCss?: string });
  }
  if (msg.tool === "unapply_mod") {
    return unapplyMod(tab, msg.input as { featureId: string });
  }
  if (msg.tool === "evaluate_js") {
    assertInjectablePage(tab.url);
    const input = msg.input as { expr?: string };
    if (typeof input.expr !== "string") throw new Error("evaluate_js requires input.expr (string)");
    try {
      const [injectionResult] = await chrome.scripting.executeScript({
        target: { tabId: tab.id! },
        world: "MAIN",
        injectImmediately: true,
        func: evaluateJsMain,
        args: [input.expr],
      });
      return injectionResult?.result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("Content Security Policy") || message.includes("unsafe-eval")) {
        throw new Error(
          "evaluate_js is blocked by this page's Content Security Policy (dynamic code is not allowed). " +
            "Use inspect_dom, get_html, get_computed_style, or screenshot instead.",
        );
      }
      throw err;
    }
  }
  const reply = (await sendToContent(tab, {
    target: "content",
    type: "content.tool",
    tool: msg.tool,
    input: msg.input,
  } satisfies AppMessage)) as { ok?: boolean; result?: unknown; error?: string } | undefined;
  if (!reply || reply.ok !== true) {
    throw new Error(reply?.error ?? "content tool returned no result");
  }
  return reply.result;
}

chrome.runtime.onMessage.addListener((msg: AppMessage, _sender, sendResponse) => {
  if (!msg || typeof msg !== "object") return false;

  if (msg.target === "offscreen") {
    ensureOffscreen()
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }

  if (msg.target === "background" && msg.type === "browser.tool") {
    handleBrowserTool(msg)
      .then((result) => sendResponse({ ok: true, result }))
      .catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        // Not an extension error: this goes back to the agent as a tool result and it
        // adapts. console.error would file it in the chrome://extensions error list.
        console.warn("[vibebob/bg] browser tool failed", msg.tool, message);
        sendResponse({ ok: false, error: message });
      });
    return true;
  }

  if (msg.target === "background" && msg.type === "feature.sync") {
    applySyncMessage(msg)
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }

  return false;
});
