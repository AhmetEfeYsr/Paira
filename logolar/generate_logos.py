import os
import re
import io
import time
from PIL import Image
import requests
# Daha gelişmiş arka plan kaldırma işlemi için InSPyReNet modeli kullanılır
# rembg yerine makasla kesilmiş görüntüsünü (scissor-cut effect) yok eden State-Of-The-Art çözüm
from transparent_background import Remover
from dotenv import load_dotenv

load_dotenv()

# ==========================================
# AYARLAR VE API SEÇİMİ
# ==========================================
# Bu script Google Gemini API üzerinden (Imagen 4 modelleri ile) görsel üretir.
# Sadece bir Google API Anahtarı (Gemini API Key) gerekir. CLI veya gcloud'a ihtiyaç yoktur.
# '.env' dosyasında GOOGLE_API_KEY ortam değişkenini tanımlamanız yeterlidir.

# Dosya yolları
PROMPTS_FILE = "IMAGEN4_PROMPTS.md"
OUTPUT_DIR = "generated_logos"

# Arka plan temizleme modelini başlat (InSPyReNet modeli çok detaylı ve yumuşak kenar/matting çıkarır)
# İlk çalıştırıldığında HuggingFace üzerinden modelin indirilmesi birkaç dakika sürebilir.
print("  [AI] Arka plan kaldırma modeli (InSPyReNet) yükleniyor...")
bg_remover = Remover()

if not os.path.exists(OUTPUT_DIR):
    os.makedirs(OUTPUT_DIR)

# ==========================================
# METİN AYRIŞTIRMA (PARSING)
# ==========================================
def parse_prompts(filepath):
    """IMAGEN4_PROMPTS.md dosyasından oyun adlarını ve promptlarını ayıklar."""
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()

    games = []
    # "### 1. Bağnam" gibi başlıkları bulur
    pattern = re.compile(r"###\s*\d+\.\s*(.+?)\n.*?-\s*\*\*Paira:\*\*(.*?)\n.*?-\s*\*\*Space:\*\*(.*?)\n", re.DOTALL)
    matches = pattern.findall(content)

    for match in matches:
        game_name = match[0].strip()
        paira_prompt = match[1].strip()
        space_prompt = match[2].strip()
        
        # Dosya ismi olarak kullanılabilir hale getir
        safe_name = re.sub(r'[^a-zA-Z0-9]', '', game_name.replace(" ", "_").lower())
        
        games.append({
            "name": game_name,
            "safe_name": safe_name,
            "paira_prompt": paira_prompt,
            "space_prompt": space_prompt
        })
    
    return games

# ==========================================
# YAPAY ZEKA GÖRSEL ÜRETİMİ (GOOGLE GEMINI API / IMAGEN 4)
# ==========================================
def generate_image_imagen(prompt):
    """Google Gemini API (Imagen 4) kullanarak görsel üretir (Express Mode/Sadece API)."""
    from google import genai
    from google.genai import types

    # GOOGLE_API_KEY .env dosyasından otomatik alınacak
    client = genai.Client()
    
    print(f"  [AI] Google Imagen API ile görsel üretiliyor...")
    
    # Gemini Imagen API kullanımı
    # Model: "imagen-3.0-generate-001" veya güncel Imagen modeli
    result = client.models.generate_images(
        model='imagen-4.0-ultra-generate-001',
        prompt=prompt,
        config=types.GenerateImagesConfig(
            number_of_images=1,
            aspect_ratio="1:1",
            output_mime_type="image/png"
        )
    )
    
    # Üretilen resim byte array olarak gelir, Pillow objesine çeviriyoruz
    image_data = result.generated_images[0].image.image_bytes
    return Image.open(io.BytesIO(image_data))

def generate_image(prompt):
    return generate_image_imagen(prompt)

# ==========================================
# GÖRSEL İŞLEME (ARKA PLAN KALDIRMA VE KIRPMA)
# ==========================================
def process_and_save_image(img, output_path):
    """
    1. Arka planı en yüksek hassasiyetle (InSPyReNet) kaldırır. Makas kesiği oluşturmaz, saç/cam gibi şeffaf nesneleri korur.
    2. Transparan alanları kırparak (bounding box) görseli merkeze oturtur.
    3. Belirli bir boyuta (örn. 512x512) yeniden boyutlandırıp logoya özel alana yerleştirir.
    4. PNG formatında kaydeder.
    """
    print("  [İşlem] Arka plan yüksek hassasiyetle (doğal matting) kaldırılıyor...")
    
    # transparent-background kütüphanesi Pillow Image nesnesi ile uyumludur ve RGBA döndürür.
    output_img = bg_remover.process(img)

    print("  [İşlem] Kırpma (Bounding Box) ve yeniden boyutlandırma uygulanıyor...")
    # Bounding Box (Görselin etrafındaki boşlukları sil)
    bbox = output_img.getbbox()
    if bbox:
        output_img = output_img.crop(bbox)
    
    # Logoyu standart bir boyuta oturt (Örn: 512x512)
    # Tasarım alanına mükemmel oturması için içine yerleştirilecek canvas:
    TARGET_SIZE = 512
    PADDING = 20 # Kenarlardan bırakılacak boşluk
    
    # Yeni, tamamen transparan bir tuval oluştur
    final_canvas = Image.new("RGBA", (TARGET_SIZE, TARGET_SIZE), (0, 0, 0, 0))
    
    # Kırpılmış resmin en-boy oranını koruyarak yeniden boyutlandır
    img_w, img_h = output_img.size
    ratio = min((TARGET_SIZE - 2*PADDING) / img_w, (TARGET_SIZE - 2*PADDING) / img_h)
    new_w = int(img_w * ratio)
    new_h = int(img_h * ratio)
    
    resized_img = output_img.resize((new_w, new_h), Image.Resampling.LANCZOS)
    
    # Merkeze yerleştir
    offset_x = (TARGET_SIZE - new_w) // 2
    offset_y = (TARGET_SIZE - new_h) // 2
    
    final_canvas.paste(resized_img, (offset_x, offset_y), resized_img)

    print(f"  [Kaydediliyor] {output_path} (PNG)")
    # PNG formatında, RGBA (transparan) destekleyecek şekilde kaydet
    final_canvas.save(
        output_path,
        format="PNG"
    )

# ==========================================
# ANA ÇALIŞMA DÖNGÜSÜ
# ==========================================
def main():
    print("=== LOGO ÜRETİM VE İŞLEME SİSTEMİ ===")
    
    if not os.path.exists(PROMPTS_FILE):
        print(f"HATA: {PROMPTS_FILE} bulunamadı!")
        return

    games = parse_prompts(PROMPTS_FILE)
    print(f"Toplam {len(games)} oyun promptu bulundu.\n")

    for i, game in enumerate(games, 1):
        print(f"[{i}/{len(games)}] Oyun işleniyor: {game['name']}")
        
        # 1. Paira Teması
        paira_filename = os.path.join(OUTPUT_DIR, f"{game['safe_name']}_paira.png")
        if not os.path.exists(paira_filename):
            print(f" -> Paira Teması Üretiliyor...")
            try:
                img_paira = generate_image(game['paira_prompt'])
                process_and_save_image(img_paira, paira_filename)
            except Exception as e:
                print(f"   HATA (Paira): {e}")
        else:
            print(f" -> Paira logoları zaten var, atlanıyor.")

        # 2. Space Teması
        space_filename = os.path.join(OUTPUT_DIR, f"{game['safe_name']}_space.png")
        if not os.path.exists(space_filename):
            print(f" -> Space Teması Üretiliyor...")
            try:
                img_space = generate_image(game['space_prompt'])
                process_and_save_image(img_space, space_filename)
            except Exception as e:
                print(f"   HATA (Space): {e}")
        else:
            print(f" -> Space logoları zaten var, atlanıyor.")
        
        print("-" * 40)
        # API limitlerine takılmamak için bekleme (isteğe bağlı)
        time.sleep(6)

if __name__ == "__main__":
    main()
