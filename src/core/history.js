// "Has this contract changed since I last checked it?"
// Pure functions; storage is injected (chrome.storage in the extension, a Map in the harness).
// Only fingerprints are kept (of the whole text and of each clause) plus the verified findings,
// never the full text.
//
// The diff is decided by the TEXT, not by the model: a clause is "new" when its fingerprint was not
// in the previous snapshot. A finding is marked YENİ only if its quote sits in such a clause, so a
// model that words the same finding a little differently on the second run does not create a fake
// change. A previous finding is reported as KALKTI only if its clause no longer exists verbatim.

import { norm } from './normalize.js';

/** FNV-1a 32-bit, hex. Fast, synchronous, good enough to detect a changed text. */
export function fingerprint(s) {
  let h = 0x811c9dc5;
  const t = String(s);
  for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

/** The same document can live at several URLs (?utm=…, #section): prefer the canonical link. */
export function documentKey(meta = {}) {
  const raw = meta.canonical || meta.url || '';
  try { const u = new URL(raw); return (u.origin + u.pathname).replace(/\/+$/, '').toLowerCase(); }
  catch { return String(raw).toLowerCase(); }
}

export const findingId = f => `${f.category}:${fingerprint(norm(f.evidence?.quote || f.quote || ''))}`;
export const clauseFingerprint = text => fingerprint(norm(text));
const MAX_CLAUSES = 3000;

const brief = (f, clauseIndex) => ({
  id: findingId(f), cfp: clauseIndex?.[f.evidence?.clause_id] || null,
  category: f.category, category_tr: f.category_tr, severity: f.severity, quote: String(f.evidence?.quote || '').slice(0, 220)
});

/** @param clauseIndex {{[clause_id:string]: string}} clause id → clause fingerprint */
export function makeSnapshot(report, textFingerprint, clauseIndex = {}) {
  return {
    date: report.meta.analysed_at, title: report.meta.title, host: report.meta.host,
    text: textFingerprint, score: report.score, band: report.band, score_status: report.score_status,
    clauses: [...new Set(Object.values(clauseIndex))].slice(0, MAX_CLAUSES),
    findings: report.findings.map(f => brief(f, clauseIndex))
  };
}

/**
 * @returns {{status:'first'|'same'|'changed', prev_date?, prev_score?, score_delta?, clauses_added?:number,
 *   clauses_removed?:number, new_ids?:string[], added?:object[], removed?:object[], by?:'clause'|'quote'}}
 */
export function compareWithPrevious(prev, report, textFingerprint, clauseIndex = {}) {
  if (!prev) return { status: 'first' };
  const base = { prev_date: prev.date, prev_score: prev.score };
  if (prev.text === textFingerprint) return { status: 'same', ...base };
  const now = report.findings.map(f => brief(f, clauseIndex));
  const delta = report.score - prev.score;

  if (Array.isArray(prev.clauses) && prev.clauses.length && Object.keys(clauseIndex).length) {
    const before = new Set(prev.clauses), after = new Set(Object.values(clauseIndex));
    const added = now.filter(f => f.cfp && !before.has(f.cfp));
    const removed = prev.findings.filter(f => f.cfp && !after.has(f.cfp));
    // new clauses that the rules flagged but the model did not confirm: shown as "check this", not as a risk
    const seen = new Set(added.map(f => f.category + f.cfp));
    const checks = (report.uncertain || [])
      .filter(u => (u.kind === 'rule_only' || u.kind === 'low_confidence') && u.category && clauseIndex[u.clause_id] && !before.has(clauseIndex[u.clause_id]))
      .map(u => ({ category: u.category, category_tr: u.category_tr || u.category, quote: String(u.quote || '').slice(0, 220), cfp: clauseIndex[u.clause_id] }))
      .filter(u => !seen.has(u.category + u.cfp) && seen.add(u.category + u.cfp));
    return {
      status: 'changed', ...base, score_delta: delta, by: 'clause',
      clauses_added: [...after].filter(x => !before.has(x)).length,
      clauses_removed: [...before].filter(x => !after.has(x)).length,
      new_ids: added.map(f => f.id), added, removed, checks
    };
  }
  // older snapshot without clause fingerprints: fall back to comparing the quotes
  const before = new Set(prev.findings.map(f => f.id)), after = new Set(now.map(f => f.id));
  const added = now.filter(f => !before.has(f.id));
  const removed = prev.findings.filter(f => !after.has(f.id));
  return { status: 'changed', ...base, score_delta: delta, by: 'quote', new_ids: added.map(f => f.id), added, removed };
}
