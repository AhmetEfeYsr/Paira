// Bagnam Game Logic
const MOCK_FIREBASE_URL = "https://raw.githubusercontent.com/AhmetEfeYSR/BagnamMockData/main/daily_words.json"; // Placeholder for now

let wordData = {}; // Object to hold the daily dataset: { "gemi": { rank: 1, score: 1.00 }, "filo": { rank: 5, score: 0.85 } }
let targetWord = "";
let guesses = []; // Store user's guesses: { word: string, rank: number, score: number }
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
    if(btnGiveup) btnGiveup.addEventListener('click', handleGiveup);
});

function resetGameState() {
    wordData = {};
    targetWord = "";
    guesses = [];
    hasWon = false;

    document.getElementById('guess-count').textContent = "0";
    document.getElementById('word-input').value = "";
    document.getElementById('word-input').disabled = false;
    document.getElementById('btn-guess').disabled = false;
    document.getElementById('btn-giveup').classList.remove('hidden');
    document.getElementById('success-message').classList.add('hidden');
    document.getElementById('guess-history').innerHTML = "";
}

async function initGame(selectedDateStr = null) {
    const btnStart = document.getElementById('btn-start');
    const btnPlayPast = document.getElementById('btn-play-past');
    const loading = document.getElementById('loading-indicator');

    if (btnStart) btnStart.classList.add('hidden');
    if (btnPlayPast) btnPlayPast.disabled = true;
    loading.classList.remove('hidden');

    resetGameState();

    try {
        let fetchDateStr = selectedDateStr;
        let isToday = false;

        if (!fetchDateStr) {
            // Get today's date
            const today = new Date();
            const yyyy = today.getFullYear();
            const mm = String(today.getMonth() + 1).padStart(2, '0');
            const dd = String(today.getDate()).padStart(2, '0');
            fetchDateStr = `${yyyy}-${mm}-${dd}`;
            isToday = true;
        }

        const FIREBASE_PROJECT_ID = "YOUR_PROJECT_ID"; // BURAYA KENDI FIREBASE PROJE ID'NIZI YAZIN
        const fileUrl = `https://firebasestorage.googleapis.com/v0/b/${FIREBASE_PROJECT_ID}.appspot.com/o/bagnam_history%2F${fetchDateStr}.json?alt=media`;

        let response = await fetch(fileUrl);

        // If it's a today query and today's file is not found, try yesterday
        if (!response.ok && response.status === 404 && isToday) {
            console.warn("Bugünün verisi bulunamadı, dünün verisi çekiliyor...");
            const today = new Date();
            const yesterday = new Date(today);
            yesterday.setDate(yesterday.getDate() - 1);
            const y_yyyy = yesterday.getFullYear();
            const y_mm = String(yesterday.getMonth() + 1).padStart(2, '0');
            const y_dd = String(yesterday.getDate()).padStart(2, '0');
            const yesterdayStr = `${y_yyyy}-${y_mm}-${y_dd}`;

            const yesterdayUrl = `https://firebasestorage.googleapis.com/v0/b/${FIREBASE_PROJECT_ID}.appspot.com/o/bagnam_history%2F${yesterdayStr}.json?alt=media`;
            response = await fetch(yesterdayUrl);
        }

        if (!response.ok) {
            if (response.status === 404) {
                 throw new Error("Seçilen tarihe ait veri bulunamadı.");
            }
            throw new Error(`HTTP error! status: ${response.status}`);
        }


        const jsonData = await response.json();

        // Process data according to the Python Cloud Function's structure
        // The expected structure is: { "date": "2023-10-25", "targetWord": "gemi", "totalWords": 50000, "words": { "gemi": { "rank": 1, "score": 100.0 }, ... } }

        wordData = {};
        if (jsonData && jsonData.words) {
            targetWord = jsonData.targetWord || "";
            for (const [kelime, info] of Object.entries(jsonData.words)) {
                // Info contains { rank: number, score: number (percentage) }
                // We normalize score to 0.0 - 1.0 range for the UI
                wordData[kelime.toLowerCase().trim()] = {
                    rank: info.rank,
                    score: info.score / 100.0
                };
            }
        } else {
             throw new Error("Invalid data format received from server.");
        }


        switchScreen('game-screen');
        document.getElementById('word-input').focus();

    } catch (error) {
        console.error("Veri yüklenirken hata:", error);
        showToast(error.message === "Seçilen tarihe ait veri bulunamadı." ? error.message : "Veriler yüklenemedi. Lütfen bağlantınızı kontrol edin.", "error");
        loading.classList.add('hidden');
        if(btnStart) btnStart.classList.remove('hidden');
        if(document.getElementById('btn-play-past')) document.getElementById('btn-play-past').disabled = false;
    }
}

function handleGuess() {
    if(hasWon) return;

    const inputEl = document.getElementById('word-input');
    let rawWord = inputEl.value;
    let word = rawWord.toLowerCase().trim();

    if(!word) return;

    // Check if word exists in our dataset
    const wordInfo = wordData[word];

    if(!wordInfo) {
        // Word not found in the 99k list
        showToast(`"${rawWord}" kelimesi sözlükte bulunamadı.`, "warning");
        inputEl.value = "";
        inputEl.focus();
        // Visual shake feedback
        inputEl.classList.add('error-shake');
        setTimeout(() => inputEl.classList.remove('error-shake'), 400);
        return;
    }

    // Check if already guessed
    if(guesses.some(g => g.word === word)) {
        showToast("Bu kelimeyi zaten tahmin ettiniz!", "warning");
        inputEl.value = "";
        inputEl.focus();
        return;
    }

    // Add guess
    guesses.push({
        word: word,
        rank: wordInfo.rank,
        score: wordInfo.score
    });

    // Update UI
    document.getElementById('guess-count').textContent = guesses.length;
    inputEl.value = "";

    // Re-render history list
    renderHistory();

    // Check win condition
    if(wordInfo.rank === 1) {
        hasWon = true;
        handleWin();
    } else {
        inputEl.focus();
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
    document.getElementById('btn-giveup').classList.add('hidden');

    const successMsg = document.getElementById('success-message');
    document.getElementById('final-guess-count').textContent = guesses.length;
    successMsg.classList.remove('hidden');

    showToast("Tebrikler! Günün kelimesini buldunuz.", "success");
}

function handleGiveup() {
    if(confirm("Pes etmek istediğinize emin misiniz? Hedef kelime gösterilecektir.")) {
        hasWon = true;
        document.getElementById('word-input').disabled = true;
        document.getElementById('btn-guess').disabled = true;
        document.getElementById('btn-giveup').classList.add('hidden');

        // Add target word to top of list as a "guess" but highlight it
        if(!guesses.some(g => g.word === targetWord)) {
            guesses.push({
                word: targetWord + " (PES ETTİNİZ)",
                rank: 1,
                score: 1.00
            });
            renderHistory();
        }

        showToast(`Günün kelimesi: ${targetWord.toUpperCase()}`, "info");
    }
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
