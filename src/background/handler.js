// The analysis request handler. Runs inside the extension's service worker, and the same code
// runs in Node for the eval runner and the Cypress harness server (scripts/serve.js).
//
// The content script lives next to an untrusted page, so its payload is treated as untrusted
// input: shape and size are checked here before anything reaches the pipeline.

import { analyze } from '../core/analyze.js';
import { makeLLM, PRESETS } from '../core/llm.js';

export const DEFAULT_SETTINGS = { provider: 'gemini', apiKey: '', model: '', baseUrl: '', autoAnalyze: false };

export const PAYLOAD_LIMITS = { blocks: 6000, blockChars: 20000, totalChars: 600000, hidden: 300, hiddenChars: 2000 };

export function resolveLLMConfig(settings = {}) {
  const provider = PRESETS[settings.provider] ? settings.provider : 'gemini';
  const preset = PRESETS[provider];
  return {
    provider, kind: preset.kind, structured: preset.structured, noKey: !!preset.noKey,
    baseUrl: (settings.baseUrl || preset.baseUrl || '').trim(),
    model: (settings.model || preset.model || '').trim(),
    apiKey: (settings.apiKey || '').trim()
  };
}

export function isConfigured(settings) {
  const c = resolveLLMConfig(settings);
  return !!(c.baseUrl && c.model && (c.apiKey || c.noKey));
}

export function sanitizePayload(p) {
  if (!p || typeof p !== 'object' || !Array.isArray(p.blocks)) throw new Error('Geçersiz istek biçimi.');
  const L = PAYLOAD_LIMITS;
  const blocks = [];
  let total = 0;
  for (const b of p.blocks.slice(0, L.blocks)) {
    if (!b || typeof b.text !== 'string' || !b.text.trim()) continue;
    const text = b.text.slice(0, L.blockChars);
    if (total + text.length > L.totalChars) break;
    total += text.length;
    blocks.push({ text, tag: /^(p|h[1-6]?)$/.test(b.tag) ? b.tag : 'p' });
  }
  const hidden = (Array.isArray(p.hidden) ? p.hidden : []).slice(0, L.hidden)
    .filter(x => x && typeof x.text === 'string')
    .map(x => ({ text: x.text.slice(0, L.hiddenChars), reason: String(x.reason || 'unknown').slice(0, 40) }));
  const m = p.meta && typeof p.meta === 'object' ? p.meta : {};
  const str = (v, n) => (typeof v === 'string' ? v : '').slice(0, n);
  const meta = { title: str(m.title, 300), url: str(m.url, 2000), host: str(m.host, 300), lang: str(m.lang, 20) };
  return { blocks, hidden, meta, rulesOnly: p.rulesOnly === true };
}

/**
 * @returns {Promise<{ok:true, report:object} | {ok:false, error:{code:string, message:string}}>}
 */
export async function handleAnalyze(rawPayload, { settings = DEFAULT_SETTINGS, fetchImpl = globalThis.fetch, randomBytes, onProgress, llmOverride = null, timeoutMs } = {}) {
  // llmOverride: {llm, provider, model} — tests, ablation and the Cypress harness
  let payload;
  try { payload = sanitizePayload(rawPayload); }
  catch (e) { return { ok: false, error: { code: 'BAD_REQUEST', message: e.message } }; }
  if (!payload.blocks.length) return { ok: false, error: { code: 'EMPTY', message: 'Sayfada okunabilir görünür metin bulunamadı.' } };

  const cfg = resolveLLMConfig(settings);
  let llm = null;
  if (!payload.rulesOnly) {
    if (llmOverride) { llm = llmOverride.llm; cfg.provider = llmOverride.provider || 'test'; cfg.model = llmOverride.model || 'test'; }
    else {
      if (!cfg.apiKey && !cfg.noKey) {
        return { ok: false, error: { code: 'NO_KEY', message: 'Henüz bir model API anahtarı girilmedi. Ayarlardan kendi anahtarınızı ekleyin (Google AI Studio’dan ücretsiz Gemini anahtarı alınabilir) ya da şimdilik yalnızca anahtar kelime kurallarıyla analiz edin.' } };
      }
      try { llm = makeLLM(cfg, fetchImpl, timeoutMs ? { timeoutMs } : undefined); }
      catch (e) { return { ok: false, error: { code: e.code || 'CONFIG', message: e.message } }; }
    }
  }
  const report = await analyze({
    ...payload, llm,
    options: { provider: llm ? cfg.provider : null, model: llm ? cfg.model : null, randomBytes, onProgress }
  });
  return { ok: true, report };
}
