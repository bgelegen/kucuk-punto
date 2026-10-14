// Extension transport: a long-lived Port to the service worker. An open port keeps the
// MV3 worker alive during long model calls and carries progress events back.

export const extensionTransport = {
  analyze(payload, onStage) {
    return new Promise((resolve, reject) => {
      const port = chrome.runtime.connect({ name: 'kp-analyze' });
      let done = false;
      const ping = setInterval(() => { try { port.postMessage({ type: 'ping' }); } catch { /* closed */ } }, 20000);
      port.onMessage.addListener(msg => {
        if (msg?.type === 'stage') onStage?.(msg.stage);
        else if (msg?.type === 'result') { done = true; clearInterval(ping); port.disconnect(); resolve(msg.result); }
      });
      port.onDisconnect.addListener(() => {
        clearInterval(ping);
        if (!done) reject(new Error(chrome.runtime.lastError?.message || 'Bağlantı kapandı.'));
      });
      port.postMessage({ type: 'analyze', payload });
    });
  },
  status: () => chrome.runtime.sendMessage({ type: 'kp:status' }),
  openOptions: () => chrome.runtime.sendMessage({ type: 'kp:openOptions' }),
  onToggle(cb) { chrome.runtime.onMessage.addListener(msg => { if (msg?.type === 'kp:toggle') cb(); }); },
  onSelection(cb) { chrome.runtime.onMessage.addListener(msg => { if (msg?.type === 'kp:analyzeSelection') cb(); }); }
};
