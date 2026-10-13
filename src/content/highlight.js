// "Metinde göster": finds a verified quote in the live page and highlights it without
// changing the page's DOM (CSS Custom Highlight API). Proves to the user that the quote is real.

import { normWithMap, norm } from '../core/normalize.js';

const STYLE_ID = 'kp-highlight-style';

function textIndex(doc) {
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, {
    acceptNode: n => (n.parentElement && !n.parentElement.closest('script,style,noscript,template')) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT
  });
  const pieces = [];
  let full = '', n;
  while ((n = walker.nextNode())) { pieces.push({ node: n, start: full.length }); full += n.nodeValue + ' '; }
  return { pieces, full };
}

function locate(pieces, offset) {
  let lo = 0, hi = pieces.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (pieces[mid].start <= offset) lo = mid; else hi = mid - 1; }
  const p = pieces[lo];
  return { node: p.node, offset: Math.min(offset - p.start, p.node.nodeValue.length) };
}

export function showQuoteInPage(quote, doc = document) {
  const { pieces, full } = textIndex(doc);
  const { text, map } = normWithMap(full);
  const q = norm(quote);
  const at = text.indexOf(q);
  if (at < 0 || !pieces.length) return false;
  const a = locate(pieces, map[at]);
  const b = locate(pieces, map[at + q.length - 1] + 1);
  const range = doc.createRange();
  range.setStart(a.node, a.offset);
  range.setEnd(b.node, b.offset);
  if (globalThis.CSS && CSS.highlights && globalThis.Highlight) {
    if (!doc.getElementById(STYLE_ID)) {
      const st = doc.createElement('style'); st.id = STYLE_ID;
      st.textContent = '::highlight(kp-quote){background:#ffd43b;color:#111}';
      (doc.head || doc.documentElement).appendChild(st);
    }
    CSS.highlights.set('kp-quote', new Highlight(range));
  } else {
    const sel = doc.getSelection(); sel.removeAllRanges(); sel.addRange(range);
  }
  const el = a.node.parentElement;
  el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  return true;
}

export function clearHighlight() { if (globalThis.CSS && CSS.highlights) CSS.highlights.delete('kp-quote'); }
