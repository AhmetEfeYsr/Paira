import os
import sys
import glob
from pathlib import Path

try:
    from rembg import remove, new_session
    from PIL import Image
    import vtracer
except ImportError:
    print("Gerekli kütüphaneler eksik! Lütfen aşağıdaki komutu çalıştırın:")
    print("pip install rembg vtracer Pillow")
    sys.exit(1)

def process_logos(input_dir, output_dir):
    # Klasörleri oluştur
    os.makedirs(output_dir, exist_ok=True)
    
    # PNG dosyalarını bul
    png_files = glob.glob(os.path.join(input_dir, "*.png"))
    
    if not png_files:
        print(f"[{input_dir}] klasöründe hiç PNG dosyası bulunamadı.")
        return

    print(f"Toplam {len(png_files)} logo bulundu. Cerrah hassasiyetinde işleme başlanıyor...\n")
    
    # Rembg oturumu (modeli bir kez yüklemek için)
    session = new_session("u2net")

    for file_path in png_files:
        filename = os.path.basename(file_path)
        name, _ = os.path.splitext(filename)
        temp_png = os.path.join(output_dir, f"{name}_temp.png")
        final_svg = os.path.join(output_dir, f"{name}.svg")
        
        print(f"İşleniyor: {filename} ...")
        
        try:
            # 1. ADIM: Cerrah Hassasiyetinde Arka Plan Temizliği (Alpha Matting ile)
            # Yapay zeka kalıntılarını ve haleleri yok etmek için alpha matting kullanıyoruz.
            with open(file_path, "rb") as f:
                input_data = f.read()
                
            output_data = remove(
                input_data, 
                session=session,
                alpha_matting=True,
                alpha_matting_foreground_threshold=240,
                alpha_matting_background_threshold=10,
                alpha_matting_erode_size=5  # Arka plan kalıntılarını tıraşlamak için hafif erozyon
            )
            
            # Geçici transparan PNG olarak kaydet
            with open(temp_png, "wb") as f:
                f.write(output_data)
                
            # 2. ADIM: Kusursuz SVG Vektörizasyonu (vtracer ile)
            # Keskin kırıkları yumuşatan, renkleri pürüzsüzleştiren ayarlar
            vtracer.convert_image_to_svg_py(
                temp_png,
                final_svg,
                colormode="color",        # Renkli SVG
                hierarchical="stacked",   # Üst üste binen katmanlar (boşlukları engeller)
                mode="spline",            # Eğrileri pürüzsüzleştirir (keskin çizgileri yok eder)
                filter_speckle=10,        # Küçük gürültüleri/kalıntıları siler
                color_precision=6,        # Renk gruplama hassasiyeti (daha az renk karmaşası)
                layer_difference=16,      # Katman farkı eşiği
                corner_threshold=60,      # Köşeleri yumuşatma açısı
                length_threshold=4.5,     # Kısa/kırık pikselleri görmezden gelme
                max_iterations=10,        # Spline optimizasyonu
                splice_threshold=45,      # Açı eşiği
                path_precision=3          # SVG yol hassasiyeti
            )
            
            # Temizlik
            if os.path.exists(temp_png):
                os.remove(temp_png)
                
            print(f"✅ Başarılı: {final_svg}")
            
        except Exception as e:
            print(f"❌ Hata oluştu ({filename}): {str(e)}")

if __name__ == "__main__":
    # Scriptin çalıştığı klasördeki 'raw_pngs' klasöründen okuyup
    # dönüştürülmüş SVG'leri 'processed_svgs' klasörüne kaydedecek
    current_dir = os.path.dirname(os.path.abspath(__file__))
    input_folder = os.path.join(current_dir, "raw_pngs")
    output_folder = os.path.join(current_dir, "processed_svgs")
    
    # Kullanıcı klasörleri önceden açmamışsa uyaralım
    if not os.path.exists(input_folder):
        os.makedirs(input_folder)
        print(f"Lütfen oluşturduğunuz PNG logolarını şu klasöre atın:\n{input_folder}\nArdından bu scripti tekrar çalıştırın.")
    else:
        process_logos(input_folder, output_folder)
