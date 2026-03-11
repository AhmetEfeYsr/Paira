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
            const data = await response.json();

            let rawWords = [];
            if (Array.isArray(data)) {
                rawWords = data;
            } else if (typeof data === 'string') {
                rawWords = [data];
            } else if (data && data.words) {
                rawWords = Array.isArray(data.words) ? data.words : [data.words];
            }

            const parsed = rawWords.flatMap(w =>
                typeof w === 'string' ? w.split(',').map(x => x.trim()).filter(x => x) : w
            );

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
