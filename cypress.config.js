// Cypress records the demo video (≤ 90 s) against the harness: the same content-script code and the
// same analysis handler as the extension, served locally (see scripts/serve.js for why).
//
//   npm run cy:run          -> cypress/videos/demo.cy.js.mp4
//   KP_MOCK=1 in .env -> demo model, labelled "mock" on screen (no key needed)
import { defineConfig } from 'cypress';
import { startHarness } from './scripts/serve.js';

const PORT = Number(process.env.KP_PORT || 5173);

export default defineConfig({
  allowCypressEnv: false,   // nothing secret goes through Cypress.env(); the key stays in the Node harness
  video: true,
  videoCompression: 28,
  viewportWidth: 1280,
  viewportHeight: 800,
  defaultCommandTimeout: 10000,
  e2e: {
    baseUrl: `http://127.0.0.1:${PORT}`,
    specPattern: 'cypress/e2e/**/*.cy.js',
    supportFile: false,
    includeShadowDom: true,
    async setupNodeEvents(on, config) {
      try { await startHarness({ port: PORT }); }
      catch (e) { if (e.code !== 'EADDRINUSE') throw e; console.log(`port ${PORT} zaten açık; mevcut sunucu kullanılıyor`); }
      return config;
    }
  }
});
