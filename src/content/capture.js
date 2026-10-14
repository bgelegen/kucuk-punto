// Page reader. Turns the DOM into visible text blocks, the way a person sees the page,
// and separately collects text that is present in the DOM but hidden from the person.
//
// Visibility rules start from page-agent's DOM reader (alibaba/page-agent, page-controller:
// Element.checkVisibility with opacity + visibility CSS) and add the hiding tricks that
// reader lets through in our tests: tiny fonts, off-screen positioning, clipping,
// transparent or same-colour-as-background text, zero-size boxes.
// Hidden text is NEVER sent to the model; it is only reported (and scanned for injections).

// No attribute-based exclusions: a page could put such an attribute on its own clauses to hide them
// from the analysis. Our panel needs none, because a TreeWalker never enters its shadow root.
const SKIP_SELECTOR = 'script,style,noscript,template,svg,canvas,iframe,object,textarea,select,option,button,input';
const BLOCK_DISPLAY = /^(block|list-item|table|table-cell|table-row|table-caption|flex|grid|flow-root|inline-block)$/;

export const HIDDEN_REASONS_TR = {
  'css-hidden': 'CSS ile gizlenmiş (display/visibility/opacity)',
  'tiny-font': 'Okunamayacak kadar küçük yazı',
  'transparent-text': 'Saydam yazı rengi',
  'low-contrast': 'Arka planla aynı renkte yazı',
  'clipped': 'Kırpılmış / görünmez kutu',
  'zero-size': 'Boyutu sıfır',
  'offscreen': 'Ekran dışına itilmiş'
};

function parseColor(s) {
  const m = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+%?))?\s*\)/.exec(s || '');
  if (!m) return null;
  let a = m[4] == null ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
  return { r: +m[1], g: +m[2], b: +m[3], a };
}
function lum({ r, g, b }) {
  const f = x => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function contrast(a, b) { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }

// The background a text actually sits on. Only an explicit, opaque background on an ancestor counts.
// No such ancestor means "unknown" (many dark sites paint the background on a separate fixed layer),
// and unknown is never treated as hidden: a false "hidden" silently drops real terms from the analysis.
function effectiveBackground(el, win) {
  for (let a = el; a; a = a.parentElement) {
    const s = win.getComputedStyle(a);
    if (s.backgroundImage && s.backgroundImage !== 'none') return null;
    const c = parseColor(s.backgroundColor);
    if (c && c.a > 0.5) return c;
  }
  return null;
}

function elementHiddenReason(el, win, doc) {
  if (typeof el.checkVisibility === 'function') {
    if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true, contentVisibilityAuto: true })) return 'css-hidden';
  } else {
    for (let a = el; a; a = a.parentElement) {
      const s = win.getComputedStyle(a);
      if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') return 'css-hidden';
    }
  }
  const cs = win.getComputedStyle(el);
  // the element's own computed size is what is rendered (a "font-size: 0" wrapper is a common layout trick)
  if (parseFloat(cs.fontSize) < 5) return 'tiny-font';
  const color = parseColor(cs.color);
  if (color && color.a < 0.15) return 'transparent-text';
  for (let a = el, i = 0; a && a !== doc.body && i < 10; a = a.parentElement, i++) {
    const s = win.getComputedStyle(a);
    if (/rect\(\s*(0|1)px[ ,]+(0|1)px[ ,]+(0|1)px[ ,]+(0|1)px\s*\)/.test(s.clip || '') || /rect\(\s*0[ ,]+0[ ,]+0[ ,]+0\s*\)/.test(s.clip || '')) return 'clipped';
    if (/inset\(\s*(50|100)%/.test(s.clipPath || '')) return 'clipped';
    if (s.overflow !== 'visible' || s.overflowX !== 'visible' || s.overflowY !== 'visible') {
      const r = a.getBoundingClientRect();
      if (r.width <= 2 || r.height <= 2) return 'clipped';
    }
  }
  const bg = effectiveBackground(el, win);
  if (color && bg && contrast(color, bg) < 1.4) return 'low-contrast';
  return null;
}

// "Off-screen" means pushed out of the page on purpose (left:-9999px, text-indent:-9999px, top:-9999px).
// Text further down the page, or below the fold of an inner scrolling box, is NOT hidden: the user can
// scroll to it. So only the left/top edges count, and vertical only for absolutely/fixed positioned boxes.
function nodeGeometryReason(node, doc, win) {
  const range = doc.createRange();
  range.selectNodeContents(node);
  const rects = range.getClientRects();
  if (!rects.length) return 'zero-size';
  const r = range.getBoundingClientRect();
  if (r.width < 1 || r.height < 1) return 'zero-size';
  if (r.right + win.scrollX <= 0) return 'offscreen';
  if (r.bottom + win.scrollY <= -200) {
    for (let a = node.parentElement, i = 0; a && i < 6; a = a.parentElement, i++) {
      const pos = win.getComputedStyle(a).position;
      if (pos === 'absolute' || pos === 'fixed') return 'offscreen';
    }
  }
  return null;
}

function blockAncestor(el, win, cache) {
  let a = el;
  while (a && a !== a.ownerDocument.body) {
    if (cache.has(a)) return cache.get(a);
    const d = win.getComputedStyle(a).display;
    if (BLOCK_DISPLAY.test(d)) { cache.set(el, a); return a; }
    a = a.parentElement;
  }
  return el.ownerDocument.body;
}

const clean = s => s.replace(/\s+/g, ' ').trim();

/**
 * @returns {{meta, blocks:{text,tag}[], hidden:{text,reason}[], stats}}
 */
export function capturePage({ doc = document, win = window, maxNodes = 60000 } = {}) {
  const body = doc.body;
  const blocks = [], hidden = [];
  const reasonCache = new Map(), blockCache = new Map();
  let cur = null, curHidden = null, nodes = 0, hiddenChars = 0, visibleChars = 0;
  const flush = () => { if (cur) { const t = clean(cur.parts.join('')); if (t) { blocks.push({ text: t, tag: cur.tag }); visibleChars += t.length; } cur = null; } };
  const flushHidden = () => { if (curHidden) { const t = clean(curHidden.parts.join(' ')); if (t.length >= 3) { hidden.push({ text: t.slice(0, 2000), reason: curHidden.reason }); hiddenChars += t.length; } curHidden = null; } };

  const walker = doc.createTreeWalker(body, NodeFilter.SHOW_TEXT, {
    acceptNode(n) {
      const p = n.parentElement;
      if (!p || p.closest(SKIP_SELECTOR)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }
  });
  let node;
  while ((node = walker.nextNode()) && nodes++ < maxNodes) {
    const el = node.parentElement;
    // whitespace between inline elements ("<a>Gizlilik</a> <a>Çerez</a>") is a visible space:
    // dropping it glued words together and quotes no longer matched the page
    if (!node.nodeValue.trim()) { if (cur) cur.parts.push(' '); continue; }
    let reason = reasonCache.get(el);
    if (reason === undefined) { reason = elementHiddenReason(el, win, doc); reasonCache.set(el, reason); }
    if (!reason) reason = nodeGeometryReason(node, doc, win);
    const blockEl = blockAncestor(el, win, blockCache);
    if (reason) {
      if (curHidden && curHidden.el === blockEl && curHidden.reason === reason) curHidden.parts.push(node.nodeValue);
      else { flushHidden(); curHidden = { el: blockEl, reason, parts: [node.nodeValue] }; }
      continue;
    }
    if (cur && cur.el === blockEl) cur.parts.push(node.nodeValue);
    else { flush(); cur = { el: blockEl, tag: /^H[1-6]$/.test(blockEl.tagName) ? blockEl.tagName.toLowerCase() : 'p', parts: [node.nodeValue] }; }
  }
  flush(); flushHidden();
  const loc = win.location;
  return {
    meta: { title: doc.title || '', url: loc.href, canonical: doc.querySelector('link[rel="canonical"]')?.href || '', host: loc.host, lang: doc.documentElement.lang || '' },
    blocks, hidden,
    stats: { textNodes: nodes, visibleChars, hiddenChars, truncatedNodes: nodes > maxNodes }
  };
}
