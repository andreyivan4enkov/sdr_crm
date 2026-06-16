/** @type {string} */
const DEFAULT_ORIGIN = "http://localhost:5173";

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get(["crmOrigin"], (data) => {
    if (!data.crmOrigin) chrome.storage.sync.set({ crmOrigin: DEFAULT_ORIGIN });
  });
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "getCrmOrigin") {
    chrome.storage.sync.get(["crmOrigin"], (data) => {
      sendResponse({ origin: data.crmOrigin || DEFAULT_ORIGIN });
    });
    return true;
  }
  return false;
});
