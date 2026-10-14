// Live demo entry (GitHub Pages): the extension's content code + the in-page web transport.
import { start } from '../content/main.js';
import { makeWebTransport } from './transport-web.js';
import { mountBar } from './bar.js';

const bar = mountBar({ rootHref: '../index.html' });
let toggle = null;
const transport = makeWebTransport({ onOpenSettings: () => bar.openSettings(), onToggleRegister: cb => { toggle = cb; } });
const app = start(transport);

// used by the "paste your own text" page after it has placed the text into the page
window.__kpDemo = {
  open: () => { app?.detect(); toggle?.(); },
  analyze: () => app?.run({})
};
