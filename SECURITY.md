# Güvenlik ve tehdit modeli

## Kim kime karşı?

| | |
|---|---|
| **Saldırgan** | Analiz edilen sayfanın sahibi. Sayfanın HTML'ini, CSS'ini ve JavaScript'ini tamamen kontrol eder. |
| **Saldırganın amacı** | Raporu yanıltmak (riskli maddeyi gizlemek, skoru düşürmek, "güvenli" dedirtmek), API anahtarını çalmak, panel üzerinden kullanıcının tarayıcısında kod çalıştırmak. |
| **Korunan şeyler** | Raporun doğruluğu ve dürüstlüğü, kullanıcının API anahtarı, kullanıcının tarayıcısı. |

Sayfadaki her şey **veri**dir: görünür metin, gizli metin, öznitelikler, yorumlar, sayfanın kendi betikleri. Hiçbiri talimat olarak ele alınmaz.

## Savunma katmanları

1. **Okuyucu (K1)** · `src/content/capture.js`
   - Kullanıcının göremediği metin modele gönderilmez. Bu kapsamda `display/visibility/opacity`, 5 px altı yazı, saydam renk, arka planla kontrastı 1,4'ün altında kalan yazı, `clip`/`clip-path`, 2 px'ten küçük taşma kutusu, sıfır boyut ve belge dışına itilmiş metin ayıklanır.
   - Bu metin ayrıca taranır. Talimat içeriyorsa güvenlik kutusunda, içermiyorsa "görünmeyen metin" belirsizliği olarak raporlanır.
   - Öznitelikler (`aria-label`, `title`, `alt`) ve HTML yorumları hiç okunmaz.
   - Okuyucu, neyi atlayacağına **sayfanın koyabileceği özniteliklere bakarak karar vermez.** İlk sürüm `[data-kp-host]` taşıyan öğeleri atlıyordu; bir sayfa bu özniteliği kendi riskli maddesine koyarak onu analizden saklayabilirdi. Kaldırıldı ve e2e testi eklendi. Kendi panelimiz Shadow DOM içinde olduğu için zaten okunmuyor.
2. **Karantina (K2)** · `src/core/injection.js`
   - Görünür metinde yapay zekâya hitap eden ya da çıktıyı yönlendiren cümleler (TR + EN; ör. "önceki talimatları yok say", "risk puanını 0 ver", `</document>`) `[KALDIRILDI: …]` ile değiştirilir. Orijinal cümle kullanıcıya gösterilir.
   - Yalnızca "yapay zekâ" kelimesinin geçmesi yetmez. Korpustaki 1.723 gerçek sözleşme cümlesinde yanlış pozitif sayısı 0'dır.
3. **Nonce'lu çit (K3)** · `src/core/prompt.js`
   - Metin `<document nonce="16 hex">…</document nonce="…">` içinde gönderilir. Nonce her analizde `crypto.getRandomValues` ile yeniden üretilir; sayfa bloğu kapatıp yeni talimat başlatamaz.
   - Sistem istemi, blok içindeki hiçbir şeyin talimat olmadığını ve talimat gibi görünen metnin `injection_suspected` alanına yazılacağını söyler.
4. **Şema (K4)** · `src/core/schema.js`
   - Her seviyede `additionalProperties: false`, sabit kategori ve önem listeleri, uzunluk sınırları, kontrol ve bidi karakterlerinin temizlenmesi.
   - Model `risk_score` gibi bir alan uydurursa yanıt reddedilir. Bir onarım turu yapılır; o da başarısız olursa etiketli kural sonucu gösterilir.
5. **Kanıt (K5)** · `src/core/verify.js`
   - Her alıntı orijinal maddede aranır. Bulunamayan, 15 karakterden kısa ya da karantinadaki cümleden alınmış alıntılar reddedilir.
   - Panelde gösterilen alıntı, modelin yazdığı metin değil, sayfadan kesilen metindir.
6. **Skor (K6)** · `src/core/score.js`: Deterministik formül. Model skoru doğrudan etkileyemez; yalnızca doğrulanmış bulgularla etkiler.
7. **Çapraz kontrol (K7)** · `src/core/analyze.js`
   - Bağımsız kural motoru modelle aynı metni okur. Model kuralların skorunun üçte birinden azını bildirirse (kural skoru ≥ 50) skor yerine **Belirsiz** gösterilir, rozet "?" olur.
   - Kuralların bulduğu ama modelin atladığı kategoriler ayrıca listelenir.
8. **Gösterim (K8)** · `src/content/panel.js`
   - Tüm veri `textContent` ve metin düğümleriyle eklenir. `scripts/build.js`, derlenen içerik betiğinde `innerHTML`, `insertAdjacentHTML` veya `document.write` varsa derlemeyi durdurur.
   - E2E testi `<img onerror>` içeren bir maddenin metin olarak gösterildiğini doğrular.
9. **Yetki (K9)**
   - Modelin hiçbir aracı yoktur.
   - Eklenti izinleri: yalnızca `storage` ve sabit sağlayıcı adresleri. Özel adresler için izin, kullanıcı "Kaydet"e bastığında istenir (`optional_host_permissions`).
   - `tabs`, `scripting`, `cookies`, `history` izinleri yoktur. Uzaktan kod yüklenmez; CSP `script-src 'self'`.
10. **Mesajlaşma**
    - Servis çalışanı yalnızca kendi içerik betiğinden gelen bağlantıları kabul eder (`sender.id` ve `sender.tab`).
    - Yükün biçimi ve boyutu sınırlıdır: 6.000 blok, blok başına 20.000, toplam 600.000 karakter.
    - API anahtarı servis çalışanında kalır; içerik betiğine ve sayfaya hiç gelmez.
11. **Rozet (K10):** Skor araç çubuğu rozetinde de gösterilir. Sayfa paneli taklit edebilir, rozeti değiştiremez.

## Bilinen sınırlılıklar

- **Filtreden kaçan görünür talimat + itaatkâr model:** Model yanıltılabilir. K7 bunu büyük bir çelişki olarak yakalar ve "Belirsiz" der. Küçük bir sapmayı (ör. 60 yerine 45) yakalamaz.
- **Panel sayfanın içindedir:** Açık Shadow DOM kullanılır (otomatik testler için). Sayfa betiği paneli okuyabilir veya üstüne sahte bir panel çizebilir. Rozet bunun için var. Daha güçlü bir seçenek Chrome `sidePanel` API'sidir; bu gelecek çalışmadır.
- **Gizlilik:** Görünür metin, seçilen sağlayıcıya gönderilir. Otomatik analiz varsayılan olarak kapalıdır; kullanıcı basmadan hiçbir şey gönderilmez.
- **Anahtar saklama:** `chrome.storage.local` şifresizdir. Bilgisayara erişimi olan biri anahtarı okuyabilir.
- **Kapsam dışı:** iframe, Shadow DOM ve PDF içindeki metin okunmaz.

## Bir açık bildirmek

GitHub'da issue açın: https://github.com/bgelegen/kucuk-punto/issues
