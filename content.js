// Page Highlighter v1.0 (upgraded)
// Adds:
//  - Floating highlight toolbar on selection
//  - Export "highlights only" printable view
//  - Uses chrome.storage.sync (cross-device)
// Keeps:
//  - Stable persistence + late-render resilience with MutationObserver
//
// Notes:
//  - Complex selections across many nodes may still fail (MVP wrapRange approach).
//  - storage.sync has quotas; fine for typical use.

const STORAGE_KEY = "ph_highlights_v3";

const COLOR_MAP = {
  yellow: "#fff59d",
  green: "#b9f6ca",
  pink: "#ffccdf",
  blue: "#b3e5fc"
};

// -------------------- Styles --------------------
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

    /* Floating toolbar */
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
  `;

  const style = document.createElement("style");
  style.setAttribute("data-ph-style", "true");
  style.textContent = css;
  document.documentElement.appendChild(style);
})();

// -------------------- Utilities --------------------
function pageKeyFromLocation(loc = window.location) {
  return `${loc.origin}${loc.pathname}`;
}
function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function getSelectionRange() {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (range.collapsed) return null;
  return range;
}

function safeGetSelectionText() {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return "";
  return (sel.toString() || "").trim();
}

// -------------------- Storage (SYNC) --------------------
async function loadAllHighlights() {
  const data = await chrome.storage.sync.get([STORAGE_KEY]);
  return data[STORAGE_KEY] || {};
}
async function saveAllHighlights(all) {
  await chrome.storage.sync.set({ [STORAGE_KEY]: all });
}
async function getPageRecords() {
  const key = pageKeyFromLocation();
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

// -------------------- DOM path anchoring --------------------
function nodeIndexWithinParent(node) {
  const p = node.parentNode;
  if (!p) return -1;
  const children = Array.from(p.childNodes);
  return children.indexOf(node);
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
  path.push(0); // marker for body root
  return path.reverse();
}
function resolveNodePath(path) {
  if (!path || !Array.isArray(path) || path.length === 0) return null;
  let cur = document.body;
  for (let i = 1; i < path.length; i++) {
    const idx = path[i];
    if (!cur || !cur.childNodes || idx >= cur.childNodes.length) return null;
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
    if (r.collapsed) return null;
    return r;
  } catch {
    return null;
  }
}

// -------------------- Quote anchoring fallback --------------------
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

// -------------------- Rendering --------------------
function wrapRange(range, colorId, highlightId) {
  const span = document.createElement("span");
  span.className = "ph-mark";
  span.dataset.phId = highlightId;
  span.style.setProperty("--ph-bg", COLOR_MAP[colorId] || COLOR_MAP.yellow);

  try {
    range.surroundContents(span);
    return true;
  } catch {
    // Fallback: single text node only
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
  if (records.length === 0) return { applied: 0, total: 0 };

  let applied = 0;

  for (const rec of records) {
    if (isAlreadyApplied(rec.id)) continue;

    let range = rec.domAnchor ? rangeFromDomAnchor(rec.domAnchor) : null;
    if (!range && rec.quoteAnchor) range = findQuoteRange(rec.quoteAnchor);
    if (!range) continue;

    if (wrapRange(range, rec.colorId, rec.id)) applied++;
  }

  return { applied, total: records.length };
}

// -------------------- Observer / Retry --------------------
let debounceTimer = null;
let observer = null;
let observerStopTimer = null;

function startDebouncedObserver() {
  if (observer) return;

  observer = new MutationObserver(() => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      applyMissingHighlights();
    }, 250);
  });

  observer.observe(document.documentElement || document.body, {
    childList: true,
    subtree: true,
    characterData: true
  });

  // Stop after 30s (keeps it lightweight). You can raise this later.
  observerStopTimer = setTimeout(() => {
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

// -------------------- Clear highlights (unwrap) --------------------
function unwrapAllMarksOnPage() {
  document.querySelectorAll(".ph-mark[data-ph-id]").forEach((el) => {
    const parent = el.parentNode;
    if (!parent) return;
    while (el.firstChild) parent.insertBefore(el.firstChild, el);
    parent.removeChild(el);
    parent.normalize();
  });
}

// -------------------- Floating toolbar --------------------
let toolbarEl = null;
let lastRange = null;

function hideToolbar() {
  if (toolbarEl) toolbarEl.remove();
  toolbarEl = null;
  lastRange = null;
}

function showToolbarForRange(range) {
  hideToolbar();
  if (!range) return;

  // Clone range so it survives focus changes/clicks
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
    btn.addEventListener("mousedown", (e) => e.preventDefault()); // keep selection
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

  // Position above selection if possible
  const padding = 10;
  const top = Math.max(padding, rect.top + window.scrollY - 48);
  let left = rect.left + window.scrollX;
  left = Math.max(padding, Math.min(left, window.scrollX + document.documentElement.clientWidth - toolbarEl.offsetWidth - padding));

  toolbarEl.style.top = `${top - window.scrollY}px`;
  toolbarEl.style.left = `${left - window.scrollX}px`;
}

async function highlightRangeAndStore(range, colorId) {
  if (!range || range.collapsed) return;

  // Only highlight real text selections
  const quote = range.toString().trim();
  if (!quote) return;

  const id = uid();

  // Render immediately
  const wrapped = wrapRange(range, colorId, id);
  try { window.getSelection()?.removeAllRanges(); } catch {}

  if (!wrapped) return;

  const domAnchor = getDomAnchorForRange(range);
  const quoteAnchor = getQuoteContext(range, 60);

  await addHighlightRecord({
    id,
    colorId,
    domAnchor,
    quoteAnchor,
    createdAt: Date.now()
  });

  // Ensure re-render resilience
  startDebouncedObserver();
}

function installToolbarListeners() {
  // Show toolbar on selection
  document.addEventListener("mouseup", () => {
    const r = getSelectionRange();
    if (!r) return hideToolbar();
    // small delay lets selection settle
    setTimeout(() => showToolbarForRange(r), 0);
  });

  // Hide toolbar if clicking elsewhere
  document.addEventListener("mousedown", (e) => {
    if (!toolbarEl) return;
    if (e.target?.closest?.("[data-ph-toolbar='true']")) return;
    hideToolbar();
  });

  // ESC closes toolbar
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") hideToolbar();
  });

  // Scroll/resize moves content; easiest: just hide
  window.addEventListener("scroll", () => toolbarEl && hideToolbar(), true);
  window.addEventListener("resize", () => toolbarEl && hideToolbar(), true);
}

// -------------------- Export highlights only --------------------
function exportHighlightsOnly() {
  const marks = Array.from(document.querySelectorAll(".ph-mark[data-ph-id]"));

  // Extract in DOM order; also de-duplicate adjacent identical strings
  const items = [];
  let last = "";
  for (const m of marks) {
    const t = (m.textContent || "").trim();
    if (!t) continue;
    if (t === last) continue;
    last = t;
    items.push(t);
  }

  const title = document.title || "Highlights";
  const now = new Date().toLocaleString();

  const html = `
<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>${escapeHtml(title)} — Highlights</title>
  <style>
    body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; padding: 24px; }
    h1 { font-size: 18px; margin: 0 0 6px; }
    .meta { color: #666; font-size: 12px; margin-bottom: 14px; }
    ul { padding-left: 18px; }
    li { margin: 8px 0; line-height: 1.35; }
    .empty { color: #666; }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)} — Highlights</h1>
  <div class="meta">${escapeHtml(location.href)}<br>${escapeHtml(now)}</div>
  ${
    items.length
      ? `<ul>${items.map(i => `<li>${escapeHtml(i)}</li>`).join("")}</ul>`
      : `<div class="empty">No highlights found on this page.</div>`
  }
  <script>window.print();</script>
</body>
</html>
`;

  const w = window.open("", "_blank", "noopener,noreferrer");
  if (!w) return;
  w.document.open();
  w.document.write(html);
  w.document.close();
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// -------------------- Messaging --------------------
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    if (msg?.type === "HIGHLIGHT_SELECTION") {
      const colorId = msg.colorId || "yellow";
      const range = getSelectionRange();
      if (!range) return sendResponse({ ok: false, reason: "No selection" });

      const selectedText = safeGetSelectionText();
      if (!selectedText) return sendResponse({ ok: false, reason: "Empty selection" });

      await highlightRangeAndStore(range, colorId);
      return sendResponse({ ok: true });
    }

    if (msg?.type === "CLEAR_PAGE_HIGHLIGHTS") {
      unwrapAllMarksOnPage();
      await clearPageRecords();
      return sendResponse({ ok: true });
    }

    if (msg?.type === "GET_PAGE_HIGHLIGHT_COUNT") {
      const { records } = await getPageRecords();
      return sendResponse({ ok: true, count: records.length });
    }

    if (msg?.type === "PRINT_WITH_HIGHLIGHTS") {
      window.print();
      return sendResponse({ ok: true });
    }

    if (msg?.type === "EXPORT_HIGHLIGHTS_ONLY") {
      exportHighlightsOnly();
      return sendResponse({ ok: true });
    }

    return sendResponse({ ok: false, reason: "Unknown message" });
  })();

  return true;
});

// -------------------- Boot --------------------
(async function boot() {
  installToolbarListeners();
  startDebouncedObserver();
  await initialReapplySequence();
})();