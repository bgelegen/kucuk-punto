// Deterministic "what we did NOT read" detector.
// Terms often say "see our Refund Policy" — those documents were not analysed,
// so the report must say so instead of implying the whole contract was covered.

const PATTERNS = [
  /\b(?:see|refer to|read|review|governed by|described in|set out in|subject to|incorporated by reference)\b[^.]{0,40}?\b(?:our|the|its)\s+((?:[A-Z][\w&'-]*\s){0,4}(?:Policy|Policies|Terms|Agreement|Guidelines|Notice|Statement|Rules|Conditions))\b/g,
  // JS \b is ASCII-only ("Politikası" ends in a non-\w letter), so word ends are lookarounds here
  /((?:[A-ZÇĞİÖŞÜ][\wçğıöşü'-]*\s){0,4}(?:Politikası|Politikamız|Sözleşmesi|Koşulları|Aydınlatma Metni|Kuralları|Şartları))(?![\wçğıöşüÇĞİÖŞÜ])[^.]{0,40}?(?<![\wçğıöşüÇĞİÖŞÜ])(?:geçerlidir|uygulanır|bakınız|inceleyiniz|yer almaktadır|ayrıca|tabidir)/g
];

/** @returns {{name:string, clause_id:string}[]} unique referenced documents */
export function findExternalReferences(clauses, ownTitle = '') {
  const seen = new Map();
  const own = ownTitle.toLowerCase();
  for (const c of clauses) {
    for (const re of PATTERNS) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(c.text))) {
        const name = m[1].trim().replace(/\s+/g, ' ');
        if (name.split(' ').length < 2) continue;              // "the Terms" alone is too vague
        const key = name.toLowerCase();
        if (own && own.includes(key)) continue;                // the document referring to itself
        if (/^(these|this|bu)\b/i.test(name)) continue;
        if (!seen.has(key)) seen.set(key, { name, clause_id: c.id });
      }
    }
  }
  return [...seen.values()].slice(0, 6);
}
