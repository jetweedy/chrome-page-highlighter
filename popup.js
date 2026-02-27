async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function sendToTab(tabId, msg) {
  return await chrome.tabs.sendMessage(tabId, msg);
}

const COLOR_MAP = {
  yellow: "#fff59d",
  green: "#b9f6ca",
  pink: "#ffccdf",
  blue: "#b3e5fc"
};

function el(tag, attrs = {}, children = []) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") n.className = v;
    else if (k === "text") n.textContent = v;
    else if (k === "html") n.innerHTML = v;
    else n.setAttribute(k, v);
  }
  for (const c of children) n.appendChild(c);
  return n;
}

function truncate(s, n = 120) {
  s = String(s || "").trim();
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + "…";
}

async function refreshCount() {
  const tab = await getActiveTab();
  if (!tab?.id) return;

  try {
    const res = await sendToTab(tab.id, { type: "GET_PAGE_HIGHLIGHT_COUNT" });
    const countEl = document.getElementById("count");
    if (countEl) {
      countEl.textContent = res?.ok ? `${res.count} highlight(s)` : "—";
    }
  } catch {
    const countEl = document.getElementById("count");
    if (countEl) countEl.textContent = "—";
  }
}

async function loadHighlightsAndRender() {
  const tab = await getActiveTab();
  if (!tab?.id) return;

  const list = document.getElementById("list");
  if (!list) return;

  list.innerHTML = "";

  let res;
  try {
    res = await sendToTab(tab.id, { type: "GET_PAGE_HIGHLIGHTS" });
  } catch {
    list.appendChild(el("div", { class: "empty", text: "Unable to read highlights on this page." }));
    return;
  }

  if (!res?.ok) {
    list.appendChild(el("div", { class: "empty", text: "No highlights found." }));
    return;
  }

  const highlights = Array.isArray(res.highlights) ? res.highlights : [];

  if (highlights.length === 0) {
    list.appendChild(el("div", { class: "empty", text: "No highlights found on this page." }));
    return;
  }

  // Sort newest-first (optional; change if you prefer DOM order)
  highlights.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  for (const h of highlights) {
    const dot = el("div", { class: "dot" });
    dot.style.background = COLOR_MAP[h.colorId] || COLOR_MAP.yellow;

    const snip = el("div", {
      class: "snip",
      text: truncate(h.text || "(text not captured)")
    });

    const top = el("div", { class: "item-top" }, [dot, snip]);

    const ta = el("textarea", {
      class: "note",
      placeholder: "Add a note (optional)…"
    });
    ta.value = h.note || "";

    const status = el("div", { class: "status", text: "" });

    const saveBtn = el("button", { class: "saveBtn", text: "Save note" });
    saveBtn.addEventListener("click", async () => {
      const note = ta.value;

      saveBtn.disabled = true;
      const oldText = saveBtn.textContent;
      saveBtn.textContent = "Saving…";
      status.textContent = "";

      try {
        const resp = await sendToTab(tab.id, {
          type: "SET_HIGHLIGHT_NOTE",
          id: h.id,
          note
        });

        if (resp?.ok) {
          status.textContent = "Saved";
          saveBtn.textContent = "Saved";
          setTimeout(() => {
            status.textContent = "";
            saveBtn.textContent = oldText;
            saveBtn.disabled = false;
          }, 650);
        } else {
          status.textContent = resp?.reason || "Save failed";
          saveBtn.textContent = oldText;
          saveBtn.disabled = false;
        }
      } catch {
        status.textContent = "Save failed";
        saveBtn.textContent = oldText;
        saveBtn.disabled = false;
      }
    });

    const saveRow = el("div", { class: "saveRow" }, [saveBtn]);

    const item = el("div", { class: "item" }, [top, ta, saveRow, status]);
    list.appendChild(item);
  }
}

document.getElementById("print")?.addEventListener("click", async () => {
  const tab = await getActiveTab();
  if (!tab?.id) return;
  await sendToTab(tab.id, { type: "PRINT_WITH_HIGHLIGHTS" });
});

document.getElementById("exportHighlights")?.addEventListener("click", async () => {
  const tab = await getActiveTab();
  if (!tab?.id) return;
  await sendToTab(tab.id, { type: "EXPORT_HIGHLIGHTS_ONLY" });
});

document.getElementById("clear")?.addEventListener("click", async () => {
  const tab = await getActiveTab();
  if (!tab?.id) return;
  await sendToTab(tab.id, { type: "CLEAR_PAGE_HIGHLIGHTS" });
  await refreshCount();
  await loadHighlightsAndRender();
});

// Boot
(async function init() {
  await refreshCount();
  await loadHighlightsAndRender();
})();