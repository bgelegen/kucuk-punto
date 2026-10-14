// Saves the real model's answers for the live demo pages (GitHub Pages "kayıtlı yanıt" mode).
//   node scripts/record-demo.js        (demo-kaydi.bat runs it through run-all.js --record)
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, loadDotEnv } from './env.js';
import { buildWeb, DEMO_PAGES } from './build-web.js';

loadDotEnv();
const statusFile = path.join(ROOT, 'cypress', '.harness-error.json');
fs.rmSync(statusFile, { force: true });
const run = spawnSync('npx', ['cypress', 'run', '--e2e', '--browser', 'electron', '--spec', 'cypress/e2e/record.cy.js', '--config', 'video=false'],
  { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32', env: { ...process.env, KP_RECORD: '1' } });
await buildWeb({ quiet: true });   // refresh demo/recordings/index.json
const have = DEMO_PAGES.filter(p => fs.existsSync(path.join(ROOT, 'demo', 'recordings', p + '.json')));
console.log(`\nKayıtlı yanıtlar: ${have.join(', ') || 'yok'}`);
let harnessError = null;
try { harnessError = JSON.parse(fs.readFileSync(statusFile, 'utf8')); } catch { /* none */ }
if (run.status !== 0 && harnessError) console.log(`Model hatası: ${harnessError.code} (${harnessError.model})`);
process.exit(run.status !== 0 && harnessError?.code === 'QUOTA' ? 6 : (run.status ?? 0));
