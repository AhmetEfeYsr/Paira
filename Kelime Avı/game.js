/**
 * game.js
 * Oyunun temel mantığını, UX yönlendirmelerini ve Akıllı Hata Tolerans (Fuzzy Search) motorunu içerir.
 */
// --- GUVENLIK: Prototype Pollution Engelleme ---
function isDangerousKey(key) {
    const dangerousProps = [
        '__proto__', 'constructor', 'prototype',
        'toString', 'hasOwnProperty', '__defineGetter__', '__defineSetter__',
        '__lookupGetter__', '__lookupSetter__', 'isPrototypeOf',
        'propertyIsEnumerable', 'toLocaleString', 'valueOf'
    ];
    return dangerousProps.includes(key);
}


// 1. AKILLI HATA TOLERANS MOTORU (Fuzzy Matcher)
class FuzzyMatcher {
    constructor() {
        // Türkçe Q klavye için basitleştirilmiş komşuluk haritası
        this.qwertyMap = {
            'q': ['w','a','s'], 'w': ['q','e','a','s','d'], 'e': ['w','r','s','d','f'],
            'r': ['e','t','d','f','g'], 't': ['r','y','f','g','h'], 'y': ['t','u','g','h','j'],
            'u': ['y','ı','i','h','j','k'], 'ı': ['u','o','j','k','l'], 'o': ['ı','p','k','l','ş'],
            'p': ['o','ğ','l','ş','i'], 'ğ': ['p','ü','ş','i'], 'ü': ['ğ','ş'],
            'a': ['q','w','s','z','x'], 's': ['a','d','w','e','z','x','c'], 'd': ['s','f','e','r','x','c','v'],
            'f': ['d','g','r','t','c','v','b'], 'g': ['f','h','t','y','v','b','n'], 'h': ['g','j','y','u','b','n','m'],
            'j': ['h','k','u','ı','n','m','ö'], 'k': ['j','l','ı','o','m','ö','ç'], 'l': ['k','ş','o','p','ö','ç'],
            'ş': ['l','i','p','ğ','ç'], 'i': ['ş','p','ğ'],
            'z': ['a','s','x'], 'x': ['z','c','s','d'], 'c': ['x','v','d','f'],
            'v': ['c','b','f','g'], 'b': ['v','n','g','h'], 'n': ['b','m','h','j'],
            'm': ['n','ö','j','k'], 'ö': ['m','ç','k','l'], 'ç': ['ö','l','ş']
        };
    }

    // İki harf klavyede yan yana mı?
    isAdjacent(char1, char2) {
        if (!this.qwertyMap[char1]) return false;
        return this.qwertyMap[char1].includes(char2);
    }

    // Ağırlıklı Damerau-Levenshtein Mesafesi
    getDistance(word1, word2) {
        word1 = word1.toLowerCase();
        word2 = word2.toLowerCase();
        
        const len1 = word1.length;
        const len2 = word2.length;
        const matrix = Array(len1 + 1).fill(null).map(() => Array(len2 + 1).fill(0));

        for (let i = 0; i <= len1; i++) matrix[i][0] = i;
        for (let j = 0; j <= len2; j++) matrix[0][j] = j;

        for (let i = 1; i <= len1; i++) {
            for (let j = 1; j <= len2; j++) {
                const cost = word1[i - 1] === word2[j - 1] ? 0 : 
                            (this.isAdjacent(word1[i - 1], word2[j - 1]) ? 0.4 : 1); // Q klavye komşuluğu ucuza mal olur

                matrix[i][j] = Math.min(
                    matrix[i - 1][j] + 1,      // Silme
                    matrix[i][j - 1] + 1,      // Ekleme
                    matrix[i - 1][j - 1] + cost // Değiştirme
                );

                // Damerau eklentisi: Yanlış sırada basılma (Anagram / Transposition)
                if (i > 1 && j > 1 && word1[i - 1] === word2[j - 2] && word1[i - 2] === word2[j - 1]) {
                    matrix[i][j] = Math.min(
                        matrix[i][j],
                        matrix[i - 2][j - 2] + 0.5 // Transposition (Harf yer değiştirme) cezası çok düşük
                    );
                }
            }
        }
        return matrix[len1][len2];
    }

    // Kelimeler eşleşiyor mu? (Örn: Hata payı <= 1.2 ise kabul et)
    isMatch(word1, word2, tolerance = 1.2) {
        return this.getDistance(word1, word2) <= tolerance;
    }
}


// 2. OYUN YÖNETİCİSİ (Game Manager)
// WebRTC mimarisine uyumlu: Sadece state tutar ve UI'yi günceller.
class GameManager {
    constructor() {
        this.matcher = new FuzzyMatcher();
        this.state = {
            role: 'masum', // 'ebe' veya 'masum'
            currentLetter: '',
            fullWord: '', // Sadece Ebe bilir
            roundTime: 20,
            playersReady: 0,
            submittedWords: {} // { peerId: "kelime" }
        };

        // UI Elementleri (index.html'de bu id'lerin olduğunu varsayıyoruz)
        this.ui = {
            statusText: document.getElementById('status-text'),
            letterDisplay: document.getElementById('letter-display'),
            wordInput: document.getElementById('word-input'),
            submitBtn: document.getElementById('submit-btn'),
            feedbackArea: document.getElementById('feedback-area')
        };

        this.initEventListeners();
    }

    initEventListeners() {
        if(!this.ui.submitBtn) return; // UI yüklenmediyse bekle
        
        this.ui.submitBtn.addEventListener('click', () => {
            const word = this.ui.wordInput.value.trim();
            if (word.length === 0) return;
            
            this.handleLocalSubmission(word);
        });
    }

    // UX Yönlendirmeleri: Ekrana bilgi basma
    updateUX(message, type = 'info') {
        if(!this.ui.feedbackArea) return;
        this.ui.feedbackArea.innerHTML = `<div class="feedback-msg ${type}">${message}</div>`;
        // 'info', 'success', 'warning', 'error' sınıfları style.css'te tanımlanmalı.
    }

    // Yeni tur başladığında çağrılır (network.js'den tetiklenir)
    startRound(role, wordData) {
        this.state.role = role;
        this.state.submittedWords = {};
        this.ui.wordInput.value = '';
        this.ui.wordInput.disabled = false;
        this.ui.submitBtn.disabled = false;

        if (role === 'ebe') {
            this.state.fullWord = wordData.word;
            this.ui.letterDisplay.innerText = wordData.word;
            this.updateUX("Ebesin! Masumları dinle ve hangi kelimeyi yazacaklarını 3 tahmin kutusuna gir.", "warning");
            // Not: Ebe için 3'lü input UI mantığı eklenecek
        } else {
            this.state.currentLetter = wordData.letter;
            this.ui.letterDisplay.innerText = wordData.letter;
            this.updateUX("Masumsun! Şifreli konuş ve Ebeyi uyandırmadan harfle başlayan bir kelimede anlaş.", "info");
        }
    }

    // Kullanıcı kelimeyi gönderdiğinde
    handleLocalSubmission(word) {
        this.ui.wordInput.disabled = true;
        this.ui.submitBtn.disabled = true;
        this.updateUX("Kelimeniz gönderildi, diğer oyuncular bekleniyor...", "info");

        // BURASI P2P BAĞLANTISI İÇİNDİR. network.js içindeki fonksiyonu çağırır.
        // window.NetworkManager.broadcast({ type: 'SUBMIT_WORD', word: word });
        
        // Şimdilik test için kendi state'imize ekleyelim
        this.state.submittedWords['localUser'] = word;
    }

    // WebRTC'den bir oyuncunun kelimesi geldiğinde
    handleRemoteSubmission(peerId, word) {
        if (isDangerousKey(peerId)) {
            console.error("Dangerous peer ID blocked in submission:", peerId);
            return;
        }
        this.state.submittedWords[peerId] = word;
        // Eğer Ebe(Host) isek ve herkes gönderdiyse değerlendirmeyi başlat
        // if (Object.keys(this.state.submittedWords).length === TOTAL_PLAYERS) {
        //     this.evaluateRound();
        // }
    }

    // Tur bitiminde kelimeleri Akıllı Tolerans ile karşılaştırma
    evaluateRound(masumWords, ebeGuesses, targetWord) {
        // Jackpot kontrolü
        for (let word of masumWords) {
            if (this.matcher.isMatch(word, targetWord, 0.5)) {
                this.updateUX("JACKPOT! Bir masum ana kelimeyi buldu!", "success");
                return { result: 'jackpot' };
            }
        }

        // Masumlar kendi aralarında eşleşti mi?
        let masumMatch = false;
        let matchedWord = "";
        
        for (let i = 0; i < masumWords.length; i++) {
            for (let j = i + 1; j < masumWords.length; j++) {
                if (this.matcher.isMatch(masumWords[i], masumWords[j])) {
                    masumMatch = true;
                    matchedWord = masumWords[i]; // Eşleşen ana kelime
                    break;
                }
            }
            if(masumMatch) break;
        }

        // Eğer masumlar eşleştiyse, Ebe bunu tahmin edebildi mi?
        if (masumMatch) {
            let ebeCaught = false;
            for (let guess of ebeGuesses) {
                if (this.matcher.isMatch(guess, matchedWord)) {
                    ebeCaught = true;
                    break;
                }
            }

            if (ebeCaught) {
                this.updateUX("Ebe masumları avladı! Tahmini doğruydu.", "error");
                return { result: 'ebe_win' };
            } else {
                this.updateUX("Masumlar başardı! Ebe kelimeyi bulamadı.", "success");
                return { result: 'masum_win' };
            }
        } else {
            this.updateUX("Masumlar kendi aralarında eşleşemedi!", "warning");
            return { result: 'fail' };
        }
    }
}

// Global olarak başlat
window.gameApp = new GameManager();
