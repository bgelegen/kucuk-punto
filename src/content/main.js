// Content-side controller. Shared by the real extension and the Cypress harness;
// only the transport (how a capture reaches the analyzer) differs between the two builds.
//
// Nothing is sent anywhere until the user presses "Analiz et" (or explicitly turns on
// auto-analysis in the options). Detection runs locally on every page.

import { capturePage } from './capture.js';
import { detectLegal, KIND_TR } from './detect.js';
import { showQuoteInPage, clearHighlight } from './highlight.js';
import { createPanel } from './panel.js';

const nextFrame = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));

export function start(transport, { win = window, doc = document, allowFrame = false } = {}) {
  // the extension only runs in the top frame; the Cypress harness page lives inside Cypress's iframe
  if ((!allowFrame && win.top !== win) || win.__kpStarted) return null;
  win.__kpStarted = true;

  let panel = null, detection = null, busy = false, lastUrl = win.location.href, lastSelection = null, lastMode = 'page';

  function detect() {
    const text = (doc.body?.innerText || '').slice(0, 300000);
    const d = detectLegal({ url: win.location.href, title: doc.title, text });
    detection = { ...d, kindTr: KIND_TR[d.kind] };
    return detection;
  }

  function ensurePanel() {
    if (panel) return panel;
    panel = createPanel({
      doc,
      onAnalyze: (opts) => { if (opts?.page) lastMode = 'page'; return run(opts); },
      onOpenOptions: () => transport.openOptions(),
      onShowQuote: (q) => showQuoteInPage(q, doc),
      onClose: () => clearHighlight()
    });
    return panel;
  }

  // the user's own selection: the fallback when a page's layout cannot be read automatically
  function captureSelection() {
    const text = String(win.getSelection?.() || '').trim();
    if (text.length < 80) return null;
    const blocks = text.split(/\n\s*\n|\n/).map(t => t.replace(/\s+/g, ' ').trim()).filter(t => t.length > 2).map(t => ({ text: t, tag: 'p' }));
    const loc = win.location;
    return { blocks, hidden: [], meta: { title: doc.title || '', url: loc.href, host: loc.host, lang: doc.documentElement.lang || '', selection: true } };
  }

  async function run({ rulesOnly = false, selection = false } = {}) {
    if (busy) return;
    busy = true;
    if (selection) lastSelection = captureSelection();
    const useSelection = selection || (lastMode === 'selection' && lastSelection);
    ensurePanel().open();
    panel.setState({ name: 'loading', stage: 'capture' });
    clearHighlight();
    try {
      await nextFrame();
      const cap = useSelection ? lastSelection : capturePage({ doc, win });
      if (useSelection && !cap) { panel.setState({ name: 'error', error: { code: 'EMPTY_SELECTION', message: 'Önce analiz etmek istediğiniz sözleşme metnini fareyle seçin (en az birkaç cümle), sonra sağ tıklayıp "Küçük Punto ile seçili metni analiz et"i seçin.' } }); return; }
      lastMode = useSelection ? 'selection' : 'page';
      if (!cap.blocks.length) { panel.setState({ name: 'error', error: { code: 'EMPTY', message: 'Sayfada okunabilir görünür metin bulunamadı. Metni seçip sağ tıklayarak "Küçük Punto ile seçili metni analiz et"i deneyin.' } }); return; }
      const res = await transport.analyze({ blocks: cap.blocks, hidden: cap.hidden, meta: cap.meta, rulesOnly }, stage => panel.setStage(stage));
      if (res && res.ok) panel.setState({ name: 'report', report: res.report });
      else panel.setState({ name: 'error', error: res?.error || { code: 'UNKNOWN', message: 'Bilinmeyen hata.' } });
    } catch (e) {
      panel.setState({ name: 'error', error: { code: 'TRANSPORT', message: 'Eklentinin arka planına ulaşılamadı: ' + (e?.message || e) + ' Sayfayı yenileyip tekrar deneyin.' } });
    } finally { busy = false; }
  }

  async function init() {
    const d = detect();
    if (d.isLegal) {
      ensurePanel().showPill(d);
      let status = null;
      try { status = await transport.status(); } catch { /* background not reachable yet */ }
      if (status?.autoAnalyze && status?.configured) run();
    }
  }

  transport.onSelection?.(() => { lastMode = 'page'; run({ selection: true }); });

  transport.onToggle(() => {
    ensurePanel();
    if (!detection) detect();
    panel.showPill(detection);
    panel.toggle();
  });

  // single-page apps: the URL changes without a reload
  win.setInterval(() => {
    if (win.location.href === lastUrl || busy) return;
    lastUrl = win.location.href;
    clearHighlight();
    if (panel) { panel.close(); panel.setState({ name: 'idle' }); }
    init();
  }, 1500);

  init();
  return { run, detect, get panel() { return panel; } };
}
