// The live demo's top bar: which model answer is used, the visitor's own key, a way back.
// Its own Shadow DOM, so the page capture never reads it. No innerHTML.

import { webState, loadRecording, clearWebHistory, WEB_MODEL } from './transport-web.js';
import { ICONS } from '../content/icons.js';

const CSS = `
:host { all: initial; }
* { box-sizing: border-box; }
.bar { position: fixed; top: 0; left: 0; right: 0; z-index: 2147483646; font: 13.5px/1.4 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  color: #fff; background: linear-gradient(135deg, #132238, #25456f); box-shadow: 0 4px 18px rgba(10,20,40,.25); }
.row { display: flex; align-items: center; gap: 12px; padding: 8px 16px; flex-wrap: wrap; }
.brand { display: flex; align-items: center; gap: 8px; font-weight: 750; color: #fff; text-decoration: none; }
.brand .mark { width: 28px; height: 28px; border-radius: 8px; background: rgba(255,255,255,.12); display: grid; place-items: center; }
.brand svg { width: 16px; height: 16px; fill: none; stroke: #c9a45c; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.live { font-size: 11.5px; font-weight: 700; color: #132238; background: #c9a45c; border-radius: 999px; padding: 1px 8px; }
.seg { display: inline-flex; background: rgba(255,255,255,.1); border-radius: 10px; padding: 3px; gap: 2px; }
.seg button { font: inherit; font-size: 12.5px; color: rgba(255,255,255,.85); background: none; border: 0; border-radius: 8px; padding: 5px 10px; cursor: pointer; white-space: nowrap; }
.seg button[aria-pressed="true"] { background: #fff; color: #132238; font-weight: 700; }
.seg button:disabled { opacity: .4; cursor: not-allowed; }
.spacer { flex: 1; }
a.back { color: #fff; opacity: .85; text-decoration: none; font-weight: 600; white-space: nowrap; }
a.back:hover { opacity: 1; text-decoration: underline; }
.info { padding: 0 16px 8px; font-size: 12.5px; color: rgba(255,255,255,.82); }
.info b { color: #fff; }
.key { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; padding: 0 16px 10px; }
.key input { font: 13px ui-monospace, Consolas, monospace; width: min(360px, 100%); padding: 6px 9px; border-radius: 8px; border: 1px solid rgba(255,255,255,.35); background: rgba(0,0,0,.25); color: #fff; }
.key button { font: inherit; font-size: 12.5px; padding: 6px 10px; border-radius: 8px; border: 0; background: #c9a45c; color: #132238; font-weight: 700; cursor: pointer; }
.key button.ghost { background: rgba(255,255,255,.12); color: #fff; font-weight: 600; }
.key a { color: #f0d79c; }
.info .short { display: none; }
@media (max-width: 640px) { .info .long { display: none; } .info .short { display: inline; } a.back { display: none; } .row { gap: 8px; padding: 6px 10px; } .seg button { padding: 5px 7px; font-size: 11.5px; } .info { padding: 0 10px 6px; } .key { padding: 0 10px 8px; } .hide-sm { display: none; } }
`;

const INFO = {
  recorded: (rec) => ['Kayıtlı Gemini yanıtı: ', `Bu sayfa için ${rec?.model || WEB_MODEL} modelinin verdiği gerçek yanıt kayıttan okunur. Şema doğrulama, alıntı doğrulama, kural karşılaştırması ve skor şu an tarayıcınızda çalışır.`, 'Gerçek model yanıtı, doğrulama tarayıcınızda.'],
  key: () => ['Kendi anahtarınız: ', `Metin, anahtarınızla doğrudan Google'a (${WEB_MODEL}) gönderilir. Anahtar yalnızca bu sekmede tutulur; sekmeyi kapatınca silinir.`, 'Anahtarınız yalnızca bu sekmede, yalnızca Google\'a.'],
  rules: () => ['Yalnızca kurallar: ', 'Model kullanılmaz; bağımsız anahtar kelime kuralları çalışır ve rapor bunu açıkça etiketler. Anahtar gerekmez.', 'Model yok, anahtar gerekmez.']
};

export function mountBar({ doc = document, rootHref = '../index.html' } = {}) {
  const h = (tag, props, ...kids) => {
    const el = doc.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v; else if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else el.setAttribute(k, v === true ? '' : String(v));
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : doc.createTextNode(String(kid)));
    return el;
  };
  const logo = () => { const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('viewBox', '0 0 24 24'); const p = doc.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', ICONS.logo); svg.append(p); return svg; };

  const host = doc.createElement('div');
  host.setAttribute('data-kp-demo-bar', '');
  const shadow = host.attachShadow({ mode: 'open' });
  const style = doc.createElement('style'); style.textContent = CSS;
  const btn = (mode, label) => h('button', { type: 'button', 'data-mode': mode, onclick: () => { webState.mode = mode; render(); if (mode === 'key' && !webState.key) input.focus(); } }, label);
  const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Model yanıtı' },
    btn('recorded', 'Kayıtlı Gemini yanıtı'), btn('key', 'Kendi anahtarım'), btn('rules', 'Yalnızca kurallar'));
  const info = h('div', { class: 'info', 'data-kp': 'demo-info' });
  const input = h('input', { type: 'password', placeholder: 'Gemini API anahtarı (AIza…)', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Gemini API anahtarı' });
  const keyRow = h('div', { class: 'key' }, input,
    h('button', { type: 'button', onclick: () => { webState.key = input.value; input.value = ''; webState.mode = 'key'; render(); } }, 'Bu sekmede kullan'),
    h('button', { type: 'button', class: 'ghost', onclick: () => { webState.key = ''; render(); } }, 'Anahtarı unut'),
    h('span', { class: 'hide-sm' }, 'Ücretsiz anahtar: ', h('a', { href: 'https://aistudio.google.com/apikey', target: '_blank', rel: 'noopener noreferrer' }, 'aistudio.google.com/apikey')));
  const bar = h('div', { class: 'bar' },
    h('div', { class: 'row' },
      h('a', { class: 'brand', href: rootHref }, h('span', { class: 'mark' }, logo()), 'Küçük Punto', h('span', { class: 'live' }, 'canlı demo')),
      seg, h('span', { class: 'spacer' }),
      h('a', { class: 'back', href: rootHref }, 'Tüm örnekler')),
    info, keyRow);
  shadow.append(style, bar);

  // keep the page content below the fixed bar (an empty element: the capture reads no text from it)
  const spacer = doc.createElement('div');
  spacer.setAttribute('data-kp-demo-spacer', '');
  doc.body.prepend(spacer);
  doc.documentElement.appendChild(host);
  const fit = () => { spacer.style.height = bar.getBoundingClientRect().height + 'px'; };

  function render() {
    const rec = recordingCache;
    const eff = webState.effective();
    for (const b of seg.querySelectorAll('button')) {
      b.setAttribute('aria-pressed', String(b.dataset.mode === eff));
      if (b.dataset.mode === 'recorded') { b.disabled = !rec; b.title = rec ? '' : 'Bu sayfa için kayıtlı model yanıtı yok'; }
    }
    const [label, text, short] = INFO[eff](rec);
    info.replaceChildren(h('b', {}, label), h('span', { class: 'long' }, text, webState.key && eff !== 'key' ? ' Anahtarınız bu sekmede kayıtlı.' : ''), h('span', { class: 'short' }, short));
    keyRow.style.display = webState.mode === 'key' ? '' : 'none';
    host.setAttribute('data-mode', eff);
    fit();
  }

  let recordingCache = null;
  loadRecording().then(r => { recordingCache = r; render(); });
  render();
  addEventListener('resize', fit);
  return {
    openSettings() { webState.mode = 'key'; render(); input.focus(); },
    clearHistory: clearWebHistory,
    host
  };
}
