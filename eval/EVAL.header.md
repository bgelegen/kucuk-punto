# Değerlendirme (EVAL)

> Bu dosya `npm run eval` ve `npm run eval:injection` tarafından **üretilir**. Elle yazılan tek kısım bu giriş bölümüdür (`eval/EVAL.header.md`); tablolar `eval/results/*.json` dosyalarından gelir.

## Ne ölçülüyor?

Görev: bir sözleşme / politika metnindeki **tüketici aleyhine riskli maddeleri** doğru kategoriyle ve **metinden birebir alıntıyla** bulmak. Ölçülen sistem eklentinin kendisidir: `eval/run.js` eklentinin servis çalışanının çağırdığı fonksiyonu (`src/core/analyze.js`) aynı istemle, aynı şema doğrulamasıyla, aynı alıntı kontrolüyle ve aynı skorla çalıştırır. Değerlendirme için ayrı bir "kolay yol" yoktur.

## Altın standart nasıl hazırlandı?

- Her belge için **risk noktaları** çıkarıldı. Bir nokta, tek kategoride tek bir tüketici riskidir (ör. "zorunlu tahkim"). Aynı risk metinde birkaç yerde tekrarlanıyorsa noktanın birden fazla **kanıt parçası** olur.
- Bütün bir bölüm aynı riski anlatıyorsa (ör. Spotify'ın tahkim sözleşmesi) nokta bir **kapsam** (`scope`: bölümün ilk ve son paragrafı) taşır. Bölümdeki her paragraf o noktaya sayılır.
- Tartışmaya açık noktalar **isteğe bağlıdır** (`optional`). Yakalanırsa yanlış alarm sayılmaz, kaçırılırsa ceza yoktur.
- Makul alternatif kategoriler `also` ile kabul edilir (ör. "hesabın kapatılması" ↔ "tek taraflı değişiklik").
- `npm run eval:check-gold` her kanıt parçasının metinde birebir geçtiğini doğrular.

**Sınırlılık:** Etiketler tek kişi tarafından, yapay zekâ desteğiyle hazırlandı. İkinci bir etiketleyiciyle uyum (ör. Cohen's κ) ölçülmedi. Sonuçlar bu etiketlerin doğruluğu kadar güvenilirdir; dosyalar `eval/gold/*.json` içinde okunabilir hâlde ve itiraza açıktır.

## Eşleştirme ve metrikler

| Terim | Tanım |
|---|---|
| **Yakalanan** | Zorunlu bir noktaya en az bir bulgu eşleşti. Bulgunun kategorisi noktanınkiyle (veya `also`) aynı ve doğrulanmış alıntısı noktanın kanıt paragraflarından birinde. |
| **Kaçırılan** | Hiçbir bulgunun eşleşmediği zorunlu nokta. |
| **Yanlış alarm** | Hiçbir noktaya (isteğe bağlılar dâhil) eşleşmeyen bulgu. |
| **Tekrar** | Zaten yakalanmış bir noktaya eşleşen ikinci bulgu. Doğru da yanlış da sayılmaz, ayrıca raporlanır. |
| Kesinlik | (bulgu − yanlış alarm) / bulgu |
| Duyarlılık | yakalanan / zorunlu nokta |

Kanıtsız iddia zaten gösterilmediği için ölçülmez. Bunun yerine **kanıt doğrulama oranı** (modelin iddialarından kaçının alıntısı metinde bulundu) ayrıca raporlanır.

## Karşılaştırılan sistemler

1. **Kural motoru (LLM yok):** İngilizce ve Türkçe düzenli ifadeler (`src/core/baseline.js`). Hem temel çizgi hem de çalışma anında modelin çapraz kontrolü.
2. **LLM + Küçük Punto boru hattı:** Kendi anahtarınızla `npm run eval -- --provider gemini`. Ham model yanıtları `eval/results/raw/<etiket>/` altına kaydedilir. `--replay` ile API'ye gitmeden yeniden puanlanabilir.

## Genel sınırlılıklar

- 6 belge ve 62 zorunlu nokta küçük bir örneklem. Sonuçlar yön göstericidir, istatistiksel anlamlılık testi yapılmadı.
- Korpus İngilizce. Türkçe yalnızca prompt injection test sayfasında ve birim testlerinde var.
- LLM çıktısı sıcaklık 0'da bile tamamen deterministik değildir. Aynı model iki çalıştırmada farklı sonuç verebilir.
- Paragraf düzeyinde eşleştirme cömerttir: doğru paragraftan alıntı yapıp riski biraz farklı yorumlayan bir bulgu yakalanmış sayılabilir.
