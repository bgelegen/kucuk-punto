// Risk taxonomy shared by the prompt, the validator, the baseline rules and the score.
// Weights are deliberately simple and documented in README ("Skor nasıl hesaplanır").

export const CATEGORIES = {
  auto_renewal: {
    tr: 'Otomatik yenileme',
    weight: 1.2,
    def: 'The subscription or charge renews/continues automatically unless the user cancels.',
    hint: 'İptal etmediğiniz sürece abonelik kendiliğinden yenilenir ve ücret alınmaya devam eder.'
  },
  cancellation_refund: {
    tr: 'İptal ve iade kısıtı',
    weight: 1.2,
    def: 'No refunds, no partial-period refunds, or cancellation is restricted or delayed.',
    hint: 'Ödediğiniz ücretin iadesi yapılmayabilir veya iptal kısıtlanmış olabilir.'
  },
  price_change: {
    tr: 'Fiyat değişikliği',
    weight: 1.0,
    def: 'The provider may change prices or fees.',
    hint: 'Hizmetin fiyatı sizin ayrıca onayınız alınmadan değiştirilebilir.'
  },
  unilateral_change: {
    tr: 'Tek taraflı değişiklik',
    weight: 1.0,
    def: 'The provider may change the terms or the service unilaterally; continued use counts as acceptance.',
    hint: 'Şirket koşulları tek taraflı değiştirebilir; kullanmaya devam etmeniz kabul sayılabilir.'
  },
  account_termination: {
    tr: 'Hesabın kapatılması',
    weight: 1.0,
    def: 'The provider may suspend or terminate the account at its discretion or without notice.',
    hint: 'Hesabınız şirketin takdirine bağlı olarak veya önceden bildirim yapılmadan kapatılabilir.'
  },
  data_sharing: {
    tr: 'Veri paylaşımı',
    weight: 1.4,
    def: 'Personal data is shared with, sold to or disclosed to third parties, partners or advertisers.',
    hint: 'Kişisel verileriniz üçüncü taraflarla, iş ortaklarıyla veya reklamcılarla paylaşılabilir.'
  },
  data_retention: {
    tr: 'Veri saklama',
    weight: 1.0,
    def: 'Data is kept for long or undefined periods, or after the account is deleted.',
    hint: 'Verileriniz uzun veya belirsiz bir süre, hatta hesabınızı sildikten sonra da saklanabilir.'
  },
  tracking_profiling: {
    tr: 'İzleme ve profilleme',
    weight: 1.2,
    def: 'Tracking (cookies, pixels, device identifiers), profiling, inferences or targeted advertising.',
    hint: 'Davranışlarınız izlenerek hakkınızda profil çıkarılabilir ve hedefli reklam gösterilebilir.'
  },
  content_license: {
    tr: 'İçeriğinize geniş lisans',
    weight: 1.1,
    def: 'User content is licensed to the provider broadly (worldwide, perpetual, irrevocable, royalty-free, sublicensable).',
    hint: 'Paylaştığınız içerikleri şirket geniş haklarla, ücretsiz ve süresiz kullanabilir.'
  },
  ai_training: {
    tr: 'Yapay zekâ eğitimi',
    weight: 1.2,
    def: 'User content or data may be used to train or improve machine-learning / AI models.',
    hint: 'İçerikleriniz veya verileriniz yapay zekâ modellerini eğitmek için kullanılabilir.'
  },
  liability_limit: {
    tr: 'Sorumluluk sınırlaması',
    weight: 0.9,
    def: 'The provider disclaims warranties or limits its liability for damages.',
    hint: 'Bir sorun olduğunda şirketin sorumluluğu sınırlıdır veya hiç yoktur.'
  },
  indemnification: {
    tr: 'Tazmin yükümlülüğü',
    weight: 0.9,
    def: 'The user must indemnify / hold harmless the provider.',
    hint: 'Şirkete karşı açılan bir davada masrafları sizin karşılamanız istenebilir.'
  },
  dispute_waiver: {
    tr: 'Tahkim ve toplu dava feragati',
    weight: 1.3,
    def: 'Mandatory arbitration, class-action waiver or jury-trial waiver.',
    hint: 'Anlaşmazlıkta mahkemeye gitme veya toplu dava açma hakkınız kısıtlanabilir.'
  },
  governing_law: {
    tr: 'Yabancı hukuk ve mahkeme',
    weight: 0.8,
    def: 'A specific (often foreign) governing law or exclusive court venue is imposed.',
    hint: 'Anlaşmazlıklar başka bir ülkenin hukukuna ve mahkemelerine tabi olabilir.'
  }
};

export const CATEGORY_IDS = Object.keys(CATEGORIES);

export const SEVERITY = { high: 3, medium: 2, low: 1 };
export const SEVERITY_IDS = Object.keys(SEVERITY);
export const SEVERITY_TR = { high: 'Yüksek', medium: 'Orta', low: 'Düşük' };

export const DOC_TYPES = ['terms_of_service', 'privacy_policy', 'subscription_terms', 'other_legal', 'not_legal'];
export const DOC_TYPES_TR = {
  terms_of_service: 'Kullanım koşulları',
  privacy_policy: 'Gizlilik politikası',
  subscription_terms: 'Abonelik şartları',
  other_legal: 'Diğer hukuki metin',
  not_legal: 'Hukuki metin değil'
};
