// Records the Cypress demo and checks the ≤ 90 s limit.
//   npm run demo            (real model from .env)      KP_MOCK=1 npm run demo   (demo model)
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, loadDotEnv } from './env.js';

loadDotEnv();
const t0 = Date.now();
const run = spawnSync('npx', ['cypress', 'run', '--e2e', '--browser', 'electron', '--spec', 'cypress/e2e/demo.cy.js'], { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' });
const video = path.join(ROOT, 'cypress/videos/demo.cy.js.mp4');
if (!fs.existsSync(video)) { console.error('Video bulunamadı: ' + video); process.exit(run.status || 1); }
fs.mkdirSync(path.join(ROOT, 'docs'), { recursive: true });
fs.copyFileSync(video, path.join(ROOT, 'docs/demo.mp4'));
const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', video], { encoding: 'utf8' });
const sec = probe.status === 0 ? parseFloat(probe.stdout) : (Date.now() - t0) / 1000;
console.log(`\ndocs/demo.mp4 · ${sec.toFixed(1)} sn ${probe.status === 0 ? '' : '(ffprobe yok; tahmini)'}`);
if (sec > 90) console.log('⚠️  90 saniyeyi aşıyor. Daha hızlı model deneyin: KP_MODEL=gemini-flash-lite-latest npm run demo');
process.exit(run.status ?? 0);
