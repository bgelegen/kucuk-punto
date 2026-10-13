// Rule-based detector (English + Turkish). It has three jobs:
//  1. Baseline in the eval: what do plain keyword rules catch without an LLM?
//  2. Cross-check at runtime: a model finding that a rule also sees is marked "kural ile doğrulandı";
//     a category the rules see but the model ignored is shown as "belirsiz – kontrol edin".
//  3. Offline mode when no API key is configured (clearly labelled in the UI).

import { splitSentences } from './segment.js';
import { CATEGORIES } from './taxonomy.js';

const RULES = {
  auto_renewal: { sev: 'medium', re: [
    /\bauto(matic(ally)?)?[- ]?renew/i, /\brenews? automatically\b/i,
    /\b(continue|continues|renew|renews)\b[^.]{0,60}\b(until|unless)\b[^.]{0,30}\bcancel/i,
    /\brecurring (billing|charges?|payments?|fees?)\b/i, /\bmonth[- ]to[- ]month\b/i,
    /otomatik olarak yenilen|kendiliğinden yenilen|iptal edilmedikçe|aksi bildirilmedikçe[^.]{0,40}(yenilen|devam)/i
  ] },
  cancellation_refund: { sev: 'high', re: [
    /\bnon[- ]?refundable\b/i, /\bno refunds?\b/i,
    /\b(not|never) (be )?(entitled|eligible) (to|for) (a |any )?refunds?\b/i,
    /\b(do|does|will) not (provide|offer|issue|give) (any )?refunds?\b/i,
    /\bno (partial|prorated|pro-rated)\b/i, /\bwithout (a |any )?refund\b/i,
    /iade (edilmez|yapılmaz|edilmeyecek)|ücret iadesi (yapılmaz|bulunmamaktadır)|cayma hakkı[^.]{0,40}(yoktur|bulunmamaktadır|kullanılamaz)/i
  ] },
  price_change: { sev: 'medium', re: [
    /\b(change|changes|increase|increases|modify|adjust)\b[^.]{0,30}\b(price|prices|pricing|fees?|subscription (fee|price)s?|charges)\b/i,
    /\bprice (changes?|increases?)\b/i,
    /(fiyat|ücret)\w*[^.]{0,40}(değiştir|artır|güncelle)/i
  ] },
  unilateral_change: { sev: 'medium', re: [
    /\b(may|can|reserve the right to)\b[^.]{0,20}\b(change|modify|amend|update|revise)\b[^.]{0,20}\b(these|this|the|our)\b[^.]{0,10}\b(terms|agreement|policy|policies)\b/i,
    /\bcontinued use\b[^.]{0,80}\b(accept|agree|constitutes)/i,
    /(tek taraflı olarak|dilediği zaman|herhangi bir zamanda)[^.]{0,60}(değiştir|güncelle)/i
  ] },
  account_termination: { sev: 'medium', re: [
    /\b(suspend|terminate|disable|close|cancel)\w*\b[^.]{0,60}\b(account|access|membership|use of the service)\b[^.]{0,100}\b(at any time|for any reason|sole discretion|without (prior )?notice)\b/i,
    /\b(at any time|for any reason|sole discretion|without (prior )?notice)\b[^.]{0,80}\b(suspend|terminate)\w*\b/i,
    /(hesab|üyeliğ)\w*[^.]{0,60}(askıya al|kapat|sonlandır|feshet)\w*[^.]{0,60}(dilediği zaman|herhangi bir sebep|bildirimde bulunmaksızın|takdir)/i
  ] },
  data_sharing: { sev: 'high', re: [
    /\b(share|shares|sell|sells|disclose|disclosed|transfer|provide)\b[^.]{0,80}\b(third[- ]part(y|ies)|partners?|advertis\w+|affiliates|service providers|vendors)\b/i,
    /\b(third[- ]part(y|ies)|partners|advertisers)\b[^.]{0,60}\b(receive|access|obtain|collect)\b[^.]{0,40}\b(data|information)\b/i,
    /(üçüncü (taraf|kişi)|iş ortak|reklam)\w*[^.]{0,80}(paylaş|aktar|devret)|(paylaş|aktar)\w*[^.]{0,80}(üçüncü (taraf|kişi)|iş ortak)|yurt ?dışına aktar/i
  ] },
  data_retention: { sev: 'medium', re: [
    /\b(retain|retains|keep|store|preserve)\b[^.]{0,80}\b(as long as|indefinitely|even after|after (you )?(delete|close|terminate)|for (a )?(longer )?period|backups?)\b/i,
    /(sakla|muhafaza)\w*[^.]{0,60}(süresiz|sildikten sonra|kapattıktan sonra|yasal süre)/i
  ] },
  tracking_profiling: { sev: 'low', re: [
    /\b(cookies|pixels?|web beacons?|tracking technolog\w+|device identifiers?|fingerprint\w*)\b/i,
    /\b(profil(e|es|ing)|infer(ences?)?|interest[- ]based|personali[sz]ed (ads|advertising)|targeted advertising)\b/i,
    /çerez|izleme teknoloji|profil(leme|iniz)|kişiselleştirilmiş reklam|hedefli reklam/i
  ] },
  content_license: { sev: 'medium', re: [
    /\b(worldwide|perpetual|irrevocable|royalty[- ]free|sub-?licensable|transferable)\b[^.]{0,140}\blicen[cs]e/i,
    /\blicen[cs]e\b[^.]{0,140}\b(worldwide|perpetual|irrevocable|royalty[- ]free|sub-?licensable)\b/i,
    /(dünya çapında|süresiz|gayri kabili rücu|telifsiz|alt lisans)[^.]{0,100}lisans/i
  ] },
  ai_training: { sev: 'medium', re: [
    /\b(train|training|improve|develop)\w*\b[^.]{0,60}\b(machine learning|artificial intelligence|\bai\b|models?)\b/i,
    /\b(machine learning|artificial intelligence)\b[^.]{0,60}\b(your|user) (content|data|information)\b/i,
    /(yapay zek[aâ]|makine öğren)\w*[^.]{0,60}(eğit|geliştir)/i
  ] },
  liability_limit: { sev: 'low', re: [
    /\blimitation of liability\b/i, /\bin no event\b[^.]{0,80}\bliable\b/i,
    /\b(not|no) (be )?(liable|responsible) for\b/i, /\b(total|aggregate|maximum) liability\b/i,
    /\b"?as is"?\b[^.]{0,40}\b"?as available"?\b/i, /\bdisclaim\w* (all |any )?(warrant|liabilit)/i,
    /sorumlu (tutulamaz|değildir|olmayacak)|sorumluluk kabul (edilmez|etmez)/i
  ] },
  indemnification: { sev: 'low', re: [
    /\bindemnif\w*/i, /\bhold\b[^.]{0,30}\bharmless\b/i,
    /tazmin (et|edeceğ|yükümlü)|zararı (karşıla|tazmin)/i
  ] },
  dispute_waiver: { sev: 'high', re: [
    /\barbitrat\w*/i, /\bclass[- ]action\b/i, /\bclass (or|and) representative\b/i, /\bjury trial\b/i,
    /tahkim|toplu dava|grup davası/i
  ] },
  governing_law: { sev: 'low', re: [
    /\b(governed by|construed in accordance with)\b[^.]{0,60}\blaws? of\b/i,
    /\bexclusive(ly)? (jurisdiction|venue)\b/i,
    /uygulanacak hukuk|yetkili (mahkeme|icra)|münhasır yetki/i
  ] }
};

const MAX_QUOTE = 300;

function trimQuote(sentence, matchIndex) {
  if (sentence.length <= MAX_QUOTE) return sentence;
  const start = Math.max(0, Math.min(matchIndex - 100, sentence.length - MAX_QUOTE));
  // cut on word boundaries so the quote stays a verbatim substring
  let s = sentence.slice(start, start + MAX_QUOTE);
  if (start > 0) s = s.slice(s.indexOf(' ') + 1);
  const lastSpace = s.lastIndexOf(' ');
  if (start + MAX_QUOTE < sentence.length && lastSpace > 0) s = s.slice(0, lastSpace);
  return s;
}

/** @returns findings in the same shape as validated model findings (source: 'rule') */
export function runBaseline(clauses) {
  const out = [];
  for (const c of clauses) {
    for (const s of splitSentences(c.text)) {
      if (s.length < 20 || s.includes('[KALDIRILDI')) continue;
      for (const [cat, rule] of Object.entries(RULES)) {
        for (const re of rule.re) {
          const m = re.exec(s);
          if (!m) continue;
          out.push({
            clause_id: c.id, category: cat, severity: rule.sev,
            quote: trimQuote(s, m.index), explanation_tr: CATEGORIES[cat].hint,
            confidence: 0.5, source: 'rule', rule: re.source.slice(0, 60)
          });
          break;
        }
      }
    }
  }
  return out;
}

export const BASELINE_RULES = RULES;
