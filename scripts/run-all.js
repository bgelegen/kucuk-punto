// One command for the whole homework run (used by calistir.bat):
//   1. check the key and pick a Gemini model that answers right now
//   2. eval on 6 documents   3. prompt-injection test   4. Cypress demo video
// Exit codes: 0 all good · 3 key missing/invalid · 4 no model available now · 5 some step failed
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { ROOT, loadDotEnv } from './env.js';
import { pickModel } from './pick-model.js';

loadDotEnv();
const provider = process.env.KP_PROVIDER || 'gemini';
if (!process.env.KP_API_KEY) { console.log('\n  API anahtarı bulunamadı (.env).'); process.exit(3); }

console.log('\n  Model kontrol ediliyor...');
const pick = await pickModel({ provider, apiKey: process.env.KP_API_KEY, baseUrl: process.env.KP_BASE_URL, model: process.env.KP_MODEL, log: console.log });
if (pick.authError) { console.log('\n  Anahtar geçersiz görünüyor.'); process.exit(3); }
if (!pick.model) {
  console.log('\n  Şu an hiçbir Gemini modeli yanıt vermiyor (yoğunluk veya günlük kota). Birkaç saat sonra tekrar deneyin.');
  process.exit(4);
}
console.log(`\n  Kullanılacak model: ${pick.model}\n`);
const env = { ...process.env, KP_PROVIDER: provider, KP_MODEL: pick.model };

const steps = [
  ['6 sözleşme değerlendirmesi', ['eval/run.js', '--provider', provider]],
  ['Gizli talimat (prompt injection) testi', ['eval/injection.js', '--provider', provider]],
  ['Cypress demo videosu', ['scripts/demo.js']]
];
const results = [];
for (const [name, args] of steps) {
  console.log(`\n  ── ${name} ──`);
  const r = spawnSync(process.execPath, [path.join(ROOT, args[0]), ...args.slice(1)], { cwd: ROOT, stdio: 'inherit', env });
  results.push([name, r.status === 0]);
}
console.log('\n  Özet:');
for (const [name, ok] of results) console.log(`   ${ok ? '✓' : '✗'} ${name}`);
process.exit(results.every(r => r[1]) ? 0 : 5);
