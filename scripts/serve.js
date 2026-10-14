// Cypress harness server.
//
// Why: Chrome 137+ ignores --load-extension in branded Chrome, so Cypress cannot reliably load the
// unpacked extension. Instead this server serves the demo pages, injects the SAME content-script code
// (built from src/content with a fetch transport instead of chrome.runtime), and answers
// POST /__kp/analyze with the SAME background handler the service worker uses.
// The real extension itself is exercised by tests/e2e-extension.mjs (Playwright, persistent context).
//
//   npm run serve                       uses KP_PROVIDER / KP_API_KEY from .env (real model)
//   KP_MOCK=1 npm run serve             demo model (labelled "kp-mock-1" in every report)
//
// Never exposes the key: it stays in this Node process; the page only receives the report.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { build } from './build.js';
import { loadDotEnv, settingsFromEnv, ROOT, isMain } from './env.js';
import { handleAnalyze, isConfigured, resolveLLMConfig } from '../src/background/handler.js';
import { mockLLM, MOCK_MODEL } from './mock-llm.js';
import { pickModel } from './pick-model.js';

const SITE = path.join(ROOT, 'site');
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const INJECT = `<script>window.__KP_HARNESS__ = { endpoint: '/__kp/analyze' };</script>\n<script src="/_kp/harness.js"></script>\n`;

export async function startHarness({ port = Number(process.env.KP_PORT || 5173), quiet = false, mockMode, inject = true } = {}) {
  loadDotEnv();
  await build({ quiet: true });
  const settings = settingsFromEnv();
  const useMock = !!mockMode || process.env.KP_MOCK === '1' || !isConfigured(settings);
  if (!useMock && settings.provider === 'gemini' && !settings.model) {
    // pick a Gemini model that answers right now (free models are often overloaded)
    const pick = await pickModel({ provider: 'gemini', apiKey: settings.apiKey, baseUrl: settings.baseUrl, log: quiet ? () => {} : console.log });
    if (pick.model) settings.model = pick.model;
  }
  const mode = mockMode || process.env.KP_MOCK_MODE || 'helpful';
  const engine = useMock ? `mock (${MOCK_MODEL}:${mode})` : `${resolveLLMConfig(settings).provider} · ${resolveLLMConfig(settings).model}`;

  // change tracking in the harness: same handler, in-memory store
  const store = new Map();
  const history = { get: async k => store.get(k) || null, set: async (k, v) => { store.set(k, v); } };

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    try {
      if (url.pathname === '/__kp/status') {
        return send(res, 200, 'application/json', JSON.stringify({ configured: true, provider: useMock ? 'mock' : settings.provider, autoAnalyze: false }));
      }
      if (url.pathname === '/__kp/analyze' && req.method === 'POST') {
        const body = await readBody(req, 4_000_000);
        const t0 = Date.now();
        const result = await handleAnalyze(JSON.parse(body), {
          settings, randomBytes: n => crypto.randomBytes(n), retry: { retries: 3, maxWaitMs: 45000 }, history,
          llmOverride: useMock ? { llm: mockLLM(mode), provider: 'mock', model: `${MOCK_MODEL}:${mode}` } : null
        });
        if (result.ok && result.report.engine.error) {
          try { fs.writeFileSync(path.join(ROOT, 'cypress', '.harness-error.json'), JSON.stringify({ code: result.report.engine.error.code, model: settings.model })); } catch { /* ignore */ }
        }
        if (!quiet) {
          const r = result.report;
          console.log(result.ok ? `  analiz: ${r.meta.title.slice(0, 40)} → skor ${r.score}, ${r.findings.length} bulgu, ${r.rejected.length} red, ${r.uncertain.length} belirsiz, güvenlik ${r.security.detected ? 'UYARI' : 'temiz'} (${Date.now() - t0} ms)` : `  hata: ${result.error.code}`);
        }
        return send(res, 200, 'application/json', JSON.stringify(result));
      }
      let file = path.normalize(path.join(SITE, decodeURIComponent(url.pathname)));
      if (!file.startsWith(SITE)) return send(res, 403, 'text/plain', 'forbidden');
      if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
      if (!fs.existsSync(file)) return send(res, 404, 'text/plain', 'not found');
      let data = fs.readFileSync(file);
      if (inject && file.endsWith('.html')) data = data.toString('utf8').replace('</body>', INJECT + '</body>');
      return send(res, 200, TYPES[path.extname(file)] || 'application/octet-stream', data);
    } catch (e) {
      return send(res, 500, 'text/plain', String(e && e.message || e));
    }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  const actual = server.address().port;
  if (!quiet) console.log(`Küçük Punto harness: http://127.0.0.1:${actual}/  ·  model: ${engine}`);
  return { server, port: actual, engine };
}

function send(res, status, type, data) { res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' }); res.end(data); }
function readBody(req, max) {
  return new Promise((resolve, reject) => {
    let n = 0; const chunks = [];
    req.on('data', c => { n += c.length; if (n > max) { reject(new Error('payload too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });
}

if (isMain(import.meta.url)) startHarness(process.argv.includes('--mock') ? { mockMode: 'helpful' } : {});
