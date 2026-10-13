// One command for the whole homework run (used by calistir.bat):
//   1. check the key and pick a Gemini model that answers right now
//   2. eval on 6 documents   3. prompt-injection test   4. Cypress demo video
// Each free Gemini model has its own small daily quota. When a step reports that the current model's
// quota is used up (exit 6), the step is repeated with the next model; every result names its model.
// Exit codes: 0 all good · 3 key missing/invalid · 4 no model available now · 5 some step failed
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { ROOT, loadDotEnv } from './env.js';
import { pickModel } from './pick-model.js';

loadDotEnv();
const provider = process.env.KP_PROVIDER || 'gemini';
if (!process.env.KP_API_KEY) { console.log('\n  API anahtarı bulunamadı (.env).'); process.exit(3); }

const exhausted = [];
let model = null;

async function choose() {
  console.log('\n  Model kontrol ediliyor...');
  const pick = await pickModel({ provider, apiKey: process.env.KP_API_KEY, baseUrl: process.env.KP_BASE_URL, model: process.env.KP_MODEL_FIXED, exclude: exhausted, log: console.log });
  if (pick.authError) { console.log('\n  Anahtar geçersiz görünüyor.'); process.exit(3); }
  if (!pick.model) {
    console.log(`\n  Şu an kullanılabilir Gemini modeli kalmadı${exhausted.length ? ` (günlük kotası dolanlar: ${exhausted.join(', ')})` : ''}.`);
    console.log('  Ücretsiz kota her gün Türkiye saatiyle 10:00 civarında yenilenir.');
    return null;
  }
  console.log(`  Kullanılacak model: ${pick.model}`);
  return pick.model;
}

const steps = [
  ['6 sözleşme değerlendirmesi', ['eval/run.js', '--provider', provider]],
  ['Gizli talimat (prompt injection) testi', ['eval/injection.js', '--provider', provider]],
  ['Cypress demo videosu', ['scripts/demo.js']]
];
const results = [];
for (const [name, args] of steps) {
  let status;
  for (;;) {
    if (!model) model = await choose();
    if (!model) { status = 'kota'; break; }
    console.log(`\n  ── ${name} (${model}) ──`);
    const r = spawnSync(process.execPath, [path.join(ROOT, args[0]), ...args.slice(1)], { cwd: ROOT, stdio: 'inherit', env: { ...process.env, KP_PROVIDER: provider, KP_MODEL: model } });
    if (r.status === 6) { console.log(`\n  ${model} modelinin günlük kotası doldu; sonraki model deneniyor.`); exhausted.push(model); model = null; continue; }
    status = r.status === 0 ? 'ok' : 'hata';
    break;
  }
  results.push([name, status]);
  if (status === 'kota') break;
}
console.log('\n  Özet:');
for (const [name, st] of results) console.log(`   ${st === 'ok' ? '✓' : '✗'} ${name}${st === 'kota' ? ' (kota)' : ''}`);
if (results.some(r => r[1] === 'kota')) process.exit(4);
process.exit(results.every(r => r[1] === 'ok') && results.length === steps.length ? 0 : 5);
