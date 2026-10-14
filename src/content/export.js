// "Raporu indir": a standalone, offline HTML copy of the report the user can keep or send.
//
// SECURITY: the file is built as a DOM (createHTMLDocument + textContent), never by string
// concatenation, so a quote such as "<script>…" ends up as text. The file also carries a CSP that
// forbids every script and every remote load, so even a parsing mistake could not run code or
// phone home when someone opens it later. Links come only from the static guidance table.

import { SEVERITY_TR } from '../core/taxonomy.js';
import { GUIDANCE, GUIDANCE_NOTE_TR } from '../core/guidance.js';

const STYLE = `
body { font: 15px/1.55 system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color: #1a1e24; background: #f7f6f2; margin: 0; }
main { max-width: 760px; margin: 0 auto; padding: 28px 20px 48px; }
header { background: linear-gradient(135deg, #132238, #25456f); color: #fff; border-radius: 16px; padding: 20px 22px; }
header h1 { margin: 0 0 4px; font-size: 22px; }
header p { margin: 0; opacity: .85; font-size: 13.5px; }
.note { background: #fff4d6; border: 1px solid #ecd9a0; color: #4a3700; border-radius: 12px; padding: 10px 14px; margin: 14px 0; font-size: 13.5px; }
.card { background: #fff; border: 1px solid #e5e1d7; border-radius: 14px; padding: 14px 16px; margin: 12px 0; }
.score { display: flex; gap: 18px; align-items: center; }
.num { font-size: 44px; font-weight: 800; line-height: 1; }
.band-low .num { color: #3d9566; } .band-medium .num { color: #d99a2b; } .band-high .num { color: #d4473c; } .band-uncertain .num { color: #8a6d1f; }
h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .7px; color: #5d6672; margin: 26px 0 6px; }
.f { border-left: 4px solid #e5e1d7; }
.f.high { border-left-color: #d4473c; } .f.medium { border-left-color: #d99a2b; } .f.low { border-left-color: #3d9566; }
.f h3 { margin: 0 0 4px; font-size: 16px; }
.chip { display: inline-block; font-size: 11.5px; font-weight: 700; padding: 1px 9px; border-radius: 999px; background: #f1eee6; color: #5d6672; }
.chip.high { background: #fde8e5; color: #962a21; } .chip.medium { background: #fcf0d6; color: #835608; } .chip.low { background: #e2f3e9; color: #256845; }
blockquote { margin: 8px 0; padding: 9px 12px; background: #f5f2ea; border-left: 3px solid #c9a45c; border-radius: 0 8px 8px 0; font: 14px/1.55 Georgia, serif; white-space: pre-wrap; }
.g { background: #f1eee6; border-radius: 10px; padding: 9px 12px; font-size: 13.5px; }
.g ul { margin: 4px 0; padding-left: 20px; }
.muted { color: #5d6672; font-size: 13px; }
.u { background: #fff9ec; border-color: #ecd29a; }
.sec { background: #fff4f3; border: 2px solid #d9534f; }
code { white-space: pre-wrap; word-break: break-word; font: 12.5px/1.45 ui-monospace, Consolas, monospace; color: #962a21; }
footer { margin-top: 28px; color: #5d6672; font-size: 12px; }
@media print { body { background: #fff; } .card { break-inside: avoid; } }
`;

/** Builds the report document. Exported for tests. */
export function buildReportDocument(r, doc = document) {
  const d = doc.implementation.createHTMLDocument('');
  const h = (tag, props, ...kids) => {
    const el = d.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) if (v != null && v !== false) el.setAttribute(k, String(v));
    for (const kid of kids.flat(Infinity)) if (kid != null && kid !== false) el.append(typeof kid === 'object' && kid.nodeType ? kid : d.createTextNode(String(kid)));
    return el;
  };
  const dt = iso => { try { return new Date(iso).toLocaleString('tr-TR', { dateStyle: 'long', timeStyle: 'short' }); } catch { return String(iso || ''); } };
  const conflict = r.score_status === 'conflict';
  const en = r.engine || {};
  const engine = en.mode === 'llm' && !en.error ? `${en.provider} · ${en.model}` : 'yalnızca kurallar (model kullanılmadı)';

  d.documentElement.setAttribute('lang', 'tr');
  const csp = h('meta', { 'http-equiv': 'Content-Security-Policy', content: "default-src 'none'; style-src 'unsafe-inline'" });
  const charset = h('meta', { charset: 'utf-8' });
  const vp = h('meta', { name: 'viewport', content: 'width=device-width, initial-scale=1' });
  const style = h('style', {}, STYLE);
  d.head.prepend(charset);
  d.head.append(csp, vp, style);
  d.title = `Küçük Punto raporu · ${r.meta?.title || r.meta?.host || 'sözleşme'}`;

  const main = h('main', {},
    h('header', {}, h('h1', {}, 'Küçük Punto · risk raporu'),
      h('p', {}, r.meta?.title || '', r.meta?.host ? ` · ${r.meta.host}` : ''),
      h('p', {}, `Analiz tarihi: ${dt(r.meta?.analysed_at)} · motor: ${engine}`)),
    h('div', { class: 'note' }, h('strong', {}, 'Hukuki tavsiye değildir. '), r.disclaimer_tr || 'Otomatik bir okuma yardımıdır; hata yapabilir.'),
    h('section', { class: `card score band-${conflict ? 'uncertain' : r.band}` },
      h('div', { class: 'num' }, conflict ? '?' : String(r.score)),
      h('div', {}, h('strong', {}, conflict ? 'Belirsiz' : `${r.band_tr} (100 üzerinden)`),
        h('div', { class: 'muted' }, conflict ? `Model ${r.score}, bağımsız kurallar ${r.rules_score} dedi; bu fark yüzünden skor verilmedi.` : 'Skoru yazılım hesaplar; yalnızca alıntısı metinde birebir bulunan bulgular sayılır.'),
        h('div', { class: 'muted' }, r.meta?.selection ? 'Yalnızca seçili metin incelendi.' : `Metnin %${r.coverage?.ratioPct ?? '?'}'i incelendi.`))),
    r.summary_tr ? h('section', { class: 'card' }, r.summary_tr) : null);

  if (r.security?.detected) {
    const s = r.security;
    main.append(h('section', { class: 'card sec' }, h('strong', {}, 'Sayfada yapay zekâya yönelik talimat bulundu'),
      h('p', { class: 'muted' }, 'Bunlar modele gönderilmedi ya da model görmeden metinden çıkarıldı.'),
      [...s.hidden_suspicious.map(x => x.text), ...s.quarantined.map(x => x.text), ...s.model_reported.map(x => x.quote)].slice(0, 8).map(t => h('p', {}, h('code', {}, t)))));
  }

  main.append(h('h2', {}, `Riskli maddeler (${r.findings.length})`));
  if (!r.findings.length) main.append(h('p', { class: 'card muted' }, 'Alıntıyla desteklenen riskli bir madde bulunamadı. Bu, metnin risksiz olduğu anlamına gelmez.'));
  for (const f of r.findings) {
    const g = GUIDANCE[f.category];
    main.append(h('article', { class: `card f ${f.severity}` },
      h('h3', {}, f.category_tr), h('span', { class: `chip ${f.severity}` }, SEVERITY_TR[f.severity]), ' ',
      h('span', { class: 'muted' }, f.source === 'rule' ? 'kural eşleşmesi' : f.corroborated ? 'model + kural' : `yalnızca model · güven %${Math.round(f.confidence * 100)}`),
      f.explanation_tr ? h('p', {}, f.explanation_tr) : null,
      h('blockquote', {}, '“' + f.evidence.quote + '”'),
      g ? h('div', { class: 'g' }, h('strong', {}, 'Ne yapabilirsiniz? '), g.tip_tr,
        g.laws.length ? h('ul', {}, g.laws.map(l => h('li', {}, h('a', { href: l.url, rel: 'noopener noreferrer' }, l.label)))) : null) : null));
  }

  if (r.uncertain?.length) {
    main.append(h('h2', {}, `Emin olamadıklarımız (${r.uncertain.length})`),
      h('section', { class: 'card u' }, h('p', { class: 'muted' }, 'Bunlar skora katılmadı; kendiniz bakmanız gerekiyor.'),
        h('ul', {}, r.uncertain.map(u => h('li', {}, u.text_tr, u.quote ? h('blockquote', {}, '“' + u.quote + '”') : null)))));
  }
  if (r.rejected?.length) {
    main.append(h('h2', {}, `Kanıtlanamadığı için gösterilmeyen iddialar (${r.rejected.length})`),
      h('section', { class: 'card' }, h('ul', {}, r.rejected.map(x => h('li', {}, x.reason_tr, x.quote ? h('div', { class: 'muted' }, '“' + x.quote + '”') : null)))));
  }
  main.append(h('footer', {}, GUIDANCE_NOTE_TR, ' ', `Küçük Punto v${r.version} · istem ${en.prompt_version || '-'}.`));
  d.body.append(main);
  return d;
}

export function reportFileName(r) {
  const host = String(r.meta?.host || 'sozlesme').replace(/[^a-z0-9.-]+/gi, '-').slice(0, 60) || 'sozlesme';
  const day = String(r.meta?.analysed_at || new Date().toISOString()).slice(0, 10);
  return `kucuk-punto-${host}-${day}.html`;
}

export function downloadReport(r, doc = document) {
  const d = buildReportDocument(r, doc);
  const html = '<!doctype html>\n' + d.documentElement.outerHTML;
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
  const a = doc.createElement('a');
  a.href = url; a.download = reportFileName(r); a.style.display = 'none';
  (doc.body || doc.documentElement).append(a);
  a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
  return a.download;
}
