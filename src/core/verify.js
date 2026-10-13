// Evidence check: a finding is valid only if its quote occurs in the captured text.
// "Alıntısı olmayan iddia geçersiz sayılır."

import { norm, findInSource } from './normalize.js';
import { QUARANTINE_MARK } from './injection.js';
import { LIMITS } from './schema.js';
import { SEVERITY } from './taxonomy.js';

export const REJECT_REASONS = {
  QUOTE_TOO_SHORT: 'Alıntı çok kısa, kanıt sayılmaz.',
  QUOTE_NOT_FOUND: 'Alıntı sayfadaki metinde bulunamadı.',
  QUOTE_FROM_QUARANTINE: 'Alıntı, kaldırılan şüpheli talimattan alınmış.',
  DUPLICATE: 'Aynı madde ve kategori için yinelenen iddia.'
};

/**
 * @param findings validated model findings
 * @param clauses  clauses exactly as the model saw them (after quarantine)
 * @returns {{accepted, rejected}}
 */
export function verifyFindings(findings, clauses) {
  const byId = new Map(clauses.map(c => [c.id, c]));
  const accepted = [];
  const rejected = [];
  for (const f of findings) {
    const q = norm(f.quote);
    if (q.includes(norm(QUARANTINE_MARK))) { rejected.push({ finding: f, reason: 'QUOTE_FROM_QUARANTINE' }); continue; }
    if (q.length < LIMITS.quoteMin) { rejected.push({ finding: f, reason: 'QUOTE_TOO_SHORT' }); continue; }
    let clause = byId.get(f.clause_id);
    let hit = clause ? findInSource(clause.text, f.quote) : null;
    let corrected = false;
    if (!hit) {
      for (const c of clauses) { const h = findInSource(c.text, f.quote); if (h) { clause = c; hit = h; corrected = true; break; } }
    }
    if (!hit) { rejected.push({ finding: f, reason: 'QUOTE_NOT_FOUND' }); continue; }
    accepted.push({
      ...f,
      clause_id: clause.id,
      clause_id_corrected: corrected,
      evidence: { clause_id: clause.id, quote: hit.text, start: hit.start, end: hit.end, heading: clause.heading || '' }
    });
  }
  // de-duplicate: same category + overlapping evidence in the same clause -> keep the more severe one
  const kept = [];
  for (const f of accepted.sort((a, b) => SEVERITY[b.severity] - SEVERITY[a.severity] || b.confidence - a.confidence)) {
    const dup = kept.find(k => k.category === f.category && k.evidence.clause_id === f.evidence.clause_id &&
      k.evidence.start < f.evidence.end && f.evidence.start < k.evidence.end);
    if (dup) rejected.push({ finding: f, reason: 'DUPLICATE' }); else kept.push(f);
  }
  return { accepted: kept, rejected };
}
