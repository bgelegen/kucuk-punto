// Turns captured blocks (or plain text) into numbered clauses: the unit the model cites.

const MAX_CLAUSE = 900;      // longer blocks are split into sentence groups
const TARGET_CLAUSE = 650;
const MIN_TEXT = 3;

const SENTENCE_SPLIT = /(?<=[.!?;:])\s+(?=[\p{Lu}0-9"“'(\[•-])/u;

export function splitSentences(text) {
  return String(text).split(SENTENCE_SPLIT).map(s => s.trim()).filter(Boolean);
}

function chunk(text) {
  if (text.length <= MAX_CLAUSE) return [text];
  const out = [];
  let cur = '';
  for (const s of splitSentences(text)) {
    if (cur && (cur.length + 1 + s.length) > TARGET_CLAUSE) { out.push(cur); cur = s; }
    else cur = cur ? cur + ' ' + s : s;
  }
  if (cur) out.push(cur);
  // a single sentence longer than MAX_CLAUSE stays whole: we never cut inside a sentence
  return out;
}

/** Plain text -> blocks (paragraphs separated by blank lines). Used by eval and tests. */
export function textToBlocks(text) {
  return String(text).split(/\n\s*\n/).map(p => p.replace(/\s*\n\s*/g, ' ').trim()).filter(p => p.length >= MIN_TEXT)
    .map(p => ({ text: p, tag: /^#{1,6}\s/.test(p) ? 'h' : 'p' }));
}

/**
 * @param {{text:string, tag?:string}[]} blocks
 * @param {{maxChars?:number}} opts
 * @returns {{clauses:{id:string,text:string,heading:string}[], totalChars:number, usedChars:number, truncated:boolean}}
 */
export function segment(blocks, { maxChars = 120000 } = {}) {
  const clauses = [];
  let heading = '';
  let total = 0, used = 0, truncated = false, n = 0;
  for (let bi = 0; bi < blocks.length; bi++) {
    const b = blocks[bi];
    const text = String(b.text || '').replace(/\s+/g, ' ').trim();
    if (text.length < MIN_TEXT) continue;
    total += text.length;
    const isHeading = /^h[1-6]?$/i.test(b.tag || '') && text.length < 160;
    if (isHeading) heading = text.replace(/^#{1,6}\s*/, '');
    for (const part of chunk(text)) {
      if (used + part.length > maxChars) { truncated = true; continue; }
      used += part.length;
      clauses.push({ id: 'c' + (++n), text: part, heading: isHeading ? '' : heading, block: bi });
    }
  }
  return { clauses, totalChars: total, usedChars: used, truncated };
}
