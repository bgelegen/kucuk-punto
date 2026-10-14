// Web transport for the public live demo (GitHub Pages). The SAME content code and the SAME
// background handler as the extension run inside the page; only where the model answer comes from
// differs, and the demo bar says which one is in use:
//
//   recorded  the real Gemini answer saved for this exact page (demo/recordings/<page>.json) is
//             replayed; schema validation, quote verification, cross-check and the score run live
//   key       the visitor's own Gemini key, kept only in this tab (sessionStorage), sent only to Google
//   rules     no model: the independent keyword rules, labelled as such in the report
//
// No key of the project owner is ever on this site.

import { handleAnalyze } from '../background/handler.js';

const MODE = 'kp_web_mode', KEY = 'kp_web_key', HISTORY = 'kp_web_history';
const store = (name) => { try { return window[name]; } catch { return null; } };
const ss = store('sessionStorage'), ls = store('localStorage');
const read = (s, k) => { try { return s ? s.getItem(k) : null; } catch { return null; } };
const write = (s, k, v) => { try { if (!s) return; if (v == null || v === '') s.removeItem(k); else s.setItem(k, v); } catch { /* private mode */ } };

export const WEB_MODEL = 'gemini-flash-lite-latest';
const slug = () => (location.pathname.split('/').pop() || '').replace(/\.html?$/, '');
const isPaste = () => slug() === 'metin';

let recording;   // undefined = not loaded yet, null = none for this page
export async function loadRecording() {
  if (recording !== undefined) return recording;
  if (isPaste()) return (recording = null);
  try {
    const list = await fetch('recordings/index.json', { cache: 'no-store' }).then(r => (r.ok ? r.json() : []));
    if (!list.includes(slug())) return (recording = null);
    const res = await fetch(`recordings/${slug()}.json`, { cache: 'no-store' });
    recording = res.ok ? await res.json() : null;
    if (recording && !Array.isArray(recording.responses)) recording = null;
  } catch { recording = null; }
  return recording;
}

export const webState = {
  get mode() { return read(ss, MODE) || 'recorded'; },
  set mode(v) { write(ss, MODE, v); },
  get key() { return read(ss, KEY) || ''; },
  set key(v) { write(ss, KEY, String(v || '').trim()); },
  /** what will actually be used on this page */
  effective() {
    const m = this.mode;
    if (m === 'key' && this.key) return 'key';
    if (m === 'recorded' && recording) return 'recorded';
    if (m === 'rules') return 'rules';
    return recording ? 'recorded' : this.key ? 'key' : 'rules';
  }
};

// change tracking across the demo pages: fingerprints only, in this browser
const memory = new Map();
const history = {
  async get(k) {
    const all = JSON.parse(read(ls, HISTORY) || '{}');
    return all[k] || memory.get(k) || null;
  },
  async set(k, v) {
    memory.set(k, v);
    try {
      const all = JSON.parse(read(ls, HISTORY) || '{}');
      all[k] = v;
      const keys = Object.keys(all);
      if (keys.length > 30) keys.sort((a, b) => String(all[a].date).localeCompare(String(all[b].date))).slice(0, keys.length - 30).forEach(x => delete all[x]);
      write(ls, HISTORY, JSON.stringify(all));
    } catch { /* storage full or blocked: memory is enough for this visit */ }
  }
};
export function clearWebHistory() { memory.clear(); write(ls, HISTORY, null); }

function replay(rec, label) {
  let i = 0;
  // the saved answers in the order the model gave them (a repair turn, if any, is the second one)
  return async () => {
    const r = rec.responses[Math.min(i++, rec.responses.length - 1)];
    await new Promise(res => setTimeout(res, 350));
    return { text: r.text, model: label, usage: null };
  };
}

export function makeWebTransport({ onOpenSettings, onToggleRegister } = {}) {
  return {
    async analyze(payload, onStage) {
      await loadRecording();
      const randomBytes = n => crypto.getRandomValues(new Uint8Array(n));
      const base = { randomBytes, onProgress: onStage, history: isPaste() ? null : history };
      const mode = webState.effective();
      if (payload.rulesOnly || mode === 'rules') return handleAnalyze({ ...payload, rulesOnly: true }, base);
      if (mode === 'recorded') {
        const when = recording.date ? new Date(recording.date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' }) : '';
        const label = `${recording.model} (kayıtlı yanıt${when ? ', ' + when : ''})`;
        return handleAnalyze(payload, { ...base, llmOverride: { llm: replay(recording, label), provider: 'gemini', model: label } });
      }
      return handleAnalyze(payload, {
        ...base, timeoutMs: 60000, retry: { retries: 1, maxWaitMs: 15000 },
        settings: { provider: 'gemini', apiKey: webState.key, model: WEB_MODEL, baseUrl: '', autoAnalyze: false }
      });
    },
    status: async () => ({ configured: true, autoAnalyze: false }),
    openOptions: () => onOpenSettings?.(),
    onToggle(cb) {
      window.addEventListener('keydown', e => { if (e.altKey && e.shiftKey && (e.key === 'k' || e.key === 'K')) cb(); });
      onToggleRegister?.(cb);
    }
  };
}
