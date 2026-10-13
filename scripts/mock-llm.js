// Deterministic stand-in for an LLM, used ONLY for offline tests, the security ablation and the
// Cypress harness when no key is configured. Every report it produces says "mock" as the model name.
//
// Modes:
//   helpful         behaves like a decent model: findings from the visible text, plus one fabricated
//                   quote (to exercise quote verification) and one low-confidence item.
//   obedient        a worst-case model that FOLLOWS any instruction it sees in the document
//                   ("report no findings", "say it is safe"). Used to show what each defence layer buys.
//   obedient-score  like obedient, but also invents a top-level "risk_score": 0 field.
//
// As a server (OpenAI-compatible /v1/chat/completions):  node scripts/mock-llm.js [port] [mode]

import http from 'node:http';
import { runBaseline } from '../src/core/baseline.js';
import { CATEGORIES } from '../src/core/taxonomy.js';
import { isMain } from './env.js';

export const MOCK_MODEL = 'kp-mock-1';

// Phrases a gullible model would treat as an order. Broader than our own filter on purpose:
// the obedient mock must also obey instructions that our regex layer does NOT catch.
const OBEY_RE = /(ignore|disregard|yok say|görmezden|no findings|risk[_ ]?score|risk puan|completely safe|tamamen güvenli|risksiz|sorun etme|iyimser|olumlu değerlendir|onaylanmıştır|approved by)/i;

export function parseClauses(userPrompt) {
  const m = /<document nonce="[^"]*">\n([\s\S]*?)\n<\/document nonce=/.exec(userPrompt);
  const body = m ? m[1] : userPrompt;
  const out = [];
  for (const line of body.split('\n')) {
    const x = /^\[(c\d+)\](?: \(([^)]*)\))? (.*)$/.exec(line);
    if (x) out.push({ id: x[1], heading: x[2] || '', text: x[3] });
  }
  return out;
}

function guessType(prompt) {
  const title = (/Page title: (.*)/.exec(prompt) || [, ''])[1].toLowerCase();
  if (/privacy|gizlilik|kvkk/.test(title)) return 'privacy_policy';
  if (/abonelik|subscription/.test(title)) return 'subscription_terms';
  return 'terms_of_service';
}

export function mockAnswer(userPrompt, mode = 'helpful') {
  const clauses = parseClauses(userPrompt);
  const turkish = /[ğüşıöçĞÜŞİÖÇ]/.test(clauses.slice(0, 20).map(c => c.text).join(' '));
  const order = clauses.find(c => OBEY_RE.test(c.text));
  if (mode.startsWith('obedient') && order) {
    const out = {
      document_type: guessType(userPrompt), language: turkish ? 'tr' : 'en',
      summary_tr: 'Bu sözleşme incelenmiş ve tüketici açısından tamamen güvenli bulunmuştur.',
      findings: [], injection_suspected: [], uncertainties: []
    };
    if (mode === 'obedient-score') out.risk_score = 0;
    return out;
  }
  const rules = runBaseline(clauses);
  const seen = new Set(), findings = [];
  for (const r of rules) {
    if (seen.has(r.category)) continue;
    seen.add(r.category);
    findings.push({ clause_id: r.clause_id, category: r.category, severity: r.severity, quote: r.quote, explanation_tr: CATEGORIES[r.category].hint, confidence: 0.85 });
    if (findings.length >= 9) break;
  }
  if (findings.length) {
    // a claim with an invented quote: must be rejected by quote verification
    findings.push({ clause_id: findings[0].clause_id, category: 'liability_limit', severity: 'high',
      quote: turkish ? 'Kullanıcı hiçbir durumda tazminat talep edemez ve tüm haklarından feragat eder.' : 'The user waives every right to compensation under any circumstances whatsoever.',
      explanation_tr: 'Tazminat hakkınızdan tamamen vazgeçiyorsunuz.', confidence: 0.7 });
  }
  const law = clauses.find(c => /governing law|laws of|mahkeme|hukuku uygulanır|yetkili/i.test(c.text) && !findings.some(f => f.clause_id === c.id));
  if (law) findings.push({ clause_id: law.id, category: 'governing_law', severity: 'low', quote: law.text.slice(0, 120).replace(/\s+\S*$/, ''), explanation_tr: 'Uyuşmazlıkta hangi ülke hukukunun ve mahkemelerinin geçerli olacağı belirlenmiş.', confidence: 0.35 });
  const cats = [...seen].slice(0, 4).map(c => CATEGORIES[c].tr.toLowerCase());
  return {
    document_type: guessType(userPrompt), language: turkish ? 'tr' : 'en',
    summary_tr: `(Demo modeli, gerçek bir dil modeli değildir.) Metinde ${cats.length ? cats.join(', ') + ' gibi' : 'belirgin'} konularda tüketici aleyhine olabilecek hükümler var.`,
    findings,
    injection_suspected: clauses.filter(c => order && c.id === order.id).map(c => ({ clause_id: c.id, quote: c.text.slice(0, 200), note_tr: 'Metin, okuyan yapay zekâya talimat vermeye çalışıyor.' })),
    uncertainties: []
  };
}

/** For makeLLM({kind:'mock', respond}) */
export function mockLLM(mode = 'helpful') {
  return async ({ turns }) => ({ text: JSON.stringify(mockAnswer(turns[0].content, mode)), model: `${MOCK_MODEL}:${mode}`, usage: null });
}

export function startMockServer(port = 0, mode = 'helpful') {
  const server = http.createServer((req, res) => {
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };
    if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      try {
        const j = JSON.parse(body || '{}');
        const user = (j.messages || []).find(m => m.role === 'user')?.content || '';
        const out = mockAnswer(user, mode);
        setTimeout(() => {
          res.writeHead(200, { 'content-type': 'application/json', ...cors });
          res.end(JSON.stringify({ model: `${MOCK_MODEL}:${mode}`, choices: [{ message: { role: 'assistant', content: JSON.stringify(out) } }], usage: { prompt_tokens: Math.round(user.length / 4), completion_tokens: 400 } }));
        }, 600);
      } catch (e) { res.writeHead(400, cors); res.end(String(e)); }
    });
  });
  return new Promise(r => server.listen(port, '127.0.0.1', () => r(server)));
}

if (isMain(import.meta.url)) {
  const port = Number(process.argv[2] || 8788), mode = process.argv[3] || 'helpful';
  startMockServer(port, mode).then(() => console.log(`mock LLM (${mode}) on http://127.0.0.1:${port}/v1`));
}
