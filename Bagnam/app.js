// Bagnam Game Logic
const MOCK_FIREBASE_URL = "https://raw.githubusercontent.com/AhmetEfeYSR/BagnamMockData/main/daily_words.json"; // Placeholder for now

let targetDate = ""; // Hedeflenen tarih (YYYY-MM-DD)
let guesses = []; // Kullanıcının tahminleri: { word: string, rank: number, score: number }
let hasWon = false;


document.addEventListener('DOMContentLoaded', () => {
    const btnStart = document.getElementById('btn-start');
    const btnGuess = document.getElementById('btn-guess');
    const wordInput = document.getElementById('word-input');
    const btnGiveup = document.getElementById('btn-giveup');
    const btnPlayPast = document.getElementById('btn-play-past');
    const datePicker = document.getElementById('past-date-picker');

    // Set max date to today
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    if (datePicker) {
        datePicker.max = `${yyyy}-${mm}-${dd}`;
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
});

function resetGameState() {
    targetDate = "";
    guesses = [];
    hasWon = false;

    document.getElementById('guess-count').textContent = "0";
    document.getElementById('word-input').value = "";
    document.getElementById('word-input').disabled = false;
    document.getElementById('btn-guess').disabled = false;
    document.getElementById('success-message').classList.add('hidden');
    document.getElementById('guess-history').innerHTML = "";
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

    if(!word) return;

    // Check if already guessed
    if(guesses.some(g => g.word === word)) {
        showToast("Bu kelimeyi zaten tahmin ettiniz!", "warning");
        inputEl.value = "";
        inputEl.focus();
        return;
    }

    // Disable inputs while fetching
    inputEl.disabled = true;
    btnGuess.disabled = true;

    try {
        const url = `https://paira-games-default-rtdb.firebaseio.com/gunluk_oyun/${targetDate}/${word}.json`;
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const rank = await response.json();

        if (rank === null) {
            // Word not found in the dataset
            showToast(`"${rawWord}" kelimesi sözlükte bulunamadı.`, "warning");
            inputEl.value = "";
            inputEl.focus();
            // Visual shake feedback
            inputEl.classList.add('error-shake');
            setTimeout(() => inputEl.classList.remove('error-shake'), 400);
        } else if (typeof rank === "number") {
            const score = calculateLogarithmicScore(rank);

            // Add guess
            guesses.push({
                word: word,
                rank: rank,
                score: score
            });

            // Update UI
            document.getElementById('guess-count').textContent = guesses.length;
            inputEl.value = "";

            // Re-render history list
            renderHistory();

            // Check win condition
            if(rank === 1) {
                hasWon = true;
                handleWin();
            } else {
                inputEl.focus();
            }
        } else {
             throw new Error("Geçersiz veri formatı döndü.");
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
        scoreSpan.textContent = `Skor: ${(g.score * 100).toFixed(1)}%`;

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

    const successMsg = document.getElementById('success-message');
    document.getElementById('final-guess-count').textContent = guesses.length;
    successMsg.classList.remove('hidden');

    showToast("Tebrikler! Günün kelimesini buldunuz.", "success");
}

// Utils
function switchScreen(screenId) {
    document.querySelectorAll('.view-state').forEach(el => el.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if(!container) return;

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;

    if(type === 'error') {
        toast.style.borderLeftColor = 'var(--danger)';
        toast.style.color = 'var(--danger)';
    } else if (type === 'success') {
        toast.style.borderLeftColor = 'var(--success)';
        toast.style.color = 'var(--success)';
    } else if (type === 'warning') {
        toast.style.borderLeftColor = 'var(--warning)';
        toast.style.color = 'var(--warning)';
    }

    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}
