// Builds the demo page site/netflix-tos.html from the eval corpus text (same text the eval uses).
// Usage: node scripts/make-fixtures.js
import fs from 'node:fs';
import { textToBlocks } from '../src/core/segment.js';

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const idx = JSON.parse(fs.readFileSync('eval/corpus/index.json', 'utf8'));

function page(id) {
  const meta = idx.find(d => d.id === id);
  const blocks = textToBlocks(fs.readFileSync(`eval/corpus/${id}.txt`, 'utf8')).map(b => b.text);
  const html = blocks.map((t, i) => {
    if (i === 0) return `<h1>${esc(t)}</h1>`;
    if (t.length < 90 && /^\d+\.\s+\S/.test(t) && !/\.\s*$/.test(t)) return `<h2>${esc(t)}</h2>`;
    return `<p>${esc(t)}</p>`;
  }).join('\n');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(blocks[0])}</title>
<link rel="stylesheet" href="fixture.css">
</head>
<body>
<div class="fixture-note">Yerel test sayfası · Metin: ${esc(meta.service)} ${esc(meta.document)}, <a href="${esc(meta.source)}">Open Terms Archive</a> arşivinden (${esc(meta.retrieved)}). Yalnızca demo ve değerlendirme içindir.</div>
<main class="doc">
${html}
</main>
</body>
</html>
`;
}

fs.writeFileSync('site/netflix-tos.html', page('netflix-tos'));
console.log('site/netflix-tos.html');
