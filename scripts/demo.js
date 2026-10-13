// Records the Cypress demo and checks the ≤ 90 s limit.
//   npm run demo     real model from .env (KP_API_KEY); KP_MOCK=1 in .env -> demo model
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, loadDotEnv } from './env.js';

loadDotEnv();
const t0 = Date.now();
const run = spawnSync('npx', ['cypress', 'run', '--e2e', '--browser', 'electron', '--spec', 'cypress/e2e/demo.cy.js'], { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' });
const video = path.join(ROOT, 'cypress/videos/demo.cy.js.mp4');
if (!fs.existsSync(video)) { console.error('Video bulunamadı: ' + video); process.exit(run.status || 1); }
// only a passing run becomes the deliverable
if (run.status === 0) { fs.mkdirSync(path.join(ROOT, 'docs'), { recursive: true }); fs.copyFileSync(video, path.join(ROOT, 'docs/demo.mp4')); }
const sec = mp4Seconds(fs.readFileSync(video)) ?? (Date.now() - t0) / 1000;
console.log(`\n${run.status === 0 ? 'docs/demo.mp4' : 'cypress/videos/demo.cy.js.mp4'} · ${sec.toFixed(1)} sn`);
if (run.status !== 0) console.log('⚠️  Cypress testi başarısız oldu; bu video teslim için kullanılmamalı.');
if (sec > 90) console.log('⚠️  90 saniyeyi aşıyor. Daha hızlı model deneyin: KP_MODEL=gemini-flash-lite-latest npm run demo');
process.exit(run.status ?? 0);

/** duration from the mp4 'mvhd' box (no ffprobe needed) */
function mp4Seconds(buf) {
  const i = buf.indexOf('mvhd');
  if (i < 0) return null;
  const v = buf[i + 4];
  const scale = v === 1 ? buf.readUInt32BE(i + 24) : buf.readUInt32BE(i + 16);
  const dur = v === 1 ? Number(buf.readBigUInt64BE(i + 28)) : buf.readUInt32BE(i + 20);
  return scale ? dur / scale : null;
}
