// Live demo (GitHub Pages) test: serves the repository root the way Pages does and drives the demo
// pages in Chromium. Checks the three answer modes, change tracking across pages, that the visitor's
// key goes only to Google, the download package and that the landing page links resolve.
//
//   npm run test:web        (Playwright, like test:e2e)

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { build } from '../scripts/build.js';
import { ROOT } from '../scripts/env.js';
import { mockAnswer } from '../scripts/mock-llm.js';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const SHOTS = process.env.SHOTS ? path.resolve(process.env.SHOTS) : null;
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
await build({ quiet: true });

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp4': 'video/mp4', '.zip': 'application/zip' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/kucuk-punto/, '');
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('404'); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}/kucuk-punto/`;

const results = [];
async function step(name, fn) {
  try { await fn(); results.push(['ok', name]); console.log(`  ✓ ${name}`); }
  catch (e) { results.push(['FAIL', name]); console.log(`  ✗ ${name}\n    ${e.stack || e}`); }
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true });
await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
const errors = [];
const page = await ctx.newPage();
page.on('pageerror', e => errors.push(e.message));
const H = page.locator('[data-kp-host]');
const bar = page.locator('[data-kp-demo-bar]');
const analyze = async () => {
  await H.locator('[data-kp=pill]').click();
  await H.locator('[data-kp=analyze]').click();
  await H.locator('[data-kp=score], [data-kp=error]').first().waitFor({ timeout: 20000 });
};
const shot = async (name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name + '.png') }); };

await step('landing page: every local link and asset resolves', async () => {
  await page.goto(BASE);
  const refs = await page.evaluate(() => [...document.querySelectorAll('a[href], img[src], video[src], video[poster], link[rel=icon]')]
    .map(e => e.getAttribute('href') || e.getAttribute('src') || e.getAttribute('poster'))
    .concat([...document.querySelectorAll('video[poster]')].map(v => v.getAttribute('poster'))));
  const local = [...new Set(refs.filter(r => r && !/^(https?:|#|mailto:)/.test(r)))];
  assert.ok(local.length >= 8, 'local refs: ' + local);
  for (const r of local) assert.equal((await page.request.get(new URL(r, BASE).href)).status(), 200, r);
  assert.match(await page.textContent('body'), /Hukuki tavsiye değildir/);
});

await step('recorded mode: the saved real Gemini answer is verified live, every quote is in the page', async () => {
  await page.goto(BASE + 'demo/netflix-tos.html');
  await page.waitForFunction(() => document.querySelector('[data-kp-demo-bar]')?.getAttribute('data-mode') === 'recorded');
  await analyze();
  assert.match(await H.locator('[data-kp=engine]').textContent(), /gemini-flash-lite-latest \(kayıtlı yanıt/);
  assert.ok(await H.locator('[data-kp=disclaimer]').isVisible());
  assert.equal(await H.locator('[data-kp=map-cell]').count(), 14);
  const quotes = await H.locator('[data-kp=finding] [data-kp=quote]').allTextContents();
  assert.ok(quotes.length >= 3);
  const text = (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ');
  for (const q of quotes) assert.ok(text.includes(q.slice(q.indexOf('“') + 1, q.lastIndexOf('”')).replace(/\s+/g, ' ')), q.slice(0, 60));
  await shot('web-netflix');
});

await step('rules mode, then change tracking from StreamBox v1 to v2 in the same browser', async () => {
  await page.goto(BASE + 'demo/streambox-abonelik.html');
  await bar.locator('button[data-mode=rules]').click();
  await analyze();
  assert.match(await H.locator('[data-kp=engine]').textContent(), /Yalnızca kurallar/);
  assert.ok(await H.locator('[data-kp=security]').isVisible(), 'hidden instructions are reported without a model');
  await page.goto(BASE + 'demo/streambox-abonelik-v2.html');
  await analyze();
  assert.equal(await H.locator('[data-kp=changes]').getAttribute('data-status'), 'changed');
  const items = (await H.locator('[data-kp=change-added], [data-kp=change-check]').allTextContents()).join(' | ');
  assert.match(items, /30 gün/);
  assert.match(items, /Yapay zekâ eğitimi/);
  await shot('web-changes');
});

await step('own-key mode: the key is sent only to Google, kept only in this tab; pasted text is not stored', async () => {
  const seen = [];
  await ctx.route('**/*', async (route) => {
    const u = route.request().url();
    const auth = route.request().headers()['authorization'];
    if (auth) seen.push(new URL(u).host);
    if (u.startsWith('https://generativelanguage.googleapis.com/')) {
      const body = JSON.parse(route.request().postData());
      const user = body.messages.find(m => m.role === 'user').content;
      return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify({ model: body.model, choices: [{ message: { content: JSON.stringify(mockAnswer(user)) } }] }) });
    }
    return route.fallback();
  });
  await page.goto(BASE + 'demo/metin.html');
  await bar.locator('button[data-mode=key]').click();
  await bar.locator('input').fill('test-key-not-a-secret');
  await bar.locator('button', { hasText: 'Bu sekmede kullan' }).click();
  assert.equal(await bar.getAttribute('data-mode'), 'key');
  await page.fill('#text', fs.readFileSync(path.join(ROOT, 'eval/corpus/signal-tos.txt'), 'utf8').slice(0, 6000));
  await page.click('#paste button[type=submit]');
  await H.locator('[data-kp=analyze]').click();
  await H.locator('[data-kp=score]').waitFor({ timeout: 20000 });
  assert.match(await H.locator('[data-kp=engine]').textContent(), /gemini · gemini-flash-lite-latest/);
  assert.deepEqual([...new Set(seen)], ['generativelanguage.googleapis.com']);
  assert.equal(await H.locator('[data-kp=changes]').count(), 0, 'pasted text has no document history');
  const storage = await page.evaluate(() => ({ local: JSON.stringify(localStorage), session: Object.keys(sessionStorage) }));
  assert.ok(!storage.local.includes('test-key-not-a-secret'), 'key is not in localStorage');
  assert.ok(!storage.local.includes('Signal'), 'pasted text is not stored');
  await bar.locator('button', { hasText: 'Anahtarı unut' }).click();
  assert.equal(await page.evaluate(() => sessionStorage.getItem('kp_web_key')), null);
  await ctx.unroute('**/*');
});

await step('the download package is a loadable extension (manifest v3 at kucuk-punto/)', async () => {
  const res = await page.request.get(BASE + 'indir/kucuk-punto-eklenti.zip');
  assert.equal(res.status(), 200);
  const buf = await res.body();
  assert.equal(buf.readUInt32LE(0), 0x04034b50);
  assert.ok(buf.includes(Buffer.from('kucuk-punto/manifest.json')) && buf.includes(Buffer.from('kucuk-punto/dist/content.js')));
});

await step('no script errors on any demo page', async () => {
  for (const p of ['', 'demo/netflix-tos.html', 'demo/streambox-abonelik.html', 'demo/streambox-abonelik-v2.html', 'demo/metin.html']) await page.goto(BASE + p);
  assert.deepEqual(errors, []);
});

await browser.close(); server.close();
const failed = results.filter(r => r[0] === 'FAIL').length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
