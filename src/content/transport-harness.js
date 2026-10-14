// Harness transport (Cypress demo only). The same content code is injected into a local test
// page as a normal script; analysis is done by scripts/serve.js, which runs the very same
// background handler in Node with the key from .env. Not part of the extension build.

const endpoint = () => (window.__KP_HARNESS__ && window.__KP_HARNESS__.endpoint) || '/__kp/analyze';

export const harnessTransport = {
  async analyze(payload, onStage) {
    onStage?.('model');
    const res = await fetch(endpoint(), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
    const out = await res.json();
    onStage?.('verify');
    await new Promise(r => setTimeout(r, 250));
    return out;
  },
  status: async () => (await fetch('/__kp/status')).json(),
  openOptions: () => { console.info('[kp] harness: ayarlar .env dosyasından okunur'); },
  onToggle(cb) {
    window.addEventListener('keydown', e => { if (e.altKey && (e.key === 'k' || e.key === 'K')) cb(); });
    window.__kpToggle = cb;
  },
  onSelection(cb) { window.__kpAnalyzeSelection = cb; }
};
