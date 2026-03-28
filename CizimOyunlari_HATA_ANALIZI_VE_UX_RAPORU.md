# 🎨 Çizim Oyunları - Detaylı Hata Analizi ve UX Raporu

**Tarih:** 28 Mart 2026  
**Kapsam:** CizBil, CizimZinciri, Gartic + Shared Modüller (drawing.js, cizbil_words.js, shared.js)

---

## 📊 Özet

| Oyun | Kritik Hata | Orta Hata | UX Sorunu |
|------|:-----------:|:---------:|:---------:|
| CizBil | 1 | 3 | 4 |
| CizimZinciri | 2 | 3 | 5 |
| Gartic | 3 | 2 | 4 |
| Shared (drawing.js) | 1 | 2 | 1 |
| **Toplam** | **7** | **10** | **14** |

---

## 🔴 KRİTİK HATALAR

### 1. [Gartic] XSS Açığı - Chat Mesajlarında innerHTML Kullanımı
**Dosya:** `Gartic/game.js` satır ~217  
**Sorun:** Doğru tahmin mesajlarında `textSpan.innerHTML` kullanılıyor. Twitch/Kick chat'ten gelen `message` değişkeni escape edilmeden HTML olarak yazılıyor.
```js
textSpan.innerHTML = `<strong>🎉 ${message}</strong> (Doğru bildi!)`;
```
**Risk:** Kötü niyetli kullanıcılar chat'ten `<script>` veya `<img onerror=...>` gibi payload gönderebilir.  
**Düzeltme:** `textContent` kullanılmalı veya HTML escape yapılmalı. ✅ DÜZELTİLDİ

### 2. [Gartic] PairaAudio.init() Hiç Çağrılmıyor
**Dosya:** `Gartic/game.js`  
**Sorun:** AudioContext user gesture gerektirir. CizBil `PairaAudio.init()` çağırırken, Gartic hiç çağırmıyor. Sonuç: Ses efektleri (correct, pass) asla çalmaz.  
**Düzeltme:** İlk kullanıcı etkileşiminde init çağrılmalı. ✅ DÜZELTİLDİ

### 3. [Gartic] Sahte Bağlantı Durumu
**Dosya:** `Gartic/game.js` satır ~195  
**Sorun:** Chat bağlantı durumu `setTimeout(() => 'Bağlandı', 2000)` ile sahte olarak gösteriliyor. Bağlantı başarısız olsa bile "Bağlandı" yazıyor.
**Düzeltme:** ChatListener'dan gerçek bağlantı durumu dinlenmeli. ✅ DÜZELTİLDİ

### 4. [Shared/drawing.js] Touch + Mouse Çift Ateşleme
**Dosya:** `shared/drawing.js`  
**Sorun:** Hem `mousedown/mousemove/mouseup` hem de `touchstart/touchmove/touchend` event listener'ları ekli. Dokunmatik cihazlarda bir dokunuş hem touch hem mouse event'i tetikliyor → çift çizim, beklenmedik davranış.  
**Düzeltme:** Touch event sonrası flag ile mouse event'leri engellemeli. ✅ DÜZELTİLDİ

### 5. [CizimZinciri] Albüm Verisi Client'a Gönderilmiyor (Kısmi)
**Dosya:** `CizimZinciri/network.js`  
**Sorun:** `broadcastState` ALBUM modunda `stories: {}` gönderiyor ama `albumSequence` içindeki `stepData` zaten hikaye içeriğini barındırıyor. Ancak `renderAlbumState`, client tarafında `networkState.players[item.ownerId].name` erişiyor - eğer `players` senkronize edilmediyse `undefined` döner.  
**Düzeltme:** Players verisi her zaman tam gönderiliyor - sorun yok. Ama albumSequence step data'sında `authorId` olan oyuncu çıkmışsa isim "Bilinmeyen" olarak gösteriliyor ki bu doğru davranış.

### 6. [CizBil] Çizen Kişi Chat'e Mesaj Gönderebiliyor
**Dosya:** `CizBil/network.js`  
**Sorun:** Ağ katmanında çizenin tahminleri `handleGuess`'te engelleniyor, ama chat'e gönderdiği mesaj tüm kullanıcılara `CHAT_EVENT` olarak broadcast ediliyor → dolaylı olarak kelimeyi ifşa edebilir.  
**Düzeltme:** Server-side (host) handler'da çizenin mesajları tamamen bloklanmalı. ✅ DÜZELTİLDİ (zaten `senderId === currentDrawer` kontrolü var, ama mesaj broadcast da engellendi)

### 7. [Shared/drawing.js] Resize Sonrası History Geçersizleşiyor
**Dosya:** `shared/drawing.js`  
**Sorun:** Canvas boyutu değiştiğinde history dizisindeki ImageData'lar eski boyutlarda kalıyor. Resize sonrası undo yapmak bozuk/kayık görüntü oluşturuyor.  
**Düzeltme:** Resize sonrası history temizlenmeli ve mevcut durum yeni başlangıç olarak kaydedilmeli. ✅ DÜZELTİLDİ

---

## 🟡 ORTA SEVİYE HATALAR

### 8. [CizBil] Timer Başlangıç Metni "00:00"
**Dosya:** `CizBil/game.html`  
**Sorun:** Timer display'de başlangıç metni `00:00` ama timer sadece saniye gösteriyor. Oyun başladığında `60` gibi bir sayıya aniden atlıyor.  
**Düzeltme:** Başlangıç metni `--` veya boş olmalı. ✅ DÜZELTİLDİ

### 9. [Gartic] Viewport Zoom Engeli (Erişilebilirlik)
**Dosya:** `Gartic/game.html`  
**Sorun:** `maximum-scale=1.0, user-scalable=no` pinch-to-zoom'u engelliyor. WCAG erişilebilirlik ihlali.  
**Düzeltme:** `maximum-scale=5.0` yapılmalı, `user-scalable=no` kaldırılmalı. ✅ DÜZELTİLDİ

### 10. [CizimZinciri] Tur Bilgisi Gösterilmiyor
**Dosya:** `CizimZinciri/game.html`  
**Sorun:** Oyun ekranında hangi turda olunduğu gösterilmiyor. Kullanıcılar kaç tur kaldığını bilemiyor.  
**Düzeltme:** Game topbar'a tur göstergesi eklendi. ✅ DÜZELTİLDİ

### 11. [CizimZinciri] Albüm Butonu Yanıltıcı
**Dosya:** `CizimZinciri/game.html`  
**Sorun:** "Sonraki Hikaye" butonu aslında her tıklamada sadece 1 adım (entry) ilerletiyor, tam bir hikaye değil.  
**Düzeltme:** Buton metni "Sonraki Adım →" olarak değiştirildi. ✅ DÜZELTİLDİ

### 12. [Gartic] Leaderboard Mobilde Gizleniyor
**Dosya:** `Gartic/style.css`  
**Sorun:** `@media (max-width: 900px)` altında `.leaderboard { display: none; }` - sıralama tablosu mobilde tamamen kayboluyor.  
**Düzeltme:** Gizlemek yerine kompakt bir görünüm verildi. ✅ DÜZELTİLDİ

### 13. [CizBil] checkAllGuessed Timer Tekrar Sıfırlama
**Dosya:** `CizBil/game.js`  
**Sorun:** Her doğru bilmede timer 10 saniyeye sıfırlanıyor (sadece ilk bilmede olmalı).  
**Düzeltme:** Sadece ilk doğru tahmin sonrası timer kısaltılıyor. ✅ DÜZELTİLDİ

### 14. [Shared/cizbil_words.js] JSON Parsing Kırılgan
**Dosya:** `shared/cizbil_words.js`  
**Sorun:** `loadGarticWords` fonksiyonu gartic.json'ı text olarak okuyup virgülle split ediyor. Kelimede virgül veya tırnak varsa bozulur.  
**Düzeltme:** Önce JSON.parse denenip, başarısız olursa fallback metin ayrıştırma yapılıyor. ✅ DÜZELTİLDİ

### 15. [CizBil] Host Kelimeyi Tahmin Ekranında Görüyor (Kısa An)
**Dosya:** `CizBil/network.js`  
**Sorun:** `onStateChange` callback'inde önce `setState` tetikleniyor, sonra sansür uygulanıyor. Çok kısa bir an orijinal kelime DOM'a yazılabilir (event loop aynı tick).  
**Risk:** Düşük - aynı senkron blokta sansürleniyor, render cycle'a düşmez.

### 16. [CizimZinciri] `window._networkState` Global Kirlilik
**Dosya:** `CizimZinciri/game.js`  
**Sorun:** `window._networkState` ve `window._myId` submit handler'lardan erişim için global'e atanıyor. Eski state referansı ile submit yapılabilir.  
**Risk:** Orta - race condition potansiyeli.

### 17. [Gartic] Toast Container HTML'de Yok
**Dosya:** `Gartic/game.html`  
**Sorun:** `shared.js`'deki `showToast` dinamik olarak oluştursa da, diğer oyunlarda HTML'de var. Tutarsızlık.  
**Düzeltme:** HTML'e eklendi. ✅ DÜZELTİLDİ

---

## 🔵 UX SORUNLARI

### 18. [CizBil] Chat Input Çizen İçin Devre Dışı Değil
Çizen kişi hâlâ chat input'una yazabiliyor ve gönder butonuna basabiliyor. Mesajı host engelliyor ama kullanıcı "neden mesajım gitmedi?" diye düşünür.  
**Düzeltme:** Çizen için chat input disabled yapıldı ve placeholder değiştirildi. ✅ DÜZELTİLDİ

### 19. [CizBil] İpucu Sistemi Yok
Uzun süre tahmin edilemezse oyuncu sıkılabilir. Kalan süreye göre harf açma mekanizması yok.

### 20. [CizimZinciri] Karakter Limiti Göstergesi Yok
Prompt input'ta `maxlength="60"` var ama kullanıcı kaç karakter kaldığını göremez.  
**Düzeltme:** Karakter sayacı eklendi. ✅ DÜZELTİLDİ

### 21. [CizimZinciri] Kimin Bitirdiği Belli Değil
"Diğer oyuncular bekleniyor" mesajı genel. Kim bitirdi, kim bitirmedi belli değil.

### 22. [CizimZinciri] Boş Çizim Gönderimi
Timer bitince boş tuval otomatik gönderiliyor. Albümde beyaz boş kare görünüyor.

### 23. [Gartic] Timer Mekanizması Yok
Kelime bazlı süre sınırı yok. Yayıncı istediği kadar bekleyebilir. Bu özgürlük olsa da opsiyonel timer UX'i iyileştirir.

### 24. [Gartic] Tur Sayacı Yok
Kaç kelime çözüldü, kaç tur geçildi bilgisi yok.

### 25-27. [Tüm Oyunlar] Toolbar Mobilde Küçük
Renk paletleri ve araç butonları küçük ekranlarda sıkışık. Touch target minimum 44x44px olmalı.

### 28-31. Genel UX Tutarsızlıkları
- CizBil 1400px max-width, CizimZinciri 1000px, Gartic 100vw - tutarsız
- CizBil ve CizimZinciri farklı lobiler (biri SharedLobbyUI, diğeri kendi yazıyor)
- Fullscreen toggle davranışı tutarlı (shared.js'den geliyor) ✅
- Ses efektleri tutarlı (shared.js PairaAudio) - Gartic hariç ✅ DÜZELTİLDİ