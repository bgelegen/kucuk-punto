// One command for the whole homework run (used by calistir.bat):
//   1. check the key and pick a Gemini model that answers right now
//   2. eval on 6 documents   3. prompt-injection test   4. Cypress demo video
// `--video` (video-cek.bat) runs only step 4, preferring the fast lite model, so re-recording the
// demo does not spend the daily quota on the eval again.
// Each free Gemini model has its own small daily quota. When a step reports that the current model's
// quota is used up (exit 6), the step is repeated with the next model; every result names its model.
// Exit codes: 0 all good · 3 key missing/invalid · 4 no model available now · 5 some step failed
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, loadDotEnv } from './env.js';
import { pickModel } from './pick-model.js';

// Everything shown in the window is also written to son-calisma.log (no secrets are printed),
// so the run can be reviewed afterwards without a screenshot.
const LOG = path.join(ROOT, 'son-calisma.log');
fs.writeFileSync(LOG, `Küçük Punto · ${new Date().toISOString()}\n`);
const strip = s => String(s).replace(/\x1b\[[0-9;]*m/g, '');
const log = (...a) => { const line = a.join(' '); process.stdout.write(line + '\n'); fs.appendFileSync(LOG, strip(line) + '\n'); };
console.log = log;
const runStep = (args, env) => new Promise(resolve => {
  const child = spawn(process.execPath, args, { cwd: ROOT, env, stdio: ['inherit', 'pipe', 'pipe'] });
  const both = d => { process.stdout.write(d); fs.appendFileSync(LOG, strip(d)); };
  child.stdout.on('data', both); child.stderr.on('data', both);
  child.on('close', code => resolve(code));
});

loadDotEnv();
const provider = process.env.KP_PROVIDER || 'gemini';
if (!process.env.KP_API_KEY) { console.log('\n  API anahtarı bulunamadı (.env).'); process.exit(3); }

const VIDEO_ONLY = process.argv.includes('--video');
const exhausted = [];
let model = null;

const WAIT_ROUNDS = Number(process.env.KP_WAIT_ROUNDS ?? 6), WAIT_MS = Number(process.env.KP_WAIT_MS ?? 60000);

async function choose() {
  let pick;
  for (let round = 0; ; round++) {
    console.log('\n  Model kontrol ediliyor...');
    pick = await pickModel({ provider, apiKey: process.env.KP_API_KEY, baseUrl: process.env.KP_BASE_URL, model: process.env.KP_MODEL_FIXED, prefer: VIDEO_ONLY ? ['gemini-flash-lite-latest'] : [], exclude: exhausted, log: console.log });
    if (pick.authError) { console.log('\n  Anahtar geçersiz görünüyor.'); process.exit(3); }
    for (const t of pick.tried) if (['QUOTA', 'MODEL'].includes(t.code) && !exhausted.includes(t.model)) exhausted.push(t.model);   // no point asking again today
    // "high demand" is temporary: wait a little instead of giving up
    if (pick.model || !pick.overloaded || round >= WAIT_ROUNDS) break;
    console.log(`\n  Modeller şu an yoğun. ${Math.round(WAIT_MS / 1000)} sn sonra tekrar denenecek (${round + 1}/${WAIT_ROUNDS})...`);
    await new Promise(r => setTimeout(r, WAIT_MS));
  }
  if (!pick.model) {
    console.log(`\n  Şu an kullanılabilir Gemini modeli kalmadı${exhausted.length ? ` (günlük kotası dolanlar: ${exhausted.join(', ')})` : ''}.`);
    console.log(pick.overloaded ? '  Modeller hâlâ yoğun. Biraz sonra calistir dosyasını tekrar açın.' : '  Ücretsiz kota her gün Türkiye saatiyle 10:00 civarında yenilenir.');
    return null;
  }
  console.log(`  Kullanılacak model: ${pick.model}`);
  return pick.model;
}

const steps = [
  ['6 sözleşme değerlendirmesi', ['eval/run.js', '--provider', provider]],
  ['Gizli talimat (prompt injection) testi', ['eval/injection.js', '--provider', provider]],
  ['Cypress demo videosu', ['scripts/demo.js']]
].filter(s => !VIDEO_ONLY || s[1][0] === 'scripts/demo.js');
const results = [];
for (const [name, args] of steps) {
  let status;
  for (;;) {
    if (!model) model = await choose();
    if (!model) { status = 'kota'; break; }
    console.log(`\n  ── ${name} (${model}) ──`);
    const code = await runStep([path.join(ROOT, args[0]), ...args.slice(1)], { ...process.env, KP_PROVIDER: provider, KP_MODEL: model, FORCE_COLOR: '0' });
    const r = { status: code };
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
