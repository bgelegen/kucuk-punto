// End-to-end test of the REAL unpacked extension (manifest, service worker, content script, options page)
// in Chromium via Playwright. The model is the local mock server, so no key or network is needed.
//
//   npm i -D playwright && npx playwright install chromium   (once)
//   npm run test:e2e                [SHOTS=docs/screenshots to save screenshots]
//
// Cypress cannot load extensions reliably in Chrome 137+, which is why the Cypress demo uses the
// harness; this test is the proof that the packaged extension itself works.

import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import assert from 'node:assert/strict';
import { build } from '../scripts/build.js';
import { startHarness } from '../scripts/serve.js';
import { startMockServer } from '../scripts/mock-llm.js';
import { ROOT } from '../scripts/env.js';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const SHOTS = process.env.SHOTS ? path.resolve(process.env.SHOTS) : null;
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

const results = [];
async function step(name, fn) {
  const t = Date.now();
  try { await fn(); results.push(['ok', name, Date.now() - t]); console.log(`  ✓ ${name}`); }
  catch (e) { results.push(['FAIL', name]); console.log(`  ✗ ${name}\n    ${e.stack || e}`); }
}

await build({ quiet: true });
const mock = await startMockServer(0, 'helpful');
const site = await startHarness({ port: 0, quiet: true, inject: false, mockMode: 'helpful' });
const MOCK_URL = `http://127.0.0.1:${mock.address().port}/v1`;
const SITE = `http://127.0.0.1:${site.port}`;

const EXT = path.join(ROOT, 'extension');
const userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kp-e2e-'));
const ctx = await chromium.launchPersistentContext(userDir, {
  channel: 'chromium', headless: true, viewport: { width: 1280, height: 800 },
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`]
});
let [sw] = ctx.serviceWorkers();
if (!sw) sw = await ctx.waitForEvent('serviceworker');
const extId = new URL(sw.url()).host;
// first install opens the options page (no key yet) — close it, we test options separately
await new Promise(r => setTimeout(r, 500));
for (const p of ctx.pages()) if (p.url().startsWith('chrome-extension://')) await p.close();

const configure = (over = {}) => sw.evaluate((s) => chrome.storage.local.set(s),
  { provider: 'custom', baseUrl: MOCK_URL, model: 'kp-mock-1', apiKey: 'test-key-not-a-secret', autoAnalyze: false, ...over });

const shadow = (page) => page.locator('[data-kp-host]');
const activeTabId = () => sw.evaluate(async () => (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0].id);
async function analyzeOn(page, url, { viaToolbar = false } = {}) {
  await page.goto(url);
  if (viaToolbar) {
    // same message the toolbar button sends (chrome.action.onClicked -> kp:toggle)
    await page.waitForTimeout(500);
    const tabId = await activeTabId();
    await sw.evaluate((id) => chrome.tabs.sendMessage(id, { type: 'kp:toggle' }), tabId);
  } else await shadow(page).locator('[data-kp=pill]').click({ timeout: 8000 });
  await shadow(page).locator('[data-kp=analyze]').click();
  await shadow(page).locator('[data-kp=score], [data-kp=error]').first().waitFor({ timeout: 30000 });
}
const shot = async (page, name, opts = {}) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name + '.png'), ...opts }); };

console.log(`extension ${extId} · mock ${MOCK_URL} · site ${SITE}`);

await step('options page lists providers and saves settings', async () => {
  const p = await ctx.newPage();
  await p.goto(`chrome-extension://${extId}/options.html`);
  assert.ok(await p.locator('#provider option').count() >= 6);
  await p.selectOption('#provider', 'custom');
  await p.fill('#apiKey', 'test-key-not-a-secret');
  await p.locator('details summary').click();
  await p.fill('#model', 'kp-mock-1');
  await p.fill('#baseUrl', MOCK_URL);
  await shot(p, 'options');
  await p.click('[data-kp=test]');
  await p.locator('#status.ok, #status.err').waitFor({ timeout: 15000 });
  const txt = await p.locator('#status').textContent();
  assert.ok(await p.locator('#status.ok').count(), txt);
  assert.match(txt, /Bağlantı çalışıyor/);
  assert.match(txt, /1 iddia reddedildi/);            // the mock's fabricated quote
  await p.close();
});

let page;
await step('real ToS page: detection pill, report, every quote exists verbatim in the page', async () => {
  await configure();
  page = await ctx.newPage();
  await analyzeOn(page, `${SITE}/netflix-tos.html`);
  const score = Number(await shadow(page).locator('[data-kp=score]').getAttribute('data-score'));
  assert.ok(score > 0 && score <= 100);
  assert.ok(await shadow(page).locator('[data-kp=disclaimer]').isVisible(), 'disclaimer visible');
  const quotes = await shadow(page).locator('[data-kp=finding] [data-kp=quote]').allTextContents();
  assert.ok(quotes.length >= 3, 'has findings');
  const pageText = (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ');
  for (const q of quotes) {
    const body = q.slice(q.indexOf('“') + 1, q.lastIndexOf('”')).replace(/\s+/g, ' ');
    assert.ok(pageText.includes(body), 'quote not in page: ' + body.slice(0, 80));
  }
  assert.equal(await shadow(page).locator('[data-kp=rejected]').getAttribute('data-count'), '1');
  const kinds = await shadow(page).locator('[data-kp=uncertain-item]').evaluateAll(els => els.map(e => e.dataset.kind));
  assert.ok(kinds.includes('external_reference'), 'reports the unread Privacy Statement: ' + kinds);
  await shot(page, 'netflix-report');
});

await step('toolbar badge shows the same score (outside the page\'s reach)', async () => {
  const score = await shadow(page).locator('[data-kp=score]').getAttribute('data-score');
  await page.bringToFront();
  const tabId = await activeTabId();
  const badge = await sw.evaluate((id) => chrome.action.getBadgeText({ tabId: id }), tabId);
  assert.equal(badge, score);
});

await step('"Metinde göster" highlights the quote in the page', async () => {
  await shadow(page).locator('[data-kp=show-in-page]').first().click();
  await page.waitForTimeout(600);
  const n = await page.evaluate(() => CSS.highlights.get('kp-quote')?.size || 0);
  assert.equal(n, 1);
  await shot(page, 'netflix-highlight');
});

await step('risk map: 14 categories, coloured exactly where a finding exists; "Haklarınız" shows static law links', async () => {
  const cells = shadow(page).locator('[data-kp=map-cell]');
  assert.equal(await cells.count(), 14);
  const lit = await cells.evaluateAll(els => els.filter(e => ['high', 'medium', 'low'].includes(e.dataset.state)).map(e => e.dataset.category).sort());
  const cats = [...new Set(await shadow(page).locator('[data-kp=finding]').evaluateAll(els => els.map(e => e.dataset.category)))].sort();
  assert.deepEqual(lit, cats);
  await shadow(page).locator(`[data-kp=map-cell][data-category=${cats[0]}]`).click();
  const card = shadow(page).locator(`[data-kp=finding][data-category=${cats[0]}]`).first();
  await card.locator('[data-kp=guidance-toggle]').click();
  const g = card.locator('[data-kp=guidance]');
  assert.ok(await g.isVisible());
  assert.match(await g.textContent(), /hukuki tavsiye değildir/i);
  const hrefs = await g.locator('a').evaluateAll(as => as.map(a => a.href));
  for (const hr of hrefs) assert.match(hr, /^https:\/\/www\.mevzuat\.gov\.tr\//);
  await shot(page, 'netflix-guidance');
});

await step('"Rapor" downloads a standalone HTML file: quotes as text, no scripts, CSP that blocks everything', async () => {
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 10000 }), shadow(page).locator('[data-kp=export]').click()]);
  assert.match(dl.suggestedFilename(), /^kucuk-punto-127\.0\.0\.1-\d+-\d{4}-\d{2}-\d{2}\.html$/);
  const html = fs.readFileSync(await dl.path(), 'utf8');
  assert.match(html, /Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"/);
  assert.match(html, /Hukuki tavsiye değildir/);
  assert.ok(!/<script/i.test(html), 'no script tag');
  const first = (await shadow(page).locator('[data-kp=finding] [data-kp=quote]').first().textContent());
  const q = first.slice(first.indexOf('“') + 1, first.lastIndexOf('”')).slice(0, 60).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  assert.ok(html.includes(q), 'first quote is in the file');
});

await step('injection page: hidden instructions never reach the model, visible one is quarantined', async () => {
  const p = await ctx.newPage();
  await analyzeOn(p, `${SITE}/streambox-abonelik.html`);
  const sec = shadow(p).locator('[data-kp=security]');
  assert.ok(await sec.isVisible());
  const secText = await sec.textContent();
  assert.match(secText, /gizli metin/i);
  assert.match(secText, /görünür cümle/);
  const unc = await shadow(p).locator('[data-kp=uncertain-item]').evaluateAll(els => els.map(e => e.dataset.kind));
  assert.ok(unc.includes('hidden_content'), 'collapsed section reported: ' + unc);
  assert.ok(Number(await shadow(p).locator('[data-kp=score]').getAttribute('data-score')) >= 60);
  await shot(p, 'streambox-security');
  await p.close();
});

await step('change tracking: the updated contract shows what changed, decided by the text', async () => {
  const p = await ctx.newPage();
  await analyzeOn(p, `${SITE}/streambox-abonelik-v2.html`);
  const ch = shadow(p).locator('[data-kp=changes]');
  assert.equal(await ch.getAttribute('data-status'), 'changed');
  const added = (await shadow(p).locator('[data-kp=change-added]').allTextContents()).join(' | ');
  assert.match(added, /30 gün/);
  assert.match(added, /14 gün/);
  // the mock model stops at 9 findings, so the AI-training clause is caught by the rules only:
  // it is still listed among the changes, as "check this" rather than as a confirmed risk
  const checks = (await shadow(p).locator('[data-kp=change-check]').allTextContents()).join(' | ');
  assert.match(added + checks, /Yapay zekâ eğitimi/);
  assert.match((await shadow(p).locator('[data-kp=change-removed]').allTextContents()).join(' | '), /7 gün/);
  assert.equal(await shadow(p).locator('[data-kp=finding][data-category=auto_renewal]').getAttribute('data-new'), 'true');
  const flags = await shadow(p).locator('[data-kp=finding]').evaluateAll(els => els.map(e => [e.dataset.category, e.dataset.new || '']));
  assert.deepEqual(flags.filter(f => f[1] === 'true').map(f => f[0]).sort(), ['auto_renewal', 'cancellation_refund'], 'only findings in changed clauses are new');
  assert.ok(flags.filter(f => !f[1]).length >= 4, 'findings in unchanged clauses are not marked new');
  await shot(p, 'streambox-changes');
  // the same page again: unchanged
  await analyzeOn(p, `${SITE}/streambox-abonelik-v2.html?utm_source=x`);
  assert.equal(await shadow(p).locator('[data-kp=changes]').getAttribute('data-status'), 'same');
  await p.close();
});

await step('options page lists the analysis history (fingerprints only) and can clear it', async () => {
  const p = await ctx.newPage();
  await p.goto(`chrome-extension://${extId}/options.html`);
  await p.locator('[data-kp=history-row]').first().waitFor({ timeout: 5000 });
  assert.ok(await p.locator('[data-kp=history-row]').count() >= 2);
  const stored = JSON.stringify(await sw.evaluate(() => chrome.storage.local.get('kp_history')));
  assert.ok(!stored.includes('Taraflar ve kapsam'), 'contract text is not stored');
  await p.locator('[data-kp=history-section]').scrollIntoViewIfNeeded();
  await shot(p, 'options-history');
  await p.click('[data-kp=clear-history]');
  await p.locator('[data-kp=history-row]').first().waitFor({ state: 'detached', timeout: 5000 });
  assert.deepEqual(await sw.evaluate(() => chrome.storage.local.get('kp_history')), {});
  await p.close();
});

await step('right-click "analyse selected text" works where page capture is not wanted', async () => {
  const p = await ctx.newPage();
  await p.goto(`${SITE}/netflix-tos.html`);
  await p.waitForTimeout(400);
  await p.evaluate(() => {
    const ps = [...document.querySelectorAll('main p, article p, p')].slice(0, 12);
    const r = document.createRange(); r.setStartBefore(ps[0]); r.setEndAfter(ps[ps.length - 1]);
    getSelection().removeAllRanges(); getSelection().addRange(r);
  });
  const tabId = await activeTabId();
  await sw.evaluate((id) => chrome.tabs.sendMessage(id, { type: 'kp:analyzeSelection' }), tabId);
  await shadow(p).locator('[data-kp=score]').waitFor({ timeout: 20000 });
  const kinds = await shadow(p).locator('[data-kp=uncertain-item]').evaluateAll(els => els.map(e => e.dataset.kind));
  assert.ok(kinds.includes('selection'), 'says only the selection was read: ' + kinds);
  assert.equal(await shadow(p).locator('[data-kp=changes]').count(), 0, 'a selection is not a document version');
  await p.close();
});

await step('real-world layouts (dark page, font-size:0 wrapper, inner scroll, content-visibility) are read', async () => {
  for (const name of ['normal', 'dark-backdrop', 'fontsize-zero', 'inner-scroll', 'content-visibility']) {
    const p = await ctx.newPage();
    await analyzeOn(p, `${SITE}/test/${name}.html`, { viaToolbar: true });
    const n = await shadow(p).locator('[data-kp=finding]').count();
    assert.ok(n >= 3, `${name}: ${n} findings`);
    const kinds = await shadow(p).locator('[data-kp=uncertain-item]').evaluateAll(els => els.map(e => e.dataset.kind));
    assert.ok(!kinds.includes('layout_suspect') && !kinds.includes('hidden_content'), `${name}: ${kinds}`);
    if (name === 'dark-backdrop') await shot(p, 'dark-page');
    await p.close();
  }
});

await step('HTML inside a quote is shown as text, never executed; attribute tricks do not hide clauses', async () => {
  const p = await ctx.newPage();
  await analyzeOn(p, `${SITE}/test-xss.html`, { viaToolbar: true });   // short page: no auto pill
  await p.waitForTimeout(300);
  assert.equal(await p.evaluate(() => window.__kpXss), undefined);
  assert.equal(await shadow(p).locator('img').count(), 0);
  const quotes = (await shadow(p).locator('[data-kp=quote]').allTextContents()).join(' ');
  assert.match(quotes, /<img src=x onerror=/);
  // a page cannot hide a clause from the analysis by copying our attribute names onto it
  assert.equal(await shadow(p).locator('[data-kp=finding][data-category=ai_training]').count(), 1);
  await p.close();
});

await step('no key: honest error, then labelled rules-only analysis', async () => {
  await configure({ provider: 'gemini', apiKey: '', baseUrl: '', model: '' });
  const p = await ctx.newPage();
  await analyzeOn(p, `${SITE}/netflix-tos.html`);
  const err = shadow(p).locator('[data-kp=error]');
  assert.equal(await err.getAttribute('data-code'), 'NO_KEY');
  await shot(p, 'no-key');
  await shadow(p).locator('[data-kp=rules-only]').click();
  await shadow(p).locator('[data-kp=score]').waitFor({ timeout: 15000 });
  assert.match(await shadow(p).locator('[data-kp=engine]').textContent(), /Yalnızca kurallar/);
  const kinds = await shadow(p).locator('[data-kp=uncertain-item]').evaluateAll(els => els.map(e => e.dataset.kind));
  assert.ok(kinds.includes('rules_only'));
  await p.close();
});

await step('provider failure (bad key) falls back to rules and says why', async () => {
  await configure({ baseUrl: 'http://127.0.0.1:9/v1' });   // nothing listens on port 9
  const p = await ctx.newPage();
  await analyzeOn(p, `${SITE}/netflix-tos.html`);
  assert.match(await shadow(p).locator('[data-kp=engine]').textContent(), /Model hatası/);
  const t = await shadow(p).locator('[data-kp=uncertain-item][data-kind=rules_only]').textContent();
  assert.match(t, /Model kullanılamadı/);
  await p.close();
});

await ctx.close();
mock.close(); site.server.close();
const failed = results.filter(r => r[0] === 'FAIL').length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
