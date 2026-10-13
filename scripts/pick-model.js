// Finds a model that answers right now with this key, using one tiny request per candidate.
// Free Gemini models are often overloaded (503) or out of daily quota (429); the eval and the
// demo then use the first model that works, and say which one in the report.
import { makeLLM, PRESETS } from '../src/core/llm.js';

export const GEMINI_CANDIDATES = ['gemini-flash-latest', 'gemini-2.5-flash', 'gemini-flash-lite-latest', 'gemini-2.5-flash-lite'];

/**
 * @returns {Promise<{model:string|null, tried:{model,ok,code?,message?}[], authError:boolean}>}
 */
export async function pickModel({ provider = 'gemini', apiKey, baseUrl, model, fetchImpl = globalThis.fetch, log = () => {} } = {}) {
  const preset = PRESETS[provider];
  if (!preset) throw new Error('Bilinmeyen sağlayıcı: ' + provider);
  const candidates = model ? [model] : provider === 'gemini' ? GEMINI_CANDIDATES : [preset.model];
  const tried = [];
  for (const m of candidates) {
    const llm = makeLLM({ ...preset, structured: preset.kind === 'openai' ? 'json_object' : preset.structured, baseUrl: baseUrl || preset.baseUrl, model: m, apiKey }, fetchImpl,
      { timeoutMs: 30000, retry: { retries: 1, maxWaitMs: 20000 } });
    try {
      await llm({ system: 'Reply with the JSON object {"ok": true} and nothing else.', turns: [{ role: 'user', content: 'ping' }] });
      tried.push({ model: m, ok: true });
      log(`  ✓ ${m} yanıt veriyor`);
      return { model: m, tried, authError: false };
    } catch (e) {
      tried.push({ model: m, ok: false, code: e.code, message: e.message });
      log(`  ✗ ${m}: ${e.message}`);
      // a deleted/revoked key fails for every model; Google words this several ways (400/401/403)
      const keyProblem = e.code === 'AUTH' || ([400, 401, 403].includes(e.status) && /key|credential|unauthori[sz]ed|permission|denied|suspended/i.test(e.message));
      if (keyProblem) return { model: null, tried, authError: true };
    }
  }
  return { model: null, tried, authError: false };
}
