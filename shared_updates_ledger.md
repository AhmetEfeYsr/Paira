# Shared Extraction Ledger

Bu dosya, oyun klasörlerinden `shared` klasörüne (shared.js / shared.css) taşınan fonksiyonları ve stilleri takip eder. Geriye dönük uyumluluk ve DRY prensipleri için kullanılır.

## Mevcut Global Yapılar
- `PairaSharedUI` (Theme, Navigation, Footer, SEO Footer, Fullscreen Toggle)
- `checkEasterEgg(username)`
- `showToast(msg, type)`
- `PairaTime` (Zaman senkronizasyonu)
- `PairaAudio` (Ses efektleri)
- `generateRoomCode()`
- `showScreen(screenId)`

## Çıkarımlar
- `normalizeTurkishChars(str)` - Türkçe karakterleri İngilizce karşılıklarına dönüştürür (Bagnam'dan taşındı).
- `getTodayDateTR()` - Türkiye saatiyle bugünün tarihini 'YYYY-MM-DD' formatında verir (Bagnam'dan taşındı).
- `escapeHtml(text)` - HTML taglerini temizler/encode eder (BilgiYarismasi'ndan taşındı).
- Lobi/Oyun UI Stilleri: `.lobby-header`, `.code-container`, `.lobby-grid`, `.players-panel`, `.game-topbar`, `.timer`, `.kick-link` (BilgiYarismasi'ndan `shared.css`'e taşındı).
- Çizim UI Stilleri: `.canvas-container`, `.toolbar`, `.color-picker`, `.color-swatch`, `.size-picker`, `.size-btn`, `.tools` (CizBil/CizimZinciri'nden `shared.css`'e taşındı).
- Timeline UI Stilleri: `.events-container`, `.event-card`, `.event-order`, `.event-title`, `.event-date`, `.game-actions`, `.order-controls`, `.btn-order`, `.drag-handle` (Krono'dan `shared.css`'e taşındı).
- Custom Tooltips & Modals: `.custom-tooltip-wrapper`, `.custom-tooltip-content`, `.random-roles-modal`, vb. (VampirKoylu'dan `shared.css`'e taşındı).
- Fuzzy Matcher Sınıfı ve Uyarı Stili (KelimeAvi'nden `shared.js` ve `shared.css`'e taşındı, birden çok oyunla entegre edildi).
