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
  constructor(code, message, status) { super(message); this.code = code; this.status = status; }
}

function httpError(status, body) {
  const short = String(body || '').slice(0, 300);
  if (status === 401 || status === 403) return new LLMError('AUTH', 'API anahtarı geçersiz veya bu modele erişimi yok.', status);
  if (status === 404) return new LLMError('MODEL', 'Model veya adres bulunamadı. Ayarlardaki model adını kontrol edin.', status);
  if (status === 429) return new LLMError('RATE', 'Sağlayıcının istek sınırına takıldınız. Biraz bekleyip tekrar deneyin.', status);
  if (status >= 500) return new LLMError('UPSTREAM', 'Model sağlayıcısında geçici bir hata oluştu.', status);
  return new LLMError('HTTP', `Sağlayıcı isteği reddetti (${status}): ${short}`, status);
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
  if (!res.ok) throw httpError(res.status, text);
  try { return JSON.parse(text); } catch { throw new LLMError('BAD_RESPONSE', 'Sağlayıcı yanıtı JSON değil.'); }
}

/**
 * @param {{kind:'openai'|'anthropic'|'mock', baseUrl:string, model:string, apiKey?:string, structured?:string}} cfg
 * @returns {(messages:{system:string, turns:{role:string,content:string}[]}) => Promise<{text:string, usage?:object, model:string}>}
 */
export function makeLLM(cfg, fetchImpl = globalThis.fetch, { timeoutMs = 90000 } = {}) {
  if (cfg.kind === 'mock') return cfg.respond;
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
