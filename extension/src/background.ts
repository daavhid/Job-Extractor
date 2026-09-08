import { extractMainWorldPageData } from "./mainWorldHelper";

console.log("✅ Background Service Worker Started");

chrome.commands.onCommand.addListener(async (command) => {
  if (command === "extract-job") {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        console.log("[Background] Hotkey Alt+J triggered for tab:", tab.id);
        chrome.tabs.sendMessage(tab.id, { action: "quickExtractAndCopy" });
      }
    } catch (e) {
      console.warn("[Background] Failed to send quickExtractAndCopy:", e);
    }
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getMainWorldData") {
    const tabId = sender.tab?.id;
    if (!tabId) {
      sendResponse({ result: null });
      return false;
    }

    chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: extractMainWorldPageData
    }).then(results => {
      sendResponse({ result: results?.[0]?.result || null });
    }).catch(err => {
      console.warn("[Background] Failed to execute in main world:", err);
      sendResponse({ result: null, error: String(err) });
    });

    return true;
  }
});