// shared/cizbil_words.js

let cizbilWords = [
    "AĞAÇ", "GÜNEŞ", "ARABA", "KEDİ", "KÖPEK",
    "EV", "TELEFON", "BİLGİSAYAR", "KİTAP", "GÖZLÜK",
    "SAAT", "MASA", "SANDALYE", "ELMA", "DENİZ",
    "BALIK", "KUŞ", "UÇAK", "BİSİKLET", "AYAKKABI",
    "ŞAPKA", "PANTOLON", "GÖMLEK", "KAPI", "TELEVİZYON",
    "KOLTUK", "YATAK", "YILDIZ", "AY", "ÇİÇEK"
];

if (typeof window !== 'undefined') {
    window.cizbilWords = cizbilWords;

    window.loadGarticWords = async function() {
        try {
            const response = await fetch('../Gartic/gartic.json');
            if (!response.ok) throw new Error('Failed to fetch gartic.json');

            const textData = await response.text();
            let parsed = [];

            // FIX: Try proper JSON.parse first, fallback to text splitting
            try {
                const jsonData = JSON.parse(textData);
                if (Array.isArray(jsonData)) {
                    parsed = jsonData.map(x => String(x).trim()).filter(x => x.length > 0);
                }
            } catch (jsonErr) {
                // Fallback: malformed JSON - remove brackets and split by comma
                const cleanedText = textData.trim().replace(/^\[/, '').replace(/\]$/, '');
                parsed = cleanedText.split(',')
                    .map(x => x.trim().replace(/\n/g, '').replace(/^["']|["']$/g, ''))
                    .filter(x => x.length > 0);
            }

            if (parsed.length > 0) {
                window.cizbilWords = parsed;
                cizbilWords = parsed;
            }
        } catch (e) {
            console.error("Gartic kelimeleri yuklenemedi:", e);
            // Fallback kelimeler kullanilacak
        }
        return window.cizbilWords;
    };
}

// Check if we are in Node.js environment or browser to export correctly
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { cizbilWords };
}
