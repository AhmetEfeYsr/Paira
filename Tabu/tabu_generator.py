import google.generativeai as genai
import json
import time
import os

# ==========================================
# AYARLAR VE API ANAHTARI
# ==========================================
API_KEY = "BURAYA_API_KEYINIZI_GIRINIZ"

# Hedef kelime sayısı (minimum 3000, maksimum 10000)
HEDEF_KELIME_SAYISI = 10000
# Her API çağrısında istenecek kelime sayısı (çok yüksek olursa API patlayabilir veya timeout alabilir, 30 idealdir)
BATCH_SIZE = 30
# Kaydetme dosyası
CIKTI_DOSYASI = "generated_words.json"
MEVCUT_TR_JSON = "tr.json"

# ==========================================
# KATEGORİLER (Sınırlandırılmış, böylece 900 farklı kategori çıkmaz)
# ==========================================
IZIN_VERILEN_KATEGORILER = [
    "Günlük Yaşam", "Mekanlar & Coğrafya", "Kişiler & Meslekler",
    "Doğa & Bitkiler", "Spor & Aktiviteler", "Sanat & Eğlence",
    "Teknoloji & İnternet", "Okul & Eğitim", "Ev & Eşyalar",
    "Soyut Kavramlar", "Duygular & Durumlar", "Tarih & Mitoloji",
    "Hayvanlar Alemi", "Yiyecek & İçecek", "Bilim & Uzay",
    "Popüler Kültür", "Giyim & Kuşam", "Ulaşım & Taşıtlar",
    "Ekonomi & Finans", "Vücut & Anatomi", "Sağlık & Tıp",
    "Din & İnanç", "Siyaset & Toplum"
]

def load_existing_words():
    """
    Hem tr.json'dan hem de daha önce üretilmiş generated_words.json'dan
    kelimeleri yükleyip küçük harfe çevirerek bir Set'e (küme) atar.
    Amacımız KESİNLİKLE aynı kelimeyi tekrar üretmemek.
    """
    mevcut_kelimeler = set()
    mevcut_data = []

    # 1. Mevcut tr.json (Eski veritabanı) okunuyor...
    if os.path.exists(MEVCUT_TR_JSON):
        try:
            with open(MEVCUT_TR_JSON, 'r', encoding='utf-8') as f:
                data = json.load(f)
                for item in data:
                    if 'ana_kelime' in item:
                        # Türkçe karakter uyumu için lower() yeterli ancak garanti olsun.
                        kelime = item['ana_kelime'].strip().lower()
                        mevcut_kelimeler.add(kelime)
        except Exception as e:
            print(f"Hata: {MEVCUT_TR_JSON} okunamadı. {e}")

    # 2. Önceden ürettiğimiz (elektrik kesintisi vs.) JSON okunuyor...
    if os.path.exists(CIKTI_DOSYASI):
        try:
            with open(CIKTI_DOSYASI, 'r', encoding='utf-8') as f:
                mevcut_data = json.load(f)
                for item in mevcut_data:
                    if 'ana_kelime' in item:
                        kelime = item['ana_kelime'].strip().lower()
                        mevcut_kelimeler.add(kelime)
        except Exception as e:
            print(f"Hata: {CIKTI_DOSYASI} okunamadı veya bozuk. Sıfırdan başlanacak. {e}")
            mevcut_data = []

    return mevcut_kelimeler, mevcut_data

def save_words(data):
    """
    Üretilen veriyi JSON olarak kaydeder.
    """
    with open(CIKTI_DOSYASI, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=4)
    print(f"[BAŞARILI] Toplam {len(data)} kelime {CIKTI_DOSYASI} dosyasına kaydedildi. (Checkpoint)")

def generate_prompt(batch_size):
    """
    Gemini API'sine gönderilecek, dünyanın en kaliteli kelimelerini ürettirecek prompt.
    """

    kategoriler_str = ", ".join(IZIN_VERILEN_KATEGORILER)

    prompt = f"""Sen dünyanın en iyi ve en zeki Türkçe Tabu kelime üretici yapay zekasısın.
Görevin, Türk kültürü, günlük yaşam, popüler kültür ve genel kültüre uygun {batch_size} adet YEPYENİ, AŞIRI KALİTELİ Tabu kartı üretmek.

ÖNEMLİ KURALLAR:
1. "ana_kelime" KESİNLİKLE eşsiz olmalıdır. Daha önce bilindik olan yaygın kelimeler dışında, yaratıcı, oynaması zevkli, orta ve zor seviye kelimeler seçmelisin.
2. "kategori" KESİNLİKLE ve SADECE şu listeden biri olmalıdır (başka bir kategori uydurma): [{kategoriler_str}]
3. "yasakli_kelimeler" KESİNLİKLE tam olarak 5 adet olmalıdır. Ana kelimeyi anlatırken insanların ilk aklına gelen, kullanması en muhtemel ve en zorlayıcı 5 kelimeyi bulmalısın. Yasaklı kelimeler ana kelimenin kökünü veya kendisini içermemelidir.
4. "zorluk" değeri 1 ile 100 arasında bir tamsayı (integer) olmalıdır. 1 çok kolay, 100 çok zor demektir. Kelimenin bilinirliği ve yasaklı kelimelerin zorluğuna göre gerçekten mantıklı bir zorluk puanı hesapla.
5. Çıktı SADECE ve SADECE geçerli bir JSON array (dizisi) olmalıdır. Hiçbir ekstra açıklama, markdown bloğu (```json gibi) veya merhaba metni KULLANMA. Sadece JSON döndür.

ÖRNEK ÇIKTI FORMATI:
[
  {{
    "ana_kelime": "Müteahhit",
    "kategori": "Kişiler & Meslekler",
    "yasakli_kelimeler": ["İnşaat", "Bina", "Ev", "Zengin", "Yapı"],
    "zorluk": 65
  }},
  {{
    "ana_kelime": "Nostalji",
    "kategori": "Soyut Kavramlar",
    "yasakli_kelimeler": ["Eski", "Geçmiş", "Özlem", "Hatıra", "Duygu"],
    "zorluk": 75
  }}
]

ŞİMDİ, bana tam {batch_size} adet yepyeni Tabu kartını içeren JSON dizisini ver.
"""
    return prompt

def main():
    if API_KEY == "BURAYA_API_KEYINIZI_GIRINIZ":
        print("HATA: Lütfen tabu_generator.py dosyasını açıp API_KEY değişkenine Gemini API anahtarınızı girin.")
        return

    # Gemini API Ayarları
    genai.configure(api_key=API_KEY)

    # Model seçimi (gemini-1.5-flash veya gemini-1.5-pro önerilir. Pro daha zeki ama daha pahalı/yavaş olabilir. Flash fiyat/performans canavarıdır.)
    # 100 Dolar bütçe ve 8 saatlik süre için gemini-1.5-flash çok ideal, dilerseniz gemini-1.5-pro da kullanabilirsiniz.
    model = genai.GenerativeModel('gemini-1.5-flash')

    print("Tabu Kelime Üretici Başlatılıyor...")
    print("Mevcut kelimeler kontrol ediliyor...")

    mevcut_kelimeler_set, uretilen_data = load_existing_words()

    print(f"Başlangıçta tespit edilen eşsiz kelime sayısı (tr.json + önceden üretilenler): {len(mevcut_kelimeler_set)}")
    print(f"Şu ana kadar bu script ile üretilmiş ve dosyaya kaydedilmiş kelime sayısı: {len(uretilen_data)}")
    print(f"Hedeflenen toplam yeni kelime sayısı: {HEDEF_KELIME_SAYISI}")

    basarisiz_deneme = 0

    while len(uretilen_data) < HEDEF_KELIME_SAYISI:
        try:
            kalan = HEDEF_KELIME_SAYISI - len(uretilen_data)
            istenecek_sayi = min(BATCH_SIZE, kalan)

            print(f"\n[{len(uretilen_data)} / {HEDEF_KELIME_SAYISI}] Gemini'den {istenecek_sayi} adet yeni kelime isteniyor...")

            prompt = generate_prompt(istenecek_sayi)

            response = model.generate_content(
                prompt,
                generation_config=genai.types.GenerationConfig(
                    temperature=0.9, # Yaratıcılığı artırmak için
                )
            )

            # Markdown temizliği (Eğer model ```json ... ``` ile yanıtlarsa temizle)
            response_text = response.text.strip()
            if response_text.startswith("```json"):
                response_text = response_text[7:]
            if response_text.startswith("```"):
                response_text = response_text[3:]
            if response_text.endswith("```"):
                response_text = response_text[:-3]
            response_text = response_text.strip()

            # JSON ayrıştırma
            yeni_kelimeler = json.loads(response_text)

            eklenen_sayi = 0
            for item in yeni_kelimeler:
                ana_kelime = item.get('ana_kelime', '').strip().lower()

                # Eşsizlik ve yapı kontrolü
                if ana_kelime and ana_kelime not in mevcut_kelimeler_set:
                    # Kategori geçerli mi?
                    kategori = item.get('kategori', 'Genel')
                    if kategori not in IZIN_VERILEN_KATEGORILER:
                        kategori = "Günlük Yaşam" # Fallback
                        item['kategori'] = kategori

                    # Yasaklı kelimeler 5 adet mi?
                    yasakli = item.get('yasakli_kelimeler', [])
                    if isinstance(yasakli, list) and len(yasakli) == 5:

                        # Kelimeyi ekle
                        mevcut_kelimeler_set.add(ana_kelime)
                        uretilen_data.append(item)
                        eklenen_sayi += 1

            print(f"-> Gelen yanıttan {eklenen_sayi} adet eşsiz ve geçerli kelime eklendi.")

            # Her başarılı batch'ten sonra kaydet (Checkpoint)
            save_words(uretilen_data)
            basarisiz_deneme = 0

            # Rate limit ve güvenlik için kısa bir bekleme
            time.sleep(3)

        except json.JSONDecodeError:
            print("Hata: Gemini API geçerli bir JSON döndürmedi. Yeniden deneniyor...")
            basarisiz_deneme += 1
            time.sleep(5)
        except Exception as e:
            print(f"Beklenmeyen bir hata oluştu: {e}")
            basarisiz_deneme += 1
            time.sleep(10)

        # Çok fazla ardışık hata olursa durdur
        if basarisiz_deneme > 10:
            print("ÇOK FAZLA BAŞARISIZ DENEME! API limitine takılmış olabilirsiniz veya internet bağlantınız koptu. Script durduruluyor.")
            print(f"Şu ana kadar üretilen {len(uretilen_data)} kelime {CIKTI_DOSYASI} dosyasında güvende.")
            break

    if len(uretilen_data) >= HEDEF_KELIME_SAYISI:
        print(f"\n🎉 TEBRİKLER! Hedeflenen {HEDEF_KELIME_SAYISI} kelime başarıyla üretildi ve {CIKTI_DOSYASI} dosyasına kaydedildi.")
        print("Mevcut tr.json dosyanız ile bu yeni generated_words.json dosyasını birleştirerek ana veritabanınızı güncelleyebilirsiniz.")

if __name__ == "__main__":
    main()
