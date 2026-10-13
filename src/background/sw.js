// MV3 service worker: owns the API key and is the only place that talks to the model provider.
// The page never sees the key; the content script only sends captured text and gets a report back.

import { handleAnalyze, DEFAULT_SETTINGS, isConfigured } from './handler.js';

const BAND_COLOR = { low: '#2f7d4f', medium: '#b7791f', high: '#c0392b' };

async function getSettings() {
  const s = await chrome.storage.local.get(Object.keys(DEFAULT_SETTINGS));
  return { ...DEFAULT_SETTINGS, ...s };
}

const randomBytes = n => crypto.getRandomValues(new Uint8Array(n));
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
      settings, fetchImpl: fetch.bind(globalThis), randomBytes,
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
  if (reason === 'install' && !isConfigured(await getSettings())) chrome.runtime.openOptionsPage();
});
