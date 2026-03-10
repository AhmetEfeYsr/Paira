// shared/cizbil_words.js

const cizbilWords = [
    "AĞAÇ", "GÜNEŞ", "ARABA", "KEDİ", "KÖPEK",
    "EV", "TELEFON", "BİLGİSAYAR", "KİTAP", "GÖZLÜK",
    "SAAT", "MASA", "SANDALYE", "ELMA", "DENİZ",
    "BALIK", "KUŞ", "UÇAK", "BİSİKLET", "AYAKKABI",
    "ŞAPKA", "PANTOLON", "GÖMLEK", "KAPI", "TELEVİZYON",
    "KOLTUK", "YATAK", "YILDIZ", "AY", "ÇİÇEK"
];

// Check if we are in Node.js environment or browser to export correctly
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { cizbilWords };
} else if (typeof window !== 'undefined') {
    window.cizbilWords = cizbilWords;
}
