// Provider adapters. Each returns the model's raw JSON text; validation happens elsewhere.
// The model gets no tools that act on the page or the browser: it can only return text.

import { RESPONSE_SCHEMA, providerSchema } from './schema.js';

export const PRESETS = {
  gemini:     { label: 'Google Gemini (ücretsiz anahtar)', kind: 'openai', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-flash-latest', structured: 'json_schema' },
  openai:     { label: 'OpenAI', kind: 'openai', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', structured: 'json_schema' },
  anthropic:  { label: 'Anthropic Claude', kind: 'anthropic', baseUrl: 'https://api.anthropic.com/v1', model: 'claude-haiku-4-5-20251001', structured: 'tool' },
  groq:       { label: 'Groq', kind: 'openai', baseUrl: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile', structured: 'json_object' },
  openrouter: { label: 'OpenRouter', kind: 'openai', baseUrl: 'https://openrouter.ai/api/v1', model: 'openai/gpt-4o-mini', structured: 'json_object' },
  ollama:     { label: 'Ollama (yerel)', kind: 'openai', baseUrl: 'http://localhost:11434/v1', model: 'qwen2.5:7b', structured: 'json_object', noKey: true },
  custom:     { label: 'OpenAI uyumlu (özel)', kind: 'openai', baseUrl: '', model: '', structured: 'json_object' }
};

export class LLMError extends Error {
  constructor(code, message, status, extra = {}) { super(message); this.code = code; this.status = status; Object.assign(this, extra); }
}

// The provider's own error text (shortened) is kept so a failure can be diagnosed later.
// Error bodies never contain the API key.
function providerMessage(body) {
  try {
    let j = JSON.parse(body);
    if (Array.isArray(j)) j = j[0];
    const m = j?.error?.message || j?.message;
    if (m) return String(m).replace(/\s+/g, ' ').slice(0, 220);
  } catch { /* not JSON */ }
  return String(body || '').replace(/\s+/g, ' ').slice(0, 220);
}

// "Please retry in 41.3s" / "retryDelay": "41s" / Retry-After header
function retryAfterMs(body, header) {
  const h = Number(header);
  if (Number.isFinite(h) && h > 0) return h * 1000;
  const m = /retry(?:Delay"?\s*:\s*"|\s+in\s+)(\d+(?:\.\d+)?)s/i.exec(String(body || ''));
  return m ? Math.ceil(parseFloat(m[1]) * 1000) : null;
}

export function httpError(status, body, retryHeader) {
  const detail = providerMessage(body);
  const tail = detail ? ` (${status}: ${detail})` : ` (${status})`;
  const wait = retryAfterMs(body, retryHeader);
  // Gemini answers an invalid key with 400 INVALID_ARGUMENT "API key not valid"
  if (status === 401 || status === 403 || /api[ _-]?key[^.]{0,40}(not valid|invalid|expired)|API_KEY_INVALID/i.test(String(body))) return new LLMError('AUTH', 'API anahtarı geçersiz veya bu modele erişimi yok.' + tail, status);
  if (status === 404) return new LLMError('MODEL', 'Model veya adres bulunamadı. Ayarlardaki model adını kontrol edin.' + tail, status);
  if (status === 429 && /per ?day|PerDay|daily/i.test(String(body))) return new LLMError('QUOTA', 'Bu model için günlük ücretsiz kota doldu.' + tail, status);
  if (status === 429) return new LLMError('RATE', 'Sağlayıcının istek sınırına takıldınız. Biraz bekleyip tekrar deneyin.' + tail, status, { retryAfterMs: wait });
  if (status >= 500) return new LLMError('UPSTREAM', 'Model sağlayıcısında geçici bir hata oluştu.' + tail, status, { retryAfterMs: wait });
  return new LLMError('HTTP', `Sağlayıcı isteği reddetti.${tail}`, status);
}

async function postJSON(fetchImpl, url, headers, body, timeoutMs) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  let res;
  try {
    res = await fetchImpl(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body), signal: ctrl.signal });
  } catch (e) {
    throw new LLMError(e.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK', e.name === 'AbortError' ? 'Model zamanında yanıt vermedi.' : 'Model sağlayıcısına bağlanılamadı.');
  } finally { clearTimeout(t); }
  const text = await res.text();
  if (!res.ok) throw httpError(res.status, text, res.headers?.get?.('retry-after'));
  try { return JSON.parse(text); } catch { throw new LLMError('BAD_RESPONSE', 'Sağlayıcı yanıtı JSON değil.'); }
}

const RETRYABLE = new Set(['RATE', 'UPSTREAM', 'NETWORK']);   // not QUOTA (daily), AUTH, MODEL, TIMEOUT

/**
 * Retries temporary provider errors (429 per-minute limit, 5xx) with backoff, honouring the
 * provider's suggested wait. Gives up when the wait would exceed maxWaitMs.
 */
export function withRetry(call, { retries = 1, maxWaitMs = 15000, baseMs = 4000, sleep = ms => new Promise(r => setTimeout(r, ms)), onRetry } = {}) {
  return async (req) => {
    for (let attempt = 0; ; attempt++) {
      try { return await call(req); }
      catch (e) {
        if (!RETRYABLE.has(e.code) || attempt >= retries) throw e;
        const wait = Math.max(e.retryAfterMs || 0, baseMs * 3 ** attempt);
        if (wait > maxWaitMs) throw e;
        onRetry?.({ attempt: attempt + 1, wait, error: e });
        await sleep(wait);
      }
    }
  };
}

/**
 * @param {{kind:'openai'|'anthropic'|'mock', baseUrl:string, model:string, apiKey?:string, structured?:string}} cfg
 * @returns {(messages:{system:string, turns:{role:string,content:string}[]}) => Promise<{text:string, usage?:object, model:string}>}
 */
export function makeLLM(cfg, fetchImpl = globalThis.fetch, { timeoutMs = 90000, retry } = {}) {
  if (cfg.kind === 'mock') return cfg.respond;
  return withRetry(makeRawLLM(cfg, fetchImpl, timeoutMs), retry);
}

function makeRawLLM(cfg, fetchImpl, timeoutMs) {
  const base = String(cfg.baseUrl || '').replace(/\/+$/, '');
  if (!base || !cfg.model) throw new LLMError('CONFIG', 'Sağlayıcı adresi veya model adı eksik.');

  if (cfg.kind === 'anthropic') {
    return async ({ system, turns }) => {
      const data = await postJSON(fetchImpl, `${base}/messages`, {
        'x-api-key': cfg.apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true'
      }, {
        model: cfg.model, max_tokens: 8000, temperature: 0, system,
        messages: turns,
        tools: [{ name: 'submit_report', description: 'Submit the risk report.', input_schema: providerSchema(RESPONSE_SCHEMA) }],
        tool_choice: { type: 'tool', name: 'submit_report' }
      }, timeoutMs);
      const tool = (data.content || []).find(b => b.type === 'tool_use');
      if (!tool) throw new LLMError('BAD_RESPONSE', 'Model rapor aracını kullanmadı.');
      return { text: JSON.stringify(tool.input), usage: data.usage, model: data.model || cfg.model };
    };
  }

  // OpenAI-compatible (OpenAI, Gemini, Groq, OpenRouter, Ollama, ...)
  let mode = cfg.structured || 'json_object';
  return async ({ system, turns }) => {
    const body = (m) => ({
      model: cfg.model, temperature: 0,
      messages: [{ role: 'system', content: system }, ...turns],
      ...(m === 'json_schema' ? { response_format: { type: 'json_schema', json_schema: { name: 'risk_report', strict: true, schema: providerSchema(RESPONSE_SCHEMA) } } }
        : m === 'json_object' ? { response_format: { type: 'json_object' } } : {})
    });
    const headers = cfg.apiKey ? { authorization: `Bearer ${cfg.apiKey}` } : {};
    let data;
    try { data = await postJSON(fetchImpl, `${base}/chat/completions`, headers, body(mode), timeoutMs); }
    catch (e) {
      // some compatible servers reject json_schema; degrade once to json_object (validator is unchanged)
      if (e.status === 400 && mode === 'json_schema') { mode = 'json_object'; data = await postJSON(fetchImpl, `${base}/chat/completions`, headers, body(mode), timeoutMs); }
      else throw e;
    }
    const msg = data.choices?.[0]?.message;
    if (!msg) throw new LLMError('BAD_RESPONSE', 'Sağlayıcı boş yanıt döndürdü.');
    return { text: msg.content ?? '', usage: data.usage, model: data.model || cfg.model };
  };
}
