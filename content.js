// Page Highlighter MVP (stabilized)
// - Primary anchoring: DOM path + offsets (more reliable)
// - Fallback anchoring: quote + prefix/suffix
// - Reapply: apply missing highlights (DO NOT clear everything)
// - MutationObserver: debounced reapply for late-loading / re-rendering pages

const STORAGE_KEY = "ph_highlights_v2";

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

// -------------------- Storage --------------------
async function loadAllHighlights() {
  const data = await chrome.storage.local.get([STORAGE_KEY]);
  return data[STORAGE_KEY] || {};
}
async function saveAllHighlights(all) {
  await chrome.storage.local.set({ [STORAGE_KEY]: all });
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
  // Path as indices from document.body down through childNodes
  const path = [];
  let cur = node;
  while (cur && cur !== document.body) {
    const idx = nodeIndexWithinParent(cur);
    if (idx < 0) break;
    path.push(idx);
    cur = cur.parentNode;
  }
  path.push(0); // marker that root is body
  return path.reverse(); // from body outward
}

function resolveNodePath(path) {
  if (!path || !Array.isArray(path) || path.length === 0) return null;
  let cur = document.body;
  // first element is 0 marker for body
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
function getQuoteContext(range, maxContext = 50) {
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

  // Instead of brittle "bodyText index -> DOM offset" mapping,
  // we do a node-by-node search and build a Range when we find a match.
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const p = node.parentElement;
      if (!p) return NodeFilter.FILTER_REJECT;
      const tag = p.tagName?.toLowerCase();
      if (["script", "style", "noscript"].includes(tag)) return NodeFilter.FILTER_REJECT;
      // Ignore our own highlight spans
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

  // If quote spans multiple nodes, MVP fallback won't find it.
  return null;
}

// -------------------- Rendering (safe-ish) --------------------
function wrapRange(range, colorId, highlightId) {
  const span = document.createElement("span");
  span.className = "ph-mark";
  span.dataset.phId = highlightId;
  span.style.setProperty("--ph-bg", COLOR_MAP[colorId] || COLOR_MAP.yellow);

  try {
    range.surroundContents(span);
    return true;
  } catch (e) {
    // Fallback: only single text node
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

// Apply missing highlights only (never clears everything)
async function applyMissingHighlights() {
  const { records } = await getPageRecords();
  if (records.length === 0) return { applied: 0, total: 0 };

  let applied = 0;

  for (const rec of records) {
    if (isAlreadyApplied(rec.id)) continue;

    // 1) Try DOM anchor
    let range = rec.domAnchor ? rangeFromDomAnchor(rec.domAnchor) : null;

    // 2) Fallback to quote (single-node only)
    if (!range && rec.quoteAnchor) {
      range = findQuoteRange(rec.quoteAnchor);
    }

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
    // Debounce re-apply, so we don’t fight with the renderer
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

  // Don’t run forever (MVP); stop after 30s
  observerStopTimer = setTimeout(() => {
    try { observer.disconnect(); } catch {}
    observer = null;
  }, 30000);
}

async function initialReapplySequence() {
  // A few gentle attempts; do NOT remove existing marks
  // This helps even without mutations if content appears late.
  const delays = [0, 300, 800, 1500, 3000, 5000];
  for (const d of delays) {
    if (d) await sleep(d);
    const res = await applyMissingHighlights();
    // If all records show up, stop
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

// -------------------- Messaging --------------------
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    if (msg?.type === "HIGHLIGHT_SELECTION") {
      const colorId = msg.colorId || "yellow";
      const range = getSelectionRange();

      if (!range) return sendResponse({ ok: false, reason: "No selection" });

      const selectedText = safeGetSelectionText();
      if (!selectedText) return sendResponse({ ok: false, reason: "Empty selection" });

      const id = uid();

      // Render first (so user sees immediate feedback)
      const wrapped = wrapRange(range, colorId, id);
      try { window.getSelection()?.removeAllRanges(); } catch {}

      if (!wrapped) {
        return sendResponse({ ok: false, reason: "Selection too complex for MVP" });
      }

      // Store anchors
      const domAnchor = getDomAnchorForRange(range);
      const quoteAnchor = getQuoteContext(range, 60);

      await addHighlightRecord({
        id,
        colorId,
        domAnchor,
        quoteAnchor,
        createdAt: Date.now()
      });

      // If the page re-renders, our mark might get blown away; observer will restore it.
      startDebouncedObserver();

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

    return sendResponse({ ok: false, reason: "Unknown message" });
  })();

  return true;
});

// -------------------- Boot --------------------
(async function boot() {
  // Start observer early to catch late-render content / re-renders
  startDebouncedObserver();
  await initialReapplySequence();
})();