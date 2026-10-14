// MV3 service worker: owns the API key and is the only place that talks to the model provider.
// The page never sees the key; the content script only sends captured text and gets a report back.

import { handleAnalyze, DEFAULT_SETTINGS, isConfigured } from './handler.js';

const BAND_COLOR = { low: '#2f7d4f', medium: '#b7791f', high: '#c0392b' };

async function getSettings() {
  const s = await chrome.storage.local.get(Object.keys(DEFAULT_SETTINGS));
  return { ...DEFAULT_SETTINGS, ...s };
}

const randomBytes = n => crypto.getRandomValues(new Uint8Array(n));

// Analysis history for change tracking: one small snapshot per document (fingerprint + findings),
// never the page text. Capped; the options page can clear it.
const HISTORY_KEY = 'kp_history', HISTORY_MAX = 300;
const history = {
  async get(key) { const { [HISTORY_KEY]: h = {} } = await chrome.storage.local.get(HISTORY_KEY); return h[key] || null; },
  async set(key, snap) {
    const { [HISTORY_KEY]: h = {} } = await chrome.storage.local.get(HISTORY_KEY);
    h[key] = snap;
    const keys = Object.keys(h);
    if (keys.length > HISTORY_MAX) keys.sort((a, b) => String(h[a].date).localeCompare(String(h[b].date))).slice(0, keys.length - HISTORY_MAX).forEach(k => delete h[k]);
    await chrome.storage.local.set({ [HISTORY_KEY]: h });
  }
};
const fromOurContentScript = sender => sender && sender.id === chrome.runtime.id && sender.tab && typeof sender.tab.id === 'number';

function safePost(port, msg) { try { port.postMessage(msg); } catch { /* tab closed */ } }

chrome.runtime.onConnect.addListener(port => {
  if (port.name !== 'kp-analyze' || !fromOurContentScript(port.sender)) { port.disconnect(); return; }
  let started = false;
  port.onMessage.addListener(async msg => {
    if (msg?.type !== 'analyze' || started) return;   // one analysis per port; pings are ignored
    started = true;
    const settings = await getSettings();
    const result = await handleAnalyze(msg.payload, {
      settings, fetchImpl: fetch.bind(globalThis), randomBytes, history,
      onProgress: stage => safePost(port, { type: 'stage', stage })
    }).catch(e => ({ ok: false, error: { code: 'INTERNAL', message: 'Beklenmeyen hata: ' + (e?.message || e) } }));
    if (result.ok) setBadge(port.sender.tab.id, result.report);
    safePost(port, { type: 'result', result });
  });
});

// The badge lives in the browser toolbar, outside the page's reach: a page can draw a fake panel
// over ours, but it cannot change this number.
function setBadge(tabId, report) {
  const conflict = report.score_status === 'conflict';
  chrome.action.setBadgeText({ tabId, text: conflict ? '?' : String(report.score) }).catch(() => {});
  chrome.action.setBadgeBackgroundColor({ tabId, color: conflict ? '#8a5a0b' : BAND_COLOR[report.band] || '#555' }).catch(() => {});
  chrome.action.setTitle({ tabId, title: `Küçük Punto: ${conflict ? 'skor belirsiz (model ve kurallar çelişiyor)' : `${report.score}/100 · ${report.band_tr}`}${report.security.detected ? ' · sayfada talimat enjeksiyonu bulundu' : ''}` }).catch(() => {});
}

chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.status === 'loading') { chrome.action.setBadgeText({ tabId, text: '' }).catch(() => {}); chrome.action.setTitle({ tabId, title: 'Küçük Punto' }).catch(() => {}); }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return false;
  if (msg?.type === 'kp:status') {
    getSettings().then(s => sendResponse({ configured: isConfigured(s), provider: s.provider, autoAnalyze: !!s.autoAnalyze }));
    return true;
  }
  if (msg?.type === 'kp:openOptions') { chrome.runtime.openOptionsPage(); sendResponse({ ok: true }); }
  return false;
});

chrome.action.onClicked.addListener(tab => {
  if (tab.id != null) chrome.tabs.sendMessage(tab.id, { type: 'kp:toggle' }).catch(() => chrome.runtime.openOptionsPage());
});

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  // right-click fallback for pages the reader cannot handle: analyse only the selected text
  chrome.contextMenus.removeAll(() => chrome.contextMenus.create({ id: 'kp-selection', title: 'Küçük Punto ile seçili metni analiz et', contexts: ['selection'] }));
  if (reason === 'install' && !isConfigured(await getSettings())) chrome.runtime.openOptionsPage();
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'kp-selection' && tab?.id != null) chrome.tabs.sendMessage(tab.id, { type: 'kp:analyzeSelection' }).catch(() => {});
});
