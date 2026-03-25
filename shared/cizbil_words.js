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

            // The JSON is currently malformed with an unquoted array [ word, word, ... ]
            // We read as text, remove brackets and newlines, and split by comma.
            const textData = await response.text();
            const cleanedText = textData.trim().replace(/^\[/, '').replace(/\]$/, '');
            const parsed = cleanedText.split(',').map(x => x.trim().replace(/\n/g, '')).filter(x => x.length > 0);

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
