// Change tracking, guidance table and the report's private fields.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { handleAnalyze } from '../src/background/handler.js';
import { textToBlocks } from '../src/core/segment.js';
import { documentKey, fingerprint, compareWithPrevious, makeSnapshot } from '../src/core/history.js';
import { GUIDANCE, GUIDANCE_NOTE_TR } from '../src/core/guidance.js';
import { CATEGORIES } from '../src/core/taxonomy.js';
import { ICONS, SHORT_TR } from '../src/content/icons.js';
import { mockLLM } from '../scripts/mock-llm.js';

const randomBytes = n => crypto.randomBytes(n);
const V1 = `Abonelik Koşulları

Aboneliğiniz, dönem sonundan en az 7 gün önce iptal etmediğiniz sürece otomatik olarak yenilenir.

Ödenen ücretler hiçbir koşulda iade edilmez.

Bu sözleşmeden doğan uyuşmazlıklar bağlayıcı tahkim yoluyla çözülür; toplu dava açma hakkından feragat edersiniz.`;
const V2 = V1
  .replace('en az 7 gün önce', 'en az 30 gün önce')
  .replace('feragat edersiniz.', 'feragat edersiniz.\n\nYüklediğiniz içerikler yapay zekâ modellerini eğitmek için kullanılabilir.');

function memoryStore() {
  const m = new Map();
  return { get: async k => m.get(k) || null, set: async (k, v) => { m.set(k, v); }, m };
}
const run = (text, history, meta = {}) => handleAnalyze(
  { blocks: textToBlocks(text), hidden: [], meta: { title: 'StreamBox', url: 'https://ornek.test/kosullar?utm=x#m2', canonical: 'https://ornek.test/kosullar', ...meta } },
  { randomBytes, history, llmOverride: { llm: mockLLM('helpful'), provider: 'mock', model: 'm' } });

test('documentKey prefers the canonical link and drops query and hash', () => {
  assert.equal(documentKey({ url: 'https://A.test/Terms/?utm=1#x' }), 'https://a.test/terms');
  assert.equal(documentKey({ url: 'https://a.test/x?y', canonical: 'https://a.test/terms' }), 'https://a.test/terms');
  assert.equal(fingerprint('abc'), fingerprint('abc'));
  assert.notEqual(fingerprint('abc'), fingerprint('abd'));
});

test('change tracking: first → same → changed, decided by the text', async () => {
  const h = memoryStore();
  const a = await run(V1, h);
  assert.equal(a.report.changes.status, 'first');
  const b = await run(V1, h, { url: 'https://ornek.test/kosullar#baska' });
  assert.equal(b.report.changes.status, 'same', 'same canonical document, same text');
  const c = await run(V2, h);
  const ch = c.report.changes;
  assert.equal(ch.status, 'changed');
  assert.equal(ch.by, 'clause');
  assert.equal(ch.clauses_added, 2, 'one clause changed (7 → 30 days), one added (AI training)');
  assert.equal(ch.clauses_removed, 1);
  const addedCats = ch.added.map(x => x.category).sort();
  assert.deepEqual(addedCats, ['ai_training', 'auto_renewal']);
  assert.deepEqual(ch.removed.map(x => x.category), ['auto_renewal']);
  // findings in unchanged clauses are never marked new
  assert.ok(!ch.added.some(x => x.category === 'cancellation_refund' || x.category === 'dispute_waiver'));
  assert.equal(ch.new_ids.length, ch.added.length);
});

test('a reworded quote in an unchanged clause is not a change', () => {
  const report = (quote) => ({ meta: { analysed_at: '2026-10-01T00:00:00Z', title: 't', host: 'h' }, score: 50, band: 'medium', score_status: 'model',
    findings: [{ category: 'auto_renewal', category_tr: 'Otomatik yenileme', severity: 'high', evidence: { clause_id: 'c2', quote } }] });
  const idx1 = { c1: 'aaaa', c2: 'bbbb' }, idx2 = { c1: 'aaaa', c2: 'bbbb', c3: 'cccc' };
  const prev = makeSnapshot(report('otomatik olarak yenilenir'), 'T1', idx1);
  const diff = compareWithPrevious(prev, report('iptal etmediğiniz sürece otomatik olarak yenilenir'), 'T2', idx2);
  assert.equal(diff.status, 'changed');
  assert.equal(diff.added.length, 0, 'same clause, different quote span → not new');
  assert.equal(diff.removed.length, 0);
  assert.equal(diff.clauses_added, 1);
});

test('snapshots keep fingerprints, never the text; the clause index never reaches the page', async () => {
  const h = memoryStore();
  const r = await run(V1, h);
  const snap = [...h.m.values()][0];
  const json = JSON.stringify(snap);
  assert.ok(!json.includes('Abonelik Koşulları'), 'text outside the verified quotes is not stored');
  assert.deepEqual(Object.keys(snap).sort(), ['band', 'clauses', 'date', 'engine', 'findings', 'host', 'score', 'score_status', 'text', 'title', 'url']);
  assert.ok(snap.clauses.every(x => /^[0-9a-f]{8}$/.test(x)));
  assert.ok(!('clauseIndex' in JSON.parse(JSON.stringify(r.report))), 'non-enumerable, not serialised');
  assert.ok(structuredClone(r.report).clauseIndex === undefined);
});

test('selection analyses are not written to history', async () => {
  const h = memoryStore();
  const r = await run(V1, h, { selection: true });
  assert.equal(r.report.changes, null);
  assert.equal(h.m.size, 0);
});

test('every category has guidance, an icon and a short label; links are static mevzuat.gov.tr URLs', () => {
  for (const cat of Object.keys(CATEGORIES)) {
    assert.ok(GUIDANCE[cat]?.tip_tr?.length > 20, `guidance for ${cat}`);
    assert.ok(ICONS[cat], `icon for ${cat}`);
    assert.ok(SHORT_TR[cat], `short label for ${cat}`);
    for (const l of GUIDANCE[cat].laws) assert.match(l.url, /^https:\/\/www\.mevzuat\.gov\.tr\/mevzuat\?MevzuatNo=\d+&MevzuatTur=1&MevzuatTertip=5$/);
  }
  assert.match(GUIDANCE_NOTE_TR, /hukuki tavsiye değildir/i);
});
