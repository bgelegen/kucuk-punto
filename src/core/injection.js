// Prompt-injection screening. Runs on every clause BEFORE the model sees it,
// and on hidden page text that the capture layer already removed.
// A clause sentence that looks like an instruction to an AI is replaced by a placeholder,
// so the model never receives it; the original is shown to the user in the security section.

import { splitSentences } from './segment.js';

export const QUARANTINE_MARK = '[KALDIRILDI: olası talimat enjeksiyonu]';

// Strong patterns: enough on their own.
const STRONG = [
  { id: 'ignore-instructions', re: /\b(ignore|disregard|forget|override|bypass)\b[^.\n]{0,40}\b(previous|prior|above|earlier|all|any|your|system|the)\b[^.\n]{0,30}\b(instructions?|prompts?|rules|directions|guidelines)\b/i },
  { id: 'role-switch', re: /\b(you are now|from now on,? you|act as|pretend to be|you're now)\b[^.\n]{0,40}\b(ai|assistant|model|llm|chatbot|gpt|claude|gemini|analy[sz]er)\b/i },
  { id: 'fence-token', re: /<\/?\s*(document|system|instructions?|user|assistant)\b[^>]{0,60}>/i },
  // (merely naming "prompt injection" or "jailbreak" is not an instruction, so those words are not patterns)
  { id: 'system-prompt', re: /\b(system prompt|system message|developer message)\b/i },
  { id: 'score-steer', re: /\b(risk[_ -]?score|risk rating|risk level)\b[^.\n]{0,50}\b(0|zero|low|lowest|safe|minimal|none)\b/i },
  { id: 'verdict-steer', re: /\b(rate|mark|classify|label|report|treat|consider)\b[^.\n]{0,40}\b(this|these|the)\b[^.\n]{0,25}\b(document|page|terms|policy|agreement|site|service)\b[^.\n]{0,30}\b(as )?(safe|harmless|low[- ]risk|risk[- ]free|trustworthy|fair|no risk)\b/i },
  { id: 'output-format', re: /\b(respond|reply|answer|output|return|print)\b[^.\n]{0,30}\b(only|exactly)\b[^.\n]{0,30}\b(json|the following|this text)\b/i },
  { id: 'json-payload', re: /["'](risk_score|findings|severity|injection_suspected|document_type)["']\s*:/i },
  { id: 'tr-ignore', re: /(önceki|yukarıdaki|tüm|bütün|verilen|sistem)\s+(talimat|komut|kural|yönerge|istem)\w*\s+(\S+\s+){0,2}(yok say|görmezden gel|unut|dikkate alma|geçersiz)/i },
  { id: 'tr-ignore-2', re: /(talimat|komut|yönerge)(ları|leri|lar|ler)?\w*\s+(yok say|görmezden gel|unut)/i },
  { id: 'tr-role', re: /(sen artık|artık sen|bundan sonra sen)\b/i },
  { id: 'tr-system', re: /sistem\s+(istem|talimat|mesaj)\w*/i },
  { id: 'tr-score', re: /risk\s*(skor|puan|seviye)\w*[^.\n]{0,40}(\b0\b|sıfır|düşük|güvenli|yok)/i },
  { id: 'tr-verdict', re: /(güvenli|risksiz|zararsız|adil)\s+(olarak|diye)\s+(işaretle|raporla|değerlendir|göster|belirt)/i },
  { id: 'suppress-findings', re: /\b(return|report|output|give|list|find)\s+(no|zero|0)\s+(findings|risks?|issues|clauses|problems)\b|\b(do not|don't|never)\s+(report|mention|flag|list|include)\s+(any|the|these)?\s*(clauses|risks?|findings|issues)\b/i },
  { id: 'reassure-user', re: /\btell\s+(the\s+)?user\b[^.\n]{0,40}\b(safe|harmless|fine|no risk|risk[- ]free|fair)\b/i },
  { id: 'role-prefix', re: /(^|[\n>]\s*)(system|assistant|developer)\s*:\s|\byou are now in\b[^.\n]{0,25}\bmode\b/i },
  { id: 'tr-suppress', re: /(risk|bulgu|madde)\w*\s+(olarak\s+)?(raporlama|bildirme|gösterme|listeleme)(ma|me)/i }
];

// Weak patterns: count only when the same sentence also ADDRESSES an AI (vocative "AI assistant:",
// "note to AI", "models reading this document"). Merely mentioning AI is not enough: real terms
// talk about "generative AI features" all the time (measured on the eval corpus: 0 false hits).
const AI_WORD = '(?:ai|a\\.i\\.|llms?|(?:large )?language models?|ai models?|assistants?|chatbots?|gpt|claude|gemini|copilot|summari[sz]ers?|analy[sz]ers?|bots?|agents?|crawlers?)';
const ADDRESSES_AI = new RegExp([
  `\\b(?:note|message|instructions?|reminder)s?\\s+(?:to|for)\\s+(?:all\\s+|any\\s+)?${AI_WORD}\\b`,
  `(?:^|[.!?]\\s+|\\n)\\s*(?:dear\\s+|hey\\s+)?${AI_WORD}(?:\\s+${AI_WORD})?\\s*[:,]`,
  `\\b${AI_WORD}\\s+(?:that|which|who)?\\s*(?:are\\s+)?(?:read|reads|reading|summari[sz]\\w*|analy[sz]\\w*|process\\w*|review\\w*|crawl\\w*)\\s+(?:this|these|the following)\\b`,
  '(?:^|[.!?]\\s+)\\s*(?:sevgili\\s+)?(?:yapay\\s*zek\\S*|asistan|dil\\s+model\\S*|özetleyici|model)\\s*(?:asistan\\S*)?\\s*[:,]',
  '(?:özetleyen|okuyan|inceleyen|analiz\\s+eden|işleyen)\\s+(?:tüm\\s+)?(?:yapay\\s*zek\\S*|asistan\\S*|dil\\s+model\\S*|model\\S*|sistem\\S*|araç\\S*)',
  '(?:yapay\\s*zek\\S*|asistan\\S*|model\\S*)\\s+(?:için\\s+)?not\\b'
].join('|'), 'i');
const DIRECTIVE = /\b(must|should|shall|have to|need to|are required to|always|never|do not|don't|instead)\b|zorunda|mutlaka|asla|gerekir|gerekmektedir|yapmayın|belirtmeyin|söylemeyin|m[ae]l[ıi]d[ıi]r\b|m[ae]m[ae]l[ıi]/i;

export function scanText(text) {
  const hits = [];
  for (const p of STRONG) { const m = p.re.exec(text); if (m) hits.push({ pattern: p.id, match: m[0] }); }
  if (!hits.length && ADDRESSES_AI.test(text) && DIRECTIVE.test(text)) {
    hits.push({ pattern: 'ai-directive', match: (ADDRESSES_AI.exec(text) || [''])[0] });
  }
  return hits;
}

/**
 * Remove instruction-like sentences from clauses before they go to the model.
 * @returns {{clauses, quarantined:{clause_id,text,patterns}[]}}
 */
export function quarantine(clauses) {
  const out = [];
  const quarantined = [];
  for (const c of clauses) {
    const sentences = splitSentences(c.text);
    let changed = false;
    const kept = sentences.map(s => {
      const hits = scanText(s);
      if (!hits.length) return s;
      changed = true;
      quarantined.push({ clause_id: c.id, text: s, patterns: hits.map(h => h.pattern) });
      return QUARANTINE_MARK;
    });
    out.push(changed ? { ...c, text: kept.join(' '), original: c.text, quarantined: true } : c);
  }
  return { clauses: out, quarantined };
}

/** Hidden segments never reach the model; we only classify them for the report. */
export function classifyHidden(hidden = []) {
  return hidden.map(h => ({ ...h, patterns: scanText(h.text).map(x => x.pattern) }))
    .map(h => ({ ...h, suspicious: h.patterns.length > 0 }));
}
