// game.js - Oyun Mantığı, UI Güncellemeleri ve Durum Yönetimi

// --- GLOBAL DEĞİŞKENLER ---
let allWords = [];
let turnTimeout = null;
let lastEndTurnAt = 0;
let renderFrame = null;
let localTurnEndTime = 0;
let lastTickSec = -1;
let isCodeVisible = false;
let pauseOffset = 0; // Duraklatma anındaki kalan süreyi tutar

// Oyunun ana durumu
let state = {
    status: 'lobby',
    players: {},
    scoreA: 0,
    scoreB: 0,
    round: 1,
    totalRounds: 3,
    turnDuration: 60,
    passLimit: 3,
    tabooPenalty: 1,
    turnId: null,
    turnOrder: [],
    turnIndex: 0,
    activeWords: [],
    wordIndex: 0,
    passesLeft: 3,
    isPaused: false,
    isWaitingForReady: false // Anlatıcının hazır olmasını bekleme durumu
};

// Yedek Kelime Havuzu (Fetch başarısız olursa diye)
const fallbackWords = [
    { ana_kelime: "güneş", yasakli_kelimeler: ["Sarı", "Sıcak", "Gökyüzü", "Yıldız", "Yaz"], kategori: "Genel", zorluk: 10 },
    { ana_kelime: "telefon", yasakli_kelimeler: ["Konuşmak", "Akıllı", "Ekran", "Mesaj", "Aramak"], kategori: "Teknoloji", zorluk: 20 },
    { ana_kelime: "kitap", yasakli_kelimeler: ["Okumak", "Sayfa", "Kütüphane", "Yazar", "Hikaye"], kategori: "Genel", zorluk: 15 },
    { ana_kelime: "bilgisayar", yasakli_kelimeler: ["Klavye", "İnternet", "Oyun", "Ekran", "Yazılım"], kategori: "Teknoloji", zorluk: 30 },
    { ana_kelime: "pizza", yasakli_kelimeler: ["Hamur", "Peynir", "İtalyan", "Yemek", "Dilim"], kategori: "Yemek", zorluk: 10 }
];

// --- SES YÖNETİMİ ---
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
    } else if (type === 'taboo') {
        osc.type = 'sawtooth'; osc.frequency.setValueAtTime(150, audioCtx.currentTime); osc.frequency.linearRampToValueAtTime(100, audioCtx.currentTime + 0.3);
        gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime); gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
        osc.start(); osc.stop(audioCtx.currentTime + 0.3);
    } else if (type === 'pass') {
        osc.type = 'triangle'; osc.frequency.setValueAtTime(300, audioCtx.currentTime); osc.frequency.exponentialRampToValueAtTime(150, audioCtx.currentTime + 0.2);
        gainNode.gain.setValueAtTime(0.2, audioCtx.currentTime); gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.2);
        osc.start(); osc.stop(audioCtx.currentTime + 0.2);
    } else if (type === 'tick') {
        osc.type = 'square'; osc.frequency.setValueAtTime(800, audioCtx.currentTime);
        gainNode.gain.setValueAtTime(0.05, audioCtx.currentTime); gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.05);
        osc.start(); osc.stop(audioCtx.currentTime + 0.05);
    } else if (type === 'end') {
        osc.type = 'square'; osc.frequency.setValueAtTime(200, audioCtx.currentTime);
        gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime); gainNode.gain.linearRampToValueAtTime(0.01, audioCtx.currentTime + 1);
        osc.start(); osc.stop(audioCtx.currentTime + 1);
    }
}

// --- UI YARDIMCI FONKSİYONLAR ---
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
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const colors = { error: 'var(--danger)', success: 'var(--success)', warning: 'var(--warning)', info: 'var(--primary-purple)' };
    toast.style.borderLeftColor = colors[type] || colors.info;
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
}

// --- BAŞLANGIÇ AYARLARI ---
document.addEventListener('DOMContentLoaded', async () => {
    try {
        const res = await fetch('tr.json');
        const data = await res.json();
        allWords = Array.isArray(data) ? data : fallbackWords;
    } catch {
        allWords = fallbackWords;
    }
    populateCategories();
    document.body.addEventListener('click', initAudio, { once: true });

    // Enter Tuşu Desteği
    document.getElementById('username-input').addEventListener('keypress', (e) => {
        if(e.key === 'Enter') document.getElementById('btn-host').click();
    });
    document.getElementById('room-code-input').addEventListener('keypress', (e) => {
        if(e.key === 'Enter') document.getElementById('btn-join').click();
    });
});

function seededShuffle(arr, seed) {
    const rng = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

function ensureActiveWords() {
    if (state.activeWords?.length > 0) return;
    if (!state.filterParams || !allWords.length) return;
    const { selCats, minD, maxD } = state.filterParams;
    const catSet = new Set(selCats);
    let filtered = allWords.filter(w => (selCats.length === 0 || catSet.has(w.kategori)) && (w.zorluk >= minD && w.zorluk <= maxD));
    if (filtered.length === 0) filtered = [...allWords];
    state.activeWords = seededShuffle([...filtered], state.gameSeed || 1);
}

function populateCategories() {
    const container = document.getElementById('category-selection');
    if (!container) return;
    const cats = [...new Set(allWords.map(w => w.kategori).filter(Boolean))];
    container.innerHTML = '';
    cats.forEach(cat => {
        const lbl = document.createElement('label');
        lbl.className = 'category-pill';
        lbl.innerHTML = `<input type="checkbox" value="${escapeHtml(cat)}" checked> ${escapeHtml(cat)}`;
        container.appendChild(lbl);
    });
}

// --- OYUN AKIŞI ---
document.getElementById('btn-start-game').addEventListener('click', () => {
    if (!isHost) return;
    if (Object.keys(state.players).length < 2) { showToast("Oyuna başlamak için en az 2 kişi olmalı!", "warning"); return; }

    state.turnDuration = Math.max(10, parseInt(document.getElementById('turn-duration').value) || 60);
    state.passLimit = Math.max(0, parseInt(document.getElementById('pass-limit').value) || 3);
    state.tabooPenalty = Math.max(0, parseInt(document.getElementById('taboo-penalty').value) || 1);
    state.totalRounds = Math.max(1, parseInt(document.getElementById('round-count').value) || 3);

    let minD = parseInt(document.getElementById('min-difficulty').value, 10) || 1;
    let maxD = parseInt(document.getElementById('max-difficulty').value, 10) || 100;
    if (minD > maxD) [minD, maxD] = [maxD, minD];
    const selCats = Array.from(document.querySelectorAll('.category-pill input:checked')).map(cb => cb.value);
    const catSet = new Set(selCats);

    let filtered = allWords.filter(w => (selCats.length === 0 || catSet.has(w.kategori)) && (w.zorluk >= minD && w.zorluk <= maxD));

    if (filtered.length === 0) {
        showToast("Seçilen kategorilerde kelime bulunamadı, tüm kelimeler yükleniyor.", "info");
        filtered = [...allWords];
    }

    const teamA = Object.values(state.players).filter(p => p.team === 'A').map(p => p.id);
    const teamB = Object.values(state.players).filter(p => p.team === 'B').map(p => p.id);
    if (teamA.length === 0 || teamB.length === 0) { showToast("Her iki takımda da en az bir oyuncu olmalı!", "warning"); return; }

    state.gameSeed = (state.gameSeed || 1) * 0x7fff + Date.now();
    state.filterParams = { selCats: [...selCats], minD, maxD };
    state.activeWords = seededShuffle([...filtered], state.gameSeed);
    state.wordIndex = 0;
    state.scoreA = 0;
    state.scoreB = 0;
    state.round = 1;
    state.isPaused = false;

    state.turnOrder = [];
    const maxLen = Math.max(teamA.length, teamB.length);
    for (let i = 0; i < maxLen; i++) {
        if (teamA[i % teamA.length]) state.turnOrder.push(teamA[i % teamA.length]);
        if (teamB[i % teamB.length]) state.turnOrder.push(teamB[i % teamB.length]);
    }

    state.turnIndex = 0;
    state.status = 'playing';

    showScreen('game-screen');
    startTurn();
});

// Turu başlatır ama süreyi başlatmaz (Bekleme Modu)
function startTurn() {
    if (!isHost || state.turnOrder.length === 0) return;
    ensureActiveWords();
    if (turnTimeout) { clearInterval(turnTimeout); turnTimeout = null; }

    state.turnId = state.turnOrder[state.turnIndex];
    state.passesLeft = state.passLimit;
    state.isPaused = false;
    state.isWaitingForReady = true; // Anlatıcının onayını bekle
    localTurnEndTime = 0;
    lastTickSec = -1;

    broadcastSync();
    updateUI();
}

// Anlatıcı onay verince süreyi başlatır
function beginTimer() {
    if (!isHost) return;
    state.isWaitingForReady = false;
    localTurnEndTime = Date.now() + (state.turnDuration * 1000);

    broadcastSync();
    updateUI(); // Host arayüzünü günceller
    startRenderTimer();

    turnTimeout = setInterval(() => {
        if (state.isPaused) return;
        if (Date.now() >= localTurnEndTime) {
            clearInterval(turnTimeout);
            turnTimeout = null;
            if (state.status === 'playing') endTurn();
        }
    }, 1000);
}

// Mola Fonksiyonu
document.getElementById('btn-pause')?.addEventListener('click', () => {
    if (!isHost || state.status !== 'playing' || state.isWaitingForReady) return;

    state.isPaused = !state.isPaused;
    if (state.isPaused) {
        pauseOffset = localTurnEndTime - Date.now();
    } else {
        localTurnEndTime = Date.now() + pauseOffset;
    }
    broadcastSync();
    updateUI();
});

function endTurn() {
    if (!isHost) return;
    const now = Date.now();
    if (now - lastEndTurnAt < 500) return;
    lastEndTurnAt = now;
    if (turnTimeout) { clearInterval(turnTimeout); turnTimeout = null; }

    localTurnEndTime = 0;
    state.turnIndex++;
    playSound('end');
    broadcast({ type: 'PLAY_SOUND', sound: 'end' });

    advanceWord();

    if (state.turnIndex >= state.turnOrder.length) {
        state.turnIndex = 0;
        state.round++;
    }

    if (state.round > state.totalRounds) {
        showWinnerScreen();
    } else {
        state.turnId = null;
        broadcastSync();
        setTimeout(() => { if (isHost && state.status === 'playing') startTurn(); }, 3000);
    }
}

function showWinnerScreen() {
    state.status = 'finished';
    const winnerTitle = document.getElementById('winner-team-name');
    const finalA = document.getElementById('final-score-a');
    const finalB = document.getElementById('final-score-b');

    finalA.innerText = state.scoreA;
    finalB.innerText = state.scoreB;

    if (state.scoreA > state.scoreB) {
        winnerTitle.innerText = "KAZANAN: TAKIM A";
        winnerTitle.style.color = "#3498db";
    } else if (state.scoreB > state.scoreA) {
        winnerTitle.innerText = "KAZANAN: TAKIM B";
        winnerTitle.style.color = "#e74c3c";
    } else {
        winnerTitle.innerText = "DOSTLUK KAZANDI (BERABERE)";
        winnerTitle.style.color = "var(--lilac)";
    }

    showScreen('winner-screen');
    broadcastSync();
}

document.getElementById('btn-back-to-lobby').addEventListener('click', () => {
    state.status = 'lobby';
    state.scoreA = 0; state.scoreB = 0; state.round = 1;
    showScreen('lobby-screen');
    broadcastSync();
});

function processAction(action) {
    if (state.isPaused) return;

    // Anlatıcı hazır olduğunu host'a ilettiğinde
    if (action === 'NARRATOR_READY' && state.isWaitingForReady) {
        beginTimer();
        return;
    }

    ensureActiveWords();
    const player = state.players[state.turnId];
    if (!player || !state.activeWords || state.activeWords.length === 0) return;

    if (action === 'CORRECT') {
        if (player.team === 'A') state.scoreA++; else state.scoreB++;
        playSound('correct'); broadcast({ type: 'PLAY_SOUND', sound: 'correct' }); advanceWord();
    } else if (action === 'TABOO') {
        if (player.team === 'A') state.scoreA = Math.max(0, state.scoreA - state.tabooPenalty); else state.scoreB = Math.max(0, state.scoreB - state.tabooPenalty);
        playSound('taboo'); broadcast({ type: 'PLAY_SOUND', sound: 'taboo' }); advanceWord();
    } else if (action === 'PASS') {
        if (state.passesLeft > 0) {
            state.passesLeft--;
            playSound('pass'); broadcast({ type: 'PLAY_SOUND', sound: 'pass' }); advanceWord();
        } else {
            const btnPass = document.getElementById('btn-pass');
            btnPass.classList.add('error-shake');
            setTimeout(() => btnPass.classList.remove('error-shake'), 400);
        }
    }
    broadcastSync();
    updateUI();
}

function advanceWord() {
    state.wordIndex++;
    if (state.wordIndex >= state.activeWords.length) {
        state.gameSeed = (state.gameSeed * 16807) % 2147483647;
        seededShuffle(state.activeWords, state.gameSeed);
        state.wordIndex = 0;
    }
    const cardEl = document.getElementById('word-card');
    if (cardEl) {
        cardEl.classList.remove('pop-animation');
        void cardEl.offsetWidth;
        cardEl.classList.add('pop-animation');
    }
}

function startRenderTimer() {
    if (renderFrame) cancelAnimationFrame(renderFrame);
    const timerEl = document.getElementById('timer-display');
    if (!timerEl) return;

    const tick = () => {
        if (state.status !== 'playing') return;

        if (state.isWaitingForReady) {
            timerEl.innerText = "BEKLİYOR";
            timerEl.style.color = 'var(--lilac)';
        } else if (!state.isPaused) {
            const left = Math.max(0, localTurnEndTime - Date.now());
            const secs = Math.ceil(left / 1000);
            const m = Math.floor(secs / 60).toString().padStart(2, '0');
            const s = (secs % 60).toString().padStart(2, '0');
            timerEl.innerText = `${m}:${s}`;

            if (secs <= 10 && secs > 0) {
                timerEl.style.color = 'var(--danger)';
                if (lastTickSec !== secs) { playSound('tick'); lastTickSec = secs; }
            } else {
                timerEl.style.color = 'var(--lilac)';
            }
        } else {
            timerEl.innerText = "DURDU";
            timerEl.style.color = 'var(--warning)';
        }

        renderFrame = requestAnimationFrame(tick);
    };
    renderFrame = requestAnimationFrame(tick);
}

// --- UI GÜNCELLEME ---
// --- UI GÜNCELLEME ---
function updateUI() {
    const playerCount = Object.keys(state.players).length;
    const playerCountEl = document.getElementById('player-count');
    if (playerCountEl) playerCountEl.innerText = playerCount;

    // YENİ: Oyuncu sayısı 2 veya fazlaysa BAŞLAT butonunu aktifleştir
    const btnStart = document.getElementById('btn-start-game');
    if (btnStart) {
        if (playerCount >= 2) {
            btnStart.classList.remove('disabled');
        } else {
            btnStart.classList.add('disabled');
        }
    }

    const pList = document.getElementById('players-list');
    if (pList) {
        pList.innerHTML = '';
        Object.values(state.players).forEach(p => {
            const li = document.createElement('li');
            li.innerHTML = `<span>${p.isHost ? '👑 ' : ''}${escapeHtml(p.name)} ${p.id === myId ? '(Sen)' : ''}</span> <strong>T-${p.team}</strong>`;
            pList.appendChild(li);
        });
    }

    if (state.status === 'playing') {
        const sa = document.getElementById('score-a'), sb = document.getElementById('score-b');
        if (sa) sa.innerText = state.scoreA; if (sb) sb.innerText = state.scoreB;

        const btnPause = document.getElementById('btn-pause');
        if (btnPause) {
            btnPause.classList.toggle('hidden', !isHost || state.isWaitingForReady);
            btnPause.innerText = state.isPaused ? '▶' : '⏸';
        }

        const tPlayer = state.players[state.turnId];
        const fw = document.getElementById('forbidden-words'), mainWord = document.getElementById('main-word');
        const wordCard = document.getElementById('word-card'), narratorActions = document.getElementById('narrator-actions');
        const gameStatusMessage = document.getElementById('game-status-message');
        const startTurnContainer = document.getElementById('start-turn-container');

        if (!tPlayer) {
            document.getElementById('turn-name').innerText = "Sıra Değişiyor...";
            return;
        }

        document.getElementById('turn-name').innerText = `${tPlayer.name} (T-${tPlayer.team})`;
        const myTeam = state.players[myId]?.team;
        const amINarrator = state.turnId === myId;
        const isOpponent = myTeam !== tPlayer.team;

        const btnPass = document.getElementById('btn-pass');
        if (btnPass) {
            btnPass.innerText = `⟳ Pas (${state.passesLeft})`;
            btnPass.classList.toggle('disabled', state.passesLeft <= 0);
        }

        if (state.isWaitingForReady) {
            wordCard.classList.add('hidden');
            narratorActions.classList.add('hidden');

            if (amINarrator) {
                startTurnContainer.classList.remove('hidden');
                gameStatusMessage.innerText = "Sıra Sende! Hazır olduğunda süreyi başlat.";
                gameStatusMessage.className = "status-badge guesser-mode";
            } else {
                startTurnContainer.classList.add('hidden');
                gameStatusMessage.innerText = `${tPlayer.name} hazırlanıyor...`;
                gameStatusMessage.className = "status-badge";
            }
        } else {
            startTurnContainer.classList.add('hidden');
            let wordObj = state.currentWord || (state.activeWords?.[state.wordIndex]);

            if (wordObj && (amINarrator || isOpponent)) {
                mainWord.innerText = wordObj.ana_kelime.toLocaleUpperCase('tr-TR');
                fw.innerHTML = '';
                wordObj.yasakli_kelimeler.forEach(w => { const li = document.createElement('li'); li.innerText = w.toLocaleUpperCase('tr-TR'); fw.appendChild(li); });
            }

            if (amINarrator) {
                wordCard.classList.remove('hidden'); narratorActions.classList.remove('hidden');
                gameStatusMessage.innerText = "Sıra Sende - Anlatıyorsun!";
                gameStatusMessage.className = "status-badge guesser-mode";
            } else if (isOpponent) {
                wordCard.classList.remove('hidden'); narratorActions.classList.add('hidden');
                gameStatusMessage.innerText = "Rakip Anlatıyor - Kontrol Et!";
                gameStatusMessage.className = "status-badge opponent-mode";
            } else {
                wordCard.classList.add('hidden'); narratorActions.classList.add('hidden');
                gameStatusMessage.innerText = "Takım Arkadaşın Anlatıyor - Tahmin Et!";
                gameStatusMessage.className = "status-badge";
            }
        }
    }
}

function displayChat(sender, msg, isSelf = false) {
    const cBox = document.getElementById('chat-messages');
    if (!cBox) return;
    const div = document.createElement('div');
    div.className = `chat-msg ${isSelf ? 'self' : ''}`;
    div.innerHTML = `<strong>${escapeHtml(sender)}:</strong> ${escapeHtml(msg)}`;
    cBox.appendChild(div);
    cBox.scrollTop = cBox.scrollHeight;
}


document.getElementById('btn-start-narrating')?.addEventListener('click', () => {
    if (state.turnId === myId && state.isWaitingForReady) {
        sendAction('NARRATOR_READY');
    }
});

function sendChat() {
    const input = document.getElementById('chat-input');
    const msg = input.value.trim();
    if (!msg) return;
    displayChat("Sen", msg, true);
    broadcast({ type: 'CHAT', sender: myName, msg: msg });
    input.value = '';
}

document.getElementById('btn-send-chat').addEventListener('click', sendChat);
document.getElementById('chat-input').addEventListener('keypress', (e) => { if(e.key === 'Enter') sendChat(); });
