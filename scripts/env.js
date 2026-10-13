// Reads KEY=value lines from the project's .env (never committed) into process.env.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function loadDotEnv(file = path.join(ROOT, '.env')) {
  if (!fs.existsSync(file)) return false;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return true;
}

/** Settings object in the same shape the extension stores, built from KP_* variables. */
export function settingsFromEnv(over = {}) {
  return {
    provider: over.provider || process.env.KP_PROVIDER || 'gemini',
    apiKey: process.env.KP_API_KEY || '',
    model: over.model || process.env.KP_MODEL || '',
    baseUrl: over.baseUrl || process.env.KP_BASE_URL || '',
    autoAnalyze: false
  };
}
