import { test } from 'node:test';
import assert from 'node:assert/strict';
import { norm, findInSource } from '../src/core/normalize.js';
import { segment, textToBlocks, splitSentences } from '../src/core/segment.js';
import { verifyFindings } from '../src/core/verify.js';
import { parseModelJSON, validateResponse, providerSchema, RESPONSE_SCHEMA } from '../src/core/schema.js';
import { computeScore } from '../src/core/score.js';
import { findExternalReferences } from '../src/core/references.js';
import { runBaseline } from '../src/core/baseline.js';

const finding = (o = {}) => ({ clause_id: 'c1', category: 'cancellation_refund', severity: 'high', quote: 'payments are non-refundable', explanation_tr: 'İade yok.', confidence: 0.9, ...o });

test('normalize: typographic differences are forgiven, words are not', () => {
  assert.equal(norm('“Hello”  —  World…'), '"hello" - world...');
  const src = 'Ödenen   ücretler “hiçbir” koşulda iade edilmez.';
  const hit = findInSource(src, 'ücretler "hiçbir" koşulda');
  assert.equal(hit.text, 'ücretler “hiçbir” koşulda');
  assert.equal(findInSource(src, 'ücretler bazı koşullarda'), null);
});

test('segment: long paragraphs split on sentences, never mid-sentence; truncation is reported', () => {
  const long = Array.from({ length: 30 }, (_, i) => `Sentence number ${i} is here and it is long enough to matter.`).join(' ');
  const s = segment([{ text: 'Terms', tag: 'h1' }, { text: long, tag: 'p' }]);
  assert.ok(s.clauses.length > 2);
  for (const c of s.clauses.slice(1)) assert.match(c.text, /\.$/);
  assert.equal(s.clauses[1].heading, 'Terms');
  const t = segment([{ text: long }], { maxChars: 300 });
  assert.equal(t.truncated, true);
  assert.ok(t.usedChars <= 300);
  assert.deepEqual(splitSentences('Bir. İki! Üç?'), ['Bir.', 'İki!', 'Üç?']);
  assert.equal(textToBlocks('a para\n\nsecond\npara').length, 2);
});

test('verify: quotes must exist verbatim; wrong clause id is corrected; fabrications rejected', () => {
  const clauses = [{ id: 'c1', text: 'Hello there.' }, { id: 'c2', text: 'To the extent permitted, payments are non-refundable and we do not provide refunds.' }];
  const v = verifyFindings([
    finding(),                                                    // right text, wrong clause -> corrected
    finding({ quote: 'all payments are always refundable', category: 'price_change' }),  // fabricated
    finding({ quote: 'short' }),                                  // too short
    finding({ quote: 'payments are non-refundable and we', severity: 'medium' })   // overlapping duplicate
  ], clauses);
  assert.equal(v.accepted.length, 1);
  assert.equal(v.accepted[0].evidence.clause_id, 'c2');
  assert.equal(v.accepted[0].clause_id_corrected, true);
  assert.deepEqual(v.rejected.map(r => r.reason).sort(), ['DUPLICATE', 'QUOTE_NOT_FOUND', 'QUOTE_TOO_SHORT']);
});

test('schema: extra fields invalidate the response; bad items are dropped, not trusted', () => {
  const ok = { document_type: 'terms_of_service', language: 'en', summary_tr: 'Özet.', findings: [finding()], injection_suspected: [], uncertainties: [] };
  assert.equal(validateResponse(ok).ok, true);
  const extra = validateResponse({ ...ok, risk_score: 0 });
  assert.equal(extra.ok, false);
  assert.match(extra.errors.join(), /risk_score: şemada olmayan alan/);
  const bad = validateResponse({ ...ok, findings: [finding(), finding({ category: 'made_up' }), finding({ confidence: 7 }), finding({ hack: 1 })] });
  assert.equal(bad.ok, true);
  assert.equal(bad.value.findings.length, 1);
  assert.equal(bad.dropped.length, 3);
  const bidi = validateResponse({ ...ok, summary_tr: 'abc‮def\u0007' });
  assert.equal(bidi.value.summary_tr, 'abcdef');
  assert.equal(validateResponse({ ...ok, document_type: 'poem' }).ok, false);
  assert.equal(parseModelJSON('```json\n{"a":1}\n```').value.a, 1);
  assert.ok(parseModelJSON('Sure! {"a":1}').error, 'prose around JSON is not accepted');
  assert.ok(!JSON.stringify(providerSchema(RESPONSE_SCHEMA)).includes('maxLength'));
});

test('score: deterministic, monotonic, ignores low-confidence findings', () => {
  assert.equal(computeScore([]).score, 0);
  assert.equal(computeScore([]).band, 'low');
  const one = computeScore([finding()]).score;
  const two = computeScore([finding(), finding({ category: 'data_sharing' })]).score;
  assert.ok(two > one && one > 0);
  assert.equal(computeScore([finding({ confidence: 0.2 })]).score, 0);
  assert.equal(computeScore([finding(), finding()]).score, computeScore([finding(), finding()]).score);
  assert.ok(computeScore(Array.from({ length: 14 }, () => finding({ category: 'dispute_waiver' }))).score <= 100);
});

test('references: unread documents are detected (EN + TR, incl. non-ASCII word ends)', () => {
  const r = findExternalReferences([
    { id: 'c1', text: 'Please see our Privacy Statement for more.' },
    { id: 'c2', text: 'Ayrıntılar için StreamBox Gizlilik Politikası geçerlidir.' },
    { id: 'c3', text: 'These Terms of Use apply.' }
  ], 'Netflix Terms of Use');
  assert.deepEqual(r.map(x => x.name), ['Privacy Statement', 'StreamBox Gizlilik Politikası']);
});

test('baseline rules: Turkish and English risky clauses are recognised', () => {
  const cats = runBaseline([
    { id: 'c1', text: 'Aboneliğiniz otomatik olarak yenilenir.' },
    { id: 'c2', text: 'Ödenen ücretler hiçbir koşulda iade edilmez.' },
    { id: 'c3', text: 'We may share your personal information with advertising partners.' },
    { id: 'c4', text: 'You waive the right to participate in a class action.' }
  ]).map(f => f.category);
  for (const c of ['auto_renewal', 'cancellation_refund', 'data_sharing', 'dispute_waiver']) assert.ok(cats.includes(c), c);
});
