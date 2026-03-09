# Tabu Kelime Üretici

Bu script, Gemini API kullanarak dünyanın en kapsamlı ve en kaliteli Tabu (ve ChatTabu) kelime havuzunu üretmek için tasarlanmıştır.

## Gereksinimler

- Python 3.7 veya üzeri
- `google-generativeai` kütüphanesi

Kütüphaneyi kurmak için terminalinizde veya komut satırınızda şu komutu çalıştırın:
```bash
pip install google-generativeai
```

## Kullanım

1. `Tabu/tabu_generator.py` dosyasını bir metin düzenleyiciyle açın.
2. 8. satırda bulunan `API_KEY = "BURAYA_API_KEYINIZI_GIRINIZ"` kısmındaki `"BURAYA_API_KEYINIZI_GIRINIZ"` yerine kendi Gemini API anahtarınızı yapıştırın.
3. Terminalinizde veya komut satırınızda `Tabu` klasörünün içine gidin.
4. Scripti başlatın:
```bash
python tabu_generator.py
```

## Özellikler

- **Elektrik Kesintisine Karşı Koruma (Checkpoint):** Üretilen kelimeler her 30 kelimede bir anında `generated_words.json` dosyasına kaydedilir. Bilgisayarınız kapanırsa, scripti tekrar çalıştırdığınızda kaldığı yerden devam eder.
- **Eşsiz Kelimeler (Deduplication):** Script hem sizin mevcut `tr.json` dosyanızdaki kelimeleri hem de o an ürettiği kelimeleri hafızasında tutarak AYNI kelimenin iki defa üretilmesini KESİNLİKLE engeller.
- **Standart Kategoriler:** Sadece izin verilen 23 adet geniş kategoriden birisini seçer. Yüzlerce garip kategori oluşmasını engeller.
- **Hata Toleransı:** API'nin yoğun olması, internet kopması veya API'nin geçici hata vermesi durumunda çökmez; bir süre bekleyip yeniden dener.

Üretim tamamlandığında, çıkan `generated_words.json` içeriğini ana `tr.json` dosyanıza ekleyebilirsiniz.
