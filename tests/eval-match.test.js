import { test } from 'node:test';
import assert from 'node:assert/strict';
import { locatePoints, matchFindings } from '../eval/lib/match.js';

test('eval matcher: caught / missed / false alarm / duplicate / optional', () => {
  const blocks = [{ text: 'Payments are non-refundable.' }, { text: 'We share data with advertisers.' }, { text: 'Hello world.' }, { text: 'Cookies are used.' }];
  const gold = { points: [
    { id: 'A', category: 'cancellation_refund', severity: 'high', evidence: ['non-refundable'] },
    { id: 'B', category: 'data_sharing', severity: 'high', evidence: ['share data'] },
    { id: 'C', category: 'tracking_profiling', severity: 'low', optional: true, evidence: ['Cookies'] }
  ] };
  const points = locatePoints(gold, blocks);
  const clauses = blocks.map((b, i) => ({ id: 'c' + (i + 1), block: i }));
  const f = (cat, cid, sev = 'high') => ({ category: cat, severity: sev, confidence: 0.9, evidence: { clause_id: cid, quote: 'x' } });
  const m = matchFindings([f('cancellation_refund', 'c1'), f('cancellation_refund', 'c1', 'medium'), f('price_change', 'c3'), f('tracking_profiling', 'c4', 'low')], points, clauses);
  assert.deepEqual(m.caught, ['A']);
  assert.deepEqual(m.missed.map(x => x.id), ['B']);
  assert.equal(m.counts.false_alarms, 1);
  assert.equal(m.counts.duplicates, 1);
  assert.equal(m.counts.optional_caught, 1);
  assert.equal(m.recall, 0.5);
  assert.equal(m.precision, 3 / 4);
});
