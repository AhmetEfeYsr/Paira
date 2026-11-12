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
let lastGuessedWord = null; // Son tahmin edilen kelime (vurgulama ve kaydırma için)
let gaveUpTargetWord = null;

function normalizeInputWord(raw) {
    if (!raw) return "";
    return raw
        .replace(/\u0307/g, '')
        .replace(/İ/g, 'i')
        .replace(/I/g, 'ı')
        .toLocaleLowerCase('tr-TR')
        .normalize('NFC')
        .trim();
}

function clearWordInput() {
    const inputEl = document.getElementById('word-input');
    const btnClearInput = document.getElementById('btn-clear-input');
    if (inputEl) inputEl.value = "";
    if (btnClearInput) btnClearInput.classList.add('hidden');
}

function getRealGuesses() {
    return guesses.filter(g => !g.isPairaEgg);
}

function updateGuessCountUI() {
    const countEl = document.getElementById('guess-count');
    if (countEl) countEl.textContent = getRealGuesses().length;
}

function updateModeBadge() {
    const badgeEl = document.getElementById('game-mode-badge');
    if (!badgeEl) return;
    if (gameMode === "endless") {
        badgeEl.textContent = `Sonsuz #${targetDate}`;
    } else if (targetDate === window.getTodayDateTR()) {
        badgeEl.textContent = `Günlük (${targetDate})`;
    } else {
        badgeEl.textContent = `Arşiv (${targetDate})`;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const btnStart = document.getElementById('btn-start');
    const btnGuess = document.getElementById('btn-guess');
    const wordInput = document.getElementById('word-input');
    const btnGiveup = document.getElementById('btn-giveup');
    const btnHint = document.getElementById('btn-hint');
    const btnPlayPast = document.getElementById('btn-play-past');
    const datePicker = document.getElementById('past-date-picker');

    const refreshDatePickerMax = () => {
        if (datePicker && window.getTodayDateTR) {
            datePicker.max = window.getTodayDateTR();
        }
    };
    refreshDatePickerMax();
    if (datePicker) {
        datePicker.addEventListener('focus', refreshDatePickerMax);
        datePicker.addEventListener('click', refreshDatePickerMax);
    }

    if (btnStart) btnStart.addEventListener('click', () => initGame());
    if (btnPlayPast && datePicker) {
        btnPlayPast.addEventListener('click', () => {
            refreshDatePickerMax();
            if (!datePicker.value) {
                showToast("Lütfen bir tarih seçin.", "warning");
                return;
            }
            const todayStr = window.getTodayDateTR();
            if (datePicker.value > todayStr) {
                showToast("Gelecek bir tarihi seçemezsiniz.", "warning");
                return;
            }
            initGame(datePicker.value, false);
        });
    }
    const btnEndless = document.getElementById('btn-endless');
    if (btnEndless) btnEndless.addEventListener('click', () => initGame(null, true));
    if (btnGuess) btnGuess.addEventListener('click', handleGuess);
    if (wordInput) {
        wordInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') handleGuess();
        });
    }
    const btnClearInput = document.getElementById('btn-clear-input');
    if (btnClearInput && wordInput) {
        btnClearInput.addEventListener('click', () => {
            clearWordInput();
            wordInput.focus();
        });
        wordInput.addEventListener('input', () => {
            if (wordInput.value.length > 0) {
                btnClearInput.classList.remove('hidden');
            } else {
                btnClearInput.classList.add('hidden');
            }
        });
    }

    if (btnGiveup) btnGiveup.addEventListener('click', handleGiveUp);
    if (btnHint) btnHint.addEventListener('click', handleHint);

    const btnLastHint = document.getElementById('btn-last-hint');
    if (btnLastHint) btnLastHint.addEventListener('click', showLastHint);

    const btnShareResult = document.getElementById('btn-share-result');
    if (btnShareResult) btnShareResult.addEventListener('click', shareVictoryResult);

    const btnModalShare = document.getElementById('btn-modal-share');
    if (btnModalShare) btnModalShare.addEventListener('click', shareVictoryResult);

    const btnNextEndless = document.getElementById('btn-next-endless');
    if (btnNextEndless) {
        btnNextEndless.addEventListener('click', () => {
            localStorage.removeItem("bagnam_state_endless");
            initGame(null, true);
        });
    }

    const btnModalNextEndless = document.getElementById('btn-modal-next-endless');
    if (btnModalNextEndless) {
        btnModalNextEndless.addEventListener('click', () => {
            const modal = document.getElementById('victory-modal');
            if (modal) modal.classList.remove('active');
            localStorage.removeItem("bagnam_state_endless");
            initGame(null, true);
        });
    }

    const btnModalClose = document.getElementById('btn-modal-close');
    if (btnModalClose) {
        btnModalClose.addEventListener('click', () => {
            const modal = document.getElementById('victory-modal');
            if (modal) modal.classList.remove('active');
        });
    }

    const victoryModal = document.getElementById('victory-modal');
    if (victoryModal) {
        victoryModal.addEventListener('click', (e) => {
            if (e.target === victoryModal) victoryModal.classList.remove('active');
        });
    }

    // Statistics Modal bindings
    const btnStats = document.getElementById('btn-stats');
    const btnLoginStats = document.getElementById('btn-login-stats');
    const btnStatsClose = document.getElementById('btn-stats-close');
    const statsModal = document.getElementById('stats-modal');

    if (btnStats) btnStats.addEventListener('click', openStatsModal);
    if (btnLoginStats) btnLoginStats.addEventListener('click', openStatsModal);
    if (btnStatsClose && statsModal) {
        btnStatsClose.addEventListener('click', () => statsModal.classList.remove('active'));
    }
    if (statsModal) {
        statsModal.addEventListener('click', (e) => {
            if (e.target === statsModal) statsModal.classList.remove('active');
        });
    }

    const btnBack = document.getElementById('btn-back');
    if (btnBack) {
        btnBack.addEventListener('click', async () => {
            const restoreLoginButtons = () => {
                const btnStartEl = document.getElementById('btn-start');
                const btnPlayPastEl = document.getElementById('btn-play-past');
                const btnEndlessEl = document.getElementById('btn-endless');
                const btnLoginStatsEl = document.getElementById('btn-login-stats');
                if (btnStartEl) btnStartEl.classList.remove('hidden');
                if (btnPlayPastEl) btnPlayPastEl.disabled = false;
                if (btnEndlessEl) btnEndlessEl.classList.remove('hidden');
                if (btnLoginStatsEl) btnLoginStatsEl.classList.remove('hidden');
            };
            if (hasWon || (guesses.length === 0 && hintsUsed === 0)) {
                restoreLoginButtons();
                window.showScreen('login-screen');
                return;
            }
            const confirmed = await window.pairaConfirm({
                title: "Oyundan Çıkış",
                message: "Oyundan çıkmak istediğinize emin misiniz? İlerlemeniz otomatik kaydedilecektir.",
                confirmText: "Çık",
                cancelText: "Devam Et",
                confirmType: "warning"
            });
            if (confirmed) {
                saveGameState();
                restoreLoginButtons();
                window.showScreen('login-screen');
            }
        });
    }
});

function renderSuccessBannerContent(isGiveUp = false) {
    const successMsg = document.getElementById('success-message');
    if (!successMsg) return;

    const wordLabel = gameMode === "endless"
        ? "Sonsuz mod kelimesini"
        : (targetDate === window.getTodayDateTR() ? "Günün kelimesini" : `${targetDate} tarihli kelimeyi`);

    const endlessBtnHtml = gameMode === "endless"
        ? `<button id="btn-next-endless" class="btn btn-secondary btn-sm" style="margin-bottom:0;">🔄 Yeni Kelime</button>`
        : ``;

    if (isGiveUp) {
        successMsg.innerHTML = `
            <h2 style="margin:0; color: var(--danger);">Oyun Bitti! 🏳️</h2>
            <p style="margin: 6px 0 0 0;">Gizli kelime: <strong style="color: var(--text-main); font-size: 1.15rem;">${window.escapeHtml(gaveUpTargetWord || "")}</strong></p>
            <div style="display: flex; gap: 10px; justify-content: center; margin-top: 12px; flex-wrap: wrap;">
                <button id="btn-share-result" class="btn btn-primary btn-sm" style="margin-bottom:0;">📋 Sonucu Kopyala &amp; Paylaş</button>
                ${endlessBtnHtml}
            </div>
        `;
        successMsg.style.borderColor = 'var(--danger)';
        successMsg.style.background = 'rgba(231, 76, 60, 0.12)';
    } else {
        const count = getRealGuesses().length;
        successMsg.innerHTML = `
            <h2 style="margin:0;">Tebrikler! 🎉</h2>
            <p style="margin: 6px 0 0 0;">${wordLabel} <strong><span id="final-guess-count">${count}</span></strong> tahminde buldunuz.</p>
            <div style="display: flex; gap: 10px; justify-content: center; margin-top: 12px; flex-wrap: wrap;">
                <button id="btn-share-result" class="btn btn-primary btn-sm" style="margin-bottom:0;">📋 Sonucu Kopyala &amp; Paylaş</button>
                ${endlessBtnHtml}
            </div>
        `;
        successMsg.style.borderColor = 'var(--success)';
        successMsg.style.background = 'var(--success-bg)';
    }

    const newShareBtn = document.getElementById('btn-share-result');
    if (newShareBtn) newShareBtn.addEventListener('click', shareVictoryResult);

    const newEndlessBtn = document.getElementById('btn-next-endless');
    if (newEndlessBtn) {
        newEndlessBtn.addEventListener('click', () => {
            localStorage.removeItem("bagnam_state_endless");
            initGame(null, true);
        });
    }
}

function resetGameState() {
    targetDate = "";
    guesses = [];
    hasWon = false;
    gaveUpTargetWord = null;
    hintsUsed = 0;
    hintDataCache = null;
    lastHintStage = null;
    lastHintType = null;
    revealedHintWords = new Set();
    skippedHintStages = new Set();
    hintHistory = [];
    lastGuessedWord = null;

    const btnLastHint = document.getElementById('btn-last-hint');
    if (btnLastHint) {
        btnLastHint.classList.add('hidden');
    }

    const btnHint = document.getElementById('btn-hint');
    if (btnHint) {
        btnHint.innerHTML = '💡';
        btnHint.disabled = false;
        btnHint.style.opacity = "1";
        btnHint.classList.remove('hidden');
    }

    updateGuessCountUI();
    clearWordInput();
    const wordInput = document.getElementById('word-input');
    const btnGuess = document.getElementById('btn-guess');
    if (wordInput) wordInput.disabled = false;
    if (btnGuess) btnGuess.disabled = false;

    const bestWidget = document.getElementById('best-guess-widget');
    if (bestWidget) bestWidget.classList.add('hidden');

    const victoryModal = document.getElementById('victory-modal');
    if (victoryModal) victoryModal.classList.remove('active');

    const btnGiveup = document.getElementById('btn-giveup');
    if (btnGiveup) {
        btnGiveup.disabled = false;
        btnGiveup.classList.remove('hidden');
    }

    const successMsg = document.getElementById('success-message');
    if (successMsg) {
        successMsg.classList.add('hidden');
        renderSuccessBannerContent(false);
    }

    const historyEl = document.getElementById('guess-history');
    if (historyEl) historyEl.innerHTML = "";
}


async function initGame(selectedDateStr = null, isEndless = false) {
    if (window.PairaAudio) {
        window.PairaAudio.init();
    }

    const btnStart = document.getElementById('btn-start');
    const btnPlayPast = document.getElementById('btn-play-past');
    const btnEndless = document.getElementById('btn-endless');
    const btnLoginStats = document.getElementById('btn-login-stats');
    const loading = document.getElementById('loading-indicator');

    const restoreLoginUI = () => {
        loading.classList.add('hidden');
        if (btnStart) btnStart.classList.remove('hidden');
        if (btnPlayPast) btnPlayPast.disabled = false;
        if (btnEndless) btnEndless.classList.remove('hidden');
        if (btnLoginStats) btnLoginStats.classList.remove('hidden');
    };

    if (btnStart) btnStart.classList.add('hidden');
    if (btnPlayPast) btnPlayPast.disabled = true;
    if (btnEndless) btnEndless.classList.add('hidden');
    if (btnLoginStats) btnLoginStats.classList.add('hidden');
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
                if (!Array.isArray(playedEndlessIds)) playedEndlessIds = [];
            } catch (e) {
                playedEndlessIds = [];
            }

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

            updateModeBadge();
            if (savedState) {
                restoreGameState(savedState);
                showToast("Kaldığınız yerden devam ediyorsunuz!", "success");
            } else {
                saveGameState();
                showToast("Sonsuz Mod başlatıldı! ID: #" + targetDate, "success");
            }
        } catch (e) {
            console.error("Sonsuz mod verisi çekilemedi:", e);
            showToast("Sonsuz mod verisi yüklenemedi. Lütfen tekrar deneyin.", "error");
            restoreLoginUI();
            return;
        }

    } else {
        endlessGameData = null;
        targetDate = intendedDate;

        // Verify that puzzle data exists for this date if no saved state with guesses exists
        if (!savedState || !savedState.guesses || savedState.guesses.length === 0) {
            try {
                const checkUrl = `https://paira-games-default-rtdb.firebaseio.com/gunluk_oyun/${targetDate}/hint-5000-tanim.json`;
                const checkRes = await fetch(checkUrl);
                if (checkRes.ok) {
                    const checkVal = await checkRes.json();
                    if (checkVal === null) {
                        // Fallback check in case hint-5000-tanim is absent but ana-kelime-pes exists
                        const fallbackRes = await fetch(`https://paira-games-default-rtdb.firebaseio.com/gunluk_oyun/${targetDate}/ana-kelime-pes.json`);
                        const fallbackVal = fallbackRes.ok ? await fallbackRes.json() : null;
                        if (fallbackVal === null) {
                            showToast(`Seçilen tarihe (${targetDate}) ait oyun verisi bulunamadı.`, "warning");
                            restoreLoginUI();
                            return;
                        }
                    }
                }
            } catch (e) {
                console.warn("Tarih doğrulama kontrolü yapılamadı:", e);
            }
        }

        updateModeBadge();
        if (savedState) {
            restoreGameState(savedState);
            showToast("Kaldığınız yerden devam ediyorsunuz!", "success");
        }
    }

    window.showScreen('game-screen');
    const wordInput = document.getElementById('word-input');
    if (wordInput && !hasWon) wordInput.focus();

    loading.classList.add('hidden');
}

// Logaritmik skor hesaplayıcı (UI gösterimi için)
function calculateLogarithmicScore(rank, maxWords = 30000) {
    if (rank === 1) return 1.0;
    if (rank > maxWords) return 0.0;

    const logMax = Math.log(maxWords);
    const logRank = Math.log(rank);
    let score = 1 - (logRank / logMax);

    return Math.max(0, Math.min(1, score));
}

async function handleGuess() {
    if (hasWon) return;

    const inputEl = document.getElementById('word-input');
    const btnGuess = document.getElementById('btn-guess');
    let rawWord = inputEl.value;
    let word = normalizeInputWord(rawWord);
    let normalizedWord = window.normalizeTurkishChars ? window.normalizeTurkishChars(word) : word;

    if (!word) return;

    // 🥚 Easter Egg: "paira" özel kelime
    if (word === 'paira') {
        if (guesses.some(g => g.word === 'paira')) {
            showToast("Bu kelimeyi zaten tahmin ettiniz!", "warning");
            clearWordInput();
            renderHistory('paira', true);
            inputEl.focus();
            return;
        }
        guesses.push({ word: 'paira', rank: 1, score: 1.0, hintAssisted: false, isPairaEgg: true });
        lastGuessedWord = 'paira';
        updateGuessCountUI();
        clearWordInput();
        renderHistory('paira', false);
        saveGameState();
        showToast("canım ablam 💜", "success");
        if (window.PairaAudio) {
            window.PairaAudio.play('correct');
        }
        inputEl.focus();
        return;
    }

    // Check if the exact word was already guessed
    const exactWordBase = word.replace(/_\d+$/, '');
    if (guesses.some(g => g.word === exactWordBase)) {
        showToast("Bu kelimeyi zaten tahmin ettiniz!", "warning");
        clearWordInput();
        renderHistory(exactWordBase, true);
        inputEl.focus();
        return;
    }

    // Disable inputs while fetching
    inputEl.disabled = true;
    btnGuess.disabled = true;

    try {
        // Önce kullanıcının yazdığı tam Türkçe kelimeyi (örn. "köy", "taş", "tür") kontrol et.
        // Yalnızca tam kelime veritabanında bulunamazsa normalize edilmiş haline ("koy", "tas", "tur") geri dön.
        let variantEntries = [];
        const addVariantsForBase = (base, isExact) => {
            const match = base.match(/_([1-5])$/);
            if (match) {
                if (!variantEntries.some(v => v.word === base)) {
                    variantEntries.push({ word: base, isExact });
                }
            } else {
                if (!variantEntries.some(v => v.word === base)) {
                    variantEntries.push({ word: base, isExact });
                }
                for (let i = 1; i <= 5; i++) {
                    const withSuffix = `${base}_${i}`;
                    if (!variantEntries.some(v => v.word === withSuffix)) {
                        variantEntries.push({ word: withSuffix, isExact });
                    }
                }
            }
        };

        addVariantsForBase(word, true);
        if (word !== normalizedWord) {
            addVariantsForBase(normalizedWord, false);
        }

        let foundData = [];

        if (gameMode === "endless") {
            if (!endlessGameData) throw new Error("Sonsuz mod verisi eksik.");
            for (const entry of variantEntries) {
                if (endlessGameData[entry.word]) {
                    foundData.push({
                        word: entry.word,
                        isExact: entry.isExact,
                        data: endlessGameData[entry.word]
                    });
                }
            }
        } else {
            const fetchPromises = variantEntries.map(async (entry) => {
                const url = `https://paira-games-default-rtdb.firebaseio.com/gunluk_oyun/${targetDate}/${encodeURIComponent(entry.word)}.json`;
                try {
                    const response = await fetch(url);
                    if (response.ok) {
                        const resJson = await response.json();
                        if (resJson && typeof resJson === 'object') {
                            foundData.push({
                                word: entry.word,
                                isExact: entry.isExact,
                                data: resJson
                            });
                        }
                    }
                } catch (e) {
                    console.error("Kelime varyantı çekilirken hata:", entry.word, e);
                }
            });
            await Promise.all(fetchPromises);
        }

        if (foundData.length === 0) {
            showToast(`"${rawWord.trim()}" kelimesi sözlükte bulunamadı.`, "warning");
            if (window.PairaAudio) {
                window.PairaAudio.play('wrong');
            }
            clearWordInput();
            inputEl.focus();
            inputEl.classList.add('error-shake');
            setTimeout(() => inputEl.classList.remove('error-shake'), 400);
        } else {
            // Eğer kullanıcının tam yazdığı Türkçe kelime için eşleşme varsa sadece onları değerlendir,
            // yoksa normalize edilmiş eşleşmelere (fallback) bak.
            const exactFound = foundData.filter(item => item.isExact);
            const candidatePool = exactFound.length > 0 ? exactFound : foundData;

            let bestMatch = null;
            for (const item of candidatePool) {
                const finalData = item.data;
                const baseWord = item.word.replace(/_\d+$/, '');

                if (typeof finalData === "object" && typeof finalData.r === "number" && typeof finalData.s === "number") {
                    if (!bestMatch || finalData.s > bestMatch.s || (finalData.s === bestMatch.s && finalData.r < bestMatch.r)) {
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

                if (guesses.some(g => g.word === baseWord)) {
                    showToast("Bu kelimeyi zaten tahmin ettiniz!", "warning");
                    clearWordInput();
                    renderHistory(baseWord, true);
                    inputEl.focus();
                    return;
                }

                const isHintAssisted = revealedHintWords.has(baseWord);
                guesses.push({
                    word: baseWord,
                    rank: rank,
                    score: score,
                    hintAssisted: isHintAssisted
                });
                lastGuessedWord = baseWord;
                addedAny = true;

                if (rank === 1) {
                    hasWon = true;
                }
            }

            if (!addedAny && !hasWon) {
                throw new Error("Geçersiz veri formatı döndü.");
            }

            updateGuessCountUI();
            clearWordInput();

            renderHistory(lastGuessedWord, false);

            saveGameState();

            if (hasWon) {
                handleWin();
            } else {
                if (window.PairaAudio) {
                    if (bestMatch && bestMatch.r <= 300) {
                        window.PairaAudio.play('correct');
                    } else {
                        window.PairaAudio.play('pop');
                    }
                }
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

function renderHistory(highlightWord = lastGuessedWord, isDuplicate = false) {
    const listEl = document.getElementById('guess-history');
    if (!listEl) return;
    listEl.innerHTML = '';

    // Sort guesses by rank (lowest rank first)
    const sortedGuesses = [...guesses].sort((a, b) => a.rank - b.rank);

    // Update best guess widget
    const bestWidget = document.getElementById('best-guess-widget');
    if (bestWidget) {
        const realGuesses = sortedGuesses.filter(g => !g.isPairaEgg);
        if (realGuesses.length > 0) {
            const best = realGuesses[0];
            bestWidget.classList.remove('hidden');
            const wordEl = document.getElementById('best-guess-word');
            const rankEl = document.getElementById('best-guess-rank');
            const barEl = document.getElementById('best-guess-bar');
            if (wordEl) wordEl.textContent = best.word;
            if (rankEl) rankEl.textContent = `#${best.rank}`;
            if (barEl) {
                const pct = Math.max(5, (best.score * 100).toFixed(0));
                barEl.style.width = `${pct}%`;
            }
        } else {
            bestWidget.classList.add('hidden');
        }
    }

    let highlightedElement = null;

    sortedGuesses.forEach((g) => {
        const li = document.createElement('li');
        li.className = 'history-item';

        if (g.rank === 1 && !g.isPairaEgg) {
            li.classList.add('rank-one-item');
        }

        const isHighlighted = highlightWord && g.word === highlightWord;
        if (isHighlighted) {
            li.classList.add('latest-guess');
            if (isDuplicate) {
                li.classList.add('duplicate-highlight');
            } else {
                li.classList.add('animate-in');
            }
            highlightedElement = li;
        }

        // Dinamik sıcak-soğuk renk: similarity skora göre HSL gradient
        const colorStyle = getSimilarityColor(g.score, g.rank);
        li.style.background = colorStyle.bg;
        li.style.borderLeft = `4px solid ${colorStyle.border}`;
        li.style.borderRight = `1px solid ${colorStyle.borderSubtle}`;
        li.style.borderTop = `1px solid ${colorStyle.borderSubtle}`;
        li.style.borderBottom = `1px solid ${colorStyle.borderSubtle}`;

        li.style.setProperty('--item-h', colorStyle.h);
        li.style.setProperty('--item-s', `${colorStyle.s}%`);
        li.style.setProperty('--item-l', `${colorStyle.l}%`);

        const wordDiv = document.createElement('div');
        wordDiv.className = 'word';

        if (g.hintAssisted) {
            const hintIcon = document.createElement('span');
            hintIcon.className = 'hint-badge';
            hintIcon.textContent = '💡';
            hintIcon.title = 'İpucuyla bulunan kelime';
            wordDiv.appendChild(hintIcon);
        }

        const wordText = document.createElement('span');

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

        if (isHighlighted && !g.isPairaEgg) {
            const latestBadge = document.createElement('span');
            latestBadge.className = 'latest-badge';
            latestBadge.textContent = isDuplicate ? 'Tekrar' : 'Son';
            wordDiv.appendChild(latestBadge);
        }

        const rankDiv = document.createElement('div');
        rankDiv.className = 'rank-score';

        const rankSpan = document.createElement('span');
        rankSpan.className = 'rank';
        rankSpan.style.color = colorStyle.text;
        rankSpan.textContent = `#${g.rank}`;

        const scoreSpan = document.createElement('span');
        scoreSpan.className = 'score';
        const pct = (g.score * 100).toFixed(1);
        scoreSpan.innerHTML = `<span class="score-bar-wrap"><span class="score-bar" style="width: ${pct}%; background: ${colorStyle.border};"></span></span><span class="score-text">${pct}%</span>`;

        rankDiv.appendChild(rankSpan);
        rankDiv.appendChild(scoreSpan);

        li.appendChild(wordDiv);
        li.appendChild(rankDiv);

        listEl.appendChild(li);
    });

    if (highlightedElement && sortedGuesses.length > 5) {
        requestAnimationFrame(() => {
            const targetTop = highlightedElement.offsetTop - (listEl.clientHeight / 2) + (highlightedElement.clientHeight / 2);
            listEl.scrollTo({
                top: Math.max(0, targetTop),
                behavior: 'smooth'
            });
        });
    }
}

/**
 * Similarity skora göre renk üretir.
 * score: 0.0 (en uzak) - 1.0 (en yakın)
 * Renk skalası: Kırmızı (0.0) → Sarı (0.5) → Yeşil (1.0)
 */
function getSimilarityColor(score, rank) {
    if (rank === 1) {
        return {
            bg: 'linear-gradient(135deg, rgba(46, 204, 113, 0.35), rgba(39, 174, 96, 0.4))',
            border: '#2ecc71',
            borderSubtle: 'rgba(46, 204, 113, 0.5)',
            text: '#2ecc71',
            h: 145, s: 63, l: 49
        };
    }

    const clampedScore = Math.max(0, Math.min(1, Number(score) || 0));
    const t = Math.pow(clampedScore, 0.7);
    let hue = t * 120;

    const saturation = 70 + clampedScore * 30;
    const lightness = 45 + (1 - clampedScore) * 15;
    const alpha = 0.15 + clampedScore * 0.25;
    const borderAlpha = 0.4 + clampedScore * 0.5;

    return {
        bg: `hsla(${hue}, ${saturation}%, ${lightness}%, ${alpha})`,
        border: `hsl(${hue}, ${saturation}%, ${lightness}%)`,
        borderSubtle: `hsla(${hue}, ${saturation}%, ${lightness}%, ${borderAlpha * 0.5})`,
        text: `hsl(${hue}, ${saturation}%, ${Math.min(lightness + 15, 80)}%)`,
        h: hue, s: saturation, l: lightness
    };
}

function handleWin() {
    const inputEl = document.getElementById('word-input');
    const btnGuess = document.getElementById('btn-guess');
    const btnGiveup = document.getElementById('btn-giveup');
    const btnHint = document.getElementById('btn-hint');

    if (inputEl) inputEl.disabled = true;
    if (btnGuess) btnGuess.disabled = true;
    if (btnGiveup) btnGiveup.disabled = true;
    if (btnHint) btnHint.disabled = true;

    const realCount = getRealGuesses().length;
    recordGameResult(true, realCount);

    const successMsg = document.getElementById('success-message');
    if (successMsg) {
        renderSuccessBannerContent(false);
        successMsg.classList.remove('hidden');
    }

    if (window.PairaAudio) {
        window.PairaAudio.play('celebrate');
    }

    showToast("Tebrikler! Gizli kelimeyi buldunuz. 🎉", "success");

    // Open Victory Modal
    const victoryModal = document.getElementById('victory-modal');
    if (victoryModal) {
        const targetWordEl = document.getElementById('victory-target-word');
        const modalCountEl = document.getElementById('modal-guess-count');
        const hintStatEl = document.getElementById('modal-hint-stat');
        const emojiPreviewEl = document.getElementById('victory-emoji-preview');
        const modalNextEndlessBtn = document.getElementById('btn-modal-next-endless');

        const winGuess = guesses.find(g => g.rank === 1 && !g.isPairaEgg) || guesses.find(g => g.rank === 1);
        if (targetWordEl && winGuess) targetWordEl.textContent = winGuess.word.toLocaleUpperCase('tr-TR');
        if (modalCountEl) modalCountEl.textContent = realCount;
        if (hintStatEl) hintStatEl.textContent = hintsUsed > 0 ? `💡 ${hintsUsed} adet ipucu kullandın.` : `🔥 Hiç ipucu kullanmadan başardın!`;
        if (emojiPreviewEl) emojiPreviewEl.textContent = generateEmojiShareText();
        if (modalNextEndlessBtn) {
            if (gameMode === "endless") {
                modalNextEndlessBtn.classList.remove('hidden');
            } else {
                modalNextEndlessBtn.classList.add('hidden');
            }
        }

        setTimeout(() => {
            victoryModal.classList.add('active');
        }, 500);
    }

    if (gameMode === "endless") {
        localStorage.removeItem("bagnam_state_endless");
    }
}

function generateEmojiShareText() {
    const realGuesses = getRealGuesses();
    let greenCount = 0;
    let orangeCount = 0;
    let redCount = 0;

    realGuesses.forEach(g => {
        if (g.rank === 1 || g.rank <= 300) greenCount++;
        else if (g.rank <= 1500) orangeCount++;
        else redCount++;
    });

    const modeTitle = gameMode === "endless"
        ? `Sonsuz Mod #${targetDate}`
        : (targetDate ? `(${targetDate})` : '');

    let emojiBlocks = '🟩'.repeat(Math.min(greenCount, 5)) + '🟧'.repeat(Math.min(orangeCount, 5)) + '🟥'.repeat(Math.min(redCount, 5));
    if (!emojiBlocks) emojiBlocks = gaveUpTargetWord ? '🟥🟥🟥' : '🟩🟩🟩';

    const statusLine = gaveUpTargetWord
        ? `🏳️ ${realGuesses.length} tahmin sonunda pes ettim.`
        : `🎯 ${realGuesses.length} tahminde bildim!${hintsUsed > 0 ? ` (💡x${hintsUsed})` : ' 🔥'}`;

    return `Paira Bağnam ${modeTitle}\n${statusLine}\n${emojiBlocks}\nhttps://pairaaa.com/Bagnam`;
}

function shareVictoryResult() {
    const text = generateEmojiShareText();
    window.copyToClipboard(text, "Sonucunuz panoya kopyalandı! Arkadaşlarınızla paylaşabilirsiniz.");
}

async function handleGiveUp() {
    if (hasWon) return;

    const confirmed = await window.pairaConfirm({
        title: "Pes Et",
        message: "Pes etmek istediğinize emin misiniz? Gizli kelime gösterilecek ve oyun tamamlanacaktır.",
        confirmText: "Pes Et",
        cancelText: "Vazgeç",
        confirmType: "danger",
        icon: "🏳️"
    });
    if (!confirmed) return;

    const inputEl = document.getElementById('word-input');
    const btnGuess = document.getElementById('btn-guess');
    const btnGiveup = document.getElementById('btn-giveup');
    const btnHint = document.getElementById('btn-hint');

    if (inputEl) inputEl.disabled = true;
    if (btnGuess) btnGuess.disabled = true;
    if (btnGiveup) btnGiveup.disabled = true;
    if (btnHint) btnHint.disabled = true;

    try {
        let targetWord;
        if (gameMode === "endless") {
            targetWord = endlessGameData ? endlessGameData["ana-kelime-pes"] : null;
        } else {
            const url = `https://paira-games-default-rtdb.firebaseio.com/gunluk_oyun/${targetDate}/ana-kelime-pes.json`;
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            targetWord = await response.json();
        }

        if (targetWord && typeof targetWord === "string") {
            hasWon = true;
            gaveUpTargetWord = targetWord.replace(/_\d+$/, '').toLocaleUpperCase('tr-TR');

            recordGameResult(false, getRealGuesses().length);

            const successMsg = document.getElementById('success-message');
            if (successMsg) {
                renderSuccessBannerContent(true);
                successMsg.classList.remove('hidden');
            }

            if (gameMode === "endless") {
                localStorage.removeItem("bagnam_state_endless");
            } else {
                saveGameState();
            }

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
        if (inputEl) inputEl.disabled = false;
        if (btnGuess) btnGuess.disabled = false;
        if (btnGiveup) btnGiveup.disabled = false;
        if (btnHint) btnHint.disabled = false;
    }
}

// ==========================================
// HINT SYSTEM
// ==========================================
async function handleHint() {
    if (hasWon) return;

    const btnHint = document.getElementById('btn-hint');
    if (btnHint) btnHint.disabled = true;

    const stages = [5000, 4000, 3000, 2000, 1500, 1000, 800, 600, 400, 300, 200, 150, 100, 75, 50, 30, 20, 10, 5, 2];
    let targetN = null;

    for (const n of stages) {
        if (skippedHintStages.has(n)) continue;
        if (!guesses.some(g => !g.isPairaEgg && g.rank <= n)) {
            targetN = n;
            break;
        }
    }

    if (targetN === null) {
        showToast("Artık ipucuna ihtiyacınız yok, hedefe çok yaklaştınız!", "info");
        if (btnHint) btnHint.disabled = false;
        return;
    }

    let hintKey = "";
    let hintTitle = "";
    let isDefinition = true;
    let isRepeatReminder = false;

    if (targetN !== lastHintStage) {
        lastHintStage = targetN;
        lastHintType = "tanim";
        hintKey = `hint-${targetN}-tanim`;
        hintTitle = `${targetN}. Kelime Tanımı`;
    } else {
        if (lastHintType === "tanim") {
            lastHintType = "kelime";
            hintKey = `hint-${targetN}-kelime`;
            hintTitle = `${targetN}. Kelime`;
            isDefinition = false;
        } else if (lastHintType === "kelime") {
            hintKey = `hint-${targetN}-kelime`;
            hintTitle = `${targetN}. Kelime (Hatırlatma)`;
            isDefinition = false;
            isRepeatReminder = true;
        }
    }

    try {
        let data;
        let wordDataForDefinition = null;

        if (gameMode === "endless") {
            data = endlessGameData ? endlessGameData[hintKey] : null;
            if (isDefinition && endlessGameData) {
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
                if (wordDataForDefinition) {
                    const cleanWordDef = normalizeInputWord(wordDataForDefinition.replace(/_\d+$/, ''));
                    if (guesses.some(g => g.word === cleanWordDef)) {
                        skippedHintStages.add(targetN);
                        lastHintStage = null;
                        lastHintType = null;
                        if (btnHint) btnHint.disabled = false;
                        handleHint();
                        return;
                    }
                    revealedHintWords.add(cleanWordDef);
                }
                displayData = data;
            } else {
                const cleanWord = normalizeInputWord(data.replace(/_\d+$/, ''));

                if (guesses.some(g => g.word === cleanWord)) {
                    skippedHintStages.add(targetN);
                    lastHintStage = null;
                    lastHintType = null;
                    if (btnHint) btnHint.disabled = false;
                    handleHint();
                    return;
                }

                revealedHintWords.add(cleanWord);
                displayData = cleanWord.toLocaleUpperCase('tr-TR');
                if (isRepeatReminder) {
                    displayData = `${displayData}\n\n(Sonraki ipucu aşamasına geçmek için bu kelimeyi tahmin kutusuna yazın.)`;
                }
            }

            if (!isRepeatReminder) {
                hintHistory.push({ title: hintTitle, content: displayData });
                hintsUsed++;

                const btnHintEl = document.getElementById('btn-hint');
                if (btnHintEl) btnHintEl.innerHTML = `💡<span class="hint-count-badge">${hintsUsed}</span>`;

                const btnLastHint = document.getElementById('btn-last-hint');
                if (btnLastHint) btnLastHint.classList.remove('hidden');

                saveGameState();
            }

            if (window.pairaAlert) {
                window.pairaAlert({
                    title: `İpucu (${hintTitle})`,
                    message: displayData,
                    okText: "Anladım",
                    icon: "💡"
                });
            } else {
                alert(`İpucu (${hintTitle}):\n\n${displayData}`);
            }
        } else {
            showToast(`İpucu verisi bulunamadı (${hintKey}). Günün verisi henüz güncellenmemiş olabilir.`, "error");
        }
    } catch (error) {
        console.error("İpucu çekilirken hata:", error);
        showToast("İpucu alınamadı. Lütfen tekrar deneyin.", "error");
    } finally {
        if (btnHint && !hasWon) btnHint.disabled = false;
    }
}

function showLastHint() {
    if (hintHistory.length === 0) {
        showToast("Henüz ipucu almadınız.", "warning");
        return;
    }

    if (hintHistory.length === 1) {
        const last = hintHistory[0];
        if (window.pairaAlert) {
            window.pairaAlert({
                title: `Son İpucu (${last.title})`,
                message: last.content,
                okText: "Kapat",
                icon: "💡"
            });
        } else {
            alert(`Son İpucu (${last.title}):\n\n${last.content}`);
        }
        return;
    }

    const formattedList = [...hintHistory]
        .reverse()
        .map((item, idx) => `${idx === 0 ? '🔹 [SON] ' : '• '}${item.title}: ${item.content}`)
        .join('\n\n');

    if (window.pairaAlert) {
        window.pairaAlert({
            title: `Alınan İpuçları (${hintHistory.length})`,
            message: formattedList,
            okText: "Kapat",
            icon: "💡"
        });
    } else {
        alert(`Alınan İpuçları:\n\n${formattedList}`);
    }
}

// ==========================================
// STATISTICS & STREAK SYSTEM
// ==========================================
function getPreviousDayDateStr(dateStr) {
    if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return "";
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() - 1);
    const yyyy = dt.getUTCFullYear();
    const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(dt.getUTCDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

function loadStats() {
    const defaultStats = {
        played: 0,
        won: 0,
        currentStreak: 0,
        maxStreak: 0,
        lastDailyWinDate: "",
        totalWinGuesses: 0,
        completedGames: {}
    };
    try {
        const raw = localStorage.getItem("bagnam_stats");
        if (!raw) return defaultStats;
        const parsed = JSON.parse(raw);
        return { ...defaultStats, ...parsed, completedGames: parsed.completedGames || {} };
    } catch (e) {
        return defaultStats;
    }
}

function recordGameResult(didWin, guessCount) {
    if (!targetDate) return;
    const stats = loadStats();
    const gameKey = `${gameMode}_${targetDate}`;

    if (stats.completedGames[gameKey]) {
        return; // Already recorded
    }

    stats.completedGames[gameKey] = {
        didWin,
        guessCount,
        timestamp: Date.now()
    };
    stats.played += 1;

    if (didWin) {
        stats.won += 1;
        stats.totalWinGuesses += Math.max(1, guessCount);

        const todayStr = window.getTodayDateTR();
        if (gameMode === "daily" && targetDate === todayStr) {
            const yesterdayStr = getPreviousDayDateStr(todayStr);
            if (stats.lastDailyWinDate === yesterdayStr) {
                stats.currentStreak += 1;
            } else if (stats.lastDailyWinDate !== todayStr) {
                stats.currentStreak = 1;
            }
            stats.lastDailyWinDate = todayStr;
            if (stats.currentStreak > stats.maxStreak) {
                stats.maxStreak = stats.currentStreak;
            }
        }
    } else {
        const todayStr = window.getTodayDateTR();
        if (gameMode === "daily" && targetDate === todayStr) {
            stats.currentStreak = 0;
        }
    }

    try {
        localStorage.setItem("bagnam_stats", JSON.stringify(stats));
    } catch (e) {}
}

function openStatsModal() {
    const stats = loadStats();
    const playedEl = document.getElementById('stat-played');
    const winRateEl = document.getElementById('stat-win-rate');
    const curStreakEl = document.getElementById('stat-current-streak');
    const maxStreakEl = document.getElementById('stat-max-streak');
    const avgGuessesEl = document.getElementById('stat-avg-guesses');

    const winRate = stats.played > 0 ? Math.round((stats.won / stats.played) * 100) : 0;
    const avgGuesses = stats.won > 0 ? Math.round(stats.totalWinGuesses / stats.won) : '-';

    if (playedEl) playedEl.textContent = stats.played;
    if (winRateEl) winRateEl.textContent = `${winRate}%`;
    if (curStreakEl) curStreakEl.textContent = stats.currentStreak;
    if (maxStreakEl) maxStreakEl.textContent = stats.maxStreak;
    if (avgGuessesEl) avgGuessesEl.textContent = avgGuesses;

    const modal = document.getElementById('stats-modal');
    if (modal) modal.classList.add('active');
}

// ==========================================
// AUTO-SAVE / RESUME LOGIC
// ==========================================
function saveGameState() {
    if (!targetDate) return;
    if (gameMode === "endless" && hasWon) {
        localStorage.removeItem("bagnam_state_endless");
        return;
    }
    const state = {
        targetDate: targetDate,
        guesses: guesses,
        hasWon: hasWon,
        gaveUpTargetWord: gaveUpTargetWord,
        hintsUsed: hintsUsed,
        lastHintStage: lastHintStage,
        lastHintType: lastHintType,
        revealedHintWords: Array.from(revealedHintWords),
        skippedHintStages: Array.from(skippedHintStages),
        hintHistory: hintHistory,
        lastGuessedWord: lastGuessedWord
    };
    const key = gameMode === "endless" ? "bagnam_state_endless" : `bagnam_state_daily_${targetDate}`;
    try {
        localStorage.setItem(key, JSON.stringify(state));
    } catch (e) {}
}

function tryLoadGameState(mode, intendedDateStr) {
    if (mode === "endless") {
        const savedStr = localStorage.getItem("bagnam_state_endless");
        if (!savedStr) return null;
        try {
            const state = JSON.parse(savedStr);
            if (state.hasWon) {
                localStorage.removeItem("bagnam_state_endless");
                return null;
            }
            return state;
        } catch (e) {
            return null;
        }
    } else {
        const specificKey = `bagnam_state_daily_${intendedDateStr}`;
        let savedStr = localStorage.getItem(specificKey) || localStorage.getItem("bagnam_state_daily");
        if (!savedStr) return null;
        try {
            const state = JSON.parse(savedStr);
            if (state.targetDate !== intendedDateStr) {
                return null;
            }
            return state;
        } catch (e) {
            return null;
        }
    }
}

function restoreGameState(state) {
    targetDate = state.targetDate;
    guesses = state.guesses || [];
    hasWon = state.hasWon || false;
    gaveUpTargetWord = state.gaveUpTargetWord || null;
    hintsUsed = state.hintsUsed || 0;
    lastHintStage = state.lastHintStage || null;
    lastHintType = state.lastHintType || null;
    revealedHintWords = new Set(state.revealedHintWords || []);
    skippedHintStages = new Set(state.skippedHintStages || []);
    hintHistory = state.hintHistory || [];
    lastGuessedWord = state.lastGuessedWord || (guesses.length > 0 ? guesses[guesses.length - 1].word : null);

    updateGuessCountUI();
    updateModeBadge();

    const btnHint = document.getElementById('btn-hint');
    if (btnHint && hintsUsed > 0) {
        btnHint.innerHTML = `💡<span class="hint-count-badge">${hintsUsed}</span>`;
    }

    const btnLastHint = document.getElementById('btn-last-hint');
    if (btnLastHint && hintHistory.length > 0) {
        btnLastHint.classList.remove('hidden');
    }

    renderHistory(lastGuessedWord, false);

    if (hasWon) {
        const input = document.getElementById('word-input');
        const submitBtn = document.getElementById('btn-guess');
        const btnGiveup = document.getElementById('btn-giveup');
        if (input) input.disabled = true;
        if (submitBtn) submitBtn.disabled = true;
        if (btnHint) btnHint.disabled = true;
        if (btnGiveup) btnGiveup.disabled = true;

        const successMsg = document.getElementById('success-message');
        if (successMsg) {
            renderSuccessBannerContent(Boolean(gaveUpTargetWord));
            successMsg.classList.remove('hidden');
        }
    }
}
