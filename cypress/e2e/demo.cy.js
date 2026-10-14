// Demo video (≤ 90 s after cutting the model waits): a happy path on a real ToS, the moment where the
// system honestly says what it does not know, the hidden-instruction page and change tracking.
// Assertions check the guarantees, not specific model outputs (a real model's wording varies).

const caption = (text) => cy.document({ log: false }).then((doc) => {
  // the caption lives in its own shadow root, so the analysis never reads it
  let host = doc.getElementById('cy-caption');
  if (!host) {
    host = doc.createElement('div');
    host.id = 'cy-caption';
    doc.documentElement.appendChild(host);
    const root = host.attachShadow({ mode: 'open' });
    const style = doc.createElement('style');
    style.textContent = `.c{position:fixed;left:24px;bottom:24px;max-width:760px;z-index:2147483646;background:rgba(19,34,56,.95);color:#fff;
      font:600 19px/1.35 system-ui,-apple-system,"Segoe UI",sans-serif;padding:14px 18px;border-radius:14px;box-shadow:0 10px 30px rgba(0,0,0,.3);border-left:5px solid #c9a45c}`;
    const box = doc.createElement('div'); box.className = 'c';
    root.append(style, box);
  }
  host.shadowRoot.querySelector('.c').textContent = text;
});

const pause = (ms) => cy.wait(ms, { log: false });

// a demo recorded while the model was failing would show rules-only results: fail instead
const modelWasUsed = () => cy.get('[data-kp=engine]').invoke('text').should((t) => {
  expect(t, 'model gerçekten kullanıldı').not.to.match(/Model hatası|Yalnızca kurallar/);
});

// every quote shown in the panel must exist verbatim in the page the user is looking at
const quotesAreInPage = () => cy.document().then((doc) => {
  const page = doc.body.innerText.replace(/\s+/g, ' ');
  cy.get('[data-kp=finding] [data-kp=quote]').each(($q) => {
    const t = $q.text();
    const quote = t.slice(t.indexOf('“') + 1, t.lastIndexOf('”')).replace(/\s+/g, ' ');
    expect(page, 'alıntı sayfada var').to.include(quote);
  });
});

const analyze = () => {
  cy.get('[data-kp=pill]', { timeout: 15000 }).should('be.visible').click();
  cy.get('[data-kp=disclaimer]').should('be.visible').and('contain', 'Hukuki tavsiye değildir');
  cy.get('[data-kp=analyze]').click();
  cy.get('[data-kp=score]', { timeout: 120000 }).should('be.visible');
  modelWasUsed();
};

describe('Küçük Punto', () => {
  it('kanıtla raporlar, emin olmadığını söyler, gizli talimata kanmaz, değişikliği yakalar', () => {
    // 1 — happy path on a real terms page
    cy.visit('/netflix-tos.html');
    caption('Gerçek bir sözleşme: Netflix Kullanım Koşulları. Küçük Punto sayfanın bir sözleşme olduğunu algıladı.');
    cy.get('[data-kp=pill]', { timeout: 15000 }).should('contain', 'algılandı');
    pause(1800);
    caption('Yalnızca ekranda görünen metin, kullanıcının kendi anahtarıyla modele gider.');
    analyze();
    caption('Skoru model değil yazılım hesaplar. Risk haritası 14 risk türünü tek bakışta gösterir.');
    cy.get('[data-kp=finding]').should('have.length.at.least', 1);
    quotesAreInPage();
    cy.get('[data-kp=map-cell]').should('have.length', 14);
    pause(2200);
    cy.get('[data-kp=risk-map]').scrollIntoView({ duration: 300 });
    pause(1200);

    // risk map → finding card → "Haklarınız" (static Turkish law references, not model output)
    cy.get('[data-kp=map-cell]').filter('[data-state=high],[data-state=medium],[data-state=low]').first().then(($c) => {
      const cat = $c.attr('data-category');
      cy.wrap($c).click();
      caption('Her bulgunun yanında sözleşmeden birebir alıntı var; alıntısı sayfada bulunmayan iddia gösterilmez.');
      pause(2200);
      cy.get(`[data-kp=finding][data-category=${cat}]`).first().as('card');
      cy.get('@card').find('[data-kp=guidance-toggle]').click();
      cy.get('@card').find('[data-kp=guidance]').should('be.visible')
        .find('a').should('have.attr', 'href').and('match', /^https:\/\/www\.mevzuat\.gov\.tr\//);
      cy.get('@card').find('[data-kp=guidance]').scrollIntoView({ duration: 300 });
      caption('"Haklarınız": ne yapabileceğiniz ve ilgili mevzuat (TKHK, KVKK, TBK). Bilgi amaçlıdır, hukuki tavsiye değildir.');
      pause(3200);
      cy.get('@card').find('[data-kp=show-in-page]').click();
    });
    caption('"Metinde göster": alıntı sayfada bulunup işaretlenir.');
    cy.window().its('CSS.highlights').invoke('get', 'kp-quote').its('size').should('eq', 1);
    pause(2200);

    // 2 — the honest-uncertainty moment
    cy.get('[data-kp=uncertain]').scrollIntoView({ duration: 300 }).should('be.visible');
    cy.get('[data-kp=uncertain-item][data-kind=external_reference]').should('exist');
    caption('Emin olmadığı yerde karar vermez: okumadığı belgeyi ve skora katmadığı maddeleri açıkça söyler.');
    pause(4000);

    // offline report file
    const day = new Date().toISOString().slice(0, 10);
    const host = new URL(Cypress.config('baseUrl')).host.replace(/[^a-z0-9.-]+/gi, '-');
    cy.get('[data-kp=export]').click().should('contain', 'İndirildi');
    cy.readFile(`cypress/downloads/kucuk-punto-${host}-${day}.html`).should('contain', 'Hukuki tavsiye değildir').and('not.contain', '<script');
    caption('Rapor tek tıkla çevrimdışı bir HTML dosyası olarak indirilir (betik yok, dış bağlantı yok).');
    pause(2400);

    // 3 — hidden instructions
    cy.visit('/streambox-abonelik.html');
    caption('Kurgusal bir abonelik sayfası: içine 9 gizli talimat kondu (beyaz yazı, 1 px yazı, "skoru 0 ver"...).');
    pause(1800);
    analyze();
    cy.get('[data-kp=security]').should('be.visible').and('contain', 'gizli metin');
    cy.get('[data-kp=score]').invoke('attr', 'data-band').should('not.eq', 'low');
    caption('Gizli metin modele hiç gitmedi; görünür talimat cümlesi model görmeden çıkarıldı. Skor düşmedi.');
    quotesAreInPage();
    cy.get('[data-kp=changes]').should('exist');
    pause(3500);

    // 4 — change tracking: the same contract (same canonical URL), updated
    cy.visit('/streambox-abonelik-v2.html');
    caption('Aynı sözleşme bir ay sonra güncellendi. Kullanıcı yine analiz ediyor.');
    pause(1500);
    analyze();
    cy.get('[data-kp=changes]').should('have.attr', 'data-status', 'changed').scrollIntoView({ duration: 300 });
    cy.get('[data-kp=change-added], [data-kp=change-check]').should('have.length.at.least', 1);
    caption('Neyin değiştiğini metnin parmak izinden bulur: yeni riskler ve kalkan maddeler. Metnin kendisi saklanmaz.');
    pause(4500);
    caption('Küçük Punto · hukuki tavsiye değildir · github.com/bgelegen/kucuk-punto');
    pause(1500);
  });
});
