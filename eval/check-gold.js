// Sanity check for the gold set: every evidence snippet must occur verbatim (after
// typographic normalisation) in its document, and every category must exist.
import { loadCorpus } from './lib/corpus.js';
import { locatePoints } from './lib/match.js';
import { CATEGORY_IDS, SEVERITY_IDS } from '../src/core/taxonomy.js';

let bad = 0;
const rows = [];
for (const doc of loadCorpus()) {
  const pts = locatePoints(doc.gold, doc.blocks);
  for (const p of pts) {
    for (const c of [p.category, ...p.also]) if (!CATEGORY_IDS.includes(c)) { bad++; console.error(`${doc.id} ${p.id}: unknown category ${c}`); }
    if (!SEVERITY_IDS.includes(p.severity)) { bad++; console.error(`${doc.id} ${p.id}: bad severity`); }
    for (const m of p.missing) { bad++; console.error(`${doc.id} ${p.id}: evidence not found -> "${m.slice(0, 80)}"`); }
  }
  rows.push(`${doc.id.padEnd(18)} points=${pts.length} required=${pts.filter(p => !p.optional).length} optional=${pts.filter(p => p.optional).length}`);
}
console.log(rows.join('\n'));
if (bad) { console.error(`\n${bad} problem(s) in gold set`); process.exit(1); }
console.log('\nGold set OK');
