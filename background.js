// background.js — Page Highlighter (frame-aware)
// - Creates context menu items for highlight colors + clear
// - Sends highlight commands to the correct frame via info.frameId
// - Provides GET_TOP_TAB_URL so all frames share one storage key (top tab URL)
// - Broadcasts CLEAR to all frames (so iframes clear immediately too)

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

function sendMessageToTab(tabId, message, frameId) {
  return new Promise((resolve, reject) => {
    const options = typeof frameId === "number" ? { frameId } : undefined;

    chrome.tabs.sendMessage(tabId, message, options, (resp) => {
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

// Try sending; if content script isn't present, inject and retry.
// Note: for restricted pages, injection will fail.
async function sendWithFallback(tabId, message, frameId) {
  try {
    return await sendMessageToTab(tabId, message, frameId);
  } catch (e) {
    // Common: "Could not establish connection. Receiving end does not exist."
    await injectContentScript(tabId);
    return await sendMessageToTab(tabId, message, frameId);
  }
}

// Broadcast to all frames (no frameId). If content script missing, inject then retry.
async function broadcastWithFallback(tabId, message) {
  try {
    return await sendMessageToTab(tabId, message);
  } catch (e) {
    await injectContentScript(tabId);
    return await sendMessageToTab(tabId, message);
  }
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) return;

  try {
    if (typeof info.menuItemId === "string" && info.menuItemId.startsWith("ph_color_")) {
      const colorId = info.menuItemId.replace("ph_color_", "");

      // ✅ Send to the frame where the selection happened
      const frameId = typeof info.frameId === "number" ? info.frameId : undefined;

      const res = await sendWithFallback(tab.id, { type: "HIGHLIGHT_SELECTION", colorId }, frameId);
      if (!res?.ok) console.warn("Highlight failed:", res?.reason);
      return;
    }

    if (info.menuItemId === "ph_clear_page") {
      // ✅ Broadcast clear so all frames unwrap immediately
      await broadcastWithFallback(tab.id, { type: "CLEAR_PAGE_HIGHLIGHTS" });
      return;
    }
  } catch (e) {
    console.warn("Highlighter error:", e.message);
  }
});

// Provide top-tab URL to content scripts (so all frames share one storage key)
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "GET_TOP_TAB_URL") {
    sendResponse({ ok: true, url: sender.tab?.url || "" });
    return true;
  }
});