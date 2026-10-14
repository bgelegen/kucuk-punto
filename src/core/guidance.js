// Static, deterministic guidance per risk category: a practical step the user can take, and the
// Turkish legislation the topic relates to. Information only, never advice: the model does not
// write this text, and it does not depend on the page. Shown under "Haklarınız ve ne yapabilirsiniz".
//
// Sources checked on 14 Oct 2026: 6502 m.52 (abonelik), m.68 (hakem heyeti), m.73/A (arabuluculuk);
// TBK 6098 m.115; MÖHUK 5718 m.26; KVKK 6698 m.5, 7, 8, 9, 11. See README › Mevzuat notları.

const MEVZUAT = (no, tertip = 5) => `https://www.mevzuat.gov.tr/mevzuat?MevzuatNo=${no}&MevzuatTur=1&MevzuatTertip=${tertip}`;
const TKHK = MEVZUAT(6502), KVKK = MEVZUAT(6698), TBK = MEVZUAT(6098), MOHUK = MEVZUAT(5718);

export const GUIDANCE = {
  auto_renewal: {
    tip_tr: 'Yenileme tarihini takviminize ekleyin ve iptal yolunu (hesap ayarları, e-posta) şimdiden not edin.',
    laws: [{ label: '6502 sayılı TKHK m.52 – abonelik sözleşmeleri ve fesih', url: TKHK }]
  },
  cancellation_refund: {
    tip_tr: 'Ödeme yapmadan önce iade ve iptal koşullarının ekran görüntüsünü saklayın.',
    laws: [{ label: 'Mesafeli Sözleşmeler Yönetmeliği – cayma hakkı ve istisnaları', url: TKHK }]
  },
  price_change: {
    tip_tr: 'Fiyat değişikliği e-postalarını takip edin; zam olduğunda aboneliği sonlandırıp sonlandıramayacağınıza bakın.',
    laws: [{ label: '6502 sayılı TKHK m.5 – haksız şartlar', url: TKHK }]
  },
  unilateral_change: {
    tip_tr: '"Koşullarımız güncellendi" bildirimlerini atlamayın. Küçük Punto, aynı sayfayı tekrar analiz ettiğinizde neyin değiştiğini gösterir.',
    laws: [{ label: '6502 sayılı TKHK m.5 – haksız şartlar', url: TKHK }]
  },
  account_termination: {
    tip_tr: 'Hesapta tuttuğunuz önemli verileri (fotoğraf, belge, satın alımlar) düzenli olarak dışa aktarın.',
    laws: [{ label: '6502 sayılı TKHK m.5 – haksız şartlar', url: TKHK }]
  },
  data_sharing: {
    tip_tr: 'Hesap ayarlarından reklam ve kişiselleştirme izinlerini kapatın; aydınlatma metninde verinin kimlere aktarıldığına bakın.',
    laws: [{ label: 'KVKK m.8 – aktarım, m.9 – yurt dışına aktarım', url: KVKK }, { label: 'KVKK m.11 – ilgili kişinin hakları', url: KVKK }]
  },
  data_retention: {
    tip_tr: 'Hesabınızı kapatırken verilerinizin silinmesini ayrıca ve yazılı olarak talep edin.',
    laws: [{ label: 'KVKK m.7 – silme, yok etme, anonim hâle getirme', url: KVKK }, { label: 'KVKK m.11 – ilgili kişinin hakları', url: KVKK }]
  },
  tracking_profiling: {
    tip_tr: 'Çerez tercihlerinden zorunlu olmayan çerezleri reddedin; uygulamalarda reklam kimliğini sıfırlayın.',
    laws: [{ label: 'KVKK m.5 – işleme şartları ve açık rıza', url: KVKK }]
  },
  content_license: {
    tip_tr: 'Başkasının kullanmasını istemediğiniz içerikleri yüklemeyin; lisansın hesabı silince sona erip ermediğine bakın.',
    laws: []
  },
  ai_training: {
    tip_tr: 'Ayarlarda "verilerim yapay zekâ eğitiminde kullanılmasın" gibi bir seçenek olup olmadığını kontrol edin.',
    laws: [{ label: 'KVKK m.5 – işleme şartları, m.11 – itiraz hakkı', url: KVKK }]
  },
  liability_limit: {
    tip_tr: 'Önemli işleriniz için bu hizmete tek başına güvenmeyin; yedek bir yol tutun.',
    laws: [{ label: 'TBK m.115 – ağır kusurdan sorumsuzluk anlaşması kesin hükümsüzdür', url: TBK }, { label: '6502 sayılı TKHK m.5 – haksız şartlar', url: TKHK }]
  },
  indemnification: {
    tip_tr: 'Hizmeti kullanırken başkalarının haklarını (telif, marka) ihlal edebilecek içeriklerden kaçının.',
    laws: [{ label: '6502 sayılı TKHK m.5 – haksız şartlar', url: TKHK }]
  },
  dispute_waiver: {
    tip_tr: 'Türkiye\'de tüketici uyuşmazlıklarında, tutara göre tüketici hakem heyetine veya arabuluculuğun ardından tüketici mahkemesine başvurma yolu vardır.',
    laws: [{ label: '6502 sayılı TKHK m.68 – tüketici hakem heyetleri', url: TKHK }, { label: '6502 sayılı TKHK m.73/A – arabuluculuk', url: TKHK }]
  },
  governing_law: {
    tip_tr: 'Yabancı hukuk seçilmiş olsa bile tüketici sözleşmelerinde, belirli koşullarda yaşadığınız ülkenin koruyucu kuralları saklı kalabilir.',
    laws: [{ label: 'MÖHUK (5718) m.26 – tüketici sözleşmeleri', url: MOHUK }]
  }
};

export const GUIDANCE_NOTE_TR = 'Bilgi amaçlıdır, hukuki tavsiye değildir. Kendi durumunuz için mevzuatın güncel metnine bakın veya bir uzmana danışın.';
