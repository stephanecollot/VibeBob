import { handlers as inspectorHandlers } from "./inspector";
import { modHandlers } from "./injector";
import type { AppMessage } from "../types/messages";

console.log("[vibebob/content] loaded on", location.href);

const allHandlers: Record<string, (input: any) => unknown> = {
  ...inspectorHandlers,
  ...modHandlers,
};

chrome.runtime.onMessage.addListener((raw: AppMessage, _sender, sendResponse) => {
  if (!raw || typeof raw !== "object" || raw.target !== "content") return false;
  if (raw.type !== "content.tool") return false;
  (async () => {
    try {
      const fn = allHandlers[raw.tool];
      if (!fn) throw new Error(`unknown content tool: ${raw.tool}`);
      const result = await fn(raw.input);
      sendResponse({ ok: true, result });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      sendResponse({ ok: false, error: message });
    }
  })();
  return true;
});
