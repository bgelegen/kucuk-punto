// Regenerates EVAL.md from eval/results/*.json. Text outside the generated tables lives in eval/EVAL.header.md.
import fs from 'node:fs';
import path from 'node:path';
import { EVAL_DIR } from './lib/corpus.js';
import { CATEGORIES } from '../src/core/taxonomy.js';
import { isMain } from '../scripts/env.js';

const pct = v => v == null ? '—' : (v * 100).toFixed(1) + '%';
const esc = s => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');

function systemSection(r) {
  const title = r.engine.mode === 'rules' ? 'Kural motoru (LLM yok, temel çizgi)' : `${r.engine.mode === 'llm-replay' ? 'LLM (kayıtlı yanıtlardan yeniden puanlandı)' : 'LLM'}: ${r.engine.provider} · ${r.engine.model}`;
  const L = [];
  L.push(`### ${title}`, '', `Çalıştırma: \`${r.date.slice(0, 16).replace('T', ' ')}\` · etiket \`${r.tag}\``, '');
  L.push(`**Toplam:** kesinlik **${pct(r.precision)}**, duyarlılık **${pct(r.recall)}**, F1 **${pct(r.f1)}** · ${r.totals.findings} bulgu, ${r.totals.caught}/${r.totals.required} zorunlu nokta yakalandı, ${r.totals.false_alarms} yanlış alarm, ${r.totals.duplicates} tekrar, ${r.totals.optional_caught} isteğe bağlı nokta.`, '');
  L.push('| Belge | Skor | Bulgu | Yakalanan | Kaçırılan | Yanlış alarm | Tekrar | Kesinlik | Duyarlılık | Reddedilen iddia | Süre |', '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
  for (const d of r.docs) {
    L.push(`| ${d.service} ${d.document} | ${d.score} | ${d.counts.findings} | ${d.counts.caught}/${d.counts.required} | ${d.counts.missed} | ${d.counts.false_alarms} | ${d.counts.duplicates} | ${pct(d.precision)} | ${pct(d.recall)} | ${d.rejected} | ${(d.ms / 1000).toFixed(1)} sn |`);
  }
  L.push('');
  const errs = r.docs.filter(d => d.error);
  if (errs.length) L.push(`> Hata: ${errs.map(d => `${d.doc}: ${d.error.message}`).join('; ')}`, '');
  if (r.engine.mode !== 'rules') {
    const rej = r.docs.reduce((a, d) => { for (const [k, v] of Object.entries(d.rejected_reasons || {})) a[k] = (a[k] || 0) + v; return a; }, {});
    const accepted = r.totals.findings;
    const totalRej = Object.values(rej).reduce((a, b) => a + b, 0);
    L.push(`**Kanıt doğrulama:** modelin ürettiği ${accepted + totalRej} iddiadan ${accepted} tanesinin alıntısı metinde bulundu (${pct(accepted / Math.max(1, accepted + totalRej))}); ${totalRej} iddia reddedildi ${totalRej ? '(' + Object.entries(rej).map(([k, v]) => `${k}: ${v}`).join(', ') + ')' : ''}.`);
    L.push(`**Şema:** ${r.docs.filter(d => d.attempts === 1 && !d.schema_errors).length}/${r.docs.length} belgede ilk denemede geçerli JSON; onarım isteyen ${r.docs.filter(d => d.repaired).length}.`, '');
    const ex = r.docs.flatMap(d => (d.rejected_examples || []).map(x => ({ ...x, doc: d.doc }))).slice(0, 6);
    if (ex.length) {
      L.push('<details><summary>Reddedilen iddia örnekleri</summary>', '', '| Belge | Neden | Kategori | Modelin alıntısı |', '|---|---|---|---|');
      for (const x of ex) L.push(`| ${x.doc} | ${x.reason} | ${x.category || '—'} | ${esc(x.quote)} |`);
      L.push('', '</details>', '');
    }
  }
  L.push('<details><summary>Kaçırılan noktalar</summary>', '', '| Belge | Nokta | Kategori | Önem | Açıklama |', '|---|---|---|---|---|');
  for (const d of r.docs) for (const m of d.missed) L.push(`| ${d.doc} | ${m.id} | ${CATEGORIES[m.category].tr} | ${m.severity} | ${esc(m.note_tr)} |`);
  L.push('', '</details>', '');
  L.push('<details><summary>Yanlış alarmlar</summary>', '', '| Belge | Kategori | Alıntı |', '|---|---|---|');
  for (const d of r.docs) for (const f of d.false_alarms) L.push(`| ${d.doc} | ${CATEGORIES[f.category].tr} | ${esc(f.quote)} |`);
  L.push('', '</details>', '');
  return L.join('\n');
}

function datasetSection() {
  const idx = JSON.parse(fs.readFileSync(path.join(EVAL_DIR, 'corpus/index.json'), 'utf8'));
  const L = ['## Veri: 6 gerçek belge', '', 'Metinler [Open Terms Archive](https://opentermsarchive.org/) projesinin arşivinden, sabit bir commit\'ten alındı (`scripts/import-corpus.mjs`). Böylece herkes aynı metni tekrar üretebilir.', '',
    '| Belge | Tür | Karakter | Zorunlu nokta | İsteğe bağlı | Kaynak |', '|---|---|---:|---:|---:|---|'];
  let req = 0, opt = 0;
  for (const d of idx) {
    const pts = JSON.parse(fs.readFileSync(path.join(EVAL_DIR, 'gold', d.id + '.json'), 'utf8')).points;
    const r = pts.filter(p => !p.optional).length, o = pts.length - r; req += r; opt += o;
    L.push(`| ${d.service} ${d.document} | ${d.type} | ${d.chars.toLocaleString('tr-TR')} | ${r} | ${o} | [OTA](${d.source}) |`);
  }
  L.push(`| **Toplam** | | | **${req}** | **${opt}** | |`, '');
  return L.join('\n');
}

function categorySection(runs) {
  const L = ['### Kategori bazında duyarlılık', '', '| Kategori | Zorunlu nokta | ' + runs.map(r => r.engine.mode === 'rules' ? 'Kurallar' : r.engine.model).join(' | ') + ' |', '|---|---:|' + runs.map(() => '---:').join('|') + '|'];
  const gold = {};
  for (const r of runs) for (const d of r.docs) for (const id of d.caught) (gold[r.tag] ||= new Set()).add(d.doc + ':' + id);
  const pointsByCat = {};
  const first = runs[0];
  for (const d of first.docs) {
    const all = JSON.parse(fs.readFileSync(path.join(EVAL_DIR, 'gold', d.doc + '.json'), 'utf8')).points.filter(p => !p.optional);
    for (const p of all) (pointsByCat[p.category] ||= []).push(d.doc + ':' + p.id);
  }
  for (const [cat, ids] of Object.entries(pointsByCat).sort((a, b) => b[1].length - a[1].length)) {
    L.push(`| ${CATEGORIES[cat].tr} | ${ids.length} | ` + runs.map(r => { const c = ids.filter(i => gold[r.tag]?.has(i)).length; return `${c}/${ids.length}`; }).join(' | ') + ' |');
  }
  return L.join('\n') + '\n';
}

export function writeEvalMarkdown() {
  const dir = path.join(EVAL_DIR, 'results');
  const runs = fs.readdirSync(dir).filter(f => f.endsWith('.json') && f !== 'injection.json').map(f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')))
    .sort((a, b) => (a.engine.mode === 'rules' ? -1 : 1) - (b.engine.mode === 'rules' ? -1 : 1) || a.tag.localeCompare(b.tag));
  const header = fs.readFileSync(path.join(EVAL_DIR, 'EVAL.header.md'), 'utf8');
  const parts = [header.trim(), '', datasetSection(), '## Sonuçlar', ''];
  if (runs.length > 1) {
    parts.push('| Sistem | Kesinlik | Duyarlılık | F1 | Bulgu | Yanlış alarm |', '|---|---:|---:|---:|---:|---:|');
    for (const r of runs) parts.push(`| ${r.engine.mode === 'rules' ? 'Kurallar' : r.engine.model} | ${pct(r.precision)} | ${pct(r.recall)} | ${pct(r.f1)} | ${r.totals.findings} | ${r.totals.false_alarms} |`);
    parts.push('');
  }
  if (!runs.some(r => r.engine.mode !== 'rules')) {
    parts.push('> **LLM sonuçları henüz yok.** Kendi anahtarınızla `npm run eval -- --provider gemini` çalıştırın; tablo bu dosyaya otomatik eklenir. Ayrıntı: README › Değerlendirme.', '');
  }
  for (const r of runs) parts.push(systemSection(r));
  if (runs.length) parts.push(categorySection(runs));
  const inj = path.join(dir, 'injection.json');
  if (fs.existsSync(inj)) parts.push(injectionSection(JSON.parse(fs.readFileSync(inj, 'utf8'))));
  fs.writeFileSync(path.join(EVAL_DIR, '..', 'EVAL.md'), parts.join('\n') + '\n');
}

function injectionSection(j) {
  const L = ['## Prompt injection testi', '', '> Soru: *Sayfaya gizli talimat koyduğunuzda sisteminiz ne yapıyor?*', '', j.intro_tr, ''];
  L.push('### 1. Hangi okuyucu saldırı metnini modele taşıyor?', '', j.reader_comparison.intro_tr, '');
  L.push('| Saldırı | page-agent okuyucusu | `innerText` | Küçük Punto yakalama | Küçük Punto → modele giden metin |', '|---|---|---|---|---|');
  for (const r of j.reader_rows) {
    const m = v => v === 'yes' ? '⚠️ Evet' : v === 'partial' ? '⚠️ Kısmen' : 'Hayır';
    L.push(`| ${r.id} · ${esc(r.technique_tr)} | ${m(r.page_agent)} | ${m(r.inner_text)} | ${r.ours_capture === 'yes' ? 'Evet (görünür metin)' : r.where === 'gizli' ? 'Hayır → gizli metin olarak raporlandı' : 'Hayır (öznitelik/yorum okunmaz)'} | ${m(r.ours_model)} |`);
  }
  const leaks = j.reader_rows.filter(r => r.page_agent !== 'no').length;
  L.push('', `page-agent okuyucusu 9 saldırının **${leaks}** tanesini (tamamen ya da kısmen) LLM'e gidecek metne taşıyor; Küçük Punto'da modele ulaşan saldırı sayısı **${j.reader_rows.filter(r => r.ours_model !== 'no').length}**. ATK-3 görünür olduğu için yakalanıyor, ama K2 karantina katmanı onu model görmeden çıkarıyor.`, '');

  L.push('### 2. Model talimata uyarsa ne olur? (ablasyon)', '',
    '"Saf" boru hattı = page-agent metni → düz istem → modelin JSON\'u olduğu gibi kabul (skoru model verir). "Küçük Punto" = tüm katmanlar açık. Aynı sayfa, aynı model. Modeller deterministik taklitlerdir: **helpful** düzgün çalışır (bir de uydurma alıntı ekler), **obedient** okuduğu her talimata uyar (en kötü durum), **obedient-score** buna ek olarak `risk_score: 0` alanı uydurur.', '',
    '| Sayfa | Model | Saf: skor / gösterilen bulgu | Küçük Punto: skor / bulgu | Küçük Punto ne yaptı |', '|---|---|---:|---:|---|');
  for (const x of j.matrix) {
    const what = x.ours.conflict ? 'Skor yerine **Belirsiz** gösterdi (model ' + x.ours.score + ', kurallar ' + x.ours.rules_score + ')'
      : x.ours.engine.startsWith('kurallar') ? 'Model yanıtı şemaya uymadı → reddedildi, etiketli kural sonucu'
      : x.ours.rejected ? `${x.ours.rejected} uydurma iddia reddedildi; ${x.ours.hidden_suspicious + x.ours.quarantined} saldırı uyarısı` : 'Normal';
    L.push(`| ${esc(x.variant_tr)} | ${x.model} | ${x.naive.score ?? '—'} / ${x.naive.shown ?? '—'} | ${x.ours.shown_score} / ${x.ours.shown} | ${what} |`);
  }
  L.push('', '**Okuma:** Gizli saldırılar saf boru hattında itaatkâr modeli skoru 0\'a indirmeye yetiyor; Küçük Punto\'da model bu metni hiç görmediği için skor değişmiyor. Filtreden kaçan görünür bir talimat ve tamamen itaatkâr bir model bir araya gelirse model yine kandırılıyor. Bu durumda sistem yanlış bir "düşük risk" göstermek yerine, bağımsız kural motoruyla çelişkiyi fark edip skoru **Belirsiz** olarak gösteriyor. Bu bir sınırlama ve raporda açıkça yazıyor.', '');

  L.push('### 3. Sonraki katmanlara hedefli saldırılar', '', '| Saldırı | Beklenen | Sonuç |', '|---|---|---|');
  const T = {
    'fabricated-quote': ['Model metinde olmayan bir alıntı uyduruyor', 'Alıntı doğrulaması reddeder'],
    'quote-from-quarantine': ['Model karantinadaki talimat cümlesini "kanıt" diye alıntılıyor', 'Reddedilir, bulgu oluşmaz'],
    'fence-escape': ['Sayfa `</document nonce=…>` yazarak veri bloğunu kapatmaya çalışıyor', 'Karantina + her çalıştırmada rastgele 64-bit nonce'],
    'model-sets-score': ['Model `risk_score: 0` alanı ekliyor', 'Şema (additionalProperties: false) reddeder; skoru yazılım hesaplar']
  };
  for (const t of j.targeted) L.push(`| ${T[t.id][0]} | ${T[t.id][1]} | ${t.ok ? '✅ Geçti' : '❌ Kaldı'} |`);
  const fp = j.filter_false_positives;
  L.push('', `**Karantina filtresinin yanlış pozitifi:** değerlendirme korpusundaki 6 gerçek belgenin ${fp.sentences} cümlesinden ${fp.flagged} tanesi talimat sanıldı. (İlk sürümde "yapay zekâ" kelimesi geçen 4 Grammarly cümlesi yanlışlıkla çıkarılıyordu; desen "yapay zekâya hitap eden" cümlelerle sınırlandırıldı.)`, '');

  const real = Object.values(j.real_runs || {});
  L.push('### 4. Gerçek modelle', '');
  if (!real.length) L.push('> Henüz çalıştırılmadı. Kendi anahtarınızla: `node eval/injection.js --provider gemini`', '');
  for (const run of real) {
    L.push(`**${run.provider} · ${run.model}** (${run.date.slice(0, 10)})`, '', '| Sayfa | Saf: skor / bulgu | Küçük Punto: skor / bulgu | Modelin kendisi enjeksiyon bildirdi | Belirsiz uyarısı |', '|---|---:|---:|---:|---|');
    for (const r of run.rows) L.push(`| ${esc(r.variant_tr)} | ${r.naive.score ?? r.naive.error} / ${r.naive.shown ?? '—'} | ${r.ours.shown_score} / ${r.ours.shown} | ${r.ours.model_reported} | ${r.ours.conflict ? 'Evet' : 'Hayır'} |`);
    L.push('');
  }
  return L.join('\n');
}

if (isMain(import.meta.url)) writeEvalMarkdown();
