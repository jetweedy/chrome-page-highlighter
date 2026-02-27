const STORAGE_KEY = "ph_highlights_v5";

const COLOR_MAP = {
  yellow: "#fff59d",
  green: "#b9f6ca",
  pink: "#ffccdf",
  blue: "#b3e5fc"
};

let noteEditorEl = null;

function closeNoteEditor() {
  if (noteEditorEl) noteEditorEl.remove();
  noteEditorEl = null;
}

function positionEditor(el, x, y) {
  const padding = 10;
  const w = el.offsetWidth || 260;
  const h = el.offsetHeight || 140;

  const left = Math.max(padding, Math.min(x, window.innerWidth - w - padding));
  const top = Math.max(padding, Math.min(y, window.innerHeight - h - padding));

  el.style.left = `${left}px`;
  el.style.top = `${top}px`;
}

function updateHighlightTooltipInDom(highlightId, note) {
  const n = String(note || "").trim();
  document.querySelectorAll(`.ph-mark[data-ph-id="${CSS.escape(highlightId)}"]`).forEach((el) => {
    if (n) el.title = n;
    else el.removeAttribute("title");
  });
}

async function openNoteEditorForHighlight(highlightId, x, y) {
  closeNoteEditor();

  // Load current note from storage
  const { records } = await getPageRecords();
  const rec = records.find(r => r.id === highlightId);
  const current = rec?.note || "";

  noteEditorEl = document.createElement("div");
  noteEditorEl.className = "ph-note-editor";
  noteEditorEl.innerHTML = `
    <div style="font-size:12px; font-weight:700; margin-bottom:6px;">Edit note</div>
    <textarea placeholder="Add a note (optional)…"></textarea>
    <div class="row">
      <button class="cancel" type="button">Cancel</button>
      <button class="save" type="button">Save</button>
    </div>
  `;

  const ta = noteEditorEl.querySelector("textarea");
  const btnCancel = noteEditorEl.querySelector("button.cancel");
  const btnSave = noteEditorEl.querySelector("button.save");

  ta.value = current;

  btnCancel.addEventListener("click", () => closeNoteEditor());

  btnSave.addEventListener("click", async () => {
    btnSave.textContent = "Saving…";
    btnSave.disabled = true;

    const note = ta.value;

    const res = await setHighlightNote(highlightId, note); // reuse your existing function
    if (res?.ok) {
      console.log("saved!");
      updateHighlightTooltipInDom(highlightId, note);
      closeNoteEditor();
    } else {
      btnSave.textContent = "Save";
      btnSave.disabled = false;
    }
  });

  document.body.appendChild(noteEditorEl);
  positionEditor(noteEditorEl, x, y);

  // focus textarea
  setTimeout(() => ta.focus(), 0);
}

// ---------- Styles ----------
(function injectStyles() {
  if (document.querySelector("style[data-ph-style='true']")) return;
  const css = `
    .ph-mark {
      background: var(--ph-bg, #fff59d);
      padding: 0.02em 0.06em;
      border-radius: 0.2em;
      box-decoration-break: clone;
      -webkit-box-decoration-break: clone;
    }
    @media print {
      .ph-mark { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }

    .ph-toolbar {
      position: fixed;
      z-index: 2147483647;
      display: flex;
      gap: 6px;
      align-items: center;
      padding: 8px;
      border-radius: 10px;
      background: rgba(32, 33, 36, 0.92);
      box-shadow: 0 6px 18px rgba(0,0,0,0.25);
      user-select: none;
    }
    .ph-toolbar button {
      width: 22px;
      height: 22px;
      border: 0;
      border-radius: 6px;
      cursor: pointer;
      padding: 0;
    }
    .ph-toolbar .ph-btn-x {
      width: 26px;
      height: 22px;
      color: white;
      font-weight: 800;
      background: rgba(255,255,255,0.12);
      display: grid;
      place-items: center;
      font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
      font-size: 14px;
      line-height: 1;
    }
    .ph-toolbar .ph-label {
      color: rgba(255,255,255,0.85);
      font-size: 12px;
      margin-right: 4px;
      font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
    }

    .ph-note-editor {
      position: fixed;
      z-index: 2147483647;
      width: 260px;
      background: white;
      border: 1px solid rgba(0,0,0,0.18);
      border-radius: 10px;
      box-shadow: 0 10px 26px rgba(0,0,0,0.25);
      padding: 10px;
      font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
    }

    .ph-note-editor textarea {
      width: 100%;
      min-height: 70px;
      resize: vertical;
      box-sizing: border-box;
      padding: 8px;
      border-radius: 8px;
      border: 1px solid #ddd;
      font-size: 12px;
    }

    .ph-note-editor .row {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 8px;
    }

    .ph-note-editor button {
      border: 0;
      border-radius: 8px;
      padding: 7px 10px;
      font-weight: 600;
      cursor: pointer;
      font-size: 12px;
    }
    .ph-note-editor .save { background: #1a73e8; color: white; }
    .ph-note-editor .cancel { background: #f1f3f4; color: #202124; }

  `;
  const style = document.createElement("style");
  style.setAttribute("data-ph-style", "true");
  style.textContent = css;
  document.documentElement.appendChild(style);
})();

// ---------- Utils ----------
function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
function frameKeyFromLocation(loc = window.location) {
  return `${loc.origin}${loc.pathname}`;
}
function getSelectionRange() {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const r = sel.getRangeAt(0);
  return r.collapsed ? null : r;
}
function safeGetSelectionText() {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return "";
  return (sel.toString() || "").trim();
}

// ---------- Get top tab URL key (shared across frames) ----------
let _topTabKeyPromise = null;

async function getTopTabKey() {
  if (_topTabKeyPromise) return _topTabKeyPromise;

  _topTabKeyPromise = new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage({ type: "GET_TOP_TAB_URL" }, (resp) => {
        const url = resp?.url || "";
        // Normalize same as before: origin+pathname
        try {
          const u = new URL(url);
          resolve(`${u.origin}${u.pathname}`);
        } catch {
          // fallback: if parsing fails, use current frame's origin+path
          resolve(`${location.origin}${location.pathname}`);
        }
      });
    } catch {
      resolve(`${location.origin}${location.pathname}`);
    }
  });

  return _topTabKeyPromise;
}

// ---------- Storage (sync) ----------
async function loadAllHighlights() {
  const data = await chrome.storage.sync.get([STORAGE_KEY]);
  return data[STORAGE_KEY] || {};
}
async function saveAllHighlights(all) {
  await chrome.storage.sync.set({ [STORAGE_KEY]: all });
}
async function getPageRecords() {
  const key = await getTopTabKey(); // ✅ tab-level key shared across frames
  const all = await loadAllHighlights();
  return { key, all, records: all[key] || [] };
}
async function addHighlightRecord(record) {
  const { key, all, records } = await getPageRecords();
  records.push(record);
  all[key] = records;
  await saveAllHighlights(all);
}
async function clearPageRecords() {
  const { key, all } = await getPageRecords();
  delete all[key];
  await saveAllHighlights(all);
}

// ---------- DOM anchoring ----------
function nodeIndexWithinParent(node) {
  const p = node.parentNode;
  if (!p) return -1;
  return Array.from(p.childNodes).indexOf(node);
}
function buildNodePath(node) {
  const path = [];
  let cur = node;
  while (cur && cur !== document.body) {
    const idx = nodeIndexWithinParent(cur);
    if (idx < 0) break;
    path.push(idx);
    cur = cur.parentNode;
  }
  path.push(0);
  return path.reverse();
}
function resolveNodePath(path) {
  if (!Array.isArray(path) || path.length === 0) return null;
  let cur = document.body;
  for (let i = 1; i < path.length; i++) {
    const idx = path[i];
    if (!cur?.childNodes || idx >= cur.childNodes.length) return null;
    cur = cur.childNodes[idx];
  }
  return cur;
}
function getDomAnchorForRange(range) {
  return {
    startPath: buildNodePath(range.startContainer),
    startOffset: range.startOffset,
    endPath: buildNodePath(range.endContainer),
    endOffset: range.endOffset
  };
}
function rangeFromDomAnchor(anchor) {
  try {
    const sc = resolveNodePath(anchor.startPath);
    const ec = resolveNodePath(anchor.endPath);
    if (!sc || !ec) return null;
    const r = document.createRange();
    r.setStart(sc, anchor.startOffset);
    r.setEnd(ec, anchor.endOffset);
    return r.collapsed ? null : r;
  } catch {
    return null;
  }
}

// ---------- Quote anchor fallback ----------
function getQuoteContext(range, maxContext = 60) {
  const quote = range.toString();
  const container =
    range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
      ? range.commonAncestorContainer
      : range.commonAncestorContainer.parentElement;

  const localText = (container?.innerText || document.body?.innerText || "");
  const idx = localText.indexOf(quote);
  if (idx === -1) return { quote, prefix: "", suffix: "" };

  const start = Math.max(0, idx - maxContext);
  const end = Math.min(localText.length, idx + quote.length + maxContext);
  return {
    quote,
    prefix: localText.slice(start, idx),
    suffix: localText.slice(idx + quote.length, end)
  };
}
function findQuoteRange({ quote }) {
  if (!quote) return null;

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const p = node.parentElement;
      if (!p) return NodeFilter.FILTER_REJECT;
      const tag = p.tagName?.toLowerCase();
      if (["script", "style", "noscript"].includes(tag)) return NodeFilter.FILTER_REJECT;
      if (p.closest?.(".ph-mark")) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }
  });

  let node;
  while ((node = walker.nextNode())) {
    const text = node.nodeValue || "";
    const idx = text.indexOf(quote);
    if (idx !== -1) {
      const r = document.createRange();
      r.setStart(node, idx);
      r.setEnd(node, idx + quote.length);
      return r;
    }
  }
  return null;
}

// ---------- Render ----------
function wrapRange(range, colorId, highlightId, noteText = "") {
  const span = document.createElement("span");
  span.className = "ph-mark";
  span.dataset.phId = highlightId;
  span.style.setProperty("--ph-bg", COLOR_MAP[colorId] || COLOR_MAP.yellow);

  // ✅ simple hover tooltip (native)
  const n = String(noteText || "").trim();
  if (n) span.title = n;

  try {
    range.surroundContents(span);
    return true;
  } catch {
    // ... keep your existing single-text-node fallback,
    // but make sure you also set title there too:
    // (you can keep it as-is and just do the same span.title assignment above)
    const sc = range.startContainer;
    const ec = range.endContainer;
    if (sc === ec && sc.nodeType === Node.TEXT_NODE) {
      const textNode = sc;
      const text = textNode.nodeValue || "";

      const before = text.slice(0, range.startOffset);
      const middle = text.slice(range.startOffset, range.endOffset);
      const after = text.slice(range.endOffset);

      const beforeNode = document.createTextNode(before);
      const middleNode = document.createTextNode(middle);
      const afterNode = document.createTextNode(after);

      const parent = textNode.parentNode;
      if (!parent) return false;

      span.appendChild(middleNode);
      parent.insertBefore(beforeNode, textNode);
      parent.insertBefore(span, textNode);
      parent.insertBefore(afterNode, textNode);
      parent.removeChild(textNode);
      return true;
    }
    return false;
  }
}

function isAlreadyApplied(highlightId) {
  return !!document.querySelector(`.ph-mark[data-ph-id="${CSS.escape(highlightId)}"]`);
}

async function applyMissingHighlights() {
  const { records } = await getPageRecords();
  const myFrameKey = frameKeyFromLocation();

  const mine = records.filter(r => r.frameKey === myFrameKey);
  if (mine.length === 0) return { applied: 0, total: 0 };

  let applied = 0;
  for (const rec of mine) {
    if (isAlreadyApplied(rec.id)) continue;

    let range = rec.domAnchor ? rangeFromDomAnchor(rec.domAnchor) : null;
    if (!range && rec.quoteAnchor) range = findQuoteRange(rec.quoteAnchor);
    if (!range) continue;

    if (wrapRange(range, rec.colorId, rec.id, rec.note)) applied++;
  }
  return { applied, total: mine.length };
}

// ---------- Observer / Retry ----------
let debounceTimer = null;
let observer = null;

function startDebouncedObserver() {
  if (observer) return;

  observer = new MutationObserver(() => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => applyMissingHighlights(), 250);
  });

  observer.observe(document.documentElement || document.body, {
    childList: true,
    subtree: true,
    characterData: true
  });

  setTimeout(() => {
    try { observer.disconnect(); } catch {}
    observer = null;
  }, 30000);
}

async function initialReapplySequence() {
  const delays = [0, 300, 800, 1500, 3000, 5000];
  for (const d of delays) {
    if (d) await sleep(d);
    const res = await applyMissingHighlights();
    const count = document.querySelectorAll(".ph-mark[data-ph-id]").length;
    if (res.total > 0 && count >= res.total) break;
  }
}

// ---------- Clear ----------
function unwrapAllMarksOnPage() {
  document.querySelectorAll(".ph-mark[data-ph-id]").forEach((el) => {
    const parent = el.parentNode;
    if (!parent) return;
    while (el.firstChild) parent.insertBefore(el.firstChild, el);
    parent.removeChild(el);
    parent.normalize();
  });
}

// ---------- Toolbar ----------
let toolbarEl = null;
let lastRange = null;

function hideToolbar() {
  toolbarEl?.remove();
  toolbarEl = null;
  lastRange = null;
}

function showToolbarForRange(range) {
  hideToolbar();
  if (!range) return;

  lastRange = range.cloneRange();
  const rect = range.getBoundingClientRect();
  if (!rect || (rect.width === 0 && rect.height === 0)) return;

  toolbarEl = document.createElement("div");
  toolbarEl.className = "ph-toolbar";
  toolbarEl.setAttribute("data-ph-toolbar", "true");

  const label = document.createElement("div");
  label.className = "ph-label";
  label.textContent = "Highlight:";
  toolbarEl.appendChild(label);

  const buttons = [
    { id: "yellow", bg: COLOR_MAP.yellow, title: "Yellow" },
    { id: "green", bg: COLOR_MAP.green, title: "Green" },
    { id: "pink", bg: COLOR_MAP.pink, title: "Pink" },
    { id: "blue", bg: COLOR_MAP.blue, title: "Blue" }
  ];

  for (const b of buttons) {
    const btn = document.createElement("button");
    btn.title = b.title;
    btn.style.background = b.bg;
    btn.addEventListener("mousedown", (e) => e.preventDefault());
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      await highlightRangeAndStore(lastRange, b.id);
      hideToolbar();
    });
    toolbarEl.appendChild(btn);
  }

  const x = document.createElement("div");
  x.className = "ph-btn-x";
  x.title = "Close";
  x.textContent = "×";
  x.addEventListener("mousedown", (e) => e.preventDefault());
  x.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    hideToolbar();
  });
  toolbarEl.appendChild(x);

  document.body.appendChild(toolbarEl);

  // position near selection
  const padding = 10;
  const top = Math.max(padding, rect.top - 52);
  const left = Math.max(padding, Math.min(rect.left, window.innerWidth - 220));

  toolbarEl.style.top = `${top}px`;
  toolbarEl.style.left = `${left}px`;
}

async function highlightRangeAndStore(range, colorId) {
  if (!range || range.collapsed) return;
  const quote = range.toString().trim();
  if (!quote) return;

  // ✅ capture anchors BEFORE wrapping (important)
  const domAnchor = getDomAnchorForRange(range);
  const quoteAnchor = getQuoteContext(range, 60);

  const id = uid();
  const wrapped = wrapRange(range, colorId, id, "");
  try { window.getSelection()?.removeAllRanges(); } catch {}

  if (!wrapped) return;

  await addHighlightRecord({
    id,
    colorId,
    domAnchor,
    quoteAnchor,
    note: "",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    frameKey: frameKeyFromLocation() // ✅ frame-specific
  });

  startDebouncedObserver();
}

function installToolbarListeners() {
  document.addEventListener("mouseup", () => {
    const r = getSelectionRange();
    if (!r) return hideToolbar();
    setTimeout(() => showToolbarForRange(r), 0);
  });

  document.addEventListener("mousedown", (e) => {
    if (!toolbarEl) return;
    if (e.target?.closest?.("[data-ph-toolbar='true']")) return;
    hideToolbar();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") hideToolbar();
  });

  window.addEventListener("scroll", () => toolbarEl && hideToolbar(), true);
  window.addEventListener("resize", () => toolbarEl && hideToolbar(), true);
}

// ---------- Export highlights only (includes notes) ----------
function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function exportHighlightsOnly() {
  const { records } = await getPageRecords();
  const items = records
    .slice()
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    .map((r) => ({
      text: (r.quoteAnchor?.quote || "").trim(),
      note: (r.note || "").trim(),
      colorId: r.colorId || "yellow"
    }))
    .filter((x) => x.text);

  const title = document.title || "Highlights";
  const now = new Date().toLocaleString();

  const html = `
<!doctype html>
<html><head><meta charset="utf-8"/>
<title>${escapeHtml(title)} — Highlights</title>
<style>
  body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; padding: 24px; }
  h1 { font-size: 18px; margin: 0 0 6px; }
  .meta { color: #666; font-size: 12px; margin-bottom: 14px; line-height: 1.3; }
  .item { margin: 10px 0; line-height: 1.35; }
  .badge { display:inline-block; width:10px; height:10px; border-radius:3px; vertical-align:middle; margin-right:8px; }
  .text { font-size: 14px; }
  .note { color:#444; font-size:12px; margin-left:18px; margin-top:2px; white-space:pre-wrap; }
</style></head>
<body>
<h1>${escapeHtml(title)} — Highlights</h1>
<div class="meta">${escapeHtml(location.href)}<br>${escapeHtml(now)}</div>
${
  items.length
    ? items.map(i => `
<div class="item">
  <span class="badge" style="background:${escapeHtml(COLOR_MAP[i.colorId] || COLOR_MAP.yellow)}"></span>
  <span class="text">${escapeHtml(i.text)}</span>
  ${i.note ? `<div class="note">${escapeHtml(i.note)}</div>` : ``}
</div>`).join("")
    : `<div>No highlights found on this page.</div>`
}
<script>window.print();</script>
</body></html>`;
  const w = window.open("", "_blank", "noopener,noreferrer");
  if (!w) return;
  w.document.open();
  w.document.write(html);
  w.document.close();
}

// ---------- Notes update ----------
async function setHighlightNote(id, note) {
  const { key, all, records } = await getPageRecords();
  const idx = records.findIndex((r) => r.id === id);
  if (idx === -1) return { ok: false, reason: "Not found" };

  const clean = String(note || "").slice(0, 2000); // cap for sync sanity

  records[idx].note = clean;
  records[idx].updatedAt = Date.now();

  all[key] = records;
  await saveAllHighlights(all);

  // Update native hover tooltip on any currently-rendered mark(s)
  updateHighlightTooltipInDom(id, clean);

  return { ok: true };
}

// ---------- Messaging ----------
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    if (msg?.type === "HIGHLIGHT_SELECTION") {
      const colorId = msg.colorId || "yellow";
      const range = getSelectionRange();
      if (!range) return sendResponse({ ok: false, reason: "No selection" });
      if (!safeGetSelectionText()) return sendResponse({ ok: false, reason: "Empty selection" });
      await highlightRangeAndStore(range, colorId);
      return sendResponse({ ok: true });
    }

    if (msg?.type === "CLEAR_PAGE_HIGHLIGHTS") {
      unwrapAllMarksOnPage();
      // Only clear storage from top frame OR any frame (safe)
      await clearPageRecords();
      return sendResponse({ ok: true });
    }

    if (msg?.type === "GET_PAGE_HIGHLIGHT_COUNT") {
      const { records } = await getPageRecords();
      return sendResponse({ ok: true, count: records.length });
    }

    if (msg?.type === "GET_PAGE_HIGHLIGHTS") {
      const { records } = await getPageRecords();
      const simplified = records.map((r) => ({
        id: r.id,
        colorId: r.colorId,
        text: (r.quoteAnchor?.quote || "").trim(),
        note: r.note || "",
        createdAt: r.createdAt || 0,
        updatedAt: r.updatedAt || 0
      }));
      return sendResponse({ ok: true, highlights: simplified });
    }

    if (msg?.type === "SET_HIGHLIGHT_NOTE") {
      if (!msg?.id) return sendResponse({ ok: false, reason: "Missing id" });
      return sendResponse(await setHighlightNote(msg.id, msg.note));
    }

    if (msg?.type === "PRINT_WITH_HIGHLIGHTS") {
      window.print();
      return sendResponse({ ok: true });
    }

    if (msg?.type === "EXPORT_HIGHLIGHTS_ONLY") {
      await exportHighlightsOnly();
      return sendResponse({ ok: true });
    }

    return sendResponse({ ok: false, reason: "Unknown message" });
  })();
  return true;
});

function installHighlightNoteListeners() {
  // Right-click on highlight -> open editor
  document.addEventListener("contextmenu", (e) => {
    const mark = e.target?.closest?.(".ph-mark[data-ph-id]");
    if (!mark) return;

    e.preventDefault();
    e.stopPropagation();

    const id = mark.getAttribute("data-ph-id");
    if (!id) return;

    openNoteEditorForHighlight(id, e.clientX, e.clientY);
  });

  // Click outside closes editor
  document.addEventListener("mousedown", (e) => {
    if (!noteEditorEl) return;
    if (e.target?.closest?.(".ph-note-editor")) return;
    closeNoteEditor();
  });

  // ESC closes editor
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeNoteEditor();
  });
}

// ---------- Boot ----------
(async function boot() {
  installToolbarListeners();
  installHighlightNoteListeners(); 
  startDebouncedObserver();
  await initialReapplySequence();
})();