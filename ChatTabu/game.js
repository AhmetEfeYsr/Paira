// --- ChatTabu Logic ---

// Fallback Word List (same as Tabu fallback)
const fallbackWords = [
    { ana_kelime: "araba", yasakli_kelimeler: ["Taşıt","Motor","Direksiyon","Tekerlek","Vites"], kategori: "Genel", zorluk: 10 },
    { ana_kelime: "bilgisayar", yasakli_kelimeler: ["Klavye","Fare","Ekran","İnternet","Teknoloji"], kategori: "Genel", zorluk: 10 },
    { ana_kelime: "güneş", yasakli_kelimeler: ["Sıcak","Yaz","Gökyüzü","Sarı","Işık"], kategori: "Doğa", zorluk: 10 },
    { ana_kelime: "kalem", yasakli_kelimeler: ["Yazı","Kağıt","Silgi","Okul","Mürekkep"], kategori: "Eğitim", zorluk: 10 },
    { ana_kelime: "deniz", yasakli_kelimeler: ["Su","Mavi","Yüzmek","Kum","Dalga"], kategori: "Doğa", zorluk: 10 },
    { ana_kelime: "kitap", yasakli_kelimeler: ["Okumak","Sayfa","Yazar","Kütüphane","Roman"], kategori: "Eğitim", zorluk: 10 },
    { ana_kelime: "telefon", yasakli_kelimeler: ["Aramak","Mesaj","Cep","Ekran","İletişim"], kategori: "Teknoloji", zorluk: 10 },
    { ana_kelime: "ev", yasakli_kelimeler: ["Yaşamak","Aile","Odalar","Kapı","Pencere"], kategori: "Genel", zorluk: 10 },
    { ana_kelime: "ağaç", yasakli_kelimeler: ["Yeşil","Yaprak","Orman","Doğa","Dal"], kategori: "Doğa", zorluk: 10 },
    { ana_kelime: "kedi", yasakli_kelimeler: ["Miyav","Hayvan","Evcil","Tüy","Kuyruk"], kategori: "Hayvanlar", zorluk: 10 }
];

let wordDatabase = [];
let currentWordIndex = 0;
let currentWord = null;
let chatListener = null;

let state = {
    platform: '',
    channel: '',
    scores: {}, // username -> score
    isPaused: false
};

// Fuzzy Matcher implementation for Turkish characters (from KelimeAvi/Aglam concept)
const normalizeTurkish = (str) => {
    return str.replace(/İ/g, 'I').replace(/ı/g, 'I')
              .replace(/Ş/g, 'S').replace(/ş/g, 'S')
              .replace(/Ğ/g, 'G').replace(/ğ/g, 'G')
              .replace(/Ü/g, 'U').replace(/ü/g, 'U')
              .replace(/Ö/g, 'O').replace(/ö/g, 'O')
              .replace(/Ç/g, 'C').replace(/ç/g, 'C')
              .toUpperCase().trim();
};

const levenshtein = (a, b) => {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;
    const matrix = [];
    for (let i = 0; i <= b.length; i++) { matrix[i] = [i]; }
    for (let j = 0; j <= a.length; j++) { matrix[0][j] = j; }
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) == a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1, // substitution
                    matrix[i][j - 1] + 1,     // insertion
                    matrix[i - 1][j] + 1      // deletion
                );
            }
        }
    }
    return matrix[b.length][a.length];
};

const isMatch = (guess, target) => {
    const nGuess = normalizeTurkish(guess);
    const nTarget = normalizeTurkish(target);

    // Direct match or within 1 edit distance for slightly longer words
    if (nGuess === nTarget) return true;

    if (nTarget.length > 4) {
        const distance = levenshtein(nGuess, nTarget);
        if (distance <= 1) return true;
    }
    return false;
};

document.addEventListener('DOMContentLoaded', async () => {
    // If we are on index.html (Setup)
    if (document.getElementById('login-container')) {
        setupLogin();
    }
    // If we are on game.html
    else if (document.getElementById('main-word')) {
        await initGame();
    }
});

function setupLogin() {
    const btnStart = document.getElementById('btn-start');
    const channelInput = document.getElementById('channel-input');
    const platformSelect = document.getElementById('platform-select');
    const loginStatus = document.getElementById('login-status');

    btnStart.addEventListener('click', () => {
        const channel = channelInput.value.trim();
        const platform = platformSelect.value;

        if (!channel) {
            loginStatus.innerText = 'Lütfen bir kanal adı girin!';
            loginStatus.className = 'status-msg error';
            return;
        }

        // Save connection params to sessionStorage and redirect
        sessionStorage.setItem('chattabu_channel', channel);
        sessionStorage.setItem('chattabu_platform', platform);
        window.location.href = 'game.html';
    });
}

async function initGame() {
    const channel = sessionStorage.getItem('chattabu_channel');
    const platform = sessionStorage.getItem('chattabu_platform');

    if (!channel || !platform) {
        window.location.href = 'index.html';
        return;
    }

    document.getElementById('channel-name-display').textContent = `${platform.toUpperCase()} / ${channel}`;

    // Load Words
    try {
        const response = await fetch('../Tabu/tr.json');
        if (response.ok) {
            wordDatabase = await response.json();
        } else {
            wordDatabase = fallbackWords;
        }
    } catch (e) {
        wordDatabase = fallbackWords;
    }

    // Shuffle words securely
    wordDatabase.sort(() => (window.crypto.getRandomValues(new Uint32Array(1))[0] % 100) - 50);

    // Setup Chat Listener
    if (typeof ChatListener === 'undefined') {
        alert('ChatListener kütüphanesi yüklenemedi!');
        return;
    }

    chatListener = new ChatListener(platform, channel, handleChatMessage);

    const statusBadge = document.getElementById('status-badge');
    statusBadge.textContent = 'Bağlanıyor...';
    statusBadge.style.color = 'var(--warning)';

    // Start listening
    chatListener.start();

    // Hacky connection display for UI since ChatListener doesn't have events yet.
    setTimeout(() => {
        statusBadge.textContent = 'Bağlandı';
        statusBadge.style.color = 'var(--success)';
    }, 2000);

    // Controls
    document.getElementById('btn-skip').addEventListener('click', nextWord);
    document.getElementById('btn-next').addEventListener('click', nextWord);
    document.getElementById('btn-leave').addEventListener('click', () => {
        chatListener.stop();
        window.location.href = 'index.html';
    });

    nextWord();
}

function nextWord() {
    if (wordDatabase.length === 0) return;

    currentWordIndex = (currentWordIndex + 1) % wordDatabase.length;
    currentWord = wordDatabase[currentWordIndex];

    const mainEl = document.getElementById('main-word');
    const fbEl = document.getElementById('forbidden-words');

    mainEl.textContent = currentWord.ana_kelime.toLocaleUpperCase('tr-TR');
    fbEl.innerHTML = currentWord.yasakli_kelimeler.map(w => `<li>${w.toLocaleUpperCase('tr-TR')}</li>`).join('');

    state.isPaused = false;
    document.getElementById('btn-next').style.display = 'none';
    document.getElementById('btn-skip').style.display = 'inline-block';
}

function handleChatMessage(username, message) {
    if (state.isPaused || !currentWord) return;

    const chatFeed = document.getElementById('chat-feed');
    const msgDiv = document.createElement('div');
    msgDiv.className = 'chat-msg';

    // Sanitize textContent
    const usernameSpan = document.createElement('strong');
    usernameSpan.textContent = username + ': ';
    const textSpan = document.createElement('span');
    textSpan.textContent = message;

    msgDiv.appendChild(usernameSpan);
    msgDiv.appendChild(textSpan);

    // Check if match
    if (isMatch(message, currentWord.ana_kelime)) {
        msgDiv.classList.add('correct');
        textSpan.textContent += ' (🎉 DOĞRU BİLDİ!)';

        handleCorrectGuess(username);
    }

    chatFeed.appendChild(msgDiv);

    // Autoscroll
    chatFeed.scrollTop = chatFeed.scrollHeight;
}

function handleCorrectGuess(username) {
    state.isPaused = true;

    if (!state.scores[username]) state.scores[username] = 0;
    state.scores[username] += 1;

    updateLeaderboard();

    document.getElementById('btn-next').style.display = 'inline-block';
    document.getElementById('btn-skip').style.display = 'none';

    // Confetti effect / visual cue on main card
    document.querySelector('.card-tabu').style.borderColor = 'var(--success)';
    document.querySelector('.card-tabu').style.boxShadow = '0 10px 40px rgba(46, 204, 113, 0.4)';

    setTimeout(() => {
        document.querySelector('.card-tabu').style.borderColor = 'var(--border-color)';
        document.querySelector('.card-tabu').style.boxShadow = '0 10px 40px rgba(0,0,0,0.5)';
    }, 2000);
}

function updateLeaderboard() {
    const list = document.getElementById('leaderboard-list');
    list.innerHTML = '';

    const sortedScores = Object.entries(state.scores).sort((a, b) => b[1] - a[1]);

    sortedScores.forEach(([uname, score]) => {
        const item = document.createElement('div');
        item.className = 'leaderboard-item';

        const nameSpan = document.createElement('span');
        nameSpan.textContent = uname;

        const scoreSpan = document.createElement('span');
        scoreSpan.textContent = `${score} Puan`;
        scoreSpan.style.color = 'var(--primary)';
        scoreSpan.style.fontWeight = 'bold';

        item.appendChild(nameSpan);
        item.appendChild(scoreSpan);
        list.appendChild(item);
    });
}
