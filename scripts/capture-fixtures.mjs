// Records, in a real browser, what each reader extracts from the injection test page:
//   - Küçük Punto's capture layer (src/content/capture.js)
//   - page-agent's DOM reader (@page-agent/page-controller, PageController.getBrowserState, whole page)
//   - document.body.innerText and textContent (what a naive extension would send)
// Output: eval/injection/captures.json (committed, so eval/injection.js runs without a browser).
//
//   npm i -D playwright && npx playwright install chromium   (once)
//   node scripts/capture-fixtures.mjs

import fs from 'node:fs';
import path from 'node:path';
import * as esbuild from 'esbuild';
import { startHarness } from './serve.js';
import { ROOT } from './env.js';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const PAGES = ['streambox-abonelik.html'];

const bundle = await esbuild.build({
  stdin: {
    contents: `import { capturePage } from './src/content/capture.js';
               import { PageController } from '@page-agent/page-controller';
               window.__kpCapture = capturePage; window.__PageController = PageController;`,
    resolveDir: ROOT, loader: 'js'
  },
  bundle: true, format: 'iife', write: false, target: 'chrome116', logLevel: 'error'
});
const code = bundle.outputFiles[0].text;
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'node_modules/@page-agent/page-controller/package.json'), 'utf8'));

const site = await startHarness({ port: 0, quiet: true, inject: false, mockMode: 'helpful' });
const browser = await chromium.launch();
const out = { generated: new Date().toISOString(), browser: browser.version(), page_agent_version: pkg.version, pages: {} };

for (const name of PAGES) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(`http://127.0.0.1:${site.port}/${name}`);
  await page.addScriptTag({ content: code });
  const data = await page.evaluate(async () => {
    const ours = window.__kpCapture({});
    const pc = new window.__PageController({ viewportExpansion: -1 });
    const st = await pc.getBrowserState();
    const attacks = [...document.querySelectorAll('[data-attack]')].map(el => ({
      id: el.dataset.attack,
      text: (el.getAttribute('aria-label') || el.textContent).trim(),
      kind: el.hasAttribute('aria-label') ? 'attribute' : 'text',
      style: el.getAttribute('style') || el.className || ''
    }));
    // comments are not elements; collect them too
    const walker = document.createTreeWalker(document, NodeFilter.SHOW_COMMENT);
    let c; while ((c = walker.nextNode())) { const m = /(ATK-\d+) \(HTML yorumu\):\s*([^\n]+)/.exec(c.nodeValue); if (m) attacks.push({ id: m[1], text: m[2].trim(), kind: 'comment', style: '' }); }
    return {
      title: document.title, url: location.href,
      ours: { blocks: ours.blocks, hidden: ours.hidden, meta: { title: ours.meta.title, host: 'streambox.example', url: 'https://streambox.example/abonelik', lang: ours.meta.lang } },
      page_agent: st.content, inner_text: document.body.innerText, text_content: document.body.textContent,
      attacks
    };
  });
  out.pages[name] = data;
  console.log(`${name}: ours ${data.ours.blocks.length} blocks / ${data.ours.hidden.length} hidden; page-agent ${data.page_agent.length} chars; ${data.attacks.length} attacks`);
  await page.close();
}
await browser.close();
site.server.close();
fs.mkdirSync(path.join(ROOT, 'eval/injection'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'eval/injection/captures.json'), JSON.stringify(out, null, 2) + '\n');
console.log('eval/injection/captures.json');
