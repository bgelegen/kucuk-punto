// The contract between the model and the system.
// 1) RESPONSE_SCHEMA is sent to the provider (structured output / tool schema).
// 2) validateResponse() is a deterministic, dependency-free validator that enforces the
//    same contract plus limits the provider does not enforce (lengths, ranges, counts).
// The model never supplies the risk score: it is not part of the schema.

import { CATEGORY_IDS, SEVERITY_IDS, DOC_TYPES } from './taxonomy.js';

export const LIMITS = {
  summary: 700, quote: 600, quoteMin: 15, explanation: 450, note: 300,
  findings: 30, injections: 10, uncertainties: 8
};

export const RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['document_type', 'language', 'summary_tr', 'findings', 'injection_suspected', 'uncertainties'],
  properties: {
    document_type: { type: 'string', enum: DOC_TYPES },
    language: { type: 'string', description: 'ISO 639-1 code of the document language, e.g. "en" or "tr".' },
    summary_tr: { type: 'string', maxLength: LIMITS.summary, description: 'Plain Turkish summary, 2-4 sentences, no legal advice.' },
    findings: {
      type: 'array', maxItems: LIMITS.findings,
      items: {
        type: 'object', additionalProperties: false,
        required: ['clause_id', 'category', 'severity', 'quote', 'explanation_tr', 'confidence'],
        properties: {
          clause_id: { type: 'string', description: 'Id of the clause the quote is copied from, e.g. "c12".' },
          category: { type: 'string', enum: CATEGORY_IDS },
          severity: { type: 'string', enum: SEVERITY_IDS },
          quote: { type: 'string', minLength: LIMITS.quoteMin, maxLength: LIMITS.quote, description: 'Exact, verbatim, contiguous text copied from that clause.' },
          explanation_tr: { type: 'string', maxLength: LIMITS.explanation, description: 'What this means for the user, in plain Turkish, 1-2 sentences.' },
          confidence: { type: 'number', minimum: 0, maximum: 1 }
        }
      }
    },
    injection_suspected: {
      type: 'array', maxItems: LIMITS.injections,
      items: {
        type: 'object', additionalProperties: false,
        required: ['clause_id', 'quote', 'note_tr'],
        properties: {
          clause_id: { type: 'string' },
          quote: { type: 'string', maxLength: LIMITS.quote },
          note_tr: { type: 'string', maxLength: LIMITS.note }
        }
      }
    },
    uncertainties: {
      type: 'array', maxItems: LIMITS.uncertainties,
      items: {
        type: 'object', additionalProperties: false,
        required: ['topic_tr', 'reason_tr'],
        properties: {
          topic_tr: { type: 'string', maxLength: LIMITS.note },
          reason_tr: { type: 'string', maxLength: LIMITS.note }
        }
      }
    }
  }
};

const UNSUPPORTED_BY_STRICT_PROVIDERS = ['minLength', 'maxLength', 'minimum', 'maximum', 'maxItems', 'minItems'];

/** Schema variant for providers whose strict mode rejects some keywords. Our validator still enforces them. */
export function providerSchema(schema = RESPONSE_SCHEMA) {
  if (Array.isArray(schema)) return schema.map(s => providerSchema(s));
  if (!schema || typeof schema !== 'object') return schema;
  const out = {};
  for (const [k, v] of Object.entries(schema)) {
    if (UNSUPPORTED_BY_STRICT_PROVIDERS.includes(k)) continue;
    out[k] = (k === 'properties') ? Object.fromEntries(Object.entries(v).map(([pk, pv]) => [pk, providerSchema(pv)])) : providerSchema(v);
  }
  return out;
}

/** Extract a JSON object from model text: tolerates code fences, nothing else. */
export function parseModelJSON(raw) {
  if (raw && typeof raw === 'object') return { value: raw, repaired: false };
  let s = String(raw ?? '').trim();
  let repaired = false;
  const fence = s.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fence) { s = fence[1]; repaired = true; }
  try { return { value: JSON.parse(s), repaired }; }
  catch (e) { return { error: 'JSON ayrıştırılamadı: ' + e.message }; }
}

const CTRL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F‪-‮⁦-⁩]/g; // incl. bidi overrides

function cleanStr(s) { return String(s).replace(CTRL, '').trim(); }

function checkObject(obj, schema, path, errors) {
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) { errors.push(`${path}: nesne olmalı`); return false; }
  for (const k of schema.required || []) if (!(k in obj)) errors.push(`${path}.${k}: eksik`);
  if (schema.additionalProperties === false) {
    for (const k of Object.keys(obj)) if (!(k in schema.properties)) errors.push(`${path}.${k}: şemada olmayan alan`);
  }
  return true;
}

function checkScalar(v, s, path, errors) {
  if (s.type === 'string') {
    if (typeof v !== 'string') return errors.push(`${path}: metin olmalı`), false;
    const c = cleanStr(v);
    if (s.enum && !s.enum.includes(c)) return errors.push(`${path}: geçersiz değer "${c.slice(0, 40)}"`), false;
    if (s.minLength != null && c.length < s.minLength) return errors.push(`${path}: çok kısa`), false;
    if (s.maxLength != null && c.length > s.maxLength) return errors.push(`${path}: çok uzun (${c.length}>${s.maxLength})`), false;
    return true;
  }
  if (s.type === 'number') {
    if (typeof v !== 'number' || !Number.isFinite(v)) return errors.push(`${path}: sayı olmalı`), false;
    if (s.minimum != null && v < s.minimum) return errors.push(`${path}: < ${s.minimum}`), false;
    if (s.maximum != null && v > s.maximum) return errors.push(`${path}: > ${s.maximum}`), false;
    return true;
  }
  return true;
}

function checkItem(item, s, path) {
  const errors = [];
  if (!checkObject(item, s, path, errors)) return errors;
  for (const [k, ps] of Object.entries(s.properties)) if (k in item) checkScalar(item[k], ps, `${path}.${k}`, errors);
  return errors;
}

/**
 * Deterministic validation.
 * - Top-level shape errors make the whole response invalid (caller may retry once).
 * - An invalid array item is dropped and recorded; the rest of the response survives.
 * @returns {{ok:boolean, errors:string[], value?:object, dropped:{path,errors,item}[]}}
 */
export function validateResponse(obj, schema = RESPONSE_SCHEMA) {
  const errors = [];
  const dropped = [];
  if (!checkObject(obj, schema, '$', errors)) return { ok: false, errors, dropped };
  for (const k of ['document_type', 'language', 'summary_tr']) if (k in obj) checkScalar(obj[k], schema.properties[k], '$.' + k, errors);
  const value = {
    document_type: cleanStr(obj.document_type ?? ''),
    language: cleanStr(obj.language ?? '').slice(0, 8),
    summary_tr: cleanStr(obj.summary_tr ?? '')
  };
  for (const key of ['findings', 'injection_suspected', 'uncertainties']) {
    const arr = obj[key];
    const ps = schema.properties[key];
    if (!Array.isArray(arr)) { errors.push(`$.${key}: dizi olmalı`); continue; }
    if (arr.length > ps.maxItems) errors.push(`$.${key}: en fazla ${ps.maxItems} öğe`);
    value[key] = [];
    arr.slice(0, ps.maxItems).forEach((item, i) => {
      const e = checkItem(item, ps.items, `$.${key}[${i}]`);
      if (e.length) { dropped.push({ path: `$.${key}[${i}]`, errors: e, item }); return; }
      const clean = {};
      for (const [k, v] of Object.entries(item)) clean[k] = typeof v === 'string' ? cleanStr(v) : v;
      value[key].push(clean);
    });
  }
  return { ok: errors.length === 0, errors, value: errors.length ? undefined : value, dropped };
}
