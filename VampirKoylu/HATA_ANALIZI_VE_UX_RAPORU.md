# 🧛‍♂️ Vampir Köylü — Kapsamlı Hata Analizi ve UX İyileştirme Raporu

**Tarih:** 28 Mart 2026  
**İncelenen Dosyalar:** `app.js`, `network.js`, `roles.js`, `ui.js`, `scene.js`, `style.css`, `game.html`, `index.html`, `game_logic.txt`, `shared/shared.js`, `shared/login.js`

---


## 🔴 KRİTİK HATALAR (Crash / Güvenlik / Çalışmayı Engeller)

### BUG-01: `scene.js` → `getPlayerScreenCoords()` — CRASH
**Dosya:** `scene.js` satır ~445  
**Şiddet:** 🔴 Kritik (Runtime Error)

```js
// HATALI:
const playerPos = this.playerModels[playerId].mesh.position.clone();

// DOĞRU:
const playerPos = this.playerModels[playerId].meshGroup.position.clone();
```

`PlayerModel` sınıfında `.mesh` diye bir property tanımlanmamış. Doğru property `.meshGroup`. Bu metot `ui.js`'deki `onPlayerSelected()` fonksiyonundan her oyuncu seçiminde çağrılıyor. Herhangi bir oyuncu 3D sahnede birine tıkladığında `TypeError: Cannot read properties of undefined (reading 'position')` hatası alınır ve aksiyon paneli düzgün konumlanamaz.

**Etki:** Oyuncu seçimi sırasında JavaScript hatası. Action panel'in oyuncunun yanında konumlanması çalışmaz.

---

### BUG-02: `game.html` → Action Panel Çift `display` Çakışması
**Dosya:** `game.html`  
**Şiddet:** 🔴 Kritik (UI Kırılması)

```html
<!-- HATALI: -->
<div id="action-panel" class="hidden" 
     style="display: none; position: absolute; ... display: flex; ...">

<!-- İki farklı display değeri aynı inline style'da: -->
<!-- display: none  (ilk tanım) -->
<!-- display: flex   (ikinci tanım — tarayıcı bunu kullanır) -->
```

Tarayıcı aynı property'nin son tanımını alır: `display: flex`. Ama `.hidden` class'ı `display: none` uygular. Bu çakışma, `ui.js`'de `els.game.actionPanel.classList.add('hidden')` ile panel gizlenmeye çalışıldığında specificity sorunlarına yol açar. Özellikle `shared.css`'deki `.hidden` tanımı `!important` içermiyorsa panel gizlenmez.

Ayrıca `ui.js`'de panel hem `classList.add('hidden')` hem `style.display = 'flex'` ile kontrol ediliyor — bu tutarsız yaklaşım beklenmedik görünürlük durumlarına neden olur.

**Düzeltme:** Inline style'dan tüm `display` tanımlarını kaldır. Görünürlük kontrolünü sadece CSS class veya sadece JS `style.display` ile yap.

---

### BUG-03: Host Tüm Rolleri Konsoldan Görebilir (Güvenlik)
**Dosya:** `app.js`  
**Şiddet:** 🟠 Önemli (Oyun Bütünlüğü)

`broadcastState()` fonksiyonunda client'lara sanitize edilmiş state gönderiliyor (rolleri siliniyor), ama host kendi `updateUIForState()` çağrısını doğrudan global `gameState` üzerinden yapıyor. Host tarayıcı konsoluna `gameState.players` yazarak tüm oyuncuların rollerini görebilir:

```js
// Konsolda:
Object.values(gameState.players).forEach(p => console.log(p.name, p.role));
```

Bu P2P mimarinin doğal bir sınırlaması, ancak:
- Host UI'da kendi dışındaki rolleri göstermemeli (zaten göstermiyor ✓)
- Console erişimi engellenemez ama en azından `gameState`'i global scope'dan kaldırıp closure içine almak erişimi zorlaştırır

---

## 🟠 OYUN MEKANİĞİ / MANTIK HATALARI

### BUG-04: Deli Rolü — Oyuncuya "Deli" Olarak Gösteriliyor
**Dosya:** `app.js` (rol ataması), `ui.js` (render)  
**Şiddet:** 🔴 Kritik (Oyun mekaniği tamamen bozuk)

`game_logic.txt`'ye göre: *"Deli kendini Gözcü, İzci veya Dedektif gibi zanneder. Ekranında sahte rolü yazar."*

Ancak kodda:
1. `assignRoles()` → oyuncuya `role: 'DELI'` atanıyor
2. `broadcastState()` → client'a kendi rolü `'DELI'` olarak gönderiliyor
3. `ui.js` → `ROLES[myPlayer.role].name` = "Deli" gösteriliyor
4. `fakeRole` sadece `resolveNight()` içinde server-side kullanılıyor, client'a hiç gönderilmiyor

**Sonuç:** Deli olan oyuncu rolünün "Deli" olduğunu anında görüyor. Oyunun temel mekaniğini tamamen bozuyor.

**Düzeltme:**
- Client'a gönderilen state'te Deli'nin rolünü sahte rolüyle değiştir
- `broadcastState()`'de: `if (p.role === 'DELI') clientP.role = p.fakeRole || 'GOZCU'`
- Deli öldüğünde veya oyun bittiğinde gerçek rolü göster

---

### BUG-05: Uyurgezer — Üçlü Çarpışma İmplemente Edilmemiş
**Dosya:** `app.js` → `resolveNight()`  
**Şiddet:** 🟠 Orta

`game_logic.txt`: *"Uyurgezer gece Seri Katil'in evine giderse ve o gece Vampirler de Seri Katil'in evine saldırı düzenlerse, Uyurgezer ölür."*

Mevcut kodda bu senaryo eksik:
```js
else if (ugTarget === skId) {
    // Sadece SK evde ise kontrol var
    if (actions[skId] === 'skip' && !protectedPlayers.has(ugId)) {
        deaths.push({ id: ugId, killer: 'SERI_KATIL' });
    }
    // EKSİK: vampTarget === skId durumu kontrol edilmiyor
}
```

**Düzeltme:** `vampTarget === skId` koşulunu ekle:
```js
else if (ugTarget === skId) {
    if (actions[skId] === 'skip' && !protectedPlayers.has(ugId)) {
        deaths.push({ id: ugId, killer: 'SERI_KATIL' });
    } else if (vampTarget === skId && !protectedPlayers.has(ugId)) {
        deaths.push({ id: ugId, killer: 'VAMPIR' }); // Vampirler boş evde UG'yi bulur
    }
}
```

---

### BUG-06: Oylama ve Yargılama Fazlarında Timer Yok
**Dosya:** `app.js`  
**Şiddet:** 🔴 Kritik (Oyun sonsuz takılabilir)

- `VOTING` fazı: Timer başlatılmıyor. Tüm hayatta kalan oyuncuların oy vermesi bekleniyor. Bir oyuncu oy vermezse oyun **sonsuza kadar takılır**.
- `JUDGEMENT` fazı: Aynı sorun. `checkJudgementEnd()` tüm oyuncuları bekliyor.
- `DEFENSE` fazı: 20 sn timer ✓ (doğru)
- `DAY_DISCUSSION` fazı: `discussionTime` timer ✓ (doğru)

**Düzeltme:** Her iki faz için de timeout ekle:
```js
// VOTING fazına geçerken:
startTimer(60, () => {
    // Timeout: oy vermeyenler 'skip' sayılır
    resolveVoting();
});

// JUDGEMENT fazına geçerken:
startTimer(30, () => {
    resolveJudgement();
});
```

---

### BUG-07: Vampir İzcisi — Çifte İşlem
**Dosya:** `app.js` → `resolveNight()`  
**Şiddet:** 🟡 Düşük-Orta

Vampir İzcisi iki ayrı bölümde işleniyor:

**Bölüm 5 (~satır 290):** Vampir saldırısına ek olarak `visit()` çağrılıyor
```js
let vampIzcisiId = Object.keys(actions).find(aid => 
    gameState.players[aid]?.role === 'VAMPIR_IZCISI' ...);
if (vampIzcisiId && ...) {
    visit(vampIzcisiId, actions[vampIzcisiId], true); // immune visit
}
```

**Bölüm 8 (~satır 340):** Info role olarak tekrar işleniyor
```js
else if (p.role === 'IZCI' || p.role === 'VAMPIR_IZCISI' || ...) {
    let isVampIzci = p.role === 'VAMPIR_IZCISI';
    if (isVampIzci) success = true; // Koşulsuz başarı
    // Rol bilgisi alıyor
}
```

Bu çifte visit hem `visits[]` listesini kirletebilir (Gözcü iki kez görür) hem de gereksiz animasyon üretir.

---

### BUG-08: Doktor — lastHealed Sıfırlama Mantığı
**Dosya:** `app.js` → `resolveNight()`  
**Şiddet:** 🟡 Düşük

```js
Object.values(gameState.players).forEach(p => { 
    if(p.role === 'DOKTOR' && !p.triedHeal) p.lastHealed = null; 
});
```

Eğer Doktor bloklanırsa (`blockedPlayers` set'inde), `visit()` `false` döner ve `triedHeal` `true` olmaz... Hayır, aslında `triedHeal = true` visit'ten önce set ediliyor. Yani Doktor bloklanmış olsa bile `triedHeal = true` olur ve `lastHealed` güncellenmez. Bu da bir sonraki gece aynı kişiyi tekrar seçememesine yol açar — doğru davranış olmalı ama kasıtlı olup olmadığı belirsiz.

---

### BUG-09: İntikamcı — Server-Side Gün Kontrolü Eksik  
**Dosya:** `app.js` → `resolveDayActions()`  
**Şiddet:** 🟡 Düşük

UI'da intikamcının sadece 1. gün hedef seçebileceği kontrol ediliyor, ama server-side (`resolveDayActions`) sadece `!p.intikamciTarget` kontrolü var:

```js
if (p.isAlive && p.role === 'INTIKAMCI' && tid !== 'skip') {
    if (!p.intikamciTarget) {  // dayCount kontrolü YOK
        p.intikamciTarget = tid;
    }
}
```

Manipüle edilmiş bir client 2. günde de ACTION mesajı gönderebilir.

---

### BUG-10: Vampir Kazanma Koşulu — Tarafsız Roller Dahil
**Dosya:** `app.js` → `checkWin()`  
**Şiddet:** 🟡 Tasarım Kararı

```js
if (vamps >= (totalAlive - vamps)) { endGame('Vampirler Kazandı!'); return true; }
```

Bu formül vampir olmayan herkesi (SK, Kundakçı dahil) "karşı taraf" sayıyor. `game_logic.txt` "vampir sayısı köylü sayısına eşitlenirse" diyor. Eğer "köylü" sadece KOY takımı demekse, tarafsız roller sayılmamalı. Eğer "vampir olmayan herkes" demekse mevcut implementasyon doğru.

---

### BUG-11: Kundakçı — Aynı Gece Benzin + Ateşleme Kontrolü Eksik
**Dosya:** `app.js` → `resolveNight()`  
**Şiddet:** 🟡 Düşük

`game_logic.txt`: *"Bir gecede hem benzin döküp hem ateşe veremez, ikisinden birini seçmelidir."*

Mevcut kodda `tid === aid` ateşleme, `tid !== aid` benzin dökme olarak ayrılmış ✓. Ancak UI tarafında bu kısıtlama yoktur — kundakçı kendini seçip ateşleme yapabilir veya başkasını seçip benzin dökebilir, tek seçimlik yapı bunu doğal olarak engelliyor ✓. **Aslında doğru çalışıyor.**

---

## 🟡 UX İYİLEŞTİRMELERİ

### UX-01: Mobil Uyumluluk — HUD Panelleri Çakışıyor
**Şiddet:** 🔴 Kritik UX

Game screen'deki HUD panelleri sabit piksel genişlikleriyle absolute pozisyonlanmış:
- Sol üst: Rol paneli — `width: 280px`
- Sağ üst: Gün/Timer — absolute right
- Sol alt: Chat/Loglar — `width: 350px`
- Sağ alt: Vasiyet/Notlar — `width: 300px`

Toplam: 280+350 = 630px sol, 300px sağ. **Mobilde (< 768px) bu paneller üst üste biner** ve 3D sahne görünmez hale gelir.

**Öneri:**
- Mobilde panelleri collapsible/tab yapısına dönüştür
- Bottom sheet pattern kullan (aşağıdan yukarı sürüklenebilir paneller)
- Veya panelleri ikon butonlarıyla toggle edilebilir yap

---

### UX-02: Ses Efektleri Kullanılmıyor
**Şiddet:** 🟡 Orta

`PairaAudio.init()` çağrılıyor ve `shared.js`'de `showToast` fonksiyonu toast türüne göre ses çalıyor. Ancak oyun içi önemli olaylarda ses efekti **hiç tetiklenmiyor**:

- Gece/gündüz geçişi
- Ölüm bildirimi
- Oylama başlangıcı/bitişi  
- Asılma animasyonu
- Faz değişimleri
- Kendi sıranın gelmesi

**Öneri:** `PairaAudio.play()` çağrılarını kritik oyun anlarına ekle. Mevcut ses tipleri: `correct`, `wrong`, `tick`, `end`, `pass`.

---

### UX-03: Sohbet ve Sistem Logları Karışık
**Şiddet:** 🟡 Orta

`game-logs` div'inde hem sistem mesajları hem oyuncu sohbet mesajları aynı yerde:
```
> Oyun başladı! Roller dağıtıldı.
> --- GÜN 1 ---
> Ali: Bence Veli şüpheli
> Mehmet gece öldürüldü!
> Oylama başladı.
> Ayşe: Ben Gözcüyüm, Ali'yi izledim
```

Görsel ayrım sadece `!` prefix'i ile yapılıyor (mor renk).

**Öneri:**
- Sistem logları: gri/italic arka plan, sol kenarlık
- Sohbet mesajları: normal stil, avatar/renk
- Ölüm haberleri: kırmızı vurgu
- Faz geçişleri: tam genişlikte ayırıcı banner

---

### UX-04: Oylama Detayları Gösterilmiyor
**Şiddet:** 🟡 Orta

Oylama tamamlandığında kimin kime oy verdiği gösterilmiyor. Log'da sadece:
- "X savunma kürsüsüne çıkıyor!" 
- Veya "Oylama berabere bitti"

**Öneri:** Oylama sonucu tablosu göster:
```
Oylama Sonuçları:
  Ali → Veli (2 oy)
  Mehmet → Ali (1 oy)
  Pas geçen: Ayşe
```

---

### UX-05: Faz İlerleme Göstergesi Yok
**Şiddet:** 🟡 Orta

Gece fazında aksiyon yapmış oyuncular "Diğer oyuncular bekleniyor..." görüyor ama:
- Kaç oyuncunun aksiyon yapması gerektiği bilinmiyor
- Kalan oyuncu sayısı gösterilmiyor
- İlerleme çubuğu/göstergesi yok

**Öneri:** `"Aksiyonlar: 2/5 tamamlandı"` gibi bir ilerleme göstergesi.

---

### UX-06: Fısıldama (Whisper) UX Zayıf
**Şiddet:** 🟡 Düşük

`/w isim mesaj` komutu:
- Oyuncunun tam ismini bilmesi gerekiyor
- Büyük/küçük harf duyarsız ✓
- Otomatik tamamlama yok
- Yardım/tutorial yok
- Syntax hatası yapılırsa net hata mesajı yok

**Öneri:** 
- `@` ile başlayan mention sistemi
- Chat input'a fısıldama butonu ekle
- `/help` komutu

---

### UX-07: Kick Özelliği Yok
**Şiddet:** 🟡 Orta

Host, lobide veya oyun sırasında sorunlu/AFK oyuncuları çıkaramıyor. Özellikle oyun sırasında AFK oyuncu bütün oyunu timer olmayan fazlarda bloke edebilir (BUG-06 ile birleşince kritik).

---

### UX-08: Rol Dağılımında Denge Uyarıları Eksik
**Şiddet:** 🟡 Düşük

Mevcut kontroller:
- ✓ Minimum 3 oyuncu
- ✓ Atanan rol sayısı > oyuncu sayısı kontrolü
- ✓ En az 1 vampir kontrolü
- ✓ Vampir sayısı < toplam oyuncu kontrolü

Eksik uyarılar:
- "Doktor seçilmedi — köylüler savunmasız kalacak"
- "Vampir oranı çok yüksek (%40+) — oyun dengesi bozulabilir"
- "Seri Katil + çok vampir = köylüler çok dezavantajlı"
- "5 kişilik oyun için önerilen: 1 Vampir, 1 Doktor, 3 Köylü"

---

### UX-09: Ölü Oyuncu Deneyimi Sınırlı
**Şiddet:** 🟡 Düşük

Ölen oyuncular:
- Mezarlık sohbetine katılabilir (sadece diğer ölüler görür)
- 3D sahnede mezar taşı olarak görünür
- Başka hiçbir şey yapamaz

**Öneri:**
- Seyirci modu (rolleri görebilme — oyun bitince)
- "Tahminde bulun" özelliği (kim vampir tahmin et, oyun sonunda puan)
- Diğer ölülerle ittifak kurma
- Oyun istatistikleri görüntüleme

---

### UX-10: Yeniden Bağlanma (Reconnect) Mekanizması Yok
**Şiddet:** 🟠 Önemli

`network.js`'de bağlantı koptuğunda:
- Host kopması: `attemptHostMigration()` var ✓ (iyi)
- Client kopması: Otomatik yeniden bağlanma **yok** ❌

Geçici ağ kesintisinde (WiFi dalgalanması, sayfa yenileme) oyuncu tamamen düşüyor ve geri dönemiyor.

**Öneri:** 
- 3 kez yeniden bağlanma denemesi (1s, 3s, 5s aralıklarla)
- "Bağlantı koptu, yeniden bağlanılıyor..." UI göstergesi
- Client ID'yi koruyarak geri bağlanma (`existingId` parametresi zaten var ama kullanılmıyor)

---

### UX-11: Gece Animasyon Süresi Sabit
**Dosya:** `app.js` → `resolveNight()`  
**Şiddet:** 🟡 Düşük

```js
setTimeout(() => { /* gündüze geç */ }, 9000);
```

Animasyon bekleme süresi sabit 9 saniye. 2 kişilik basit bir gece için bile 9 saniye bekletiliyor. 

**Öneri:** Animasyon sayısına göre dinamik süre: `Math.max(5000, animCount * 2000)`

---

### UX-12: Lobide Oyuncu Limiti Kontrolü Yok
**Şiddet:** 🟡 Düşük

HTML'de "Oyuncular (0/12)" yazıyor ama kodda max oyuncu kontrolü yok. 12'den fazla oyuncu katılabilir:
- 3D sahnede evler çok sıkışır
- Kamera zoom'u yetmeyebilir
- Performans sorunları

**Düzeltme:** `onPlayerJoin()`'de max kontrol ekle.

---

### UX-13: Vasiyet (Will) UX İyileştirmeleri
**Şiddet:** 🟡 Düşük

- Karakter limiti gösterilmiyor
- "Kaydedildi" feedback'i geçici DOM manipülasyonuyla yapılıyor
- Her input event'inde debounce ile network'e gönderiliyor (1 sn) — oyun performansını etkilemez ama gereksiz trafik

**Öneri:** Karakter sayacı, kalıcı kaydetme göstergesi.

---

### UX-14: Login Sayfası — Oda Kodu Validasyonu
**Dosya:** `shared/login.js`, `index.html`  
**Şiddet:** 🟡 Düşük

- Oda kodu formatı kontrol edilmiyor (uzunluk, karakter seti)
- `maxlength="10"` var ama minimum uzunluk kontrolü yok
- Geçersiz oda koduna bağlanma denemesinde anlamlı hata mesajı yok (PeerJS generic error)

---

## 📊 GENEL ÖZET TABLOSU

| # | Kod | Kategori | Şiddet | Açıklama |
|---|-----|----------|--------|----------|
| 1 | BUG-01 | Crash | 🔴 Kritik | `scene.js` `.mesh` → `.meshGroup` |
| 2 | BUG-02 | UI | 🔴 Kritik | Action panel çift display |
| 3 | BUG-03 | Güvenlik | 🟠 Önemli | Host rolleri görebilir |
| 4 | BUG-04 | Mekanik | 🔴 Kritik | Deli rolü oyuncuya gösteriliyor |
| 5 | BUG-05 | Mekanik | 🟠 Orta | Uyurgezer üçlü çarpışma eksik |
| 6 | BUG-06 | Mekanik | 🔴 Kritik | Oylama/Yargılama timer'sız |
| 7 | BUG-07 | Mekanik | 🟡 Düşük | Vampir İzcisi çifte işlem |
| 8 | BUG-08 | Mekanik | 🟡 Düşük | Doktor bloklanma davranışı belirsiz |
| 9 | BUG-09 | Güvenlik | 🟡 Düşük | İntikamcı server-side gün kontrolü yok |
| 10 | BUG-10 | Tasarım | 🟡 Düşük | Vampir kazanma koşulu belirsiz |
| 11 | BUG-11 | Mekanik | ✅ Doğru | Kundakçı implementasyonu doğru |
| 12 | UX-01 | Mobil | 🔴 Kritik | HUD panelleri çakışıyor |
| 13 | UX-02 | Ses | 🟡 Orta | Ses efektleri kullanılmıyor |
| 14 | UX-03 | UI | 🟡 Orta | Log/sohbet karışık |
| 15 | UX-04 | UI | 🟡 Orta | Oylama detayları yok |
| 16 | UX-05 | UI | 🟡 Orta | Faz ilerleme göstergesi yok |
| 17 | UX-06 | UX | 🟡 Düşük | Fısıldama UX zayıf |
| 18 | UX-07 | UX | 🟡 Orta | Kick özelliği yok |
| 19 | UX-08 | UX | 🟡 Düşük | Denge uyarıları yok |
| 20 | UX-09 | UX | 🟡 Düşük | Ölü oyuncu deneyimi sınırlı |
| 21 | UX-10 | Network | 🟠 Önemli | Reconnect mekanizması yok |
| 22 | UX-11 | UX | 🟡 Düşük | Sabit animasyon süresi |
| 23 | UX-12 | UX | 🟡 Düşük | Max oyuncu kontrolü yok |
| 24 | UX-13 | UX | 🟡 Düşük | Vasiyet UX |
| 25 | UX-14 | UX | 🟡 Düşük | Oda kodu validasyonu |

---

## 🎯 ÖNCELİK SIRASI (Düzeltme Önerisi)

### Acil (Oyunu Kırıyor):
1. **BUG-01** — `.mesh` → `.meshGroup` (1 satır değişiklik)
2. **BUG-04** — Deli rolü client'a sahte rol gönder
3. **BUG-06** — Oylama/Yargılama timer ekle
4. **BUG-02** — Action panel display düzelt

### Kısa Vadede:
5. **UX-01** — Mobil responsive HUD
6. **UX-10** — Reconnect mekanizması
7. **BUG-05** — Uyurgezer üçlü çarpışma
8. **UX-07** — Kick özelliği

### Orta Vadede:
9. **UX-02** — Ses efektleri
10. **UX-03** — Log/sohbet ayrımı
11. **UX-04** — Oylama detay tablosu
12. **UX-05** — Faz ilerleme göstergesi

### Uzun Vadede:
13-25. Diğer UX iyileştirmeleri