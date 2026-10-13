// Options page: provider, key, model. Runs in the extension origin (never inside a web page).
import { PRESETS } from '../core/llm.js';
import { DEFAULT_SETTINGS, handleAnalyze, resolveLLMConfig } from '../background/handler.js';
import { textToBlocks } from '../core/segment.js';

const $ = id => document.getElementById(id);
const HELP = {
  gemini: ['Ücretsiz anahtar: ', 'https://aistudio.google.com/apikey', ' adresinde “Create API key”. Varsayılan model gemini-flash-latest.'],
  openai: ['Anahtar: ', 'https://platform.openai.com/api-keys', ' (ücretli).'],
  anthropic: ['Anahtar: ', 'https://console.anthropic.com/settings/keys', ' (ücretli; Claude Pro aboneliği API anahtarı içermez).'],
  groq: ['Ücretsiz katman: ', 'https://console.groq.com/keys', ''],
  openrouter: ['Anahtar: ', 'https://openrouter.ai/keys', ''],
  ollama: ['Anahtar gerekmez. Ollama’yı OLLAMA_ORIGINS=chrome-extension://* ile başlatın.', '', ''],
  custom: ['OpenAI uyumlu herhangi bir /chat/completions adresi.', '', '']
};

// Small fixed sample with known risky clauses, used by "Bağlantıyı test et".
const SAMPLE = `Abonelik Koşulları

Aboneliğiniz, dönem bitmeden en az 30 gün önce iptal etmediğiniz sürece otomatik olarak aynı süre için yenilenir ve kayıtlı kartınızdan ücret tahsil edilir.

Ödenen ücretler hiçbir koşulda iade edilmez; kısmi kullanım dönemleri için de geri ödeme yapılmaz.

Şirket bu koşulları dilediği zaman ve önceden bildirim yapmaksızın değiştirebilir; hizmeti kullanmaya devam etmeniz değişiklikleri kabul ettiğiniz anlamına gelir.

Bu sözleşmeden doğan uyuşmazlıklar bağlayıcı tahkim yoluyla çözülür; toplu dava açma hakkınızdan feragat edersiniz.`;

function fill() {
  const sel = $('provider');
  for (const [id, p] of Object.entries(PRESETS)) sel.append(new Option(p.label, id));
}

function setStatus(text, kind = 'info') { const s = $('status'); s.textContent = text; s.className = kind; }

function renderHelp() {
  const id = $('provider').value, p = PRESETS[id], [a, link, b] = HELP[id] || ['', '', ''];
  const help = $('provider-help');
  help.replaceChildren(a);
  if (link) { const el = document.createElement('a'); el.href = link; el.target = '_blank'; el.rel = 'noopener'; el.textContent = link.replace('https://', ''); help.append(el); }
  help.append(b);
  $('model').placeholder = p.model || 'model adı';
  $('baseUrl').placeholder = p.baseUrl || 'https://…/v1';
  $('apiKey').disabled = !!p.noKey;
}

function formValues() {
  return { provider: $('provider').value, apiKey: $('apiKey').value.trim(), model: $('model').value.trim(), baseUrl: $('baseUrl').value.trim(), autoAnalyze: $('autoAnalyze').checked };
}

const MANIFEST_HOSTS = new Set(chrome.runtime.getManifest().host_permissions.map(h => new URL(h.replace('/*', '/')).origin));

// Must run synchronously inside the click handler (user gesture) before any await.
function requestOriginIfNeeded(settings) {
  const { baseUrl } = resolveLLMConfig(settings);
  let origin;
  try { origin = new URL(baseUrl).origin; } catch { return Promise.resolve(true); }
  if (MANIFEST_HOSTS.has(origin)) return Promise.resolve(true);
  return chrome.permissions.request({ origins: [origin + '/*'] }).catch(() => false);
}

async function load() {
  const s = { ...DEFAULT_SETTINGS, ...(await chrome.storage.local.get(Object.keys(DEFAULT_SETTINGS))) };
  $('provider').value = PRESETS[s.provider] ? s.provider : 'gemini';
  $('apiKey').value = s.apiKey; $('model').value = s.model; $('baseUrl').value = s.baseUrl; $('autoAnalyze').checked = !!s.autoAnalyze;
  renderHelp();
  if (!s.apiKey && !PRESETS[s.provider]?.noKey) setStatus('Henüz anahtar yok. Gemini için ücretsiz anahtar alıp buraya yapıştırın, sonra “Kaydet”.', 'info');
}

$('form').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const v = formValues();
  const perm = requestOriginIfNeeded(v);
  perm.then(async granted => {
    await chrome.storage.local.set(v);
    setStatus(granted ? 'Kaydedildi.' : 'Kaydedildi, ancak bu adres için erişim izni verilmedi; sağlayıcı CORS’a izin vermiyorsa istekler başarısız olur.', granted ? 'ok' : 'err');
  });
});

$('test').addEventListener('click', () => {
  const v = formValues();
  // no permission prompt here: the test simply tries; "Kaydet" is where access is requested
  Promise.resolve().then(async () => {
    $('test').disabled = true;
    setStatus('Örnek bir abonelik metni modele gönderiliyor…', 'info');
    const t0 = performance.now();
    const res = await handleAnalyze({ blocks: textToBlocks(SAMPLE), meta: { title: 'Test', host: 'kucuk-punto.test' } }, {
      settings: v, randomBytes: n => crypto.getRandomValues(new Uint8Array(n)), timeoutMs: 60000
    });
    $('test').disabled = false;
    const sec = ((performance.now() - t0) / 1000).toFixed(1);
    if (!res.ok) return setStatus('✗ ' + res.error.message, 'err');
    const r = res.report;
    if (r.engine.error) return setStatus(`✗ Model kullanılamadı: ${r.engine.error.message}`, 'err');
    setStatus(`✓ Bağlantı çalışıyor (${sec} sn): ${r.engine.model} şemaya uygun JSON döndürdü. ${r.findings.length} bulgu, alıntılarının tümü metinde doğrulandı; ${r.rejected.length} iddia reddedildi. Örnek skor: ${r.score}/100.`, 'ok');
  });
});

$('clear').addEventListener('click', async () => {
  await chrome.storage.local.remove('apiKey'); $('apiKey').value = '';
  setStatus('Anahtar silindi.', 'info');
});
$('reveal').addEventListener('click', () => {
  const k = $('apiKey'); const show = k.type === 'password';
  k.type = show ? 'text' : 'password'; $('reveal').textContent = show ? 'Gizle' : 'Göster';
});
$('provider').addEventListener('change', renderHelp);

fill();
load();
