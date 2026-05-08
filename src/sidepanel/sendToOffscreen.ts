import type { AppMessage } from "../types/messages";

let ready: Promise<void> | null = null;

function ensure(): Promise<void> {
  if (!ready) {
    ready = chrome.runtime
      .sendMessage({ target: "offscreen", type: "_ensure" } as unknown as AppMessage)
      .then(() => undefined)
      .catch(() => {
        ready = null;
      });
  }
  return ready;
}

export async function sendToOffscreen(msg: AppMessage): Promise<void> {
  await ensure();
  await chrome.runtime.sendMessage(msg).catch(() => {});
}
