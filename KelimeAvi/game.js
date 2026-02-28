/**
 * game.js
 * Oyunun temel mantığını, UX yönlendirmelerini ve Akıllı Hata Tolerans (Fuzzy Search) motorunu içerir.
 */

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
class GameManager {
    constructor() {
        this.matcher = new FuzzyMatcher();
        this.wordList = ["AKINTI", "BARDAK", "CÜZDAN", "DEFTER", "ELMA", "FINDIK", "GÜNEŞ", "HAYVAN", "IRMAK", "KİTAP", "MASA", "NOKTA", "OTOBÜS", "PENCERE", "RADYO", "SAAT", "TELEFON", "UÇAK", "VAGON", "YILDIZ", "ZAMAN"];

        this.state = {
            status: 'lobby', // lobby, playing, voting, finished
            players: {},
            round: 1,
            totalRounds: 3,
            turnDuration: 45,
            timeIncrease: 15,

            // Puanlama Ayarları
            settings: {
                ebeWinPts: 2,
                masumWinPts: 1,
                jackpotPts: 5,
                voteCorrectPts: 1,
                voteWrongPts: 1
            },

            currentEbe: null,
            targetWord: '',
            revealedLetters: 1,

            submittedWords: {}, // { peerId: "kelime" }
            ebeGuesses: [], // ["kelime1", "kelime2", ...]

            endTime: 0
        };

        this.renderFrame = null;
    }

    initEventListeners() {
        const btnStart = document.getElementById('btn-start-game');
        if(btnStart) {
            btnStart.addEventListener('click', () => {
                if(NetworkManager.isHost()) this.startGame();
            });
        }

        const btnSubmitMasum = document.getElementById('btn-submit-masum');
        if(btnSubmitMasum) {
            btnSubmitMasum.addEventListener('click', () => {
                const word = document.getElementById('masum-word-input').value.trim();
                if(word.length === 0) return;
                this.handleLocalSubmission(word);
            });
        }

        const btnSubmitEbe = document.getElementById('btn-submit-ebe');
        if(btnSubmitEbe) {
            btnSubmitEbe.addEventListener('click', () => {
                const guesses = [
                    document.getElementById('ebe-guess-1').value.trim(),
                    document.getElementById('ebe-guess-2').value.trim(),
                    document.getElementById('ebe-guess-3').value.trim(),
                    document.getElementById('ebe-guess-4').value.trim(),
                    document.getElementById('ebe-guess-5').value.trim()
                ].filter(g => g.length > 0);

                if(guesses.length === 0) {
                    showToast("En az bir tahmin yapmalısın!", "warning");
                    return;
                }
                this.handleLocalEbeSubmission(guesses);
            });
        }
    }

    startGame() {
        const playerIds = Object.keys(this.state.players);
        if(playerIds.length < 3) {
            showToast("Oynamak için en az 3 oyuncu gerekiyor!", "error");
            return;
        }

        this.state.totalRounds = parseInt(document.getElementById('round-count').value) || 3;
        this.state.turnDuration = parseInt(document.getElementById('turn-duration').value) || 45;
        this.state.timeIncrease = parseInt(document.getElementById('time-increase').value) || 15;

        this.state.settings.ebeWinPts = parseInt(document.getElementById('pts-ebe-win').value) || 2;
        this.state.settings.masumWinPts = parseInt(document.getElementById('pts-masum-win').value) || 1;
        this.state.settings.jackpotPts = parseInt(document.getElementById('pts-jackpot').value) || 5;

        // Herkesin puanını sıfırla
        playerIds.forEach(id => this.state.players[id].score = 0);

        this.state.round = 1;
        this.state.status = 'playing';

        this.startNewTurn();
    }

    startNewTurn() {
        this.state.submittedWords = {};
        this.state.ebeGuesses = [];
        this.state.revealedLetters = 1;

        // Rastgele Ebe Seçimi
        const playerIds = Object.keys(this.state.players);
        this.state.currentEbe = playerIds[Math.floor(Math.random() * playerIds.length)];

        // Herkesi Masum yap, Ebeyi ebe yap
        playerIds.forEach(id => {
            this.state.players[id].role = (id === this.state.currentEbe) ? 'ebe' : 'masum';
        });

        // Rastgele Kelime Seçimi
        this.state.targetWord = this.wordList[Math.floor(Math.random() * this.wordList.length)];

        this.state.endTime = Date.now() + (this.state.turnDuration * 1000);

        NetworkManager.broadcastSync();
        this.syncRoundData();
        this.startTimer();
    }

    syncRoundData() {
        const myId = NetworkManager.getMyId();
        const amIEbe = (this.state.currentEbe === myId);

        const masumArea = document.getElementById('masum-area');
        const ebeArea = document.getElementById('ebe-area');
        const letterDisplay = document.getElementById('current-letters');

        document.getElementById('masum-word-input').value = '';
        document.getElementById('btn-submit-masum').disabled = false;

        [1,2,3,4,5].forEach(i => document.getElementById(`ebe-guess-${i}`).value = '');
        document.getElementById('btn-submit-ebe').disabled = false;

        document.getElementById('game-status-message').innerText = amIEbe ? "Ebesin! Sohbeti dinle, kelimeleri tahmin et!" : "Masumsun! Aranızda şifreli konuşun.";

        if(amIEbe) {
            masumArea.classList.add('hidden');
            ebeArea.classList.remove('hidden');
            letterDisplay.innerText = this.state.targetWord; // Ebe tüm kelimeyi görür
        } else {
            masumArea.classList.remove('hidden');
            ebeArea.classList.add('hidden');
            letterDisplay.innerText = this.state.targetWord.substring(0, this.state.revealedLetters) + "...";
        }
    }

    startTimer() {
        if(this.renderFrame) cancelAnimationFrame(this.renderFrame);

        const timerEl = document.getElementById('timer-display');

        const tick = () => {
            if(this.state.status !== 'playing') return;

            const left = Math.max(0, this.state.endTime - Date.now());
            const secs = Math.ceil(left / 1000);
            const m = Math.floor(secs / 60).toString().padStart(2, '0');
            const s = (secs % 60).toString().padStart(2, '0');
            timerEl.innerText = `${m}:${s}`;

            if (secs <= 10 && secs > 0) timerEl.style.color = 'var(--danger)';
            else timerEl.style.color = 'var(--lilac)';

            if (left <= 0 && NetworkManager.isHost()) {
                this.evaluateRound(); // Süre bitti
                return;
            }

            this.renderFrame = requestAnimationFrame(tick);
        };
        this.renderFrame = requestAnimationFrame(tick);
    }

    // Masumun kendi kelimesini göndermesi
    handleLocalSubmission(word) {
        document.getElementById('btn-submit-masum').disabled = true;
        showToast("Kelime gönderildi, diğerleri bekleniyor...", "info");

        if(NetworkManager.isHost()) {
            this.state.submittedWords[NetworkManager.getMyId()] = word;
            this.checkAllSubmissions();
        } else {
            NetworkManager.broadcast({ type: 'SUBMIT_WORD', word: word });
        }
    }

    // Ebe'nin tahminlerini göndermesi
    handleLocalEbeSubmission(guesses) {
        document.getElementById('btn-submit-ebe').disabled = true;
        showToast("Tahminler gönderildi!", "info");

        if(NetworkManager.isHost()) {
            this.state.ebeGuesses = guesses;
            this.checkAllSubmissions();
        } else {
            NetworkManager.broadcast({ type: 'SUBMIT_GUESSES', guesses: guesses });
        }
    }

    // Host: Uzaktan masum kelimesi geldi
    handleRemoteSubmission(peerId, word) {
        this.state.submittedWords[peerId] = word;
        this.checkAllSubmissions();
    }

    // Host: Uzaktan ebe tahminleri geldi
    handleRemoteGuesses(peerId, guesses) {
        this.state.ebeGuesses = guesses;
        this.checkAllSubmissions();
    }

    checkAllSubmissions() {
        if(!NetworkManager.isHost()) return;

        const playerIds = Object.keys(this.state.players);
        const masumCount = playerIds.length - 1; // 1 kişi ebe

        const receivedMasumWords = Object.keys(this.state.submittedWords).length;
        const ebeSubmitted = this.state.ebeGuesses.length > 0;

        if(receivedMasumWords === masumCount && ebeSubmitted) {
            this.evaluateRound();
        }
    }

    evaluateRound() {
        if(!NetworkManager.isHost()) return;
        if(this.state.status !== 'playing') return; // Çoklu tetiklenmeyi önle

        const masumWords = Object.values(this.state.submittedWords);
        const ebeGuesses = this.state.ebeGuesses;
        const targetWord = this.state.targetWord;

        let resultMsg = "";
        let isJackpot = false;
        let isMasumWin = false;
        let isEbeWin = false;

        // 1. Jackpot kontrolü
        let jackpotWinners = [];
        for (let [peerId, word] of Object.entries(this.state.submittedWords)) {
            if (this.matcher.isMatch(word, targetWord, 0.5)) { // Sıkı tolerans
                jackpotWinners.push(peerId);
                isJackpot = true;
            }
        }

        if(isJackpot) {
            resultMsg = "JACKPOT! Masumlar ana kelimeyi buldu!";
            jackpotWinners.forEach(id => {
                this.state.players[id].score += this.state.settings.jackpotPts;
            });
            NetworkManager.broadcast({ type: 'PLAY_SOUND', sound: 'correct' });
            if(typeof playSound === 'function') playSound('correct');
        } else {
            // 2. Masum eşleşmesi
            let masumMatch = false;
            let matchedWord = "";
            let matchedPeers = [];

            const entries = Object.entries(this.state.submittedWords);
            for (let i = 0; i < entries.length; i++) {
                let currentMatches = [entries[i][0]];
                for (let j = i + 1; j < entries.length; j++) {
                    if (this.matcher.isMatch(entries[i][1], entries[j][1])) {
                        currentMatches.push(entries[j][0]);
                        matchedWord = entries[i][1];
                    }
                }
                if(currentMatches.length >= 2) {
                    masumMatch = true;
                    matchedPeers = currentMatches;
                    break;
                }
            }

            if(masumMatch) {
                // Ebe bu eşleşen kelimeyi buldu mu?
                let ebeCaught = false;
                for (let guess of ebeGuesses) {
                    if (this.matcher.isMatch(guess, matchedWord)) {
                        ebeCaught = true; break;
                    }
                }

                if(ebeCaught) {
                    isEbeWin = true;
                    resultMsg = "EBE KAZANDI! Masumların eşleştiği kelimeyi ("+matchedWord+") bildi.";
                    this.state.players[this.state.currentEbe].score += this.state.settings.ebeWinPts;
                    NetworkManager.broadcast({ type: 'PLAY_SOUND', sound: 'taboo' });
                    if(typeof playSound === 'function') playSound('taboo');
                } else {
                    isMasumWin = true;
                    resultMsg = "MASUMLAR KAZANDI! Eşleştiler ("+matchedWord+") ama Ebe bulamadı.";
                    matchedPeers.forEach(id => {
                        this.state.players[id].score += this.state.settings.masumWinPts;
                    });
                    NetworkManager.broadcast({ type: 'PLAY_SOUND', sound: 'correct' });
                    if(typeof playSound === 'function') playSound('correct');

                    // Ödül: Harf aç
                    this.state.revealedLetters++;
                }
            } else {
                resultMsg = "Masumlar kendi aralarında eşleşemedi!";
                NetworkManager.broadcast({ type: 'PLAY_SOUND', sound: 'pass' });
                if(typeof playSound === 'function') playSound('pass');
            }
        }

        NetworkManager.broadcastSync();
        NetworkManager.broadcast({ type: 'ACTION', action: 'SHOW_RESULT', msg: resultMsg });
        this.processAction('SHOW_RESULT', null, resultMsg);

        // Sonraki tura geçiş
        setTimeout(() => {
            this.handleRoundEndTransition(isJackpot, isEbeWin, isMasumWin);
        }, 5000);
    }

    handleRoundEndTransition(isJackpot, isEbeWin, isMasumWin) {
        if(this.state.round >= this.state.totalRounds) {
            this.state.status = 'finished';
            NetworkManager.broadcastSync();
            updateUI();
        } else {
            this.state.round++;
            if(!isJackpot && !isEbeWin && isMasumWin) {
                // Masum kazandıysa tur devam eder, süre artar
                this.state.endTime = Date.now() + (this.state.timeIncrease * 1000);
                this.state.submittedWords = {};
                this.state.ebeGuesses = [];
                NetworkManager.broadcastSync();
                this.syncRoundData();
                this.startTimer();
            } else {
                // Ebe kazandı, eşleşilemedi veya Jackpot olduysa yeni tur başlar
                this.startNewTurn();
            }
        }
    }

    endRoundPrematurely(reasonMsg) {
        if(!NetworkManager.isHost()) return;

        if(this.renderFrame) cancelAnimationFrame(this.renderFrame);

        NetworkManager.broadcast({ type: 'ACTION', action: 'SHOW_RESULT', msg: reasonMsg });
        this.processAction('SHOW_RESULT', null, reasonMsg);

        setTimeout(() => {
            this.startNewTurn();
        }, 5000);
    }

    processAction(action, peerId, payload = null) {
        if(action === 'SHOW_RESULT') {
            showToast(payload, "info");
            const gs = document.getElementById('game-status-message');
            if(gs) {
                gs.innerText = payload;
                gs.style.color = 'var(--warning)';
            }
        }
    }
}

// Global UI Fonksiyonları
function updateUI() {
    if(!window.gameApp) return;
    const state = window.gameApp.state;

    // Oyuncu Listesi (Lobi & Oyun)
    const pList = document.getElementById('players-list');
    if (pList) {
        pList.innerHTML = '';
        Object.values(state.players).forEach(p => {
            const li = document.createElement('li');
            li.innerHTML = `<span>${p.isHost ? '👑 ' : ''}${escapeHtml(p.name)} ${p.id === NetworkManager.getMyId() ? '(Sen)' : ''}</span> <strong>${p.score} Puan</strong>`;
            pList.appendChild(li);
        });

        const count = document.getElementById('player-count');
        if(count) count.innerText = Object.keys(state.players).length;
    }

    // Oyun İçi UI
    if(state.status === 'playing') {
        const roundInd = document.getElementById('round-indicator');
        if(roundInd) roundInd.innerText = `Tur ${state.round} / ${state.totalRounds}`;
    }

    // Bitir Ekranı
    if(state.status === 'finished') {
        const scoresDiv = document.getElementById('final-scores');
        if(scoresDiv) {
            scoresDiv.innerHTML = '';
            // Puanlara göre sırala
            const sorted = Object.values(state.players).sort((a,b) => b.score - a.score);
            sorted.forEach((p, index) => {
                scoresDiv.innerHTML += `<div style="font-size: 1.2rem; margin: 10px 0;">${index+1}. ${escapeHtml(p.name)} - <strong>${p.score} Puan</strong></div>`;
            });
        }
    }
}

function escapeHtml(text) {
    if (text == null) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showScreen(screenId) {
    document.querySelectorAll('.view-state').forEach(el => {
        if (el.id === screenId) {
            el.classList.remove('hidden');
            el.classList.add('active');
        } else {
            el.classList.add('hidden');
            el.classList.remove('active');
        }
    });
}

function showToast(msg, type = "info") {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const colors = { error: 'var(--danger)', success: 'var(--success)', warning: 'var(--warning)', info: 'var(--primary-blue)' };
    toast.style.borderLeftColor = colors[type] || colors.info;
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
}

// Ses Fonksiyonları (Basit)
let audioCtx = null;
function initAudio() {
    if (!audioCtx) {
        try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return; }
    }
    if (audioCtx?.state === 'suspended') audioCtx.resume();
}
function playSound(type) {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    if (type === 'correct') {
        osc.type = 'sine'; osc.frequency.setValueAtTime(523.25, audioCtx.currentTime); osc.frequency.setValueAtTime(659.25, audioCtx.currentTime + 0.1);
        gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime); gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
        osc.start(); osc.stop(audioCtx.currentTime + 0.3);
    } else if (type === 'taboo') { // Hata sesi olarak kullanalım
        osc.type = 'sawtooth'; osc.frequency.setValueAtTime(150, audioCtx.currentTime); osc.frequency.linearRampToValueAtTime(100, audioCtx.currentTime + 0.3);
        gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime); gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
        osc.start(); osc.stop(audioCtx.currentTime + 0.3);
    } else if (type === 'pass') { // Nötr/Geçiş sesi
        osc.type = 'triangle'; osc.frequency.setValueAtTime(300, audioCtx.currentTime); osc.frequency.exponentialRampToValueAtTime(150, audioCtx.currentTime + 0.2);
        gainNode.gain.setValueAtTime(0.2, audioCtx.currentTime); gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.2);
        osc.start(); osc.stop(audioCtx.currentTime + 0.2);
    }
}

// Başlat
document.addEventListener('DOMContentLoaded', () => {
    window.gameApp = new GameManager();
    window.gameApp.initEventListeners();
    document.body.addEventListener('click', initAudio, { once: true });

    // Lobiye Dön Butonu
    const btnBack = document.getElementById('btn-back-to-lobby');
    if(btnBack) {
        btnBack.addEventListener('click', () => {
            if(NetworkManager.isHost()) {
                window.gameApp.state.status = 'lobby';
                NetworkManager.broadcastSync();
                showScreen('lobby-screen');
            }
        });
    }

    // Gelişmiş Ayarlar Toggle
    const btnAdvanced = document.getElementById('btn-toggle-advanced');
    const advancedSettings = document.getElementById('advanced-settings');
    if(btnAdvanced && advancedSettings) {
        btnAdvanced.addEventListener('click', () => {
            advancedSettings.classList.toggle('hidden');
        });
    }
});