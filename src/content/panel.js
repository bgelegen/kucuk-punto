// In-page report panel (Shadow DOM, so the page's CSS cannot restyle it and ours cannot leak).
//
// SECURITY: every string that came from the page or the model is inserted with text nodes /
// textContent. There is no innerHTML anywhere in this file, so a quote such as
// "<img src=x onerror=...>" is displayed as text, never parsed. Links come only from the
// static guidance table, never from the page or the model.
//
// Stable `data-kp` hooks are used by the Cypress demo and the Playwright tests.

import { SEVERITY_TR, CATEGORIES, SEVERITY } from '../core/taxonomy.js';
import { GUIDANCE, GUIDANCE_NOTE_TR } from '../core/guidance.js';
import { findingId } from '../core/history.js';
import { ICONS, SHORT_TR } from './icons.js';
import { downloadReport } from './export.js';

const STAGES = [
  ['capture', 'Görünür metin okunuyor, gizli metin ayıklanıyor'],
  ['model', 'Model maddeleri inceliyor'],
  ['repair', 'Model yanıtı şemaya uymadı, bir kez düzeltme isteniyor'],
  ['verify', 'Alıntılar orijinal metinde tek tek doğrulanıyor'],
  ['done', 'Skor hesaplanıyor']
];

const UNCERTAIN_LABEL = {
  low_confidence: 'Düşük güven', rule_only: 'Kontrol edin', model: 'Modelin çekincesi',
  external_reference: 'İncelenmeyen belge', truncated: 'Kısmi inceleme', not_legal: 'Belge türü',
  rules_only: 'Model kullanılmadı', model_rule_conflict: 'Tutarsız sonuç', hidden_content: 'Görünmeyen metin',
  layout_suspect: 'Sayfa okunamamış olabilir', selection: 'Yalnızca seçili metin'
};

const HIDDEN_REASON_TR = {
  'css-hidden': 'CSS ile gizlenmiş', 'tiny-font': 'Mikroskobik yazı', 'transparent-text': 'Saydam yazı',
  'low-contrast': 'Arka planla aynı renk', 'clipped': 'Kırpılmış kutu', 'zero-size': 'Sıfır boyut', 'offscreen': 'Ekran dışı'
};

const CSS = `
:host { all: initial; }
* { box-sizing: border-box; }
.root {
  --bg:#f7f6f2; --card:#ffffff; --ink:#1a1e24; --muted:#5d6672; --line:#e5e1d7; --soft:#f1eee6;
  --navy:#132238; --navy2:#25456f; --gold:#c9a45c;
  --hi:#d4473c; --hi-bg:#fde8e5; --hi-ink:#962a21; --me:#d99a2b; --me-bg:#fcf0d6; --me-ink:#835608; --lo:#3d9566; --lo-bg:#e2f3e9; --lo-ink:#256845;
  --warn:#d9a032; --warn-bg:#fff9ec; --warn-line:#ecd29a; --danger:#d9534f; --danger-bg:#fff4f3; --ok:#2f7d4f;
  --quote:#f5f2ea; --shadow:0 1px 2px rgba(20,30,50,.06), 0 4px 14px rgba(20,30,50,.06);
  font: 14px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; color: var(--ink); -webkit-font-smoothing: antialiased;
}
@media (prefers-color-scheme: dark) { .root {
  --bg:#12151a; --card:#1b1f26; --ink:#e9ebee; --muted:#9aa3ae; --line:#2b313a; --soft:#232832;
  --hi-bg:#3a1f1d; --hi-ink:#f2a29a; --me-bg:#3a2e14; --me-ink:#f0c470; --lo-bg:#173025; --lo-ink:#8fd3ad;
  --warn-bg:#2b2416; --warn-line:#5a4823; --danger-bg:#2e1c1c; --quote:#232832; --shadow:0 1px 2px rgba(0,0,0,.3);
} }
button { font: inherit; cursor: pointer; color: inherit; }
a { color: var(--navy2); }
@media (prefers-color-scheme: dark) { a { color: #8db4e8; } }
svg.i { width: 16px; height: 16px; flex: none; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }

.pill { position: fixed; right: 20px; bottom: 20px; z-index: 2147483647; display: flex; align-items: center; gap: 12px; border: 0; border-radius: 16px;
  padding: 10px 16px 10px 10px; color: #fff; background: linear-gradient(135deg, var(--navy), var(--navy2)); box-shadow: 0 10px 30px rgba(10,20,40,.35); }
.pill .mark { width: 34px; height: 34px; border-radius: 10px; background: rgba(255,255,255,.12); display: grid; place-items: center; }
.pill .mark svg { width: 20px; height: 20px; color: var(--gold); }
.pill .t1 { font-weight: 700; font-size: 13.5px; display: block; text-align: left; }
.pill .t2 { font-size: 12px; opacity: .8; display: block; text-align: left; }
.pill:hover { filter: brightness(1.08); }

.panel { position: fixed; top: 0; right: 0; bottom: 0; width: 440px; max-width: 100vw; z-index: 2147483647; background: var(--bg);
  border-left: 1px solid var(--line); box-shadow: -12px 0 40px rgba(10,20,40,.22); display: flex; flex-direction: column; }
.panel[hidden], .pill[hidden] { display: none; }
header { display: flex; align-items: center; gap: 10px; padding: 14px 16px; color: #fff; background: linear-gradient(135deg, var(--navy), var(--navy2)); }
header .logo { width: 30px; height: 30px; border-radius: 9px; background: rgba(255,255,255,.12); display: grid; place-items: center; }
header .logo svg { color: var(--gold); width: 18px; height: 18px; }
header .brand { flex: 1; line-height: 1.2; }
header .brand b { display: block; font-size: 15px; letter-spacing: .2px; }
header .brand small { opacity: .75; font-size: 12px; }
header button { background: transparent; border: 0; color: #fff; padding: 6px; border-radius: 8px; display: grid; }
header button:hover { background: rgba(255,255,255,.12); }

.disclaimer { display: flex; gap: 10px; padding: 9px 16px; background: #fff4d6; border-bottom: 1px solid #ecd9a0; color: #5a4300; font-size: 12.5px; line-height: 1.45; }
.disclaimer strong { color: #3d2d00; }
@media (prefers-color-scheme: dark) { .disclaimer { background: #2e2713; border-color: #5a4823; color: #e9d59b; } .disclaimer strong { color: #f6e3a8; } }

.body { flex: 1; overflow-y: auto; padding: 14px 16px 18px; display: flex; flex-direction: column; gap: 12px; scroll-behavior: smooth; }
.card { background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 14px; box-shadow: var(--shadow); }
.muted { color: var(--muted); } .small { font-size: 12.5px; }
h2 { display: flex; align-items: center; gap: 8px; font-size: 12px; text-transform: uppercase; letter-spacing: .7px; color: var(--muted); margin: 8px 2px -2px; font-weight: 700; }
h2 .n { background: var(--soft); color: var(--ink); border-radius: 999px; padding: 0 8px; font-size: 11.5px; letter-spacing: 0; }
p { margin: 0; }
.row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }

.btn { border: 1px solid var(--line); background: var(--card); border-radius: 10px; padding: 8px 12px; font-size: 13px; display: inline-flex; align-items: center; gap: 6px; }
.btn:hover { border-color: var(--navy2); }
.btn.primary { background: linear-gradient(135deg, var(--navy), var(--navy2)); color: #fff; border: 0; font-weight: 650; padding: 12px 14px; width: 100%; justify-content: center; font-size: 14.5px; box-shadow: 0 6px 16px rgba(19,34,56,.25); }
.btn.link { border: 0; background: none; padding: 2px 0; color: var(--navy2); font-weight: 600; font-size: 12.5px; }
@media (prefers-color-scheme: dark) { .btn.link { color: #8db4e8; } }
.btn.link:hover { text-decoration: underline; }

.hero { text-align: center; padding: 22px 16px; }
.hero .big { width: 54px; height: 54px; margin: 0 auto 10px; border-radius: 16px; display: grid; place-items: center; background: linear-gradient(135deg, var(--navy), var(--navy2)); }
.hero .big svg { width: 28px; height: 28px; color: var(--gold); }
.hero h3 { margin: 0 0 4px; font-size: 16px; }
.tips { display: flex; flex-direction: column; gap: 6px; font-size: 12.5px; color: var(--muted); }
.tips div { display: flex; gap: 8px; align-items: flex-start; }
kbd { font: 11px ui-monospace, Menlo, Consolas, monospace; border: 1px solid var(--line); border-bottom-width: 2px; border-radius: 5px; padding: 0 5px; background: var(--card); }

.progress { height: 4px; border-radius: 4px; background: var(--soft); overflow: hidden; margin-bottom: 14px; }
.progress span { display: block; height: 100%; width: 40%; border-radius: 4px; background: linear-gradient(90deg, var(--navy2), var(--gold)); animation: slide 1.2s ease-in-out infinite; }
@keyframes slide { 0% { transform: translateX(-100%); } 100% { transform: translateX(260%); } }
.steps { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
.steps li { display: flex; gap: 10px; align-items: center; color: var(--muted); }
.steps li .dot { width: 18px; height: 18px; border-radius: 50%; border: 2px solid var(--line); flex: none; display: grid; place-items: center; }
.steps li.on { color: var(--ink); font-weight: 600; }
.steps li.on .dot { border-color: var(--navy2); border-top-color: transparent; animation: spin .8s linear infinite; }
.steps li.ok { color: var(--ok); }
.steps li.ok .dot { border-color: var(--ok); background: var(--ok); color: #fff; }
.steps li.ok .dot svg { width: 11px; height: 11px; stroke-width: 3; }
@keyframes spin { to { transform: rotate(360deg); } }

.score { display: grid; grid-template-columns: 168px 1fr; gap: 6px 14px; align-items: center; }
.gauge { width: 168px; height: 100px; }
.gauge .track { stroke: var(--soft); }
.gauge text { fill: var(--ink); font-family: system-ui, sans-serif; }
.score .band { font-size: 19px; font-weight: 750; line-height: 1.15; }
.score[data-band="low"] .band { color: var(--lo); } .score[data-band="medium"] .band { color: var(--me); } .score[data-band="high"] .band { color: var(--hi); }
.score[data-band="uncertain"] { border: 2px dashed var(--warn-line); background: var(--warn-bg); } .score[data-band="uncertain"] .band { color: var(--me-ink); }
.counts { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 6px; }
.engine { display: inline-block; font-size: 11.5px; padding: 1px 8px; border-radius: 999px; background: var(--soft); color: var(--muted); margin-top: 6px; }
.engine.warn { background: var(--hi-bg); color: var(--hi-ink); }
.how { grid-column: 1 / -1; padding-top: 8px; border-top: 1px dashed var(--line); }

.changes { border-left: 4px solid var(--navy2); }
.changes[data-status="changed"] { border-left-color: var(--warn); background: var(--warn-bg); }
.changes .title { display: flex; gap: 8px; align-items: center; font-weight: 700; }
.changes ul { margin: 8px 0 0; padding-left: 18px; font-size: 12.5px; display: flex; flex-direction: column; gap: 4px; }
.delta { font-weight: 700; } .delta.up { color: var(--hi); } .delta.down { color: var(--lo); }

.alert { border: 2px solid var(--danger); background: var(--danger-bg); }
.alert .title { display: flex; gap: 8px; align-items: center; font-weight: 700; color: var(--hi-ink); margin-bottom: 6px; }
.alert ul { margin: 8px 0 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 8px; }
.alert li { font-size: 12.5px; background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 8px; }
.alert li code { display: block; margin-top: 4px; white-space: pre-wrap; word-break: break-word; font: 12px/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; color: var(--hi-ink); }

.map { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
.cell { border: 1px solid var(--line); background: var(--card); border-radius: 10px; padding: 7px 4px 6px; display: flex; flex-direction: column; align-items: center; gap: 3px; font-size: 10.5px; line-height: 1.15; text-align: center; color: var(--muted); min-height: 58px; }
.cell svg { width: 17px; height: 17px; }
.cell[data-state="high"] { background: var(--hi-bg); border-color: transparent; color: var(--hi-ink); font-weight: 650; }
.cell[data-state="medium"] { background: var(--me-bg); border-color: transparent; color: var(--me-ink); font-weight: 650; }
.cell[data-state="low"] { background: var(--lo-bg); border-color: transparent; color: var(--lo-ink); font-weight: 650; }
.cell[data-state="check"] { border: 1.5px dashed var(--warn); color: var(--me-ink); }
.cell[data-state="none"] { opacity: .55; cursor: default; }
.cell:not([data-state="none"]):hover { transform: translateY(-1px); box-shadow: var(--shadow); }
.legend { display: flex; gap: 10px; flex-wrap: wrap; font-size: 11.5px; color: var(--muted); margin-top: 8px; }
.legend i { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 4px; vertical-align: -1px; }

.summary { font-size: 13.5px; border-left: 4px solid var(--gold); }

.chip { display: inline-block; font-size: 11px; font-weight: 700; padding: 1px 8px; border-radius: 999px; background: var(--soft); color: var(--muted); letter-spacing: .2px; }
.chip[data-sev="high"] { background: var(--hi-bg); color: var(--hi-ink); }
.chip[data-sev="medium"] { background: var(--me-bg); color: var(--me-ink); }
.chip[data-sev="low"] { background: var(--lo-bg); color: var(--lo-ink); }
.chip.new { background: var(--navy2); color: #fff; }
.chip.check { background: transparent; border: 1.5px dashed var(--warn); color: var(--me-ink); }
.chip.reason { background: var(--hi-bg); color: var(--hi-ink); }

.finding { display: flex; flex-direction: column; gap: 9px; border-left: 4px solid var(--line); transition: box-shadow .3s, transform .3s; }
.finding[data-severity="high"] { border-left-color: var(--hi); } .finding[data-severity="medium"] { border-left-color: var(--me); } .finding[data-severity="low"] { border-left-color: var(--lo); }
.finding.flash { box-shadow: 0 0 0 3px var(--gold); }
.fhead { display: flex; gap: 10px; align-items: center; }
.ficon { width: 32px; height: 32px; border-radius: 10px; display: grid; place-items: center; flex: none; background: var(--soft); }
.finding[data-severity="high"] .ficon { background: var(--hi-bg); color: var(--hi-ink); }
.finding[data-severity="medium"] .ficon { background: var(--me-bg); color: var(--me-ink); }
.finding[data-severity="low"] .ficon { background: var(--lo-bg); color: var(--lo-ink); }
.fhead .cat { font-weight: 700; font-size: 14.5px; line-height: 1.2; }
blockquote { margin: 0; padding: 9px 11px; background: var(--quote); border-left: 3px solid var(--gold); border-radius: 0 8px 8px 0; font: 12.8px/1.55 Georgia, "Times New Roman", serif; white-space: pre-wrap; word-break: break-word; }
blockquote .where { display: block; font: 700 10.5px/1.4 system-ui, sans-serif; color: var(--muted); margin-bottom: 3px; text-transform: uppercase; letter-spacing: .5px; }
.meta { display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 12px; color: var(--muted); }
.badge { display: inline-flex; gap: 4px; align-items: center; font-size: 11.5px; font-weight: 650; }
.badge.ok { color: var(--ok); } .badge.solo { color: var(--me-ink); } .badge.rule { color: var(--navy2); }
.badge svg { width: 13px; height: 13px; }
.guide { display: none; font-size: 12.5px; background: var(--soft); border-radius: 10px; padding: 10px 11px; }
.guide.open { display: block; }
.guide b { display: block; font-size: 11px; text-transform: uppercase; letter-spacing: .5px; color: var(--muted); margin: 0 0 3px; }
.guide ul { margin: 4px 0 6px; padding-left: 18px; }
.guide .note { font-size: 11.5px; color: var(--muted); }
.acts { display: flex; gap: 14px; }

.uncertain { border: 1px solid var(--warn-line); background: var(--warn-bg); }
.uncertain .title { display: flex; gap: 8px; align-items: center; font-weight: 700; color: var(--me-ink); margin-bottom: 4px; }
.uncertain ul { margin: 6px 0 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 8px; }
.uncertain li { font-size: 12.5px; border-top: 1px solid var(--warn-line); padding-top: 8px; transition: box-shadow .3s; border-radius: 6px; }
.uncertain li:first-child { border-top: 0; padding-top: 0; }
.uncertain li.flash { box-shadow: 0 0 0 3px var(--gold); }
.uncertain li b { display: block; font-size: 11px; text-transform: uppercase; letter-spacing: .5px; color: var(--me-ink); }
.uncertain blockquote { margin-top: 4px; font-size: 12px; }

details.rejected { font-size: 12.5px; }
details.rejected summary { cursor: pointer; font-weight: 650; color: var(--muted); }
details.rejected ul { padding-left: 18px; margin: 8px 0 0; display: flex; flex-direction: column; gap: 6px; }
details.rejected s { color: var(--muted); }

.err { border: 2px solid var(--danger); background: var(--danger-bg); display: flex; flex-direction: column; gap: 10px; }
.err .title { font-weight: 700; color: var(--hi-ink); display: flex; gap: 8px; align-items: center; }
footer:empty { display: none; }
footer { padding: 10px 14px; border-top: 1px solid var(--line); background: var(--card); display: flex; justify-content: space-between; align-items: center; gap: 8px; font-size: 11px; color: var(--muted); }
footer .btn { padding: 6px 10px; font-size: 12.5px; }
`;

export function createPanel({ doc = document, onAnalyze, onOpenOptions, onShowQuote, onClose } = {}) {
  const h = (tag, props, ...kids) => {
    const el = doc.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'kp') el.setAttribute('data-kp', v);
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : String(v));
    }
    for (const kid of kids.flat(Infinity)) if (kid != null && kid !== false) el.append(kid instanceof Node ? kid : doc.createTextNode(String(kid)));
    return el;
  };
  const NS = 'http://www.w3.org/2000/svg';
  const s = (tag, attrs = {}) => { const el = doc.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v)); return el; };
  const icon = (name) => { const svg = s('svg', { viewBox: '0 0 24 24', class: 'i', 'aria-hidden': 'true' }); svg.append(s('path', { d: ICONS[name] || ICONS.info })); return svg; };
  const fmt = n => Number(n).toLocaleString('tr-TR');
  const dateTr = iso => { try { return new Date(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }); } catch { return ''; } };
  const clip = (t, n) => { t = String(t || ''); return t.length > n ? t.slice(0, n - 1) + '…' : t; };

  const host = doc.createElement('div');
  host.setAttribute('data-kp-host', '');
  const shadow = host.attachShadow({ mode: 'open' });
  const style = doc.createElement('style'); style.textContent = CSS;
  const root = h('div', { class: 'root' });
  shadow.append(style, root);

  const pillSub = h('span', { class: 't2' }, '');
  const pill = h('button', { class: 'pill', kp: 'pill', hidden: true, type: 'button', onclick: () => open() },
    h('span', { class: 'mark' }, icon('logo')), h('span', {}, h('span', { class: 't1' }, 'Küçük Punto'), pillSub));

  const body = h('div', { class: 'body', kp: 'body' });
  const footer = h('footer', { kp: 'footer' });
  const panel = h('aside', { class: 'panel', kp: 'panel', hidden: true, role: 'dialog', 'aria-label': 'Küçük Punto risk raporu' },
    h('header', {},
      h('div', { class: 'logo' }, icon('logo')),
      h('div', { class: 'brand' }, h('b', {}, 'Küçük Punto'), h('small', {}, 'sözleşme risk raporu')),
      h('button', { kp: 'close', type: 'button', title: 'Kapat', 'aria-label': 'Kapat', onclick: () => close() }, icon('close'))),
    // always visible, above the scrolling area, in every state
    h('div', { class: 'disclaimer', kp: 'disclaimer', role: 'note' }, icon('info'),
      h('div', {}, h('strong', {}, 'Hukuki tavsiye değildir. '),
        'Otomatik bir okuma yardımıdır; hata yapabilir ve sözleşmenin yerine geçmez. Önemli kararlarda metnin tamamını okuyun, gerekirse bir hukukçuya danışın.')),
    body, footer);
  root.append(pill, panel);

  let timer = null, state = { name: 'idle' }, detection = null;
  const stopTimer = () => { if (timer) { clearInterval(timer); timer = null; } };

  function open() { pill.hidden = true; panel.hidden = false; if (state.name === 'idle') render(); }
  function close() { panel.hidden = true; if (detection?.isLegal || state.name === 'report') pill.hidden = false; onClose?.(); }
  const isOpen = () => !panel.hidden;

  function showPill(det) {
    detection = det;
    pillSub.textContent = det?.isLegal ? `${det.kindTr} algılandı · analiz et` : 'Bu sayfayı analiz et';
    if (!isOpen()) pill.hidden = false;
  }
  function setState(next) { state = next; render(); }
  function setStage(stage) { if (state.name === 'loading') { state = { ...state, stage }; render(); } }

  function render() {
    stopTimer();
    body.replaceChildren(); footer.replaceChildren();
    ({ idle: renderIdle, loading: renderLoading, error: renderError, report: renderReport })[state.name]();
  }

  function renderIdle() {
    const d = detection;
    body.append(
      h('div', { class: 'card hero' },
        h('div', { class: 'big' }, icon('logo')),
        h('h3', {}, d?.isLegal ? `${d.kindTr} algılandı` : 'Bu sayfadaki koşulları inceleyelim'),
        h('p', { class: 'muted small' }, d ? `Yaklaşık ${fmt(d.words)} kelime. ` : '', 'Riskli maddeleri, sözleşmeden birebir alıntılarıyla birlikte gösteririm.')),
      h('button', { class: 'btn primary', kp: 'analyze', type: 'button', onclick: () => onAnalyze?.({ page: true }) }, 'Riskleri analiz et'),
      h('div', { class: 'card tips' },
        h('div', {}, icon('shield'), h('span', {}, 'Yalnızca ekranda görünen metin, ayarlarda seçtiğiniz model sağlayıcısına kendi anahtarınızla gönderilir. Gizli metinler gönderilmez.')),
        h('div', {}, icon('search'), h('span', {}, 'Sayfa düzgün okunamazsa: sözleşme metnini seçin, sağ tıklayın → "Küçük Punto ile seçili metni analiz et".')),
        h('div', {}, icon('history'), h('span', {}, 'Aynı sözleşmeyi daha sonra tekrar analiz ederseniz neyin değiştiğini gösteririm.')),
        h('div', {}, icon('info'), h('span', {}, 'Kısayol: ', h('kbd', {}, 'Alt'), ' + ', h('kbd', {}, 'Shift'), ' + ', h('kbd', {}, 'K')))),
      h('button', { class: 'btn link', kp: 'open-options', type: 'button', onclick: () => onOpenOptions?.() }, 'Model, API anahtarı ve analiz geçmişi'));
  }

  function renderLoading() {
    const t0 = state.t0 || (state.t0 = Date.now());
    const order = STAGES.map(x => x[0]).filter(x => x !== 'repair' || state.stage === 'repair');
    const cur = order.indexOf(state.stage || 'capture');
    const elapsed = h('span', { kp: 'elapsed' }, `${Math.round((Date.now() - t0) / 1000)} sn`);
    body.append(h('div', { class: 'card', kp: 'loading' },
      h('div', { class: 'progress' }, h('span', {})),
      h('ul', { class: 'steps' }, order.map((id, i) => h('li', { class: i < cur ? 'ok' : i === cur ? 'on' : '' },
        h('span', { class: 'dot' }, i < cur ? icon('check') : ''), STAGES.find(x => x[0] === id)[1]))),
      h('p', { class: 'muted small', style: 'margin-top:12px' }, 'Geçen süre: ', elapsed)));
    timer = setInterval(() => { elapsed.textContent = `${Math.round((Date.now() - t0) / 1000)} sn`; }, 500);
  }

  function renderError() {
    const e = state.error || {};
    body.append(h('div', { class: 'card err', kp: 'error', 'data-code': e.code || '' },
      h('div', { class: 'title' }, icon('alert'), e.code === 'NO_KEY' ? 'API anahtarı gerekli' : 'Analiz tamamlanamadı'),
      h('p', {}, e.message || 'Bilinmeyen hata.'),
      h('div', { class: 'row' },
        e.code === 'NO_KEY' ? h('button', { class: 'btn', kp: 'open-options', type: 'button', onclick: () => onOpenOptions?.() }, 'Ayarları aç') : null,
        e.code === 'EMPTY_SELECTION' ? null : h('button', { class: 'btn', kp: 'rules-only', type: 'button', onclick: () => onAnalyze?.({ rulesOnly: true }) }, 'Yalnızca kurallarla analiz et'),
        e.code !== 'NO_KEY' ? h('button', { class: 'btn', kp: 'retry', type: 'button', onclick: () => onAnalyze?.({}) }, 'Tekrar dene') : null)));
  }

  // ---------- report
  function gauge(score, band, conflict) {
    const svg = s('svg', { viewBox: '0 0 200 116', class: 'gauge', role: 'img', 'aria-label': conflict ? 'Skor belirsiz' : `Risk skoru ${score} / 100` });
    const arc = 'M 20 100 A 80 80 0 0 1 180 100';
    svg.append(s('path', { d: arc, class: 'track', fill: 'none', 'stroke-width': 16, 'stroke-linecap': 'round' }));
    const color = conflict ? '#b9a06a' : { low: '#3d9566', medium: '#d99a2b', high: '#d4473c' }[band];
    const len = Math.PI * 80, v = conflict ? 0.5 : Math.max(0.02, Math.min(1, score / 100));
    svg.append(s('path', { d: arc, fill: 'none', stroke: color, 'stroke-width': 16, 'stroke-linecap': 'round', 'stroke-dasharray': `${(len * v).toFixed(1)} ${len.toFixed(1)}`, ...(conflict ? { 'stroke-opacity': 0.5 } : {}) }));
    for (const t of [30, 60]) { const a = Math.PI * (1 - t / 100); svg.append(s('line', { x1: 100 + 62 * Math.cos(a), y1: 100 - 62 * Math.sin(a), x2: 100 + 70 * Math.cos(a), y2: 100 - 70 * Math.sin(a), stroke: '#9aa3ae', 'stroke-width': 2 })); }
    const num = s('text', { x: 100, y: 92, 'text-anchor': 'middle', 'font-size': 40, 'font-weight': 800 }); num.textContent = conflict ? '?' : String(score);
    const sub = s('text', { x: 100, y: 112, 'text-anchor': 'middle', 'font-size': 12, fill: '#8a929c' }); sub.textContent = '/ 100';
    svg.append(num, sub);
    return svg;
  }

  function cellStates(r) {
    const st = {};
    for (const f of r.findings) if (!st[f.category] || SEVERITY[f.severity] > SEVERITY[st[f.category]]) st[f.category] = f.severity;
    for (const u of r.uncertain) if ((u.kind === 'rule_only' || u.kind === 'low_confidence') && u.category && !st[u.category]) st[u.category] = 'check';
    return st;
  }

  function flash(el) { if (!el) return; el.scrollIntoView({ block: 'center' }); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1400); }

  function renderReport() {
    const r = state.report;
    const en = r.engine || {};
    const modelUsed = en.mode === 'llm' && !en.error;
    const conflict = r.score_status === 'conflict';
    const engineLabel = modelUsed ? `${en.provider || 'model'} · ${en.model}` : en.error ? 'Model hatası → yalnızca kurallar' : 'Yalnızca kurallar (model kullanılmadı)';
    const sevCount = k => r.findings.filter(f => f.severity === k).length;
    const newIds = new Set(r.changes?.new_ids || []);

    // 1. score
    body.append(h('section', { class: 'card score', kp: 'score', 'data-band': conflict ? 'uncertain' : r.band, 'data-score': conflict ? '' : r.score, 'data-status': r.score_status },
      gauge(r.score, r.band, conflict),
      h('div', {},
        h('div', { class: 'band', kp: 'band' }, conflict ? 'Belirsiz' : r.band_tr),
        h('div', { class: 'counts' }, ['high', 'medium', 'low'].map(k => sevCount(k) ? h('span', { class: 'chip', 'data-sev': k }, `${sevCount(k)} ${SEVERITY_TR[k].toLowerCase()}`) : null),
          r.findings.length ? null : h('span', { class: 'chip' }, 'kanıtlı bulgu yok')),
        h('span', { class: 'engine' + (modelUsed ? '' : ' warn'), kp: 'engine' }, engineLabel)),
      conflict ? h('p', { class: 'small how', kp: 'conflict' }, `Model ${r.score} diyor, bağımsız kurallar ${r.rules_score} diyor. Bu kadar büyük bir fark, modelin sayfadaki bir ifadeyle yanıltıldığını gösterebilir. Bu yüzden skor vermiyoruz; aşağıdaki "Emin olamadıklarımız" bölümüne bakın.`) : null,
      h('p', { class: 'how muted small' },
        'Skoru model değil yazılım hesaplar; yalnızca alıntısı metinde birebir bulunan bulgular sayılır. ',
        `${r.meta.selection ? 'Seçili metin' : `Metnin %${r.coverage.ratioPct}'i`} incelendi · ${fmt(r.clause_count)} parça · ${(r.trace.ms / 1000).toFixed(1).replace('.', ',')} sn.`)));

    // 2. change tracking (decided by the text fingerprints, not by the model)
    const ch = r.changes;
    if (ch && ch.status === 'first') {
      body.append(h('section', { class: 'card changes small', kp: 'changes', 'data-status': 'first' },
        h('div', { class: 'title' }, icon('history'), 'Bu sözleşmenin parmak izi kaydedildi'),
        h('p', { class: 'muted' }, 'Metnin kendisi değil, yalnızca özeti (parmak izi) bu tarayıcıda saklandı. Sözleşme değişirse bir dahaki analizde neyin değiştiğini göstereceğim.')));
    } else if (ch && ch.status === 'same') {
      body.append(h('section', { class: 'card changes small', kp: 'changes', 'data-status': 'same' },
        h('div', { class: 'title' }, icon('check'), 'Son analizinizden beri değişmedi'),
        h('p', { class: 'muted' }, `${dateTr(ch.prev_date)} tarihli analizle metin birebir aynı.`)));
    } else if (ch && ch.status === 'changed') {
      const d = ch.score_delta;
      const counts = ch.by === 'clause' ? [ch.clauses_added ? `${ch.clauses_added} madde eklendi ya da değişti` : null, ch.clauses_removed ? `${ch.clauses_removed} madde kaldırıldı ya da değişti` : null].filter(Boolean).join(', ') : '';
      body.append(h('section', { class: 'card changes', kp: 'changes', 'data-status': 'changed', 'data-added': (ch.added || []).length, 'data-removed': (ch.removed || []).length },
        h('div', { class: 'title' }, icon('history'), 'Bu sözleşme değişmiş'),
        h('p', { class: 'small' }, `${dateTr(ch.prev_date)} tarihli analizinizden beri metin değişti${counts ? ': ' + counts : ''}. Skor: ${ch.prev_score} → ${r.score} `,
          d ? h('span', { class: 'delta ' + (d > 0 ? 'up' : 'down') }, `(${d > 0 ? '+' : ''}${d})`) : null),
        ch.added?.length || ch.removed?.length || ch.checks?.length ? h('ul', {},
          (ch.added || []).map(a => h('li', { kp: 'change-added' }, h('span', { class: 'chip new' }, 'YENİ RİSK'), ' ', h('b', {}, a.category_tr), ': ', h('span', { class: 'muted' }, '“' + clip(a.quote, 90) + '”'))),
          (ch.checks || []).map(a => h('li', { kp: 'change-check' }, h('span', { class: 'chip check' }, 'YENİ · KONTROL EDİN'), ' ', h('b', {}, a.category_tr), ': ', h('span', { class: 'muted' }, '“' + clip(a.quote, 90) + '”'))),
          (ch.removed || []).map(a => h('li', { kp: 'change-removed' }, h('span', { class: 'chip' }, 'KALKTI'), ' ', h('b', {}, a.category_tr), ': ', h('span', { class: 'muted' }, '“' + clip(a.quote, 90) + '”')))) :
          h('p', { class: 'small muted', style: 'margin-top:6px' }, 'Değişen maddelerde yeni bir risk bulunmadı.'),
        ch.engine_changed ? h('p', { class: 'small muted', style: 'margin-top:6px' }, 'Not: önceki analiz farklı bir motorla yapılmıştı; skor farkının bir kısmı bundan kaynaklanabilir.') : null));
    }

    // 3. security
    const sec = r.security;
    if (sec.detected) {
      const items = [
        ...sec.hidden_suspicious.map(x => ({ tag: 'Gizli metin · ' + (HIDDEN_REASON_TR[x.reason] || x.reason), text: x.text, where: 'Modele gönderilmedi.' })),
        ...sec.quarantined.map(x => ({ tag: 'Görünür metinde talimat', text: x.text, where: 'Model görmeden önce metinden çıkarıldı.' })),
        ...sec.model_reported.map(x => ({ tag: 'Model fark etti', text: x.quote, where: x.note_tr }))
      ];
      const li = it => h('li', { kp: 'security-item' }, h('span', { class: 'chip reason' }, it.tag), ' ', h('span', { class: 'muted' }, it.where), h('code', {}, clip(it.text, 220)));
      body.append(h('section', { class: 'card alert', kp: 'security', 'data-count': items.length },
        h('div', { class: 'title' }, icon('alert'), 'Sayfada yapay zekâya yönelik talimat bulundu'),
        h('p', { class: 'small' }, 'Bu sayfa, okuyan bir yapay zekâyı yönlendirmeye çalışan metin içeriyor. Aşağıdakiler modele hiç gönderilmedi ya da model görmeden metinden çıkarıldı. Sayfaya güvenirken dikkatli olun.'),
        h('p', { class: 'small', style: 'margin-top:6px;font-weight:650' }, [
          sec.hidden_suspicious.length ? `${sec.hidden_suspicious.length} gizli metin (modele hiç gönderilmedi)` : null,
          sec.quarantined.length ? `${sec.quarantined.length} görünür cümle (model görmeden çıkarıldı)` : null,
          sec.model_reported.length ? `${sec.model_reported.length} modelin kendisinin fark ettiği` : null
        ].filter(Boolean).join(' · ')),
        h('ul', {}, items.slice(0, 3).map(li)),
        items.length > 3 ? h('details', { class: 'small', style: 'margin-top:8px' }, h('summary', { style: 'cursor:pointer' }, `${items.length - 3} tane daha`), h('ul', {}, items.slice(3).map(li))) : null));
    } else if (sec.hidden_removed) {
      body.append(h('p', { class: 'muted small', kp: 'hidden-note' }, `Sayfadaki ${fmt(sec.hidden_removed)} görünmeyen metin parçası analize alınmadı (talimat içermiyordu).`));
    }

    // 4. risk map: all 14 categories at a glance
    const st = cellStates(r);
    body.append(h('h2', {}, 'Risk haritası'));
    body.append(h('section', { class: 'card', kp: 'risk-map' },
      h('div', { class: 'map' }, Object.keys(CATEGORIES).map(cat => {
        const state = st[cat] || 'none';
        return h('button', { class: 'cell', type: 'button', kp: 'map-cell', 'data-category': cat, 'data-state': state, title: CATEGORIES[cat].tr + (state === 'none' ? ': bulgu yok' : state === 'check' ? ': kontrol edin' : `: ${SEVERITY_TR[state].toLowerCase()} risk`),
          onclick: () => state === 'none' ? null : flash(shadow.querySelector(`[data-kp="finding"][data-category="${cat}"]`) || shadow.querySelector(`[data-kp="uncertain-item"][data-category="${cat}"]`)) },
          icon(cat), SHORT_TR[cat]);
      })),
      h('div', { class: 'legend' },
        h('span', {}, h('i', { style: 'background:var(--hi-bg);border:1px solid var(--hi)' }), 'yüksek'),
        h('span', {}, h('i', { style: 'background:var(--me-bg);border:1px solid var(--me)' }), 'orta'),
        h('span', {}, h('i', { style: 'background:var(--lo-bg);border:1px solid var(--lo)' }), 'düşük'),
        h('span', {}, h('i', { style: 'border:1.5px dashed var(--warn)' }), 'kontrol edin'),
        h('span', {}, h('i', { style: 'border:1px solid var(--line)' }), 'bulunmadı'))));

    // 5. summary
    if (r.summary_tr) body.append(h('section', { class: 'card summary', kp: 'summary' }, r.summary_tr));

    // 6. findings
    body.append(h('h2', {}, 'Riskli maddeler', h('span', { class: 'n' }, String(r.findings.length))));
    if (!r.findings.length) body.append(h('p', { class: 'card muted small', kp: 'no-findings' }, 'Alıntıyla desteklenen riskli bir madde bulunamadı. Bu, metnin risksiz olduğu anlamına gelmez; "Emin olamadıklarımız" bölümüne de bakın.'));
    for (const f of r.findings) body.append(findingCard(f, newIds.has(findingId(f))));


    // 7. uncertainty, said out loud
    if (r.uncertain.length) {
      body.append(h('section', { class: 'card uncertain', kp: 'uncertain', 'data-count': r.uncertain.length },
        h('div', { class: 'title' }, icon('help'), `Emin olamadıklarımız (${r.uncertain.length})`),
        h('p', { class: 'small muted' }, 'Bu maddeler skora katılmadı. Sistem burada karar vermiyor; kendiniz bakmanız gerekiyor.'),
        h('ul', {}, r.uncertain.map(u => h('li', { kp: 'uncertain-item', 'data-kind': u.kind, 'data-category': u.category || null },
          h('b', {}, UNCERTAIN_LABEL[u.kind] || 'Belirsiz'), u.text_tr,
          u.quote ? h('blockquote', {}, '“' + clip(u.quote, 220) + '”') : null,
          u.quote ? h('button', { class: 'btn link', type: 'button', onclick: (ev) => showQuote(ev.currentTarget, u.quote) }, 'Metinde göster') : null)))));
    }

    // 8. rejected claims
    if (r.rejected.length) {
      body.append(h('details', { class: 'rejected card', kp: 'rejected', 'data-count': r.rejected.length },
        h('summary', {}, `Kanıtlanamadığı için gösterilmeyen iddialar (${r.rejected.length})`),
        h('p', { class: 'small muted', style: 'margin-top:6px' }, 'Model bu iddiaları ileri sürdü ama alıntıları sayfada birebir bulunamadı. Alıntısı olmayan iddia geçersiz sayılır.'),
        h('ul', {}, r.rejected.map(x => h('li', {}, h('b', {}, x.reason_tr), x.quote ? [' — ', h('s', {}, '“' + clip(x.quote, 160) + '”')] : null)))));
    }

    footer.append(
      h('span', {}, `v${r.version} · istem ${en.prompt_version}`),
      h('span', { class: 'row' },
        h('button', { class: 'btn', kp: 'export', type: 'button', title: 'Raporu HTML dosyası olarak indir', onclick: (ev) => { downloadReport(r, doc); ev.currentTarget.lastChild.textContent = 'İndirildi'; } }, icon('download'), 'Rapor'),
        h('button', { class: 'btn', kp: 'copy-json', type: 'button', title: 'Raporu JSON olarak kopyala', onclick: (ev) => copyJSON(ev.currentTarget, r) }, icon('braces'), 'JSON'),
        h('button', { class: 'btn', kp: 'reanalyze', type: 'button', title: 'Yeniden analiz et', onclick: () => onAnalyze?.({}) }, icon('refresh'))));
  }

  function findingCard(f, isNew) {
    const badge = f.source === 'rule' ? h('span', { class: 'badge rule' }, 'Kural eşleşmesi')
      : f.corroborated ? h('span', { class: 'badge ok', title: 'Bağımsız anahtar kelime kuralları da aynı maddede aynı riski buldu.' }, icon('check'), 'Kural ile de doğrulandı')
      : h('span', { class: 'badge solo', title: 'Bu bulguyu yalnızca model buldu; alıntısı doğrulandı.' }, 'Yalnızca model');
    const ev = f.evidence, g = GUIDANCE[f.category];
    const guide = g ? h('div', { class: 'guide', kp: 'guidance' },
      h('b', {}, 'Ne yapabilirsiniz?'), h('p', {}, g.tip_tr),
      g.laws.length ? [h('b', { style: 'margin-top:8px' }, 'İlgili mevzuat'), h('ul', {}, g.laws.map(l => h('li', {}, h('a', { href: l.url, target: '_blank', rel: 'noopener noreferrer' }, l.label))))] : null,
      h('p', { class: 'note' }, GUIDANCE_NOTE_TR)) : null;
    return h('article', { class: 'card finding', kp: 'finding', 'data-category': f.category, 'data-severity': f.severity, 'data-source': f.source, 'data-new': isNew ? 'true' : null },
      h('div', { class: 'fhead' },
        h('span', { class: 'ficon' }, icon(f.category)),
        h('div', { style: 'flex:1' }, h('div', { class: 'cat' }, f.category_tr),
          h('div', { class: 'row', style: 'margin-top:3px;gap:6px' }, h('span', { class: 'chip', 'data-sev': f.severity }, SEVERITY_TR[f.severity]), isNew ? h('span', { class: 'chip new', kp: 'new-badge' }, 'YENİ') : null))),
      f.explanation_tr ? h('p', {}, f.explanation_tr) : null,
      h('blockquote', { kp: 'quote' }, ev.heading ? h('span', { class: 'where' }, ev.heading) : null, '“' + ev.quote + '”'),
      h('div', { class: 'meta' },
        h('span', { class: 'row' }, badge, f.source === 'model' ? h('span', {}, `· güven %${Math.round(f.confidence * 100)}`) : null),
        h('span', { class: 'acts' },
          g ? h('button', { class: 'btn link', kp: 'guidance-toggle', type: 'button', onclick: (e) => { guide.classList.toggle('open'); e.currentTarget.lastChild.textContent = guide.classList.contains('open') ? 'Gizle' : 'Haklarınız'; } }, icon('book'), 'Haklarınız') : null,
          h('button', { class: 'btn link', kp: 'show-in-page', type: 'button', onclick: (e) => showQuote(e.currentTarget, ev.quote) }, icon('search'), 'Metinde göster'))),
      guide);
  }

  function showQuote(btn, quote) {
    const ok = onShowQuote?.(quote);
    if (!ok) { btn.textContent = 'Sayfada bulunamadı (sayfa değişmiş olabilir)'; btn.disabled = true; }
  }

  async function copyJSON(btn, report) {
    const label = btn.lastChild;
    try { await navigator.clipboard.writeText(JSON.stringify(report, null, 2)); label.textContent = 'Kopyalandı'; }
    catch { label.textContent = 'Kopyalanamadı'; }
    setTimeout(() => { label.textContent = 'JSON'; }, 1500);
  }

  (doc.documentElement || doc.body).appendChild(host);
  render();
  return { host, shadow, open, close, isOpen, toggle: () => (isOpen() ? close() : open()), showPill, setState, setStage, get state() { return state; } };
}
