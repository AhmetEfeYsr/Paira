// Bagnam Game Logic
const MOCK_FIREBASE_URL = "https://raw.githubusercontent.com/AhmetEfeYSR/BagnamMockData/main/daily_words.json"; // Placeholder for now

let targetDate = ""; // Hedeflenen tarih (YYYY-MM-DD)
let guesses = []; // Kullanıcının tahminleri: { word: string, rank: number, score: number }
let hasWon = false;
let hintsUsed = 0; // Kaç ipucu kullanıldı
let hintDataCache = null;
let lastHintStage = null;
let lastHintType = null;


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
        datePicker.max = getTodayDateTR();
    }

    if(btnStart) btnStart.addEventListener('click', () => initGame());
    if(btnPlayPast && datePicker) {
        btnPlayPast.addEventListener('click', () => {
            if(!datePicker.value) {
                showToast("Lütfen bir tarih seçin.", "warning");
                return;
            }
            initGame(datePicker.value);
        });
    }
    if(btnGuess) btnGuess.addEventListener('click', handleGuess);
    if(wordInput) {
        wordInput.addEventListener('keypress', (e) => {
            if(e.key === 'Enter') handleGuess();
        });
    }
    if(btnGiveup) btnGiveup.addEventListener('click', handleGiveUp);
    if(btnHint) btnHint.addEventListener('click', handleHint);
});

function resetGameState() {
    targetDate = "";
    guesses = [];
    hasWon = false;
    hintsUsed = 0;
    hintDataCache = null;
    lastHintStage = null;
    lastHintType = null;

    const btnHint = document.getElementById('btn-hint');
    if (btnHint) {
        btnHint.textContent = "İpucu Al";
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

function normalizeTurkishChars(str) {
    // Şapkalı harfler ve Türkçe karakterlerin İngilizce karşılıkları
    const charMap = {
        'I': 'i', 'İ': 'i', 'ı': 'i',
        'â': 'a', 'î': 'i', 'û': 'u',
        'Â': 'a', 'Î': 'i', 'Û': 'u',
        'ç': 'c', 'ğ': 'g', 'ö': 'o', 'ş': 's', 'ü': 'u',
        'Ç': 'c', 'Ğ': 'g', 'Ö': 'o', 'Ş': 's', 'Ü': 'u'
    };
    return str.replace(/[IİıâîûÂÎÛçğöşüÇĞÖŞÜ]/g, char => charMap[char] || char).toLowerCase();
}

function getTodayDateTR() {
    const today = new Date();
    // UTC+3 (Türkiye Saati) ayarı yapıp tarihi YYYY-MM-DD olarak döndür
    const utc = today.getTime() + (today.getTimezoneOffset() * 60000);
    const trDate = new Date(utc + (3600000 * 3)); // UTC + 3 saat

    const yyyy = trDate.getFullYear();
    const mm = String(trDate.getMonth() + 1).padStart(2, '0');
    const dd = String(trDate.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

async function initGame(selectedDateStr = null) {
    const btnStart = document.getElementById('btn-start');
    const btnPlayPast = document.getElementById('btn-play-past');
    const loading = document.getElementById('loading-indicator');

    if (btnStart) btnStart.classList.add('hidden');
    if (btnPlayPast) btnPlayPast.disabled = true;
    loading.classList.remove('hidden');

    resetGameState();

    // Artık veri önden yüklenmiyor, sadece tarihi ayarlayıp UI'ı değiştiriyoruz
    targetDate = selectedDateStr || getTodayDateTR();

    switchScreen('game-screen');
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
    let word = rawWord.toLowerCase().trim();
    let normalizedWord = normalizeTurkishChars(word);

    if(!word) return;

    // Check if already guessed
    if(guesses.some(g => g.word === word.replace(/_\d+$/, ''))) {
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
                for (let i = 1; i <= 5; i++) {
                    const withSuffix = `${base}_${i}`;
                    if (!wordsToCheck.includes(withSuffix)) wordsToCheck.push(withSuffix);
                }
            }
        }

        const fetchPromises = wordsToCheck.map(w => 
            fetch(`https://paira-games-default-rtdb.firebaseio.com/gunluk_oyun/${targetDate}/${w}.json`)
        );

        const responses = await Promise.all(fetchPromises);
        
        let foundData = [];
        
        for (let i = 0; i < responses.length; i++) {
            if (responses[i].ok) {
                const data = await responses[i].json();
                if (data !== null) {
                    foundData.push({
                        word: wordsToCheck[i],
                        data: data
                    });
                }
            }
        }

        if (foundData.length === 0) {
            // Word not found in the dataset
            showToast(`"${rawWord}" kelimesi sözlükte bulunamadı.`, "warning");
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

                // Add guess
                guesses.push({
                    word: baseWord,
                    rank: rank,
                    score: score
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

    sortedGuesses.forEach(g => {
        const li = document.createElement('li');
        li.className = `history-item ${getColorClass(g.rank)}`;

        const wordDiv = document.createElement('div');
        wordDiv.className = 'word';
        wordDiv.textContent = g.word;

        const rankDiv = document.createElement('div');
        rankDiv.className = 'rank-score';

        const rankSpan = document.createElement('span');
        rankSpan.className = 'rank';
        rankSpan.textContent = `Sıra: ${g.rank}`;

        const scoreSpan = document.createElement('span');
        scoreSpan.className = 'score';
        scoreSpan.textContent = `Benzerlik: ${(g.score * 100).toFixed(1)}%`;

        rankDiv.appendChild(rankSpan);
        rankDiv.appendChild(scoreSpan);

        li.appendChild(wordDiv);
        li.appendChild(rankDiv);

        listEl.appendChild(li);
    });
}

function getColorClass(rank) {
    if(rank === 1) return 'color-1'; // Target
    if(rank <= 100) return 'color-2'; // Very close
    if(rank <= 1000) return 'color-3'; // Close
    if(rank <= 10000) return 'color-4'; // Moderate
    return 'color-5'; // Far
}

function handleWin() {
    document.getElementById('word-input').disabled = true;
    document.getElementById('btn-guess').disabled = true;
    document.getElementById('btn-giveup').disabled = true;

    const successMsg = document.getElementById('success-message');
    document.getElementById('final-guess-count').textContent = guesses.length;
    successMsg.classList.remove('hidden');

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
        const url = `https://paira-games-default-rtdb.firebaseio.com/gunluk_oyun/${targetDate}/ana-kelime-pes.json`;
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const targetWord = await response.json();

        if (targetWord && typeof targetWord === "string") {
            hasWon = true; // prevent further guesses

            // Show failure/give up message in the success banner area
            const successMsg = document.getElementById('success-message');
            successMsg.innerHTML = `<h2 style="margin:0; color: var(--danger);">Oyun Bitti!</h2><p>Günün kelimesi: <strong>${targetWord.replace(/_\d+$/, '').toLocaleUpperCase('tr-TR')}</strong></p>`;
            successMsg.classList.remove('hidden');
            successMsg.style.borderColor = 'var(--danger)';
            successMsg.style.background = 'rgba(231, 76, 60, 0.1)';

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

    const stages = [500, 300, 150, 100, 50, 30, 10, 5, 3];
    let targetN = null;

    // Bulunan kelimelerden herhangi birinin sırası (rank) aşama (N) değerinden küçük eşit mi?
    // Küçük veya eşit değilse, o aşama için ipucu vereceğiz.
    for (const n of stages) {
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
        const url = `https://paira-games-default-rtdb.firebaseio.com/gunluk_oyun/${targetDate}/${hintKey}.json`;
        const response = await fetch(url);
        
        if (!response.ok) throw new Error("Fetch error");
        const data = await response.json();

        if (data) {
            let displayData = isDefinition ? data : data.replace(/_\d+$/, '').toLocaleUpperCase('tr-TR');
            let hintMessage = `İpucu (${hintTitle}):\n\n${displayData}`;
            
            hintsUsed++;
            alert(hintMessage);
        } else {
            showToast("İpucu verisi bulunamadı.", "error");
        }
    } catch (error) {
        console.error("İpucu çekilirken hata:", error);
        showToast("İpucu alınamadı. Lütfen tekrar deneyin.", "error");
    } finally {
        btnHint.disabled = false;
    }
}

// Utils
function switchScreen(screenId) {
    document.querySelectorAll('.view-state').forEach(el => el.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
}


