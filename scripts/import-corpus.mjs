// One-off import of Open Terms Archive snapshots (commit d8d090f2e9d8c08465057721f1f0d76504c5635d) into eval/corpus.
import fs from 'node:fs'; import path from 'node:path';
import { mdToPlain } from '../eval/lib/markdown.js';
const SRC = process.argv[2];
const DOCS = [
  ['netflix-tos', 'Netflix', 'Terms of Service', 'terms_of_service'],
  ['spotify-tos', 'Spotify', 'Terms of Service', 'terms_of_service'],
  ['grammarly-tos', 'Grammarly', 'Terms of Service', 'terms_of_service'],
  ['signal-tos', 'Signal', 'Terms of Service', 'terms_of_service'],
  ['reddit-privacy', 'Reddit', 'Privacy Policy', 'privacy_policy'],
  ['telegram-privacy', 'Telegram', 'Privacy Policy', 'privacy_policy']
];
const index = [];
for (const [id, service, doc, type] of DOCS) {
  const rel = service + '/' + doc + '.md';
  const plain = mdToPlain(fs.readFileSync(path.join(SRC, rel), 'utf8'));
  fs.writeFileSync('eval/corpus/' + id + '.txt', plain);
  index.push({ id, service, document: doc, type, chars: plain.length,
    source: 'https://github.com/OpenTermsArchive/contrib-versions/blob/d8d090f2e9d8c08465057721f1f0d76504c5635d/' + encodeURI(rel),
    retrieved: '2026-10-13' });
}
fs.writeFileSync('eval/corpus/index.json', JSON.stringify(index, null, 2) + '\n');
console.log(index.map(d => d.id + ' ' + d.chars).join('\n'));
