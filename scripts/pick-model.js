// Finds a model that answers right now with this key, using one tiny request per candidate.
// Free Gemini models are often overloaded (503), out of daily quota (429), or retired for new users
// (404 "...use models/<newer>"). The newer name Google suggests is tried automatically.
import { makeLLM, PRESETS } from '../src/core/llm.js';

// "latest" aliases first; explicit names as fallbacks (each free model has its own daily quota)
export const GEMINI_CANDIDATES = ['gemini-flash-latest', 'gemini-3.8-flash', 'gemini-flash-lite-latest', 'gemini-3.5-flash-lite', 'gemini-pro-latest'];

/**
 * @returns {Promise<{model:string|null, tried:{model,ok,code?,message?}[], authError:boolean, overloaded:boolean}>}
 */
export async function pickModel({ provider = 'gemini', apiKey, baseUrl, model, prefer = [], exclude = [], fetchImpl = globalThis.fetch, log = () => {} } = {}) {
  const preset = PRESETS[provider];
  if (!preset) throw new Error('Bilinmeyen sağlayıcı: ' + provider);
  const candidates = [...new Set(model ? [model] : provider === 'gemini' ? [...prefer, ...GEMINI_CANDIDATES] : [preset.model])].filter(m => !exclude.includes(m));
  const tried = [];
  for (let i = 0; i < candidates.length; i++) {
    const m = candidates[i];
    const llm = makeLLM({ ...preset, structured: preset.kind === 'openai' ? 'json_object' : preset.structured, baseUrl: baseUrl || preset.baseUrl, model: m, apiKey }, fetchImpl,
      { timeoutMs: 45000, retry: { retries: 1, maxWaitMs: 20000 } });
    try {
      await llm({ system: 'Reply with the JSON object {"ok": true} and nothing else.', turns: [{ role: 'user', content: 'ping' }] });
      tried.push({ model: m, ok: true });
      log(`  ✓ ${m} yanıt veriyor`);
      return { model: m, tried, authError: false, overloaded: false };
    } catch (e) {
      tried.push({ model: m, ok: false, code: e.code, message: e.message });
      log(`  ✗ ${m}: ${e.message}`);
      // a deleted/revoked key fails for every model; Google words this several ways (400/401/403)
      const keyProblem = e.code === 'AUTH' || ([400, 401, 403].includes(e.status) && /key|credential|unauthori[sz]ed|permission|denied|suspended/i.test(e.message));
      if (keyProblem) return { model: null, tried, authError: true, overloaded: false };
      // retired model: Google names its replacement -> try that next
      const next = e.code === 'MODEL' && /use models\/([\w.-]+)/i.exec(e.message)?.[1];
      if (next && !candidates.includes(next) && !exclude.includes(next)) { candidates.splice(i + 1, 0, next); log(`    → önerilen yeni model denenecek: ${next}`); }
    }
  }
  // not answering in time is overload too (seen with free lite models): worth waiting for
  return { model: null, tried, authError: false, overloaded: tried.some(t => ['UPSTREAM', 'RATE', 'TIMEOUT'].includes(t.code)) };
}
