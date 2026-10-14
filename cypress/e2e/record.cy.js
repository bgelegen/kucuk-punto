// Not part of the demo video: visits the live-demo pages once with the real model so that the harness
// (KP_RECORD=1) saves the model's answers to demo/recordings/. Run by scripts/record-demo.js.
const pages = ['/netflix-tos.html', '/streambox-abonelik.html', '/streambox-abonelik-v2.html'];

describe('canlı demo kayıtları', () => {
  for (const p of pages) {
    it(`gerçek model yanıtını kaydeder: ${p}`, () => {
      cy.visit(p);
      cy.get('[data-kp=pill]', { timeout: 15000 }).click();
      cy.get('[data-kp=analyze]').click();
      cy.get('[data-kp=score]', { timeout: 120000 }).should('be.visible');
      cy.get('[data-kp=engine]').invoke('text').should('not.match', /Model hatası|Yalnızca kurallar/);
    });
  }
});
