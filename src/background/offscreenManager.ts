const OFFSCREEN_PATH = "src/offscreen/offscreen.html";

let creating: Promise<void> | null = null;

export async function ensureOffscreen(): Promise<void> {
  const url = chrome.runtime.getURL(OFFSCREEN_PATH);
  const existing = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT" as chrome.runtime.ContextType],
    documentUrls: [url],
  });
  if (existing.length > 0) return;

  if (creating) {
    await creating;
    return;
  }
  creating = chrome.offscreen
    .createDocument({
      url: OFFSCREEN_PATH,
      reasons: ["WORKERS" as chrome.offscreen.Reason],
      justification: "Hosts the long-running VibeBob agent loop and VFS.",
    })
    .finally(() => {
      creating = null;
    });
  await creating;
}
