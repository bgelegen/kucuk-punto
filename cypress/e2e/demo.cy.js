// Demo video (≤ 90 s): one happy path on a real ToS, one moment where the system honestly says
// what it does not know, and the hidden-instruction page. Assertions check the guarantees, not
// specific model outputs (a real model's wording varies run to run).

const caption = (text) => cy.document({ log: false }).then((doc) => {
  // the caption lives in its own shadow root, so the analysis never reads it
  let host = doc.getElementById('cy-caption');
  if (!host) {
    host = doc.createElement('div');
    host.id = 'cy-caption';
    doc.documentElement.appendChild(host);
    const root = host.attachShadow({ mode: 'open' });
    const style = doc.createElement('style');
    style.textContent = `.c{position:fixed;left:24px;bottom:24px;max-width:780px;z-index:2147483646;background:rgba(22,38,61,.94);color:#fff;
      font:600 19px/1.35 system-ui,-apple-system,"Segoe UI",sans-serif;padding:14px 18px;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,.3)}`;
    const box = doc.createElement('div'); box.className = 'c';
    root.append(style, box);
  }
  host.shadowRoot.querySelector('.c').textContent = text;
});

const pause = (ms) => cy.wait(ms, { log: false });

// every quote shown in the panel must exist verbatim in the page the user is looking at
const quotesAreInPage = () => cy.document().then((doc) => {
  const page = doc.body.innerText.replace(/\s+/g, ' ');
  cy.get('[data-kp=finding] [data-kp=quote]').each(($q) => {
    const t = $q.text();
    const quote = t.slice(t.indexOf('“') + 1, t.lastIndexOf('”')).replace(/\s+/g, ' ');
    expect(page, 'alıntı sayfada var').to.include(quote);
  });
});

describe('Küçük Punto', () => {
  it('gerçek bir sözleşmeyi kanıtla raporlar, emin olmadığını söyler, gizli talimata kanmaz', () => {
    // 1 — happy path on a real terms page
    cy.visit('/netflix-tos.html');
    caption('Gerçek bir sözleşme açıldı: Netflix Kullanım Koşulları (Open Terms Archive)');
    cy.get('[data-kp=pill]', { timeout: 15000 }).should('be.visible').and('contain', 'algılandı');
    pause(1500);
    cy.get('[data-kp=pill]').click();
    cy.get('[data-kp=disclaimer]').should('be.visible').and('contain', 'Hukuki tavsiye değildir');
    cy.get('[data-kp=analyze]').click();
    caption('Yalnızca görünür metin modele gider. Yanıt JSON şemasından ve alıntı kontrolünden geçer.');
    cy.get('[data-kp=score]', { timeout: 75000 }).should('be.visible');
    caption('Skoru model değil yazılım hesaplar. Her riskli maddenin yanında orijinal alıntısı var.');
    cy.get('[data-kp=finding]').should('have.length.at.least', 1);
    quotesAreInPage();
    pause(2500);
    cy.get('[data-kp=finding]').first().find('[data-kp=show-in-page]').click();
    caption('"Metinde göster": alıntı sayfada birebir bulunup işaretlenir.');
    cy.window().its('CSS.highlights').invoke('get', 'kp-quote').its('size').should('eq', 1);
    pause(2500);

    // 2 — the honest-uncertainty moment
    cy.get('[data-kp=uncertain]').scrollIntoView({ duration: 400 }).should('be.visible');
    cy.get('[data-kp=uncertain-item][data-kind=external_reference]').should('exist');
    caption('Emin olmadığı yerde karar vermez: okumadığı belgeyi ve skora katmadığı maddeleri açıkça söyler.');
    pause(4000);

    // 3 — hidden instructions
    cy.visit('/streambox-abonelik.html');
    caption('Bu sayfaya 9 gizli talimat kondu: beyaz yazı, 1 px yazı, ekran dışı metin, "skoru 0 ver"...');
    pause(1500);
    cy.get('[data-kp=pill]').click();
    cy.get('[data-kp=analyze]').click();
    cy.get('[data-kp=score]', { timeout: 75000 }).should('be.visible');
    cy.get('[data-kp=security]').should('be.visible').and('contain', 'gizli metin');
    caption('Gizli metin modele hiç gitmedi; görünür talimat cümlesi model görmeden çıkarıldı. Skor düşmedi.');
    cy.get('[data-kp=score]').invoke('attr', 'data-band').should('not.eq', 'low');
    pause(3500);
    cy.get('[data-kp=uncertain-item][data-kind=hidden_content]').scrollIntoView({ duration: 400 }).should('be.visible');
    caption('Kapalı "Kampanya" bölümünü okumadığını da söyler: görmediğiniz metin analize alınmaz.');
    quotesAreInPage();
    pause(3500);
    caption('Küçük Punto · hukuki tavsiye değildir · github.com/bgelegen/kucuk-punto');
    pause(1500);
  });
});
