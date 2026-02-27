async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function sendToTab(tabId, msg) {
  return await chrome.tabs.sendMessage(tabId, msg);
}

async function refreshCount() {
  const tab = await getActiveTab();
  if (!tab?.id) return;

  try {
    const res = await sendToTab(tab.id, { type: "GET_PAGE_HIGHLIGHT_COUNT" });
    document.getElementById("count").textContent = res?.ok ? `${res.count} highlight(s)` : "—";
  } catch {
    document.getElementById("count").textContent = "—";
  }
}

document.getElementById("print").addEventListener("click", async () => {
  const tab = await getActiveTab();
  if (!tab?.id) return;
  await sendToTab(tab.id, { type: "PRINT_WITH_HIGHLIGHTS" });
});

document.getElementById("clear").addEventListener("click", async () => {
  const tab = await getActiveTab();
  if (!tab?.id) return;
  await sendToTab(tab.id, { type: "CLEAR_PAGE_HIGHLIGHTS" });
  await refreshCount();
});

refreshCount();