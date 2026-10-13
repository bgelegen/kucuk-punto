// Deterministic risk score. The model cannot set or influence it except through
// findings that survived schema validation AND quote verification.
//
// For each category: contribution = categoryWeight * (maxSeverity + 0.5 * min(extraFindings, 2))
// raw = sum of contributions;  score = round(100 * (1 - e^(-raw / 10)))
// Findings with confidence < MIN_CONFIDENCE are shown as "belirsiz" and do not count.

import { CATEGORIES, SEVERITY } from './taxonomy.js';

export const MIN_CONFIDENCE = 0.5;
export const BANDS = [
  { max: 29, id: 'low', tr: 'Düşük risk' },
  { max: 59, id: 'medium', tr: 'Orta risk' },
  { max: 100, id: 'high', tr: 'Yüksek risk' }
];

export function computeScore(findings) {
  const byCat = {};
  for (const f of findings) {
    if ((f.confidence ?? 1) < MIN_CONFIDENCE) continue;
    const c = (byCat[f.category] ||= { count: 0, max: 0 });
    c.count++;
    c.max = Math.max(c.max, SEVERITY[f.severity] || 0);
  }
  let raw = 0;
  const breakdown = [];
  for (const [cat, c] of Object.entries(byCat)) {
    const w = CATEGORIES[cat]?.weight ?? 1;
    const contribution = w * (c.max + 0.5 * Math.min(c.count - 1, 2));
    raw += contribution;
    breakdown.push({ category: cat, count: c.count, maxSeverity: c.max, contribution: Math.round(contribution * 100) / 100 });
  }
  const score = Math.round(100 * (1 - Math.exp(-raw / 10)));
  const band = BANDS.find(b => score <= b.max);
  breakdown.sort((a, b) => b.contribution - a.contribution);
  return { score, band: band.id, band_tr: band.tr, raw: Math.round(raw * 100) / 100, breakdown };
}
