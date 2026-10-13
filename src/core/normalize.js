// Text normalisation used for quote verification and span matching.
// Only typographic differences are forgiven (case, whitespace, quote/dash styles, ligatures).
// Any change of words means the quote is not in the source and the claim is rejected.

const QUOTE_SINGLE = /[‘’‚‛′`´]/;
const QUOTE_DOUBLE = /[“”„‟″«»]/;
const DASH = /[‐-―−]/;
const SPACE = /[\s  -​  　﻿]/;
const INVISIBLE = /[­‌‍⁠]/; // soft hyphen, zero-width joiners

function mapChar(c) {
  if (QUOTE_SINGLE.test(c)) return "'";
  if (QUOTE_DOUBLE.test(c)) return '"';
  if (DASH.test(c)) return '-';
  if (c === '…') return '...';
  return c.normalize('NFKC').toLowerCase();
}

/**
 * Normalise a string and keep a map from every output index to the source index,
 * so a match found in normalised space can be cut out of the original text.
 */
export function normWithMap(src) {
  const s = String(src ?? '');
  let out = '';
  const map = [];
  let pendingSpace = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (INVISIBLE.test(c)) continue;
    if (SPACE.test(c)) { pendingSpace = out.length > 0; continue; }
    if (pendingSpace) { out += ' '; map.push(i); pendingSpace = false; }
    const m = mapChar(c);
    for (const ch of m) { out += ch; map.push(i); }
  }
  return { text: out, map };
}

export function norm(s) {
  return normWithMap(s).text;
}

/** Find a normalised needle in a source string. Returns original [start, end) or null. */
export function findInSource(source, needle) {
  const n = norm(needle);
  if (!n) return null;
  const { text, map } = normWithMap(source);
  const at = text.indexOf(n);
  if (at < 0) return null;
  const start = map[at];
  const end = map[at + n.length - 1] + 1;
  return { start, end, text: String(source).slice(start, end) };
}
