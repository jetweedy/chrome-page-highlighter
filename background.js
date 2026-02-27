const MENU_ROOT = "ph_root";

const COLORS = [
  { id: "yellow", title: "Highlight (Yellow)" },
  { id: "green", title: "Highlight (Green)" },
  { id: "pink", title: "Highlight (Pink)" },
  { id: "blue", title: "Highlight (Blue)" }
];

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_ROOT,
      title: "Page Highlighter",
      contexts: ["selection"]
    });

    for (const c of COLORS) {
      chrome.contextMenus.create({
        id: `ph_color_${c.id}`,
        parentId: MENU_ROOT,
        title: c.title,
        contexts: ["selection"]
      });
    }

    chrome.contextMenus.create({
      id: "ph_clear_page",
      title: "Clear highlights on this page",
      contexts: ["page"]
    });
  });
});

function sendMessageToTab(tabId, message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (resp) => {
      const err = chrome.runtime.lastError;
      if (err) reject(new Error(err.message));
      else resolve(resp);
    });
  });
}

function injectContentScript(tabId) {
  return new Promise((resolve, reject) => {
    chrome.scripting.executeScript(
      {
        target: { tabId, allFrames: true },
        files: ["content.js"]
      },
      () => {
        const err = chrome.runtime.lastError;
        if (err) reject(new Error(err.message));
        else resolve(true);
      }
    );
  });
}

async function sendWithFallback(tabId, message) {
  try {
    return await sendMessageToTab(tabId, message);
  } catch (e) {
    // Common: "Could not establish connection. Receiving end does not exist."
    await injectContentScript(tabId);
    return await sendMessageToTab(tabId, message);
  }
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) return;

  try {
    if (typeof info.menuItemId === "string" && info.menuItemId.startsWith("ph_color_")) {
      const colorId = info.menuItemId.replace("ph_color_", "");
      const res = await sendWithFallback(tab.id, { type: "HIGHLIGHT_SELECTION", colorId });
      // If content script refused (complex selection), at least log it
      if (!res?.ok) console.warn("Highlight failed:", res?.reason);
      return;
    }

    if (info.menuItemId === "ph_clear_page") {
      await sendWithFallback(tab.id, { type: "CLEAR_PAGE_HIGHLIGHTS" });
      return;
    }
  } catch (e) {
    console.warn("Highlighter error:", e.message);
  }
});