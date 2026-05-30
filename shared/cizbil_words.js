// shared/cizbil_words.js

let cizbilWords = [
    "AĞAÇ", "GÜNEŞ", "ARABA", "KEDİ", "KÖPEK",
    "EV", "TELEFON", "BİLGİSAYAR", "KİTAP", "GÖZLÜK",
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
}

// Check if we are in Node.js environment or browser to export correctly
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { cizbilWords };
}
