// In-page report panel (Shadow DOM, so the page's CSS cannot restyle it and ours cannot leak).
//
// SECURITY: every string that came from the page or the model is inserted with text nodes /
// textContent. There is no innerHTML anywhere in this file, so a quote such as
// "<img src=x onerror=...>" is displayed as text, never parsed.
//
// Stable `data-kp` hooks are used by the Cypress demo and the Playwright tests.

import { SEVERITY_TR } from '../core/taxonomy.js';

const STAGES = [
  ['capture', 'Görünür metin okunuyor, gizli metin ayıklanıyor'],
  ['model', 'Model maddeleri inceliyor'],
  ['repair', 'Model yanıtı şemaya uymadı, bir kez düzeltme isteniyor'],
  ['verify', 'Alıntılar orijinal metinde tek tek doğrulanıyor'],
  ['done', 'Skor hesaplanıyor']
];

const UNCERTAIN_LABEL = {
  low_confidence: 'Düşük güven',
  rule_only: 'Model ile kurallar ayrıştı',
  model: 'Modelin çekincesi',
  external_reference: 'İncelenmeyen belge',
  truncated: 'Kısmi inceleme',
  not_legal: 'Belge türü',
  rules_only: 'Model kullanılmadı',
  model_rule_conflict: 'Tutarsız sonuç',
  hidden_content: 'Görünmeyen metin'
};

const HIDDEN_REASON_TR = {
  'css-hidden': 'CSS ile gizlenmiş', 'tiny-font': 'Mikroskobik yazı', 'transparent-text': 'Saydam yazı',
  'low-contrast': 'Arka planla aynı renk', 'clipped': 'Kırpılmış kutu', 'zero-size': 'Sıfır boyut', 'offscreen': 'Ekran dışı'
};

const ICONS = {
  scale: 'M12 3v18M5 21h14M6 7h12M6 7l-3 7a3 3 0 0 0 6 0L6 7zm12 0-3 7a3 3 0 0 0 6 0l-3-7zM12 3l-1.5 2h3L12 3z',
  close: 'M6 6l12 12M18 6 6 18',
  alert: 'M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  help: 'M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3m.1 4h.01M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z',
  check: 'M20 6 9 17l-5-5',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm10 2-4.3-4.3',
  x: 'M18 6 6 18M6 6l12 12',
  info: 'M12 16v-4m0-4h.01M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z'
};

const CSS = `
:host { all: initial; }
* { box-sizing: border-box; }
.root { font: 14px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; color: #1b1f24; -webkit-font-smoothing: antialiased; }
button { font: inherit; cursor: pointer; }
svg.i { width: 16px; height: 16px; flex: none; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }

.pill { position: fixed; right: 20px; bottom: 20px; z-index: 2147483647; display: flex; align-items: center; gap: 10px;
  background: #16263d; color: #fff; border: 0; border-radius: 999px; padding: 10px 16px 10px 12px; box-shadow: 0 6px 24px rgba(10,20,40,.28); }
.pill .mark { width: 28px; height: 28px; border-radius: 50%; background: #f4efe4; color: #16263d; display: grid; place-items: center; }
.pill .t1 { font-weight: 650; font-size: 13px; display: block; text-align: left; }
.pill .t2 { font-size: 12px; opacity: .75; display: block; text-align: left; }
.pill:hover { background: #1f3a5f; }

.panel { position: fixed; top: 0; right: 0; bottom: 0; width: 420px; max-width: 100vw; z-index: 2147483647; background: #fbfaf7;
  border-left: 1px solid #ddd8cc; box-shadow: -10px 0 40px rgba(10,20,40,.18); display: flex; flex-direction: column; }
.panel[hidden], .pill[hidden] { display: none; }
header { display: flex; align-items: center; gap: 10px; padding: 14px 16px; background: #16263d; color: #fff; }
header .brand { font-weight: 700; font-size: 15px; letter-spacing: .2px; flex: 1; display: flex; align-items: center; gap: 8px; }
header .brand small { font-weight: 500; opacity: .7; font-size: 12px; }
header button { background: transparent; border: 0; color: #fff; padding: 4px; border-radius: 6px; display: grid; }
header button:hover { background: rgba(255,255,255,.12); }

.disclaimer { display: flex; gap: 10px; padding: 10px 16px; background: #fff4d6; border-bottom: 1px solid #ecd9a0; color: #5a4300; font-size: 12.5px; line-height: 1.45; }
.disclaimer strong { display: block; font-size: 13px; color: #3d2d00; }

.body { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 14px; }
.card { background: #fff; border: 1px solid #e6e2d8; border-radius: 10px; padding: 14px; }
.muted { color: #5b6470; }
.small { font-size: 12.5px; }
h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .6px; color: #5b6470; margin: 6px 0 -4px; font-weight: 650; }
p { margin: 0; }

.btn { border: 1px solid #c9c3b4; background: #fff; color: #1b1f24; border-radius: 8px; padding: 8px 12px; font-size: 13px; display: inline-flex; align-items: center; gap: 6px; }
.btn:hover { border-color: #16263d; }
.btn.primary { background: #16263d; color: #fff; border-color: #16263d; font-weight: 600; padding: 11px 14px; width: 100%; justify-content: center; font-size: 14px; }
.btn.primary:hover { background: #1f3a5f; }
.btn.link { border: 0; background: none; padding: 2px 0; color: #1f3a5f; font-weight: 600; font-size: 12.5px; }
.btn.link:hover { text-decoration: underline; }
.row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }

.steps { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
.steps li { display: flex; gap: 10px; align-items: center; color: #8a919b; }
.steps li .dot { width: 18px; height: 18px; border-radius: 50%; border: 2px solid #d2cdc1; flex: none; display: grid; place-items: center; }
.steps li.on { color: #1b1f24; font-weight: 600; }
.steps li.on .dot { border-color: #16263d; border-top-color: transparent; animation: spin .8s linear infinite; }
.steps li.ok { color: #2f6b47; }
.steps li.ok .dot { border-color: #2f7d4f; background: #2f7d4f; color: #fff; }
.steps li.ok .dot svg { width: 11px; height: 11px; stroke-width: 3; }
@keyframes spin { to { transform: rotate(360deg); } }

.score { display: grid; grid-template-columns: auto 1fr; gap: 4px 16px; align-items: center; border-width: 2px; }
.score .num { font-size: 44px; font-weight: 750; line-height: 1; letter-spacing: -1px; grid-row: span 2; }
.score .num small { font-size: 15px; font-weight: 600; color: #8a919b; letter-spacing: 0; }
.score .band { font-size: 18px; font-weight: 700; }
.score .how { grid-column: 1 / -1; margin-top: 8px; padding-top: 8px; border-top: 1px dashed #e0dbcf; }
.score[data-band="low"] { border-color: #8cc5a3; } .score[data-band="low"] .num, .score[data-band="low"] .band { color: #2f7d4f; }
.score[data-band="medium"] { border-color: #e6c27a; } .score[data-band="medium"] .num, .score[data-band="medium"] .band { color: #a0660f; }
.score[data-band="high"] { border-color: #e59a92; } .score[data-band="high"] .num, .score[data-band="high"] .band { color: #b8322a; }
.score[data-band="uncertain"] { border-color: #e6c27a; border-style: dashed; background: #fffaf0; } .score[data-band="uncertain"] .num, .score[data-band="uncertain"] .band { color: #8a5a0b; }
.engine { display: inline-block; font-size: 11.5px; padding: 1px 8px; border-radius: 999px; background: #eef1f5; color: #3b4a5c; }
.engine.warn { background: #fdecea; color: #8c2a22; }

.alert { border: 2px solid #d9534f; background: #fff6f5; }
.alert .title { display: flex; gap: 8px; align-items: center; font-weight: 700; color: #a52a22; margin-bottom: 6px; }
.alert ul { margin: 8px 0 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 8px; }
.alert li { font-size: 12.5px; background: #fff; border: 1px solid #f0c9c5; border-radius: 8px; padding: 8px; }
.alert li code { display: block; margin-top: 4px; white-space: pre-wrap; word-break: break-word; font: 12px/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; color: #6b1d17; }

.chip { display: inline-block; font-size: 11.5px; font-weight: 650; padding: 1px 8px; border-radius: 999px; background: #eee; color: #333; }
.chip[data-sev="high"] { background: #fbe1de; color: #9b2820; }
.chip[data-sev="medium"] { background: #fbefd5; color: #8a5a0b; }
.chip[data-sev="low"] { background: #e6f2ea; color: #2a6b43; }
.chip.reason { background: #f6dcd9; color: #7a221b; }

.finding { display: flex; flex-direction: column; gap: 8px; border-left-width: 4px; }
.finding[data-severity="high"] { border-left-color: #d0453b; }
.finding[data-severity="medium"] { border-left-color: #d9a032; }
.finding[data-severity="low"] { border-left-color: #59a77a; }
.finding .cat { font-weight: 700; font-size: 14.5px; }
blockquote { margin: 0; padding: 8px 10px; background: #f6f3ec; border-left: 3px solid #b9b09b; border-radius: 0 6px 6px 0; font: 12.5px/1.5 Georgia, "Times New Roman", serif; color: #33302a; white-space: pre-wrap; word-break: break-word; }
blockquote .where { display: block; font: 600 11px/1.4 system-ui, sans-serif; color: #7a7466; margin-bottom: 3px; text-transform: uppercase; letter-spacing: .4px; }
.meta { display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 12px; color: #5b6470; }
.badge { display: inline-flex; gap: 4px; align-items: center; font-size: 11.5px; font-weight: 600; }
.badge.ok { color: #2f6b47; } .badge.solo { color: #7a6a3a; } .badge.rule { color: #45607d; }
.badge svg { width: 13px; height: 13px; }

.uncertain { border: 1px solid #e6c27a; background: #fffaf0; }
.uncertain .title { display: flex; gap: 8px; align-items: center; font-weight: 700; color: #7d5508; margin-bottom: 4px; }
.uncertain ul { margin: 6px 0 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 8px; }
.uncertain li { font-size: 12.5px; border-top: 1px solid #f1e2bd; padding-top: 8px; }
.uncertain li:first-child { border-top: 0; padding-top: 0; }
.uncertain li b { display: block; font-size: 11.5px; text-transform: uppercase; letter-spacing: .4px; color: #8a5a0b; }
.uncertain blockquote { margin-top: 4px; font-size: 12px; }

details.rejected { font-size: 12.5px; }
details.rejected summary { cursor: pointer; font-weight: 650; color: #5b6470; }
details.rejected ul { padding-left: 18px; margin: 8px 0 0; display: flex; flex-direction: column; gap: 6px; }
details.rejected s { color: #8a919b; }

.err { border: 2px solid #d9534f; background: #fff6f5; display: flex; flex-direction: column; gap: 10px; }
.err .title { font-weight: 700; color: #a52a22; display: flex; gap: 8px; align-items: center; }
footer { padding: 10px 16px; border-top: 1px solid #e6e2d8; background: #f4f1ea; display: flex; justify-content: space-between; align-items: center; gap: 8px; font-size: 11.5px; color: #6b7280; }
.toast { position: absolute; left: 50%; bottom: 60px; transform: translateX(-50%); background: #16263d; color: #fff; padding: 6px 12px; border-radius: 8px; font-size: 12.5px; }
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
  const icon = (name) => {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = doc.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('class', 'i'); svg.setAttribute('aria-hidden', 'true');
    const p = doc.createElementNS(NS, 'path'); p.setAttribute('d', ICONS[name]); svg.append(p);
    return svg;
  };
  const fmt = n => Number(n).toLocaleString('tr-TR');

  const host = doc.createElement('div');
  host.setAttribute('data-kp-host', '');
  const shadow = host.attachShadow({ mode: 'open' });
  const style = doc.createElement('style'); style.textContent = CSS;
  const root = h('div', { class: 'root' });
  shadow.append(style, root);

  const pillTitle = h('span', { class: 't1' }, 'Küçük Punto');
  const pillSub = h('span', { class: 't2' }, '');
  const pill = h('button', { class: 'pill', kp: 'pill', hidden: true, type: 'button', onclick: () => open() },
    h('span', { class: 'mark' }, icon('scale')), h('span', {}, pillTitle, pillSub));

  const body = h('div', { class: 'body', kp: 'body' });
  const footer = h('footer', { kp: 'footer' });
  const panel = h('aside', { class: 'panel', kp: 'panel', hidden: true, role: 'dialog', 'aria-label': 'Küçük Punto risk raporu' },
    h('header', {},
      h('div', { class: 'brand' }, icon('scale'), 'Küçük Punto', h('small', {}, 'sözleşme risk raporu')),
      h('button', { kp: 'close', type: 'button', title: 'Kapat', 'aria-label': 'Kapat', onclick: () => close() }, icon('close'))),
    // Always visible, above the scrolling area, in every state (requirement: no legal advice, clearly shown)
    h('div', { class: 'disclaimer', kp: 'disclaimer', role: 'note' }, icon('info'),
      h('div', {}, h('strong', {}, 'Hukuki tavsiye değildir.'),
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
    body.replaceChildren();
    footer.replaceChildren();
    ({ idle: renderIdle, loading: renderLoading, error: renderError, report: renderReport })[state.name]();
  }

  function renderIdle() {
    const d = detection;
    body.append(
      h('div', { class: 'card' },
        h('p', { style: 'font-weight:650;margin-bottom:4px' }, d?.isLegal ? `Bu sayfa: ${d.kindTr}` : 'Bu sayfa bir sözleşme / politika metnine benzemiyor.'),
        h('p', { class: 'muted small' }, d ? `Yaklaşık ${fmt(d.words)} kelime.` : ''),
        h('p', { class: 'muted small', style: 'margin-top:8px' },
          'Analiz başlatıldığında yalnızca ekranda görünen metin, ayarlarda seçtiğiniz model sağlayıcısına kendi anahtarınızla gönderilir. Gizli metinler gönderilmez, sadece size raporlanır.')),
      h('button', { class: 'btn primary', kp: 'analyze', type: 'button', onclick: () => onAnalyze?.({}) }, 'Riskleri analiz et'),
      h('button', { class: 'btn link', kp: 'open-options', type: 'button', onclick: () => onOpenOptions?.() }, 'Model ve API anahtarı ayarları'));
  }

  function renderLoading() {
    const t0 = state.t0 || (state.t0 = Date.now());
    const order = STAGES.map(s => s[0]).filter(s => s !== 'repair' || state.stage === 'repair');
    const cur = order.indexOf(state.stage || 'capture');
    const elapsed = h('span', { kp: 'elapsed' }, '0 sn');
    body.append(h('div', { class: 'card', kp: 'loading' },
      h('ul', { class: 'steps' }, order.map((id, i) => h('li', { class: i < cur ? 'ok' : i === cur ? 'on' : '' },
        h('span', { class: 'dot' }, i < cur ? icon('check') : ''), STAGES.find(s => s[0] === id)[1]))),
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
        h('button', { class: 'btn', kp: 'rules-only', type: 'button', onclick: () => onAnalyze?.({ rulesOnly: true }) }, 'Yalnızca kurallarla analiz et'),
        e.code !== 'NO_KEY' ? h('button', { class: 'btn', kp: 'retry', type: 'button', onclick: () => onAnalyze?.({}) }, 'Tekrar dene') : null)));
  }

  function renderReport() {
    const r = state.report;
    const en = r.engine || {};
    const modelUsed = en.mode === 'llm' && !en.error;
    const engineLabel = modelUsed ? `${en.provider || 'model'} · ${en.model}` : en.error ? `Model hatası → yalnızca kurallar` : 'Yalnızca kurallar (model kullanılmadı)';

    // 1. score (or an explicit "Belirsiz" when model and rules disagree sharply)
    const conflict = r.score_status === 'conflict';
    body.append(h('section', { class: 'card score', kp: 'score', 'data-band': conflict ? 'uncertain' : r.band, 'data-score': conflict ? '' : r.score, 'data-status': r.score_status },
      h('div', { class: 'num' }, conflict ? '?' : String(r.score), h('small', {}, ' /100')),
      h('div', { class: 'band', kp: 'band' }, conflict ? 'Belirsiz' : r.band_tr),
      h('div', {}, h('span', { class: 'engine' + (modelUsed ? '' : ' warn'), kp: 'engine' }, engineLabel)),
      conflict ? h('p', { class: 'small', style: 'grid-column:1/-1;margin-top:6px', kp: 'conflict' },
        `Model ${r.score} diyor, bağımsız kurallar ${r.rules_score} diyor. Bu kadar büyük bir fark, modelin sayfadaki bir ifadeyle yanıltıldığını gösterebilir. Bu yüzden skor vermiyoruz; aşağıdaki "Emin olamadıklarımız" bölümüne bakın.`) : null,
      h('p', { class: 'how muted small' },
        'Skoru model değil yazılım hesaplar: yalnızca alıntısı metinde birebir bulunan bulgular sayılır. ',
        `Metnin %${r.coverage.ratioPct}'i incelendi · ${fmt(r.clause_count)} parça · ${(r.trace.ms / 1000).toFixed(1).replace('.', ',')} sn.`)));

    // 2. security
    const s = r.security;
    if (s.detected) {
      const items = [
        ...s.hidden_suspicious.map(x => ({ tag: 'Gizli metin · ' + (HIDDEN_REASON_TR[x.reason] || x.reason), text: x.text, where: 'Modele gönderilmedi.' })),
        ...s.quarantined.map(x => ({ tag: 'Görünür metinde talimat', text: x.text, where: 'Model görmeden önce metinden çıkarıldı.' })),
        ...s.model_reported.map(x => ({ tag: 'Model fark etti', text: x.quote, where: x.note_tr }))
      ];
      body.append(h('section', { class: 'card alert', kp: 'security', 'data-count': items.length },
        h('div', { class: 'title' }, icon('alert'), 'Sayfada yapay zekâya yönelik talimat bulundu'),
        h('p', { class: 'small' }, 'Bu sayfa, okuyan bir yapay zekâyı yönlendirmeye çalışan metin içeriyor. Aşağıdakiler modele hiç gönderilmedi ya da model görmeden metinden çıkarıldı. Sayfaya güvenirken dikkatli olun.'),
        h('p', { class: 'small', style: 'margin-top:6px;font-weight:600' }, [
          s.hidden_suspicious.length ? `${s.hidden_suspicious.length} gizli metin (modele hiç gönderilmedi)` : null,
          s.quarantined.length ? `${s.quarantined.length} görünür cümle (model görmeden çıkarıldı)` : null,
          s.model_reported.length ? `${s.model_reported.length} modelin kendisinin fark ettiği` : null
        ].filter(Boolean).join(' · ')),
        h('ul', {}, items.slice(0, 4).map(it => h('li', { kp: 'security-item' }, h('span', { class: 'chip reason' }, it.tag), ' ', h('span', { class: 'muted' }, it.where), h('code', {}, clip(it.text, 220))))),
        items.length > 4 ? h('details', { class: 'small', style: 'margin-top:8px' }, h('summary', { style: 'cursor:pointer' }, `${items.length - 4} tane daha`),
          h('ul', {}, items.slice(4).map(it => h('li', { kp: 'security-item' }, h('span', { class: 'chip reason' }, it.tag), ' ', h('span', { class: 'muted' }, it.where), h('code', {}, clip(it.text, 220)))))) : null));
    } else if (s.hidden_removed) {
      body.append(h('p', { class: 'muted small', kp: 'hidden-note' }, `Sayfadaki ${fmt(s.hidden_removed)} görünmeyen metin parçası analize alınmadı (talimat içermiyordu).`));
    }

    // 3. summary
    if (r.summary_tr) body.append(h('p', { kp: 'summary' }, r.summary_tr));

    // 4. findings
    body.append(h('h2', {}, `Riskli maddeler (${r.findings.length})`));
    if (!r.findings.length) body.append(h('p', { class: 'card muted small', kp: 'no-findings' }, 'Alıntıyla desteklenen riskli bir madde bulunamadı. Bu, metnin risksiz olduğu anlamına gelmez.'));
    for (const f of r.findings) body.append(findingCard(f));

    // 5. uncertainty, said out loud
    if (r.uncertain.length) {
      body.append(h('section', { class: 'card uncertain', kp: 'uncertain', 'data-count': r.uncertain.length },
        h('div', { class: 'title' }, icon('help'), `Emin olamadıklarımız (${r.uncertain.length})`),
        h('p', { class: 'small muted' }, 'Bu maddeler skora katılmadı. Sistem burada karar vermiyor; kendiniz bakmanız gerekiyor.'),
        h('ul', {}, r.uncertain.map(u => h('li', { kp: 'uncertain-item', 'data-kind': u.kind },
          h('b', {}, UNCERTAIN_LABEL[u.kind] || 'Belirsiz'), u.text_tr,
          u.quote ? h('blockquote', {}, '“' + clip(u.quote, 220) + '”') : null,
          u.quote ? h('button', { class: 'btn link', type: 'button', onclick: (ev) => showQuote(ev.currentTarget, u.quote) }, 'Metinde göster') : null)))));
    }

    // 6. rejected claims (transparency: what the model said but could not prove)
    if (r.rejected.length) {
      body.append(h('details', { class: 'rejected card', kp: 'rejected', 'data-count': r.rejected.length },
        h('summary', {}, `Kanıtlanamadığı için gösterilmeyen iddialar (${r.rejected.length})`),
        h('p', { class: 'small muted', style: 'margin-top:6px' }, 'Model bu iddiaları ileri sürdü ama alıntıları sayfada birebir bulunamadı. Alıntısı olmayan iddia geçersiz sayılır.'),
        h('ul', {}, r.rejected.map(x => h('li', {}, h('b', {}, x.reason_tr), x.quote ? [' — ', h('s', {}, '“' + clip(x.quote, 160) + '”')] : null)))));
    }

    footer.append(
      h('span', {}, `Rapor v${r.version} · istem ${en.prompt_version}`),
      h('span', { class: 'row' },
        h('button', { class: 'btn', kp: 'copy-json', type: 'button', onclick: (ev) => copyJSON(ev.currentTarget, r) }, 'JSON'),
        h('button', { class: 'btn', kp: 'reanalyze', type: 'button', onclick: () => onAnalyze?.({}) }, 'Yeniden analiz')));
  }

  function findingCard(f) {
    const badge = f.source === 'rule' ? h('span', { class: 'badge rule' }, 'Kural eşleşmesi')
      : f.corroborated ? h('span', { class: 'badge ok', title: 'Bağımsız anahtar kelime kuralları da aynı maddede aynı riski buldu.' }, icon('check'), 'Kural ile de doğrulandı')
      : h('span', { class: 'badge solo', title: 'Bu bulguyu yalnızca model buldu; alıntısı doğrulandı.' }, 'Yalnızca model');
    const ev = f.evidence;
    return h('article', { class: 'card finding', kp: 'finding', 'data-category': f.category, 'data-severity': f.severity, 'data-source': f.source },
      h('div', { class: 'row' }, h('span', { class: 'chip', 'data-sev': f.severity }, SEVERITY_TR[f.severity]), h('span', { class: 'cat' }, f.category_tr)),
      f.explanation_tr ? h('p', {}, f.explanation_tr) : null,
      h('blockquote', { kp: 'quote' }, ev.heading ? h('span', { class: 'where' }, ev.heading) : null, '“' + ev.quote + '”'),
      h('div', { class: 'meta' },
        h('span', { class: 'row' }, badge, f.source === 'model' ? h('span', {}, `· güven %${Math.round(f.confidence * 100)}`) : null),
        h('button', { class: 'btn link', kp: 'show-in-page', type: 'button', onclick: (e) => showQuote(e.currentTarget, ev.quote) }, icon('search'), 'Metinde göster')));
  }

  function showQuote(btn, quote) {
    const ok = onShowQuote?.(quote);
    if (!ok) { btn.textContent = 'Sayfada bulunamadı (sayfa değişmiş olabilir)'; btn.disabled = true; }
  }

  async function copyJSON(btn, report) {
    try { await navigator.clipboard.writeText(JSON.stringify(report, null, 2)); btn.textContent = 'Kopyalandı'; }
    catch { btn.textContent = 'Kopyalanamadı'; }
    setTimeout(() => { btn.textContent = 'JSON'; }, 1500);
  }

  const clip = (s, n) => { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

  (doc.documentElement || doc.body).appendChild(host);
  render();
  return { host, shadow, open, close, isOpen, toggle: () => (isOpen() ? close() : open()), showPill, setState, setStage, get state() { return state; } };
}
