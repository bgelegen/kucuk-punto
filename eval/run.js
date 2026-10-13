#!/usr/bin/env node
// Mini eval: runs the real pipeline (src/core/analyze.js) over the corpus and scores it against gold.
//
//   node eval/run.js                         rules-only baseline (no key needed)
//   KP_API_KEY=... node eval/run.js --provider gemini [--model gemini-flash-latest]
//   node eval/run.js --replay eval/results/raw/<tag>  re-score saved model outputs without calling the API
//
// Writes eval/results/<tag>.json and regenerates EVAL.md.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { loadCorpus, EVAL_DIR } from './lib/corpus.js';
import { locatePoints, matchFindings } from './lib/match.js';
import { analyze } from '../src/core/analyze.js';
import { segment } from '../src/core/segment.js';
import { makeLLM, PRESETS } from '../src/core/llm.js';
import { writeEvalMarkdown } from './report.js';
import { loadDotEnv } from '../scripts/env.js';

function args() {
  const a = process.argv.slice(2), o = {};
  for (let i = 0; i < a.length; i++) if (a[i].startsWith('--')) o[a[i].slice(2)] = (a[i + 1] && !a[i + 1].startsWith('--')) ? a[++i] : true;
  return o;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  loadDotEnv();
  const o = args();
  const docs = loadCorpus(o.docs ? String(o.docs).split(',') : null);
  let llmFactory = null, tag = 'rules', engineInfo = { mode: 'rules' };

  if (o.replay) {
    const dir = path.resolve(String(o.replay));
    tag = path.basename(dir) + '-replay';
    const meta = JSON.parse(fs.readFileSync(path.join(dir, '_meta.json'), 'utf8'));
    engineInfo = { mode: 'llm-replay', ...meta };
    llmFactory = (doc) => {
      const saved = JSON.parse(fs.readFileSync(path.join(dir, doc.id + '.json'), 'utf8'));
      let i = 0;
      return async () => { const r = saved.responses[Math.min(i++, saved.responses.length - 1)]; if (r.error) throw Object.assign(new Error(r.error.message), { code: r.error.code }); return r; };
    };
  } else if (o.provider || process.env.KP_PROVIDER) {
    const preset = PRESETS[o.provider || process.env.KP_PROVIDER];
    if (!preset) throw new Error('Bilinmeyen sağlayıcı. Seçenekler: ' + Object.keys(PRESETS).join(', '));
    const apiKey = process.env.KP_API_KEY;
    if (!apiKey && !preset.noKey) throw new Error('KP_API_KEY ortam değişkeni (veya .env) gerekli.');
    const cfg = { ...preset, model: o.model || process.env.KP_MODEL || preset.model, baseUrl: o['base-url'] || process.env.KP_BASE_URL || preset.baseUrl, apiKey };
    tag = `${o.provider || process.env.KP_PROVIDER}-${cfg.model}`.replace(/[^a-z0-9.-]+/gi, '_');
    engineInfo = { mode: 'llm', provider: o.provider || process.env.KP_PROVIDER, model: cfg.model };
    const rawDir = path.join(EVAL_DIR, 'results/raw', tag);
    fs.mkdirSync(rawDir, { recursive: true });
    fs.writeFileSync(path.join(rawDir, '_meta.json'), JSON.stringify({ ...engineInfo, date: new Date().toISOString() }, null, 2));
    const base = makeLLM(cfg);
    llmFactory = (doc) => {
      const log = { doc: doc.id, responses: [] };
      return async (req) => {
        for (let attempt = 0; ; attempt++) {
          const t = Date.now();
          try {
            const r = await base(req);
            log.responses.push({ ...r, ms: Date.now() - t });
            fs.writeFileSync(path.join(rawDir, doc.id + '.json'), JSON.stringify(log, null, 2));
            return r;
          } catch (e) {
            if (e.code === 'RATE' && attempt < 4) { console.log(`  429 – ${20 * (attempt + 1)} sn bekleniyor`); await sleep(20000 * (attempt + 1)); continue; }
            log.responses.push({ error: { code: e.code, message: e.message } });
            fs.writeFileSync(path.join(rawDir, doc.id + '.json'), JSON.stringify(log, null, 2));
            throw e;
          }
        }
      };
    };
  }

  const results = [];
  for (const doc of docs) {
    process.stdout.write(`• ${doc.id} … `);
    const meta = { title: doc.service + ' ' + doc.document, host: doc.service.toLowerCase() + '.example' };
    const t0 = Date.now();
    const report = await analyze({
      blocks: doc.blocks, meta, llm: llmFactory ? llmFactory(doc) : null,
      options: { provider: engineInfo.provider, model: engineInfo.model, randomBytes: n => crypto.randomBytes(n) }
    });
    const { clauses } = segment(doc.blocks, { maxChars: 120000 });
    const points = locatePoints(doc.gold, doc.blocks);
    const m = matchFindings(report.findings, points, clauses);
    const rejected = report.rejected.filter(r => r.reason !== 'DUPLICATE');
    results.push({
      doc: doc.id, service: doc.service, document: doc.document, chars: doc.chars,
      engine_mode: report.engine.mode, model: report.engine.model, error: report.engine.error,
      score: report.score, band: report.band, ms: Date.now() - t0,
      attempts: report.trace.attempts, repaired: report.trace.repaired, schema_errors: report.trace.schema_errors.length,
      rejected: rejected.length, rejected_reasons: rejected.reduce((a, r) => ((a[r.reason] = (a[r.reason] || 0) + 1), a), {}),
      rejected_examples: rejected.slice(0, 3).map(r => ({ reason: r.reason, category: r.category, quote: String(r.quote || '').slice(0, 140) })),
      low_confidence: report.uncertain.filter(u => u.kind === 'low_confidence').length,
      uncertain_kinds: report.uncertain.reduce((a, u) => ((a[u.kind] = (a[u.kind] || 0) + 1), a), {}),
      usage: report.trace.usage,
      ...m
    });
    console.log(`skor ${report.score} · bulgu ${m.counts.findings} · yakalanan ${m.counts.caught}/${m.counts.required} · yanlış alarm ${m.counts.false_alarms}` + (report.engine.error ? ` · HATA: ${report.engine.error.message}` : ''));
  }
  const tot = results.reduce((a, r) => { for (const k of Object.keys(r.counts)) a[k] = (a[k] || 0) + r.counts[k]; return a; }, {});
  const precision = tot.findings ? (tot.findings - tot.false_alarms) / tot.findings : null;
  const recall = tot.required ? tot.caught / tot.required : null;
  const summary = { tag, engine: engineInfo, date: new Date().toISOString(), totals: tot, precision, recall, f1: precision && recall ? 2 * precision * recall / (precision + recall) : null, docs: results };
  fs.mkdirSync(path.join(EVAL_DIR, 'results'), { recursive: true });
  fs.writeFileSync(path.join(EVAL_DIR, 'results', tag + '.json'), JSON.stringify(summary, null, 2) + '\n');
  console.log(`\n${tag}: kesinlik ${(precision * 100).toFixed(1)}% · duyarlılık ${(recall * 100).toFixed(1)}% · F1 ${(summary.f1 * 100).toFixed(1)}%`);
  writeEvalMarkdown();
}

main().catch(e => { console.error('\n' + e.message); process.exit(1); });
