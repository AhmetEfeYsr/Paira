// ChatTabu App Logic

let chatListener = null;
let currentWordObj = null;
let leaderboard = {}; // { username: points }
let availableWords = [];

document.addEventListener('DOMContentLoaded', () => {
    // Load words from Tabu/words.js (assumed to expose `WORDS` global variable)
    if (typeof WORDS !== 'undefined') {
        availableWords = [...WORDS]; // Clone
    } else {
        // Fallback dummy words if script not loaded
        availableWords = [
            { t: "Köpek", f: ["Hav Hav", "Hayvan", "Kedi", "Tasğma", "Kemik"] },
            { t: "Bilgisayar", f: ["Klavye", "Fare", "Ekran", "İnternet", "Teknoloji"] }
        ];
    }

    const btnStart = document.getElementById('btn-start-game');
    const btnEnd = document.getElementById('btn-end-game');
    const btnPass = document.getElementById('btn-pass');
    const btnNext = document.getElementById('btn-next');

    if(btnStart) btnStart.addEventListener('click', startGame);
    if(btnEnd) btnEnd.addEventListener('click', endGame);
    if(btnPass) btnPass.addEventListener('click', () => nextWord(false));
    if(btnNext) btnNext.addEventListener('click', () => nextWord(false));
});

function switchScreen(screenId) {
    document.querySelectorAll('.view-state').forEach(el => el.style.display = 'none');
    const target = document.getElementById(screenId);
    if(target) {
        target.style.display = 'flex'; // Reset to default layout
        target.classList.add('active');
    }
}

function startGame() {
    const platform = document.getElementById('platform-select').value;
    const channelName = document.getElementById('channel-input').value.trim();

    if (!channelName) {
        showToast("Lütfen bir kanal adı girin.", "warning");
        return;
    }

    // Initialize UI
    switchScreen('game-screen');
    document.getElementById('channel-display').textContent = `Kanal: ${channelName} (${platform})`;

    leaderboard = {};
    updateLeaderboardUI();
    nextWord(true); // first word

    // Connect to Chat
    chatListener = new ChatListener(platform, channelName, handleChatMessage);
}

function endGame() {
    if (confirm("Oyunu bitirmek ve bağlantıyı kesmek istediğinize emin misiniz?")) {
        if (chatListener) {
            chatListener.disconnect();
            chatListener = null;
        }
        switchScreen('login-screen');
        showToast("Oyun sonlandırıldı.", "info");
    }
}

function nextWord(isFirst = false) {
    if (availableWords.length === 0) {
        // Reload words if empty
        if (typeof WORDS !== 'undefined') {
            availableWords = [...WORDS];
        }
    }

    const randomIndex = Math.floor(Math.random() * availableWords.length);
    currentWordObj = availableWords.splice(randomIndex, 1)[0];

    // Update UI
    document.getElementById('main-word').textContent = currentWordObj.t;

    const ul = document.getElementById('forbidden-words');
    ul.innerHTML = '';
    currentWordObj.f.forEach(word => {
        const li = document.createElement('li');
        li.textContent = word;
        ul.appendChild(li);
    });

    if (!isFirst) {
        // Small flash effect
        const card = document.querySelector('.taboo-card');
        card.style.transform = 'scale(0.95)';
        setTimeout(() => card.style.transform = 'scale(1)', 150);
    }
}

function handleChatMessage(data) {
    const { username, message } = data;

    if (!currentWordObj) return;

    // Clean message and target word for comparison
    const cleanMsg = message.trim().toLowerCase();
    const targetWord = currentWordObj.t.trim().toLowerCase();

    // Exact match check
    if (cleanMsg === targetWord) {
        handleCorrectGuess(username);
    }
}

function handleCorrectGuess(username) {
    // 1. Add score
    if (!leaderboard[username]) leaderboard[username] = 0;
    leaderboard[username] += 1;

    // 2. Show notification
    const notif = document.getElementById('chat-notification');
    const winnerSpan = document.getElementById('notif-winner');

    winnerSpan.textContent = username;
    notif.classList.add('show');

    // Play sound (optional, assuming we have none, we skip)

    setTimeout(() => {
        notif.classList.remove('show');
    }, 3000);

    // 3. Update leaderboard UI
    updateLeaderboardUI();

    // 4. Automatically move to next word
    setTimeout(() => {
        nextWord(false);
    }, 500); // Small delay to let streamer react
}

function updateLeaderboardUI() {
    const list = document.getElementById('leaderboard-list');
    list.innerHTML = '';

    const entries = Object.entries(leaderboard).sort((a, b) => b[1] - a[1]);

    if (entries.length === 0) {
        list.innerHTML = '<li style="text-align: center; color: var(--text-muted); padding: 20px;">Henüz kimse puan alamadı. İzleyicilerinizi cesaretlendirin!</li>';
        return;
    }

    entries.forEach(([user, points]) => {
        const li = document.createElement('li');

        const nameSpan = document.createElement('span');
        nameSpan.textContent = user;
        nameSpan.style.fontWeight = "600";

        const pointSpan = document.createElement('span');
        pointSpan.className = 'points';
        pointSpan.textContent = points;

        li.appendChild(nameSpan);
        li.appendChild(pointSpan);
        list.appendChild(li);
    });
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if(!container) return;

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;

    if(type === 'warning') {
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