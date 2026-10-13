// The pipeline. Pure and environment-agnostic: the extension's service worker, the eval runner,
// the Cypress harness server and the unit tests all call this same function.
//
//  capture -> segment -> quarantine -> [prompt -> LLM -> parse -> schema-validate (+1 repair)]
//          -> quote-verify -> cross-check with rules -> deterministic score -> report

import { segment } from './segment.js';
import { quarantine, classifyHidden } from './injection.js';
import { runBaseline } from './baseline.js';
import { findExternalReferences } from './references.js';
import { buildSystemPrompt, buildUserPrompt, buildRepairPrompt, PROMPT_VERSION } from './prompt.js';
import { parseModelJSON, validateResponse } from './schema.js';
import { verifyFindings, REJECT_REASONS } from './verify.js';
import { computeScore, MIN_CONFIDENCE } from './score.js';
import { CATEGORIES, SEVERITY } from './taxonomy.js';

export const REPORT_VERSION = 1;
export const DISCLAIMER_TR = 'Bu rapor hukuki tavsiye değildir. Yapay zekâ ve kurallarla üretilmiş otomatik bir özettir; sözleşmenin yerine geçmez ve hata içerebilir. Önemli kararlar için metnin tamamını okuyun ve gerekirse bir hukukçuya danışın.';

function overlaps(a, b) {
  return a.clause_id === b.clause_id && a.category === b.category;
}

/**
 * @param {object} input
 * @param {{text:string,tag?:string}[]} input.blocks   visible text blocks from the capture layer
 * @param {{text:string,reason:string}[]} [input.hidden] hidden text removed by the capture layer
 * @param {{title?:string,url?:string,host?:string}} [input.meta]
 * @param {Function|null} input.llm  from makeLLM(); null = rules-only mode
 * @param {{provider?:string, model?:string, maxChars?:number, randomBytes:Function, now?:Function}} input.options
 */
export async function analyze({ blocks, hidden = [], meta = {}, llm = null, options = {} }) {
  const now = options.now || (() => Date.now());
  const progress = typeof options.onProgress === 'function' ? options.onProgress : () => {};
  const t0 = now();
  progress('prepare');
  const seg = segment(blocks, { maxChars: options.maxChars ?? 120000 });
  const coverage = {
    totalChars: seg.totalChars, usedChars: seg.usedChars, truncated: seg.truncated,
    ratioPct: seg.totalChars ? Math.round(100 * seg.usedChars / seg.totalChars) : 100
  };
  const { clauses, quarantined } = quarantine(seg.clauses);
  const hiddenClassified = classifyHidden(hidden);
  const rules = runBaseline(clauses);
  const references = findExternalReferences(clauses, meta.title);

  const engine = { mode: llm ? 'llm' : 'rules', provider: options.provider || null, model: options.model || null, prompt_version: PROMPT_VERSION };
  const trace = { attempts: 0, repaired: false, schema_errors: [], dropped_items: [], usage: null };

  let modelOut = null;
  let llmError = null;
  if (llm && clauses.length) {
    const nonce = options.nonce || [...options.randomBytes(8)].map(b => b.toString(16).padStart(2, '0')).join('');
    const system = buildSystemPrompt();
    const turns = [{ role: 'user', content: buildUserPrompt({ clauses, meta, nonce, coverage }) }];
    for (let attempt = 1; attempt <= 2 && !modelOut; attempt++) {
      trace.attempts = attempt;
      progress(attempt === 1 ? 'model' : 'repair');
      let res;
      try { res = await llm({ system, turns }); }
      catch (e) { llmError = { code: e.code || 'ERROR', message: e.message }; break; }
      engine.model = res.model || engine.model;
      trace.usage = res.usage || null;
      const parsed = parseModelJSON(res.text);
      const v = parsed.error ? { ok: false, errors: [parsed.error], dropped: [] } : validateResponse(parsed.value);
      if (parsed.repaired) trace.repaired = true;
      if (v.ok) { modelOut = v.value; trace.dropped_items = v.dropped.map(d => ({ path: d.path, errors: d.errors })); break; }
      trace.schema_errors.push(...v.errors);
      if (attempt === 1) {
        trace.repaired = true;
        turns.push({ role: 'assistant', content: String(res.text).slice(0, 20000) }, { role: 'user', content: buildRepairPrompt(v.errors) });
      }
    }
    if (!modelOut && !llmError) llmError = { code: 'SCHEMA', message: 'Model iki denemede de şemaya uygun yanıt üretmedi; yalnızca kural motorunun sonuçları gösteriliyor.' };
  }

  // ---- findings
  progress('verify');
  let findings, rejected = [];
  if (modelOut) {
    const v = verifyFindings(modelOut.findings, clauses);
    rejected = v.rejected.map(r => ({ ...r.finding, reason: r.reason, reason_tr: REJECT_REASONS[r.reason] }));
    // items dropped by the schema validator are also unsupported claims
    for (const d of trace.dropped_items) rejected.push({ path: d.path, reason: 'SCHEMA_ITEM', reason_tr: 'Şemaya uymayan öğe: ' + d.errors.join('; ') });
    findings = v.accepted.map(f => ({ ...f, source: 'model', corroborated: rules.some(r => overlaps(r, f)) }));
  } else {
    // rules-only mode (no key, provider error, or schema failure): label every finding as such
    findings = verifyFindings(rules, clauses).accepted.map(f => ({ ...f, source: 'rule', corroborated: false }));
  }

  const confident = findings.filter(f => f.confidence >= MIN_CONFIDENCE || f.source === 'rule');
  const lowConfidence = findings.filter(f => f.source === 'model' && f.confidence < MIN_CONFIDENCE);
  const scored = computeScore(confident.map(f => ({ ...f, confidence: f.source === 'rule' ? 1 : f.confidence })));
  // independent second opinion: the score the keyword rules alone would give
  const rulesScore = modelOut ? computeScore(verifyFindings(rules, clauses).accepted.map(f => ({ ...f, confidence: 1 }))).score : scored.score;

  // ---- uncertainty, said out loud
  const uncertain = [];
  for (const f of lowConfidence) uncertain.push({ kind: 'low_confidence', category: f.category, quote: f.evidence.quote, clause_id: f.clause_id, text_tr: `Model bu maddeden emin değil (güven %${Math.round(f.confidence * 100)}); skora katılmadı.` });
  if (modelOut) {
    const modelCats = new Set(findings.map(f => f.category));
    const seen = new Set();
    for (const r of rules) {
      if (modelCats.has(r.category) || seen.has(r.category)) continue;
      seen.add(r.category);
      uncertain.push({ kind: 'rule_only', category: r.category, quote: r.quote, clause_id: r.clause_id, text_tr: `Kurallar "${CATEGORIES[r.category].tr}" ile ilgili bir ifade buldu ama model bunu risk olarak raporlamadı. Kendiniz kontrol edin.` });
    }
    for (const u of modelOut.uncertainties) uncertain.push({ kind: 'model', text_tr: `${u.topic_tr}: ${u.reason_tr}` });
  }
  for (const ref of references) uncertain.push({ kind: 'external_reference', clause_id: ref.clause_id, text_tr: `Metin "${ref.name}" adlı başka bir belgeye atıf yapıyor. O belge incelenmedi.` });
  if (coverage.truncated) uncertain.push({ kind: 'truncated', text_tr: `Metin çok uzun olduğu için yalnızca ilk %${coverage.ratioPct}'i incelendi.` });
  if (modelOut && modelOut.document_type === 'not_legal') uncertain.push({ kind: 'not_legal', text_tr: 'Model bu sayfanın bir sözleşme veya politika metni olmadığını düşünüyor; rapor güvenilir olmayabilir.' });
  // a model that was steered (or simply wrong) tends to under-report; the rules cannot be steered
  const conflict = !!modelOut && rulesScore >= 50 && scored.score < rulesScore / 3;
  if (conflict) uncertain.push({ kind: 'model_rule_conflict', text_tr: `Model düşük risk bildirdi (skor ${scored.score}) ama anahtar kelime kuralları çok sayıda riskli ifade buldu (kural skoru ${rulesScore}). Bu tutarsızlık bir model hatası veya sayfadaki bir manipülasyon olabilir; maddeleri kendiniz kontrol edin.` });
  const benignHiddenChars = hiddenClassified.filter(h => !h.suspicious).reduce((a, h) => a + h.text.length, 0);
  if (benignHiddenChars >= 400) uncertain.push({ kind: 'hidden_content', text_tr: `Sayfada şu an görünmeyen yaklaşık ${benignHiddenChars.toLocaleString('tr-TR')} karakterlik metin var (kapalı bölüm, açılır menü vb.). Görmediğiniz metin analize alınmaz; önemli bir bölüm kapalıysa açıp yeniden analiz edin.` });
  if (!modelOut) uncertain.push({ kind: 'rules_only', text_tr: llmError ? `Model kullanılamadı (${llmError.message}). Aşağıdakiler yalnızca anahtar kelime kurallarının sonucudur ve yanlış alarm içerebilir.` : 'Model kullanılmadı. Aşağıdakiler yalnızca anahtar kelime kurallarının sonucudur ve yanlış alarm içerebilir.' });

  const security = {
    hidden_removed: hiddenClassified.length,
    hidden_chars: hiddenClassified.reduce((a, h) => a + h.text.length, 0),
    hidden_suspicious: hiddenClassified.filter(h => h.suspicious).map(h => ({ text: h.text.slice(0, 400), reason: h.reason, patterns: h.patterns })),
    quarantined: quarantined.map(q => ({ clause_id: q.clause_id, text: q.text.slice(0, 400), patterns: q.patterns })),
    model_reported: modelOut ? modelOut.injection_suspected : []
  };
  security.detected = security.hidden_suspicious.length + security.quarantined.length + security.model_reported.length > 0;

  findings.sort((a, b) => SEVERITY[b.severity] - SEVERITY[a.severity] || (b.confidence - a.confidence));
  progress('done');
  return {
    version: REPORT_VERSION,
    disclaimer_tr: DISCLAIMER_TR,
    meta: { title: meta.title || '', host: meta.host || '', analysed_at: new Date(t0).toISOString() },
    document_type: modelOut ? modelOut.document_type : null,
    summary_tr: modelOut ? modelOut.summary_tr : '',
    score: scored.score, band: scored.band, band_tr: scored.band_tr, score_breakdown: scored.breakdown, rules_score: rulesScore,
    // 'conflict': the model and the independent rules disagree sharply -> the UI shows "Belirsiz", not a number
    score_status: conflict ? 'conflict' : modelOut ? 'model' : 'rules',
    findings: findings.filter(f => !(f.source === 'model' && f.confidence < MIN_CONFIDENCE)).map(f => ({
      category: f.category, category_tr: CATEGORIES[f.category].tr, severity: f.severity,
      explanation_tr: f.explanation_tr, confidence: f.confidence, source: f.source, corroborated: f.corroborated,
      evidence: f.evidence
    })),
    uncertain, rejected,
    security, coverage,
    clause_count: clauses.length,
    engine: { ...engine, error: llmError },
    trace: { ...trace, ms: now() - t0, rule_hits: rules.length }
  };
}
