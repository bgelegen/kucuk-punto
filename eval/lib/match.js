// Matching system findings against gold "risk points".
//
// A gold point = one distinct consumer risk (e.g. "mandatory arbitration"), with one or more
// verbatim evidence snippets, because the same risk is often repeated in several paragraphs.
// A finding matches a point when (a) its category equals the point's category (or one of the
// point's explicitly allowed alternatives) and (b) its verified quote lies in a paragraph that
// contains one of the point's evidence snippets.
//
//  caught      required point matched by at least one finding        -> recall numerator
//  missed      required point with no matching finding               -> "kaçırılan"
//  false alarm finding that matches no point                         -> "yanlış alarm"
//  duplicate   finding that matches an already-caught point          -> neither TP nor FP
//  optional    debatable point: catching it is fine, missing it is not penalised

import { norm } from '../../src/core/normalize.js';
import { SEVERITY } from '../../src/core/taxonomy.js';

export function locatePoints(gold, blocks) {
  const normBlocks = blocks.map(b => norm(b.text));
  return gold.points.map(p => {
    const paras = new Set();
    const missing = [];
    for (const e of p.evidence) {
      const ne = norm(e);
      let found = false;
      normBlocks.forEach((t, i) => { if (t.includes(ne)) { paras.add(i); found = true; } });
      if (!found) missing.push(e);
    }
    // scope: a dedicated section (e.g. the whole arbitration agreement) — every paragraph in it counts
    for (const sc of p.scope || []) {
      const a = normBlocks.findIndex(t => t.includes(norm(sc.from)));
      const b = normBlocks.findIndex((t, i) => i >= a && t.includes(norm(sc.to)));
      if (a < 0 || b < 0) { missing.push(`scope ${sc.from} … ${sc.to}`); continue; }
      for (let i = a; i <= b; i++) paras.add(i);
    }
    return { ...p, optional: !!p.optional, also: p.also || [], paras, missing };
  });
}

/**
 * @param findings  report findings: {category, severity, confidence, evidence:{clause_id, quote}}
 * @param clauses   clauses with .block (paragraph index)
 */
export function matchFindings(findings, points, clauses) {
  const clauseBlock = new Map(clauses.map(c => [c.id, c.block]));
  const state = new Map(points.map(p => [p.id, { point: p, hits: [] }]));
  const falseAlarms = [], duplicates = [], matched = [];
  const order = [...findings].sort((a, b) => (SEVERITY[b.severity] - SEVERITY[a.severity]) || ((b.confidence ?? 0) - (a.confidence ?? 0)));
  for (const f of order) {
    const para = clauseBlock.get(f.evidence.clause_id);
    const cands = points.filter(p => (p.category === f.category || p.also.includes(f.category)) && p.paras.has(para));
    if (!cands.length) { falseAlarms.push({ ...f, para }); continue; }
    const fresh = cands.find(p => !p.optional && !state.get(p.id).hits.length) || cands.find(p => !state.get(p.id).hits.length);
    if (fresh) { state.get(fresh.id).hits.push(f); matched.push({ point: fresh.id, finding: f }); }
    else { duplicates.push({ ...f, para, point: cands[0].id }); }
  }
  const required = points.filter(p => !p.optional);
  const caught = required.filter(p => state.get(p.id).hits.length);
  const missed = required.filter(p => !state.get(p.id).hits.length);
  const optionalCaught = points.filter(p => p.optional && state.get(p.id).hits.length);
  const sevAgree = matched.filter(m => m.finding.severity === points.find(p => p.id === m.point).severity).length;
  const n = findings.length;
  const precision = n ? (n - falseAlarms.length) / n : null;
  const recall = required.length ? caught.length / required.length : null;
  const f1 = precision != null && recall != null && (precision + recall) ? 2 * precision * recall / (precision + recall) : null;
  return {
    counts: { findings: n, required: required.length, caught: caught.length, missed: missed.length, false_alarms: falseAlarms.length, duplicates: duplicates.length, optional_caught: optionalCaught.length, severity_agree: sevAgree, matched: matched.length },
    precision, recall, f1,
    caught: caught.map(p => p.id),
    missed: missed.map(p => ({ id: p.id, category: p.category, severity: p.severity, note_tr: p.note_tr })),
    false_alarms: falseAlarms.map(f => ({ category: f.category, severity: f.severity, quote: f.evidence.quote.slice(0, 160), para: f.para })),
    duplicates: duplicates.map(f => ({ category: f.category, point: f.point }))
  };
}
