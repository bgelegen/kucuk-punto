// Is the open page a terms / privacy / subscription document?
// Cheap and local: URL, title and the density of legal vocabulary. Nothing leaves the browser here.

const URL_RE = /(terms|tos\b|conditions|legal|privacy|policy|policies|eula|agreement|subscription|billing|kullanim|kosul|sozlesme|gizlilik|kvkk|aydinlatma|uyelik|abonelik|cerez|cookie|mesafeli)/i;
const TITLE_RE = /(terms|conditions|privacy|policy|agreement|subscription|legal|cookie|koşul|şart|sözleşme|gizlilik|politika|aydınlatma|kvkk|üyelik|abonelik|çerez)/i;
const LEGAL_WORDS = /\b(shall|hereby|herein|liable|liability|warrant\w*|indemnif\w*|arbitrat\w*|governing law|terminat\w*|agreement|personal (data|information)|third[- ]part\w*|jurisdiction|refund\w*|subscription|consent|licen[cs]e\w*|disclos\w*|retain\w*|cookies?)\b|sözleşme|madde|taraflar|kişisel veri|yükümlü|fesih|iade|abonelik|rıza|sorumlu|üçüncü kişi|yetkili mahkeme|aydınlatma|çerez/gi;

export function detectLegal({ url = '', title = '', text = '' }) {
  const words = text ? text.split(/\s+/).length : 0;
  const hits = text ? (text.match(LEGAL_WORDS) || []).length : 0;
  const density = words ? Math.round(hits / words * 1000 * 10) / 10 : 0;
  const urlHit = URL_RE.test(url), titleHit = TITLE_RE.test(title);
  const isLegal = words >= 250 && (((urlHit || titleHit) && density >= 5) || density >= 14);
  const hay = (url + ' ' + title).toLowerCase();
  const kind = /privacy|gizlilik|kvkk|aydınlatma|aydinlatma|cookie|çerez|cerez/.test(hay) ? 'privacy'
    : /subscription|abonelik|üyelik|uyelik|billing/.test(hay) ? 'subscription' : 'terms';
  return { isLegal, kind, density, words, urlHit, titleHit };
}

export const KIND_TR = { privacy: 'Gizlilik politikası', subscription: 'Abonelik şartları', terms: 'Kullanım koşulları' };
