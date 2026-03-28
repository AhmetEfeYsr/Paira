# Logo Oluşturucu ve İşleyici (Google Gemini / Imagen 4 Entegrasyonlu)

Bu Python betiği (`generate_logos.py`), Markdown formatındaki prompt dosyanızı okur, **Google Gemini API (Imagen 4 - Express Mode)** ile logoları üretir, arka planlarını cerrahi hassasiyetle temizler, istenilen boyuta tam oturtur ve `.avif` formatında kaydeder.

Bu yöntem **Express mode** olarak bilinir ve `gcloud` veya karmaşık yetkilendirmelere ihtiyaç duymadan, sadece basit bir API anahtarı ile çalışır.

## Gereksinimler

Öncelikle gerekli Python kütüphanelerini kurmalısınız. Eski rembg kütüphanesi yerine, arka planları **makasla kesilmiş gibi değil, saç ve cam gibi detayları koruyarak çok daha yumuşak ve profesyonel** silen `transparent-background` (InSPyReNet modeli) kullanılmıştır:

```bash
pip install pillow pillow-heif requests transparent-background python-dotenv google-genai
```

## Ayarlar ve Kimlik Doğrulama

1. [Google AI Studio](https://aistudio.google.com/app/apikey) adresinden bir **Gemini API Key** alın.
2. Proje dizininde (bu script ile aynı yerde) bir `.env` dosyası oluşturun.
3. İçerisine aldığınız API anahtarını şu şekilde ekleyin:

   ```env
   GOOGLE_API_KEY=AIzaSySizinAldiginizGizliAnahtarBuraya
   ```

4. Betiği çalıştırın:
   ```bash
   python generate_logos.py
   ```

## Ne Yapar?
- `IMAGEN4_PROMPTS.md` dosyasını okuyup içindeki "Paira" ve "Space" temalarındaki promptları ayrıştırır.
- Görselleri AI aracılığıyla (1024x1024) oluşturur.
- **transparent-background (InSPyReNet)** kütüphanesi ile resmin sadece ana objesini bırakıp arka planını "State-of-the-art" kalitesinde (doğal matting ile) temizler.
- Saydamlığına (Bounding Box) göre resmi kırpar.
- Seçtiğiniz alana tam oturması için (`TARGET_SIZE=512`, `PADDING=20` ayarlı), ortalanmış ve orantılı bir şekilde yeni tuvale yerleştirir.
- Yeni nesil, hafif ve şeffaf katman destekleyen **AVIF** formatında `generated_logos/` klasörüne kaydeder.
