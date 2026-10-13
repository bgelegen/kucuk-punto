import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { textToBlocks } from '../../src/core/segment.js';

export const EVAL_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

export function loadCorpus(only) {
  const index = JSON.parse(fs.readFileSync(path.join(EVAL_DIR, 'corpus/index.json'), 'utf8'));
  return index.filter(d => !only || only.includes(d.id)).map(d => {
    const text = fs.readFileSync(path.join(EVAL_DIR, 'corpus', d.id + '.txt'), 'utf8');
    const gold = JSON.parse(fs.readFileSync(path.join(EVAL_DIR, 'gold', d.id + '.json'), 'utf8'));
    return { ...d, text, blocks: textToBlocks(text), gold };
  });
}
