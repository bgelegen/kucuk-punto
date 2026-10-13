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
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name + '.png') }); };

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
