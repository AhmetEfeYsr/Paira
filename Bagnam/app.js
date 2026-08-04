// Bagnam Game Logic
const MOCK_FIREBASE_URL = "https://raw.githubusercontent.com/AhmetEfeYSR/BagnamMockData/main/daily_words.json"; // Placeholder for now

let targetDate = ""; // Hedeflenen tarih (YYYY-MM-DD) veya sonsuz mod id
let gameMode = "daily"; // "daily" veya "endless"
let endlessGameData = null; // Sonsuz mod için R2'den çekilen toplu veri
let guesses = []; // Kullanıcının tahminleri: { word: string, rank: number, score: number, hintAssisted: boolean }
let hasWon = false;
let hintsUsed = 0; // Kaç ipucu kullanıldı
let hintDataCache = null;
let lastHintStage = null;
let lastHintType = null;
let revealedHintWords = new Set(); // İpucuyla açığa çıkan kelimeler
let skippedHintStages = new Set(); // Kelimesi zaten bilindiği için atlanan aşamalar
let hintHistory = []; // Alınan tüm ipuçları: { title: string, content: string }


document.addEventListener('DOMContentLoaded', () => {
    const btnStart = document.getElementById('btn-start');
    const btnGuess = document.getElementById('btn-guess');
    const wordInput = document.getElementById('word-input');
    const btnGiveup = document.getElementById('btn-giveup');
    const btnHint = document.getElementById('btn-hint');
    const btnPlayPast = document.getElementById('btn-play-past');
    const datePicker = document.getElementById('past-date-picker');

    // Set max date to today
    if (datePicker) {
        datePicker.max = window.getTodayDateTR();
    }

    if(btnStart) btnStart.addEventListener('click', () => initGame());
    if(btnPlayPast && datePicker) {
        btnPlayPast.addEventListener('click', () => {
            if(!datePicker.value) {
                showToast("Lütfen bir tarih seçin.", "warning");
                return;
            }
            initGame(datePicker.value, false);
        });
    }
    const btnEndless = document.getElementById('btn-endless');
    if(btnEndless) btnEndless.addEventListener('click', () => initGame(null, true));
    if(btnGuess) btnGuess.addEventListener('click', handleGuess);
    if(wordInput) {
        wordInput.addEventListener('keydown', (e) => {
            if(e.key === 'Enter') handleGuess();
        });
    }
    if(btnGiveup) btnGiveup.addEventListener('click', handleGiveUp);
    if(btnHint) btnHint.addEventListener('click', handleHint);

    const btnLastHint = document.getElementById('btn-last-hint');
    if(btnLastHint) btnLastHint.addEventListener('click', showLastHint);

    const btnBack = document.getElementById('btn-back');
    if(btnBack) {
        btnBack.addEventListener('click', () => {
            if (hasWon || confirm("Oyundan çıkmak istediğinize emin misiniz? İlerlemeniz kaydedilecek.")) {
                window.showScreen('login-screen');
                const btnStart = document.getElementById('btn-start');
                const btnPlayPast = document.getElementById('btn-play-past');
                const btnEndless = document.getElementById('btn-endless');
                if (btnStart) btnStart.classList.remove('hidden');
                if (btnPlayPast) btnPlayPast.disabled = false;
                if (btnEndless) btnEndless.classList.remove('hidden');
            }
        });
    }
});

function resetGameState() {
    targetDate = "";
    guesses = [];
    hasWon = false;
    hintsUsed = 0;
    hintDataCache = null;
    lastHintStage = null;
    lastHintType = null;
    revealedHintWords = new Set();
    skippedHintStages = new Set();
    hintHistory = [];

    const btnLastHint = document.getElementById('btn-last-hint');
    if (btnLastHint) {
        btnLastHint.classList.add('hidden');
    }

    const btnHint = document.getElementById('btn-hint');
    if (btnHint) {
        btnHint.innerHTML = '💡';
        btnHint.disabled = false;
        btnHint.style.opacity = "1";
    }

    document.getElementById('guess-count').textContent = "0";
    document.getElementById('word-input').value = "";
    document.getElementById('word-input').disabled = false;
    document.getElementById('btn-guess').disabled = false;

    const btnGiveup = document.getElementById('btn-giveup');
    if (btnGiveup) btnGiveup.disabled = false;

    const successMsg = document.getElementById('success-message');
    successMsg.classList.add('hidden');
    // Reset styling from give up failure
    successMsg.innerHTML = `<h2 style="margin:0;">Tebrikler! 🎉</h2><p>Günün kelimesini <strong><span id="final-guess-count">X</span></strong> tahminde buldunuz.</p>`;
    successMsg.style.borderColor = 'var(--success)';
    successMsg.style.background = 'var(--success-bg)';

    document.getElementById('guess-history').innerHTML = "";
}


async function initGame(selectedDateStr = null, isEndless = false) {
    if (window.PairaAudio) {
        window.PairaAudio.init();
    }

    const btnStart = document.getElementById('btn-start');
    const btnPlayPast = document.getElementById('btn-play-past');
    const btnEndless = document.getElementById('btn-endless');
    const loading = document.getElementById('loading-indicator');

    if (btnStart) btnStart.classList.add('hidden');
    if (btnPlayPast) btnPlayPast.disabled = true;
    if (btnEndless) btnEndless.classList.add('hidden');
    loading.classList.remove('hidden');

    resetGameState();

    gameMode = isEndless ? "endless" : "daily";
    let intendedDate = isEndless ? null : (selectedDateStr || window.getTodayDateTR());
    let savedState = tryLoadGameState(gameMode, intendedDate);

    if (isEndless) {
        if (savedState) {
            targetDate = savedState.targetDate;
            showToast("Sonsuz Mod (Kaldığın Yerden) yükleniyor...", "info");
        } else {
            let playedEndlessIds = [];
            try {
                const stored = localStorage.getItem("playedEndlessIds");
                if (stored) playedEndlessIds = JSON.parse(stored);
            } catch (e) {}

            if (playedEndlessIds.length >= 99) {
                playedEndlessIds = []; // Hepsi bitince başa sar
            }

            let randomId;
            let attempts = 0;
            do {
                randomId = Math.floor(Math.random() * 99) + 1;
                attempts++;
                if (attempts > 500) break;
            } while (playedEndlessIds.includes(randomId));

            playedEndlessIds.push(randomId);
            try {
                localStorage.setItem("playedEndlessIds", JSON.stringify(playedEndlessIds));
            } catch (e) {}

            targetDate = randomId.toString();
            showToast("Sonsuz Mod yükleniyor... Lütfen bekleyin.", "info");
        }

        try {
            const res = await fetch(`https://db.pairaaa.com/Sonsuz%20Mod/${targetDate}.json`);
            if (!res.ok) throw new Error("Ağ hatası");
            endlessGameData = await res.json();
            
            if (savedState) {
                restoreGameState(savedState);
                showToast("Kaldığınız yerden devam ediyorsunuz!", "success");
            } else {
                showToast("Sonsuz Mod başlatıldı! ID: " + targetDate, "success");
            }
        } catch (e) {
            console.error("Sonsuz mod verisi çekilemedi:", e);
            showToast("Sonsuz mod verisi yüklenemedi. Lütfen tekrar deneyin.", "error");
            loading.classList.add('hidden');
            if (btnStart) btnStart.classList.remove('hidden');
            if (btnPlayPast) btnPlayPast.disabled = false;
            if (btnEndless) btnEndless.classList.remove('hidden');
            return;
        }

    } else {
        endlessGameData = null;
        targetDate = intendedDate;
        
        if (savedState) {
            restoreGameState(savedState);
            showToast("Kaldığınız yerden devam ediyorsunuz!", "success");
        }
    }

    window.showScreen('game-screen');
    document.getElementById('word-input').focus();

    // Temizle loading
    loading.classList.add('hidden');
}

// Logaritmik skor hesaplayıcı (UI gösterimi için)
function calculateLogarithmicScore(rank, maxWords = 30000) {
    if (rank === 1) return 1.0;
    if (rank > maxWords) return 0.0;

    // Logaritmik düşüş: Rank büyüdükçe puan yavaşça azalır, rank küçükken puan yüksektir
    const logMax = Math.log(maxWords);
    const logRank = Math.log(rank);
    let score = 1 - (logRank / logMax);

    // Yüzdelik olarak (0.0 - 1.0 aralığına sıkıştırıyoruz)
    return Math.max(0, Math.min(1, score));
}

async function handleGuess() {
    if(hasWon) return;

    const inputEl = document.getElementById('word-input');
    const btnGuess = document.getElementById('btn-guess');
    let rawWord = inputEl.value;
    let word = rawWord.toLocaleLowerCase('tr-TR').trim();
    let normalizedWord = window.normalizeTurkishChars ? window.normalizeTurkishChars(word) : word;

    if(!word) return;

    // 🥚 Easter Egg: "paira" özel kelime
    if (word === 'paira') {
        if (guesses.some(g => g.word === 'paira')) {
            showToast("Bu kelimeyi zaten tahmin ettiniz!", "warning");
            inputEl.value = "";
            inputEl.focus();
            return;
        }
        guesses.push({ word: 'paira', rank: 1, score: 1.0, hintAssisted: false, isPairaEgg: true });
        document.getElementById('guess-count').textContent = guesses.length;
        inputEl.value = "";
        renderHistory();
        showToast("canım ablam 💜", "success");
        if (window.PairaAudio) {
            window.PairaAudio.play('correct');
        }
        inputEl.focus();
        return;
    }

    // Check if already guessed (normalized check)
    const normalizedWordBase = normalizedWord.replace(/_\d+$/, '');
    if (guesses.some(g => {
        const gNorm = window.normalizeTurkishChars ? window.normalizeTurkishChars(g.word) : g.word;
        return gNorm === normalizedWordBase;
    })) {
        showToast("Bu kelimeyi zaten tahmin ettiniz!", "warning");
        inputEl.value = "";
        inputEl.focus();
        return;
    }

    // Disable inputs while fetching
    inputEl.disabled = true;
    btnGuess.disabled = true;

    try {
        // Kullanıcı "ağaç" yazmış olabilir, "agac" yazmış olabilir.
        // Veritabanında her iki versiyon da mevcut olabilir.
        // O yüzden hem orijinal (küçük harf) hem de normalize edilmiş haliyle arama yapacağız.
        let basesToCheck = [word];
        if (word !== normalizedWord) {
            basesToCheck.push(normalizedWord);
        }

        let wordsToCheck = [];
        
        for (const base of basesToCheck) {
            const match = base.match(/_([1-5])$/);
            if (match) {
                if (!wordsToCheck.includes(base)) wordsToCheck.push(base);
            } else {
                if (!wordsToCheck.includes(base)) wordsToCheck.push(base);
                for (let i = 1; i <= 5; i++) {
                    const withSuffix = `${base}_${i}`;
                    if (!wordsToCheck.includes(withSuffix)) wordsToCheck.push(withSuffix);
                }
            }
        }

        let foundData = [];
        
        if (gameMode === "endless") {
            if (!endlessGameData) throw new Error("Sonsuz mod verisi eksik.");
            for (let i = 0; i < wordsToCheck.length; i++) {
                const w = wordsToCheck[i];
                if (endlessGameData[w]) {
                    foundData.push({
                        word: w,
                        data: endlessGameData[w]
                    });
                }
            }
        } else {
            // Fetch homonym variants directly via parallel GET requests (avoids 401 unindexed orderBy error on Firebase RTDB)
            const fetchPromises = wordsToCheck.map(async (w) => {
                const url = `https://paira-games-default-rtdb.firebaseio.com/gunluk_oyun/${targetDate}/${encodeURIComponent(w)}.json`;
                try {
                    const response = await fetch(url);
                    if (response.ok) {
                        const resJson = await response.json();
                        if (resJson && typeof resJson === 'object') {
                            foundData.push({
                                word: w,
                                data: resJson
                            });
                        }
                    }
                } catch (e) {
                    console.error("Kelime varyantı çekilirken hata:", w, e);
                }
            });
            await Promise.all(fetchPromises);
        }

        if (foundData.length === 0) {
            // Word not found in the dataset
            showToast(`"${rawWord}" kelimesi sözlükte bulunamadı.`, "warning");
            if (window.PairaAudio) {
                window.PairaAudio.play('wrong');
            }
            inputEl.value = "";
            inputEl.focus();
            // Visual shake feedback
            inputEl.classList.add('error-shake');
            setTimeout(() => inputEl.classList.remove('error-shake'), 400);
        } else {
            // Find the single best match among all variants and homonyms
            let bestMatch = null;
            for (const item of foundData) {
                const finalData = item.data;
                const baseWord = item.word.replace(/_\d+$/, '');
                
                if (typeof finalData === "object" && typeof finalData.r === "number" && typeof finalData.s === "number") {
                    if (!bestMatch || finalData.s > bestMatch.s) {
                        bestMatch = {
                            word: baseWord,
                            r: finalData.r,
                            s: finalData.s
                        };
                    }
                }
            }

            let addedAny = false;

            if (bestMatch) {
                const baseWord = bestMatch.word;
                const rank = bestMatch.r;
                const score = bestMatch.s;

                // Eğer kelime önceden eklenmişse uyarı ver ve iptal et
                if (guesses.some(g => g.word === baseWord)) {
                    showToast("Bu kelimeyi zaten tahmin ettiniz!", "warning");
                    inputEl.value = "";
                    inputEl.focus();
                    return;
                }

                // Add guess (ipucuyla açığa çıkmış kelime mi kontrol et)
                const isHintAssisted = revealedHintWords.has(baseWord);
                guesses.push({
                    word: baseWord,
                    rank: rank,
                    score: score,
                    hintAssisted: isHintAssisted
                });
                addedAny = true;

                // Check win condition
                if(rank === 1) {
                    hasWon = true;
                }
            }
            
            // Eğer none valid (foundData var ama data geçersizse)
            if (!addedAny && !hasWon) {
                 throw new Error("Geçersiz veri formatı döndü.");
            }

            // Update UI
            document.getElementById('guess-count').textContent = guesses.length;
            inputEl.value = "";

            // Re-render history list
            renderHistory();

            saveGameState(); // <-- Otomatik Kayıt

            // Check win condition UI update
            if(hasWon) {
                handleWin();
            } else {
                inputEl.focus();
            }
        }

    } catch (error) {
        console.error("Tahmin yapılırken hata:", error);
        showToast("Bir hata oluştu. Lütfen tekrar deneyin.", "error");
    } finally {
        if (!hasWon) {
            inputEl.disabled = false;
            btnGuess.disabled = false;
            inputEl.focus();
        }
    }
}

function renderHistory() {
    const listEl = document.getElementById('guess-history');
    listEl.innerHTML = '';

    // Sort guesses by rank (lowest rank first)
    const sortedGuesses = [...guesses].sort((a, b) => a.rank - b.rank);

    sortedGuesses.forEach((g, index) => {
        const li = document.createElement('li');
        li.className = 'history-item';

        // Dinamik sıcak-soğuk renk: similarity skora göre HSL gradient
        const colorStyle = getSimilarityColor(g.score, g.rank);
        li.style.background = colorStyle.bg;
        li.style.borderLeft = `4px solid ${colorStyle.border}`;
        li.style.borderRight = `1px solid ${colorStyle.borderSubtle}`;
        li.style.borderTop = `1px solid ${colorStyle.borderSubtle}`;
        li.style.borderBottom = `1px solid ${colorStyle.borderSubtle}`;

        // Dinamik parlama için CSS değişkenleri
        li.style.setProperty('--item-h', colorStyle.h);
        li.style.setProperty('--item-s', `${colorStyle.s}%`);
        li.style.setProperty('--item-l', `${colorStyle.l}%`);

        // Giriş animasyonu
        li.style.animationDelay = `${index * 0.03}s`;

        const wordDiv = document.createElement('div');
        wordDiv.className = 'word';
        
        // İpucuyla bilinen kelimeye sembol ekle
        if (g.hintAssisted) {
            const hintIcon = document.createElement('span');
            hintIcon.className = 'hint-badge';
            hintIcon.textContent = '💡';
            hintIcon.title = 'İpucuyla bulunan kelime';
            wordDiv.appendChild(hintIcon);
        }
        
        const wordText = document.createElement('span');

        // 🥚 Paira easter egg: taç ve canım ablam
        if (g.isPairaEgg) {
            const crownIcon = document.createElement('span');
            crownIcon.textContent = '👑';
            crownIcon.style.marginRight = '4px';
            wordDiv.appendChild(crownIcon);
            
            wordText.textContent = g.word;
            wordDiv.appendChild(wordText);

            const loveText = document.createElement('span');
            loveText.className = 'paira-love-text';
            loveText.textContent = 'canım ablam 💜';
            wordDiv.appendChild(loveText);
        } else {
            wordText.textContent = g.word;
            wordDiv.appendChild(wordText);
        }

        const rankDiv = document.createElement('div');
        rankDiv.className = 'rank-score';

        const rankSpan = document.createElement('span');
        rankSpan.className = 'rank';
        rankSpan.style.color = colorStyle.text;
        rankSpan.textContent = `#${g.rank}`;

        const scoreSpan = document.createElement('span');
        scoreSpan.className = 'score';
        // Benzerlik bar gösterimi
        const pct = (g.score * 100).toFixed(1);
        scoreSpan.innerHTML = `<span class="score-bar-wrap"><span class="score-bar" style="width: ${pct}%; background: ${colorStyle.border};"></span></span><span class="score-text">${pct}%</span>`;

        rankDiv.appendChild(rankSpan);
        rankDiv.appendChild(scoreSpan);

        li.appendChild(wordDiv);
        li.appendChild(rankDiv);

        listEl.appendChild(li);
    });
}

/**
 * Similarity skora göre renk üretir.
 * score: 0.0 (en uzak) - 1.0 (en yakın)
 * Renk skalası: Kırmızı (0.0) → Sarı (0.5) → Yeşil (1.0)
 */
function getSimilarityColor(score, rank) {
    if (rank === 1) {
        // Hedef kelime - özel yeşil parıltı (eski altın parıltı yerine)
        return {
            bg: 'linear-gradient(135deg, rgba(46, 204, 113, 0.35), rgba(39, 174, 96, 0.4))',
            border: '#2ecc71',
            borderSubtle: 'rgba(46, 204, 113, 0.5)',
            text: '#2ecc71',
            h: 145, s: 63, l: 49
        };
    }

    // Nonlinear mapping for better visual distribution
    const t = Math.pow(score, 0.7); // Düşük skorlara daha fazla renk aralığı
    
    // Hue: 0 (Kırmızı) → 60 (Sarı) → 120 (Yeşil)
    let hue = t * 120;

    const saturation = 70 + score * 30; // 70-100%
    const lightness = 45 + (1 - score) * 15; // yakın: 45%, uzak: 60%
    const alpha = 0.15 + score * 0.25; // 0.15 - 0.40
    const borderAlpha = 0.4 + score * 0.5; // 0.4 - 0.9

    return {
        bg: `hsla(${hue}, ${saturation}%, ${lightness}%, ${alpha})`,
        border: `hsl(${hue}, ${saturation}%, ${lightness}%)`,
        borderSubtle: `hsla(${hue}, ${saturation}%, ${lightness}%, ${borderAlpha * 0.5})`,
        text: `hsl(${hue}, ${saturation}%, ${Math.min(lightness + 15, 80)}%)`,
        h: hue, s: saturation, l: lightness
    };
}

function handleWin() {
    document.getElementById('word-input').disabled = true;
    document.getElementById('btn-guess').disabled = true;
    document.getElementById('btn-giveup').disabled = true;

    const successMsg = document.getElementById('success-message');
    document.getElementById('final-guess-count').textContent = guesses.length;
    successMsg.classList.remove('hidden');

    if (window.PairaAudio) {
        window.PairaAudio.play('correct');
    }

    showToast("Tebrikler! Günün kelimesini buldunuz.", "success");
}

async function handleGiveUp() {
    if (hasWon) return;

    const confirmGiveUp = confirm("Pes etmek istediğinize emin misiniz? Günün kelimesi gösterilecek ve oyun bitecek.");
    if (!confirmGiveUp) return;

    const inputEl = document.getElementById('word-input');
    const btnGuess = document.getElementById('btn-guess');
    const btnGiveup = document.getElementById('btn-giveup');

    inputEl.disabled = true;
    btnGuess.disabled = true;
    btnGiveup.disabled = true;

    try {
        let targetWord;
        if (gameMode === "endless") {
            targetWord = endlessGameData["ana-kelime-pes"];
        } else {
            const url = `https://paira-games-default-rtdb.firebaseio.com/gunluk_oyun/${targetDate}/ana-kelime-pes.json`;
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            targetWord = await response.json();
        }

        if (targetWord && typeof targetWord === "string") {
            hasWon = true; // prevent further guesses

            // Show failure/give up message in the success banner area
            const successMsg = document.getElementById('success-message');
            successMsg.innerHTML = `<h2 style="margin:0; color: var(--danger);">Oyun Bitti!</h2><p>Günün kelimesi: <strong>${targetWord.replace(/_\d+$/, '').toLocaleUpperCase('tr-TR')}</strong></p>`;
            successMsg.classList.remove('hidden');
            successMsg.style.borderColor = 'var(--danger)';
            successMsg.style.background = 'rgba(231, 76, 60, 0.1)';

            saveGameState(); // <-- Otomatik Kayıt

            if (window.PairaAudio) {
                window.PairaAudio.play('wrong');
            }

            showToast("Pes ettiniz.", "warning");
        } else {
            throw new Error("Geçersiz veri formatı döndü.");
        }
    } catch (error) {
        console.error("Pes etme işlemi sırasında hata:", error);
        showToast("Bir hata oluştu. Lütfen tekrar deneyin.", "error");
        inputEl.disabled = false;
        btnGuess.disabled = false;
        btnGiveup.disabled = false;
    }
}

// Utils
async function handleHint() {
    if (hasWon) return;

    const btnHint = document.getElementById('btn-hint');
    btnHint.disabled = true;

    const stages = [5000, 4000, 3000, 2000, 1500, 1000, 800, 600, 400, 300, 200, 150, 100, 75, 50, 30, 20, 10, 5, 2];
    let targetN = null;

    // Bulunan kelimelerden herhangi birinin sırası (rank) aşama (N) değerinden küçük eşit mi?
    // Küçük veya eşit değilse, o aşama için ipucu vereceğiz.
    // Ayrıca kelimesi zaten tahmin edilmiş aşamaları da atla.
    for (const n of stages) {
        if (skippedHintStages.has(n)) continue;
        if (!guesses.some(g => g.rank <= n)) {
            targetN = n;
            break;
        }
    }

    if (targetN === null) {
        showToast("Artık ipucuna ihtiyacınız yok, çok yaklaştınız!", "success");
        btnHint.disabled = false;
        return;
    }

    let hintKey = "";
    let hintTitle = "";
    let isDefinition = true;

    if (targetN !== lastHintStage) {
        // Yeni bir aşamaya geçildi, tanım vereceğiz.
        lastHintStage = targetN;
        lastHintType = "tanim";
        hintKey = `hint-${targetN}-tanim`;
        hintTitle = `${targetN}. Kelime Tanımı`;
    } else {
        // Zaten bu aşamanın tanımını aldıysa kelimeyi vereceğiz.
        if (lastHintType === "tanim") {
            lastHintType = "kelime";
            hintKey = `hint-${targetN}-kelime`;
            hintTitle = `${targetN}. Kelime`;
            isDefinition = false;
        } else if (lastHintType === "kelime") {
            // Zaten kelimeyi aldı ama tahmin etmediyse tekrar hatırlatacağız
            hintKey = `hint-${targetN}-kelime`;
            hintTitle = `${targetN}. Kelime`;
            isDefinition = false;
        }
    }

    try {
        let data;
        let wordDataForDefinition = null;

        if (gameMode === "endless") {
            data = endlessGameData[hintKey];
            if (isDefinition) {
                wordDataForDefinition = endlessGameData[`hint-${targetN}-kelime`];
            }
        } else {
            const url = `https://paira-games-default-rtdb.firebaseio.com/gunluk_oyun/${targetDate}/${hintKey}.json`;
            const response = await fetch(url);
            if (!response.ok) throw new Error("Fetch error");
            data = await response.json();

            if (isDefinition) {
                const wordUrl = `https://paira-games-default-rtdb.firebaseio.com/gunluk_oyun/${targetDate}/hint-${targetN}-kelime.json`;
                const wordResponse = await fetch(wordUrl);
                if (wordResponse.ok) {
                    wordDataForDefinition = await wordResponse.json();
                }
            }
        }

        if (data) {
            let displayData;
            if (isDefinition) {
                displayData = data;
                // Tanım alınsa bile kelimeyi listeye ekle, böylece bilinirse ampul çıksın
                if (wordDataForDefinition) {
                    const cleanWordDef = wordDataForDefinition.replace(/_\d+$/, '').toLocaleLowerCase('tr-TR');
                    revealedHintWords.add(cleanWordDef);
                }
            } else {
                // Kelime ipucu - önce zaten tahmin edilmiş mi kontrol et
                const cleanWord = data.replace(/_\d+$/, '').toLocaleLowerCase('tr-TR');
                
                if (guesses.some(g => g.word === cleanWord)) {
                    // Kelime zaten tahmin edilmiş, bu aşamayı atla ve sonraki ipucuna geç
                    skippedHintStages.add(targetN);
                    btnHint.disabled = false;
                    handleHint(); // Otomatik olarak sonraki ipucunu dene
                    return;
                }
                
                revealedHintWords.add(cleanWord);
                displayData = cleanWord.toLocaleUpperCase('tr-TR');
            }
            
            let hintMessage = `İpucu (${hintTitle}):\n\n${displayData}`;
            
            // İpucu geçmişine kaydet
            hintHistory.push({ title: hintTitle, content: displayData });
            
            hintsUsed++;
            
            // İpucu sayacını badge olarak göster
            const btnHintEl = document.getElementById('btn-hint');
            if (btnHintEl) btnHintEl.innerHTML = `💡<span class="hint-count-badge">${hintsUsed}</span>`;
            
            // Son İpucu butonunu göster
            const btnLastHint = document.getElementById('btn-last-hint');
            if (btnLastHint) btnLastHint.classList.remove('hidden');
            
            saveGameState(); // <-- Otomatik Kayıt

            alert(hintMessage);
        } else {
            showToast(`İpucu verisi bulunamadı (${hintKey}). Günün verisi henüz güncellenmemiş olabilir.`, "error");
        }
    } catch (error) {
        console.error("İpucu çekilirken hata:", error);
        showToast("İpucu alınamadı. Lütfen tekrar deneyin.", "error");
    } finally {
        btnHint.disabled = false;
    }
}

function showLastHint() {
    if (hintHistory.length === 0) {
        showToast("Henüz ipucu almadınız.", "warning");
        return;
    }
    const last = hintHistory[hintHistory.length - 1];
    alert(`Son İpucu (${last.title}):\n\n${last.content}`);
}

// ==========================================
// AUTO-SAVE / RESUME LOGIC
// ==========================================
function saveGameState() {
    if (!targetDate) return;
    const state = {
        targetDate: targetDate,
        guesses: guesses,
        hasWon: hasWon,
        hintsUsed: hintsUsed,
        lastHintStage: lastHintStage,
        lastHintType: lastHintType,
        revealedHintWords: Array.from(revealedHintWords),
        skippedHintStages: Array.from(skippedHintStages),
        hintHistory: hintHistory
    };
    const key = gameMode === "endless" ? "bagnam_state_endless" : "bagnam_state_daily";
    localStorage.setItem(key, JSON.stringify(state));
}

function tryLoadGameState(mode, intendedDateStr) {
    const key = mode === "endless" ? "bagnam_state_endless" : "bagnam_state_daily";
    const savedStr = localStorage.getItem(key);
    if (!savedStr) return null;

    try {
        const state = JSON.parse(savedStr);
        if (mode === "daily" && state.targetDate !== intendedDateStr) {
            return null;
        }

        return state;
    } catch (e) {
        return null;
    }
}

function restoreGameState(state) {
    targetDate = state.targetDate;
    guesses = state.guesses || [];
    hasWon = state.hasWon || false;
    hintsUsed = state.hintsUsed || 0;
    lastHintStage = state.lastHintStage || null;
    lastHintType = state.lastHintType || null;
    revealedHintWords = new Set(state.revealedHintWords || []);
    skippedHintStages = new Set(state.skippedHintStages || []);
    hintHistory = state.hintHistory || [];

    document.getElementById('guess-count').textContent = guesses.length;
    
    const btnHint = document.getElementById('btn-hint');
    if (btnHint && hintsUsed > 0) {
        btnHint.innerHTML = `💡<span class="hint-count-badge">${hintsUsed}</span>`;
    }
    
    const btnLastHint = document.getElementById('btn-last-hint');
    if (btnLastHint && hintHistory.length > 0) {
        btnLastHint.classList.remove('hidden');
    }

    renderHistory();
}
