# 13 — Orchestration Efficiency & Anti-Repetition Redesign

> Status: **Faz 0–3 (backend) uygulandı ve test edildi**; kalan tek iş: Coverage UI (frontend) + 3→6'nın canlı doğrulaması
> Trigger: forensic analysis of session `test1` (`ab516225-3529-4611-b331-55ba26dcbc61`)
> Decisions locked: (1) hybrid operation signature, (2) DB-backed coverage, (3) süre sınırı yok — bitişe AI karar verir (see §6), brute = arka-plan ayrı agent (§7)

---

## 1. Problem & evidence (test1)

`test1` taradı `192.168.1.0/24` (gerçekte **3 canlı host**: .1, .2, .4), **~79.5 dk** çalıştı, operatör manuel durdurdu. Sonuç: **0 vuln, 0 exploit, 0 shell, 0 cred** — sadece host/servis keşfi.

| Belirti | Kanıt |
|--------|-------|
| **Tekrar** | 24 agent (16 scanner). `.4`'e 10 scanner, `.1`'e 4. Aynı `(host,port)` 2–3×: VNC:5900 ×3 (`enum`→`brute`→`security`), SMB:445 ×3 (`enum`→`version`→`enum`), UPnP:52869 ×2, web:443 ×3. `smb_enum_445` birebir 2 kez (16 dk arayla). |
| **Timeout israfı** | 24 agentin **10'u** wall-clock timeout (%42). scanner=600s, exploit=480s, webapp=300s. |
| **Brute, scanner lane'inde** | `ssh-brute`/`vnc-brute`, nmap NSE olarak 600s scanner bütçesinde → 0 sonuç, timeout. |
| **Kuyruk açlığı** | `spawn_max_parallel=3`. Agent'lar slot için **368s'ye kadar** bekledi → 368s kuyruk + 600s koşma = ~968s/agent. |
| **21 dk sessiz takılma** | Son agent 10:41:52'de bitti, oturum 11:03:07'de durduruldu; arada brain hiç event üretmedi. `agent.run()` global timeout'suz ([session_orchestration.py:61](../core/session_orchestration.py#L61)); brain'in kendi `reason()` çağrısının wall-clock cap'i yok. |

### Mimari kök neden
Sistem **"ne bulduğunu" izliyor, "ne denediğini" izlemiyor.** Brain her iterasyonda planı `MissionContext`'teki *bulgulardan* yeniden türetiyor; "şu servisi zaten enumerate ettim" diye bir kayıt olmadığı için aynı işi yeniden öneriyor. Tek koruma — dedup anahtarı `(agent_type, target, port, module, normalize(task_type))` + **60s** pencere ([brain_agent.py:734](../core/brain_agent.py#L734), [:774](../core/brain_agent.py#L774)) — iterasyonlar-arası (5–16 dk) tekrarları yakalayamıyor. `MissionContext`'in dataclass'larında ([mission_context.py](../core/mission_context.py)) hiçbir *plan/coverage* yapısı yok; hepsi bulgu.

---

## 2. Tasarım ilkeleri

1. **Eksen = bilgi kazancı (information gain), agent sayısı değil.** Tam kapsamlı pentest zaten çok agent açar; kötü olan, beklenen yeni bilgisi sıfır olan spawn'dır.
2. **Verimlilik, kapsamlılığı ASLA budamamalı.** Kazanç yalnızca *zero-information-gain tekrarı* yok etmekten gelir; meşru derinleşmeyi (Sınıf 3, §3) hiçbir koşulda engellemeyiz.
3. **Süre sınırı yok; sonlanma ilerlemeye dayanır.** Bu uygulama çeşitli görevler için tasarlandı; gerektiğinde saatlerce çalışmalı. Görev, yapacak yeni iş kalmayınca (doğal bitiş) veya uzun süre yeni bulgu üretmeyince (spinning) durur — saate göre değil. Tek bir op'un timeout'u toplam süreyi sınırlamaz. Sonlanma daima **graceful** (uçuştakini bitir + raporla), hard-kill değil.
4. **Brain tek yazar.** Coverage state'i de brain'in sahip olduğu tek-kaynak akışına bağlarız (DB + in-memory mirror), yeni bir senkronizasyon problemi yaratmadan.
5. **Hard-block ikincil, prompt birincil.** Asıl mekanizma: brain tekrarı *en baştan önermesin* (coverage tablosu prompt'a enjekte). Hard-block güvenlik ağı.

---

## 3. Görev taksonomisi (kapsamlılığı koruyan budamanın anahtarı)

Naif "aynı (host,port)'u tekrar tarama" kuralı kapsamlılığı kırar. Görevleri sınıflandırmadan dedup yapmayız:

| Sınıf | Örnek | Tekrar mantığı | Kural |
|------|------|------|------|
| **1. Characterization** (idempotent) | port/servis/versiyon tespiti, vuln NSE, banner | Değişmeyen hedefte aynı cevap | **(host,port,script-set) başına 1×.** test1'deki TÜM israf burada. |
| **2. Action / attempt** (stateful) | brute, exploit | Farklı wordlist/cred ile anlamlı ama sınırlı | **(host,port,teknik) başına deneme bütçesi.** Exploit'te var ([brain_agent.py:670](../core/brain_agent.py#L670)), brute'ta yok. |
| **3. Progressive** (legit derinleşme) | share enum → dosya listele → dosya çek | Önceki sonucu *tüketir*, "tekrar" değil | **Asla bloklama.** İmza spesifik alt-operasyonu içerir → daha derin op = farklı imza. |

Mevcut dedup üçünü serbest-metin task adı hash'leyerek **karıştırıyor.** Çözüm: `op_class`'ı (1/2/3) operasyon `kind`'ından türet; dedup/bütçe kuralı sınıfa göre uygulansın.

---

## 4. Bileşen 1 — Operation Signature (HİBRİT, karar #1)

**Hibrit = yapısal alan (öncelikli) + server-side parser (fallback).**

### 4a. Yapısal alan (LLM doldurabilir, opsiyonel)
`spawn_agent` / `spawn_agents_batch` params'ına opsiyonel `operation` eklenir:
```jsonc
"operation": {
  "kind": "service_enum|version_detect|vuln_scan|port_scan|web_scan|dir_bruteforce|cred_bruteforce|exploit|...",
  "port": 445,
  "scripts": ["smb-enum-shares", "smb-enum-users"]   // NSE / wordlist-id / MSF module
}
```
BRAIN_SOUL.md zaten `task_type=<agent>_<service>_<port>` konvansiyonunu ve dedup anahtarını öğretiyor ([BRAIN_SOUL.md:285](../souls/BRAIN_SOUL.md#L285)) → `operation`'ı soul'a eklemek küçük bir adım.

### 4b. Server-side parser/classifier (fallback — `operation` yoksa)
`finding_classifier`'ın **ML→LLM→rule→cache** desenini ([finding_classifier.py:151](../core/finding_classifier.py#L151)) yeni `OperationClassifier`'da yeniden kullan:
- `agent_type` → lane.
- `options.port` / `ports` / `task_type` suffix (`_445`) → port.
- `options.nse_scripts` / `module` / `scan_type` + `task_type` verb token'ı (`enum`/`version`/`vuln`/`scan`/`brute`/`dirb`/`exploit`) → `kind`. Küçük kontrollü sözlük + rule-based; belirsizse (nadir) LLM'e sor, cache'le.

### 4c. Kanonik imza
```
signature = f"{lane}:{kind}:{host}:{port}:{'+'.join(sorted(scripts)) or tool}"
op_class  = CLASS_OF[kind]   # characterization | action | progressive
```
Farklı verb/script → farklı imza → Sınıf-3 ilerlemeli işler doğal olarak korunur.

---

## 5. Bileşen 2 — Coverage Ledger (DB tablosu, karar #2)

`MissionContext`'e in-memory mirror + **kalıcı DB tablosu** (observable, UI'da gösterilebilir, fresh-clone'da migration ile gelir). Migration konvansiyonu: numaralı blok + `schema_migrations` ([db.py:70](../database/db.py#L70)).

```sql
-- migration vN
CREATE TABLE IF NOT EXISTS scan_coverage (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id     TEXT NOT NULL,
  signature      TEXT NOT NULL,          -- §4c kanonik imza
  op_class       TEXT NOT NULL,          -- characterization|action|progressive
  agent_type     TEXT, host TEXT, port INTEGER, kind TEXT, scripts TEXT,
  status         TEXT NOT NULL,          -- pending|running|done|empty|exhausted|failed
  attempts       INTEGER NOT NULL DEFAULT 0,
  findings_count INTEGER NOT NULL DEFAULT 0,
  agent_id       TEXT,                   -- son çalıştıran agent
  first_seen     REAL NOT NULL,
  last_update    REAL NOT NULL,
  UNIQUE(session_id, signature)
);
CREATE INDEX IF NOT EXISTS idx_coverage_session ON scan_coverage(session_id);
```

### Yaşam döngüsü (spawn anında karar)
`_spawn_agent` içindeki mevcut dedup bloğunu ([brain_agent.py:709-789](../core/brain_agent.py#L709)) coverage-lookup ile **değiştir/güçlendir**:
1. `signature, op_class` hesapla.
2. Lookup:
   - **characterization** + status ∈ {done, empty, running} → **BLOCK**, cache'lenmiş bulgu referansını + "already covered" döndür.
   - **action** → `attempts < budget` ise geç, değilse **BLOCK (exhausted)**.
   - **progressive** → imza zaten spesifik; imza-bazında asla bloklama.
   - **not found** → `running` olarak insert, devam.
3. Agent bitince: status (done/empty/failed), `findings_count`, `attempts++` güncelle.
4. **`force=true` kaçış kapısı**: operatör/brain bilinçli yeniden tarama isterse (hedef değişti vb.) blok atlanır — nadir, loglanır.

### Entegrasyon noktaları
- Spawn kararı: [brain_agent.py:709](../core/brain_agent.py#L709) (dedup bloğu).
- Agent-done güncelleme: `_handle_spawn_result` / child-done işleme ([brain_agent.py:288](../core/brain_agent.py#L288), child done path).
- Prompt enjeksiyonu: [_build_attack_path_section](../core/brain_agent.py#L2342) → "Coverage so far" tablosu ekle.
- Yeni `CoverageRepository` → [database/repositories.py](../database/repositories.py); migration → [database/db.py](../database/db.py).

---

## 6. Bileşen 3 — Bütçe modeli (karar #3, mühendislik seçimi)

Tümü `app_settings`'ten tunable; aşağıdakiler **default**. Felsefe: operasyona-duyarlı + kapsam-ölçekli + graceful.

### 6a. Operasyon-bazlı timeout (flat `{scanner:600,exploit:480,*:300}` yerine — [brain_agent.py:1241](../core/brain_agent.py#L1241))
| Operasyon | Timeout | Gerekçe |
|-----------|--------:|---------|
| ping sweep (/24) | 120s | `nmap -sn` /24'te bile hızlı |
| service scan (top-1000) | 90s | |
| **full TCP 1-65535 (tek host)** | **300s** | Dakikalar gereken **tek meşru** durum — ayrı bütçe |
| vuln NSE (tek servis) | 120s | |
| web dir/content scan | 180s | |
| exploit (modül başına) | 240s | 480→240; uzun tek-pencere yerine deneme bütçesi |
| cred brute | attempt-bounded, hard 300s tavan | Kendi lane'i (§7) |

### 6b. Deneme bütçesi (Sınıf-2)
`(host,port,technique)` başına: characterization=1, exploit=2 (mevcut `_max_exploit_retries` ile uyumlu). **Brute istisna** — sıkı bütçesi yok; arka planda kendi wordlist'i bitene kadar çalışır (§7). Brute'un sorunu *uzun sürmesi* değildi, *ön planda slot tutup brain'i bloklaması*ydı.

### 6c. Görev sonlanması — SAATE göre değil, İLERLEMEYE göre

> **Önemli ayrım:** §6a'daki op-bazlı timeout'lar **tek bir aracın** asılı kalmasını engeller; **toplam görev süresini sınırlamaz.** Görev, her biri kısa yüzlerce operasyonla **saatlerce** sürebilir (büyük kapsam bunu meşru kılar). Bu uygulama çeşitli görevler için tasarlandı; gerektiğinde saatlerce çalışmalı.

Bu yüzden **sabit mission wall-clock bütçesi YOK. Bitiş kararını AI (brain) verir.**

> **Operatör kararı:** "Görevin bitmesine AI karar vermeli — yapacak bir şey kalmadıysa, bulunabilecek tüm zafiyetler bulunduysa ve yeni denemeler fayda sağlamıyorsa dursun. Ama denenecek şeyler varsa denemeli."

Brain bu kararı şu girdilerle verir (mekanik kural değil, muhakeme):

1. **Doğal bitiş (birincil):** coverage ledger'da `pending`/denenmemiş op kalmadı **VE** uçuşta agent yok **VE** brain "yeni denemeler fayda sağlamaz" diye değerlendiriyor → `mission_done` çağır, sentez/rapor. Denenecek bir şey kaldıysa **bitmez** — denemeye devam eder. Süre sınırı yok: büyük kapsam worklist'i saatlerce dolu tutar.
2. **İlerleme-yok yedeği (yalnızca güvenlik ağı):** brain bunu fark edemezse, `idle_minutes` boyunca (default **45 dk**, tunable) yeni bulgu = 0 **VE** uçuşta lead yok → "spinning" kabul edilir, brain'e "topla/karar ver" sinyali gider. *İlerledikçe sayaç sıfırlanır.* Bu, brain'i durdurmaz; ona güçlü bir sonlandırma sinyali verir.
3. **Mutlak güvenlik tavanı:** yalnızca runaway'e karşı; default **kapalı** (∞), operatör görev başına ayarlayabilir. Açıksa graceful.

Yani kontrol AI'da: coverage + idle sinyalleri brain'in prompt'una beslenir, `mission_done` kararını brain verir. Mekanik backstop sadece brain tıkanırsa devreye girer.

### 6d. Brain `reason()` wall-clock timeout
Child'larda var, brain'de yok. **90s** (httpx 30s×3 ile uyumlu), 1 retry, sonra graceful degrade — 21 dk sessiz takılmanın çaresi. Sarmalama: [base_agent.py reason()](../core/base_agent.py) çağrısı.

### 6e. Yakınsama (convergence) durması
**K=2** ardışık batch'te (yeni bulgu = 0) **VE** coverage'da `pending` yüksek-değerli op yok **VE** uçuşta lead'li agent yok → fazı bitir. Çift koşul erken durmayı önler.

---

## 7. Bileşen 4 — Brute = arka planda çalışan ayrı `cred_attack` agent'ı

> **Operatör kararı:** "Brute-force'ların çok sınırı olmasına gerek yok; onlar arkaplanda çalışır, o sırada brain başka işlere devam etsin. Yeni bir agent olabilir."

En yüksek kaldıraçlı tek B değişikliği. test1'de brute'un sorunu *uzun sürmesi* değil, **ön plandaki scanner lane'inde slot tutup (cap=3) herkesi bloklaması ve 600s'de timeout olması**ydı. Çözüm — onları ön plandan tamamen çıkar:

- **Yeni `agent_type="cred_attack"`** (ayrı agent — operatör tercihi). `ssh-brute`/`vnc-brute`/hydra/medusa burada.
- **Arka plan / non-blocking:** brain bu agent'ı *fire-and-forget* başlatır, **`wait_for_agents` ile beklemez.** Brain hemen başka işe döner. Brute bitince/cred bulununca sonuç `MessageBus` üzerinden asenkron gelir, brain bir sonraki iterasyonda toplar.
- **Ayrı eşzamanlılık havuzu:** ana `spawn_max_parallel` slot'unu **tüketmez** (§8). LLM gate'ini de tüketmez — brute LLM-hafif, çoğunlukla araç (hydra/nmap) bekler.
- **Sıkı limit yok:** kendi wordlist'i bitene kadar çalışır; sadece sane bir tavan (örn. wordlist tek geçiş, hard 1h üst-sınır runaway'e karşı). ML success-gate opsiyonel sinyal olarak kalabilir ama *bloklamaz*.
- **Scanner'dan ayır:** scanner yalnızca `nmap_scan`+`report_finding`'e sahip ([scanner_agent.py:71](../core/agents/scanner_agent.py#L71)); op-classifier `cred_bruteforce` görürse scanner/`nmap --script *-brute` yolunu reddeder, `cred_attack`'e yönlendirir.

---

## 8. Bileşen 5 — Eşzamanlılığı kaynağa göre ayır

`spawn_max_parallel=3`, LLM-kuyruğu açlığı yüzünden düşürülmüş ([brain_agent.py:204](../core/brain_agent.py#L204) "test3 forensics"). Naif artırmak o sorunu geri getirir. Doğru çözüm: **kaynağı ayır** — scanner çoğunlukla nmap'i (ağ I/O) bekler, LLM'i değil.
- `spawn_max_parallel` → **6** (ön plan agent canlılığı: scanner/webapp/exploit).
- Ayrı **`llm_concurrency=3`** gate'i [llm_client.py](../core/llm_client.py)'de, tüm agent'lar arası paylaşımlı (token-bucket / semaphore).
- **`cred_attack` ayrı arka-plan havuzu** (`cred_attack_max_parallel`, default 2): ön plan slot'undan bağımsız. Brute'lar burada koşar, brain'i ve ana kuyruğu hiç bloklamaz (§7).
- Sonuç: çok scanner paralel nmap koşar, brute'lar arkada sessizce dener, LLM turları seri kalır → throughput artar, kuyruk açlığı geri gelmez.

---

## 9. Prompt değişiklikleri

[_build_attack_path_section](../core/brain_agent.py#L2342)'a kompakt **"Coverage so far"** tablosu: host → kapsanan op'lar + status (done/empty/exhausted) + kalan mission bütçesi. Brain checklist gibi okusun, tekrarı önermesin. Hard-block (§5) yalnızca güvenlik ağı.

---

## 10. Aşamalı yol haritası (düşük risk → yüksek)

| Faz | İçerik | Risk | Etki |
|-----|--------|------|------|
| **0 — Acil/izole** | brain `reason()` timeout (§6d); agent timeout'larını configurable yap + default'ları indir, full-port'u özel-koru (§6a) | Düşük, lokal | 21 dk takılma + timeout israfının çoğu gider |
| **1 — Çekirdek** | Operation Signature (§4) + Coverage Ledger (§5): DB+repo+spawn entegrasyonu+prompt enjeksiyonu; op-bazlı timeout'u signature'a bağla | Orta | **Tekrarı bitirir** |
| **2 — cred_attack + eşzamanlılık** ✅ | Yeni `cred_attack` arka-plan agent'ı (§7) + brute'u scanner→cred_attack reroute + ayrı havuz + wait("all")'dan hariç + 900s bütçe | Orta | Brute ön planı bloklamaz |
| **3 — Sonlanma + eşzamanlılık** ✅ | AI-driven `mission_done` (MISSION PROGRESS + idle nudge prompt'a) + opsiyonel hard backstop (default kapalı) + LLM-concurrency gate + spawn 3→6 | Düşük-orta | Self-terminate (spinning'de), throughput |
| 3b — Coverage UI | scan_coverage'ı attack-graph-canvas'ta göster (kalan tek iş, frontend) | Düşük | Operatör şeffaflığı |

> Brute'un scanner'dan çıkarılması bilinçli olarak **Faz 2'ye** ertelendi: önce `cred_attack` agent'ı var olmalı ki brute yeteneği bir an bile kaybolmasın.

---

## 13. Detaylı implementasyon planı (koda hazır)

### Faz 0 — item 1: brain `reason()` wall-clock timeout ✅ (uygulandı)
- **Dosya:** [core/base_agent.py:490](../core/base_agent.py#L490) — `action_dict = await self.reason()`.
- **Değişiklik:** `asyncio.wait_for(self.reason(), timeout=self._reason_timeout_s)` ile sar. `TimeoutError` yakala → mevcut `action_dict is None` yolu gibi davran (log + `emit_event("reason_timeout")` + kısa bekle + `continue`), ama **ardışık timeout sayacı** tut; `>= 3` olursa `AgentState.ERROR` ile çık (sonsuz takılmayı kes).
- **Ayar:** `self._reason_timeout_s` constructor kwarg, default **90** (brain için; child'lar zaten kendi wall-clock'unda). `app_settings.reason_timeout_seconds` ile override.
- **Kabul:** test1-benzeri stall'da agent 90s içinde event üretir; 3 ardışık timeout'ta graceful biter, asılı kalmaz.
- **Risk:** çok düşük — yalnızca yeni bir zaman sınırı ekler, mevcut başarı yolunu değiştirmez.

### Faz 0 — item 2: agent timeout'ları configurable + makul default ✅ (uygulandı)
- **Dosya:** yeni `_resolve_agent_timeout()` metodu, [core/brain_agent.py](../core/brain_agent.py) (`_run_child` içindeki eski `{"scanner":600,"exploit":480}.get(...)` yerine).
- **Muhafazakâr strateji (regresyon riski sıfır):** Bütçeyi YALNIZCA test1'de zaman yiyen işte kısalt — **dar (tek-host, tek-port/küçük-aralık) scanner** taramaları (çoğu `ssh-brute`/`vnc-brute` NSE, 600s'e kadar asılıydı). **Geniş** taramalar (subnet sweep, full `1-65535`, `top1000` keyword) **eski 600s'i korur** → meşru keşif (test1'de /24 taraması 455s sürmüştü) asla kesilmez.
- **Değerler (hepsi `app_settings` ile tunable):** dar scanner **240** (eski 600), geniş scanner **600** (`agent_timeout_scanner_broad`), exploit **360** (eski 480, hafif), default/webapp **300** (değişmedi — test1'deki webapp 300s timeout'ları muhtemelen meşru uzun dir-scan'di, kısaltmak riskliydi).
- **Kabul:** tek-port brute/enum NSE artık 240s'de kesilir (eskiden 600s); subnet/full-range taramalar 600s yaşar.
- **Risk:** düşük — sadece timeout süreleri; tekrar/coverage mantığına dokunmaz. Brute hâlâ scanner'da (Faz 2'de taşınacak) ama artık 600 yerine 240s yer.

### Faz 1 — Operation Signature + Coverage Ledger (çekirdek) ✅ (uygulandı + test edildi)
> [core/operation_signature.py](../core/operation_signature.py) · migration v25 + `CoverageRepository` · `_spawn_agent` coverage guard + `_run_child` mark_finished · "COVERAGE SO FAR" prompt + soul `operation` alanı. Testler: [test_operation_signature.py](../tests/test_operation_signature.py) (10) + `TestCoverageLedger` (2). Detaylar aşağıda.
1. **`core/operation_signature.py` (yeni):** `derive_signature(agent_type, target, task_type, options, operation?) -> (signature:str, kind:str, op_class:str, host, port, scripts)`. Yapısal `operation` varsa onu kullan; yoksa parser (verb sözlüğü + port suffix + nse/module). `OperationClassifier` → `finding_classifier` deseni (rule→cache→opsiyonel LLM).
2. **DB migration (yeni vN)** [database/db.py](../database/db.py): `scan_coverage` tablosu (§5 DDL).
3. **`CoverageRepository`** [database/repositories.py](../database/repositories.py): `upsert_running`, `mark_done/empty/failed`, `lookup(session, signature)`, `list_for_session`, `pending_high_value`.
4. **Spawn entegrasyonu** [core/brain_agent.py:709-789](../core/brain_agent.py#L709): mevcut dedup bloğunu coverage-lookup ile değiştir (§5 yaşam döngüsü). characterization+done/empty/running → block (cache döndür); action → attempt budget; progressive → asla block; `force=true` kaçış.
5. **Agent-done güncelleme** child-done yolunda → `mark_done/empty`.
6. **Prompt enjeksiyonu** [core/brain_agent.py:2342](../core/brain_agent.py#L2342): "Coverage so far" tablosu.
7. **`operation` alanı** soul'a [souls/BRAIN_SOUL.md](../souls/BRAIN_SOUL.md) + spawn şeması.
8. Op-bazlı timeout'u (item 2) artık `kind`'a bağla.
- **Kabul:** test1 senaryosunda aynı `(host,port,characterization)` ikinci kez **spawn edilmez**; prompt'ta coverage görünür. Sınıf-3 ilerlemeli op'lar geçer.

### Faz 2 — `cred_attack` arka-plan agent'ı + eşzamanlılık ✅ (uygulandı + test edildi)
1. ✅ **[core/agents/cred_attack_agent.py](../core/agents/cred_attack_agent.py) (yeni):** `hydra_bruteforce` + nmap-brute; credential finding yayınlar; registry'ye eklendi.
2. ✅ **Ayrı havuz + non-blocking:** `_cred_attack_semaphore` (`cred_attack_max_parallel=2`), `wait_for_agents("all")`'dan **hariç** (brain bloklanmaz), `_resolve_agent_timeout` → **900s** background bütçe.
3. ✅ **Reroute:** `_spawn_agent`'ta op-signature `kind==cred_bruteforce` ve `agent_type==scanner` → `cred_attack`'e yönlendirilir (`brute_rerouted` event). Coverage da artık cred_attack lane'inde.
4. ⏸ **Concurrency decoupling (ERTELENDİ):** `spawn_max_parallel` bilinçli olarak **3'te bırakıldı**. 3→6 yükseltmesi, LLM-queue starvation regresyonunu ("test3 forensics") önlemek için paylaşımlı `llm_concurrency` gate olmadan yapılmamalı. Ayrı cred_attack havuzu zaten ana havuzu brute'tan kurtardığı için asıl kazanım elde edildi; 3→6 + LLM-gate Faz 3'e bırakıldı.
- **Test:** `TestCredAttackLane` (4): reroute imzası, normal-tarama-reroute-edilmez, wait("all") cred_attack'i hariç tutar, 900s bütçe.

### Faz 3 — AI-driven sonlanma + eşzamanlılık ✅ (backend uygulandı + test edildi)
1. ✅ **Idle/progress sinyali** ([brain_agent.py](../core/brain_agent.py) `_update_progress_tracking` + `_build_progress_section`): system prompt'a "MISSION PROGRESS" (bulgu/coverage/aktif-agent/idle dakika). Idle eşiğinde (default 45 dk, tunable) + aktif foreground agent yokken escalating wrap-up nudge → **brain `mission_done`'a kendi karar verir**. cred_attack foreground sayımından hariç.
2. ✅ **Opsiyonel hard backstop** (`idle_hard_stop_minutes`, default **0=kapalı**): aşırı idle + agent yok → `_mission_done` (runaway son çare; tasarım §6c'ye uygun, default kapalı).
3. ✅ **LLM-concurrency gate** ([llm_client.py](../core/llm_client.py) `_get_llm_gate`, default 4, `TIRPAN_LLM_CONCURRENCY`): tüm agent LLM çağrıları arası paylaşımlı; agent sayısını LLM throughput'undan ayırır. Bununla **`spawn_max_parallel` 3→6** güvenli (queue starvation'ı gate önler).
4. ⏳ **Coverage UI** (kalan): scan_coverage'ı attack-graph-canvas'ta göster.
- **Test:** `TestMissionProgress` (6): idle tracking, nudge, backstop OFF/ON, cred_attack foreground'a sayılmaz, prompt'a ulaşma. LLM-gate concurrency cap testi.
- **Not:** 3→6 birim-test edildi ama **canlı çok-agent koşusuyla doğrulanmalı**; sorun olursa `spawn_max_parallel` ayarından geri alınır.

---

## 11. Riskler & kapsamlılık emniyetleri

| Risk | Emniyet |
|------|---------|
| Aşırı bloklama (meşru işi keser) | Block YALNIZCA characterization-class done/empty için. Sınıf-3 farklı imza → asla bloklanmaz. `force=true` kaçış kapısı. |
| Bayat coverage (host durumu değişti) | Yeni port → yeni imza → doğal olarak izinli. Characterization yalnızca *bilinen* (host,port) için kilitli. |
| Erken yakınsama | Çift koşul: yeni-bulgu=0 **VE** uçuşta lead yok. Yavaş meşru agent mission'ı canlı tutar. |
| Sonlanma meşru uzun görevi keser | Süre sınırı yok; durma yalnızca iş bitince ya da uzun süre 0 ilerleme olunca. İlerledikçe idle-sayaç sıfırlanır → saatlerce çalışabilir. full-TCP'nin ayrı uzun op-bütçesi var. |
| Op-classifier yanlış sınıflar | Hibrit: LLM yapısal `operation` verince parser devre dışı; belirsizlik cache'li LLM fallback'a gider; yanlış-block'lar `force` ile aşılır + loglanır. |

---

## 12. Açık kalemler (uygulama öncesi netleşecek)

- `op_class` ↔ `kind` haritasının tam sözlüğü (controlled vocabulary) — §3/§4 üzerinden kesinleştir.
- `cred_attack` ayrı agent_type mi, exploit-lane alt-kind mı? (§7) — implementasyonda karar.
- Coverage mirror'ın in-memory ↔ DB senkron stratejisi (write-through mu, periodic flush'a mı binsin — mevcut 30s flush var [session_orchestration.py:42](../core/session_orchestration.py#L42)).
- `app_settings` anahtar isimleri ve Settings → ML/Orchestration UI'da gösterim.

> **Sonraki adım:** Faz 0 ayrı ayrı PR'lanabilir (lokal, geri-alınabilir). Faz 1'in detaylı implementasyon spec'i (DB DDL + repo metodları + spawn-path diff + soul/prompt diff) onay sonrası yazılacak. Hiçbir kod bu doküman onaylanmadan değiştirilmeyecek.
