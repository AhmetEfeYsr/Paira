// game.js - Trivia Oyun Mantığı, UI Güncellemeleri ve Durum Yönetimi

// --- GLOBAL DEĞİŞKENLER ---
let allQuestions = [];
let turnTimeout = null;
let renderFrame = null;
let localTurnEndTime = 0;
let lastTickSec = -1;
let isCodeVisible = false;

// Oyunun ana durumu
let state = {
    status: 'lobby',
    players: {},
    round: 1,
    totalRounds: 10,
    turnDuration: 20,
    wrongPenalty: true, // -5 Puan Cezası
    activeQuestions: [],
    currentQuestion: null,
    answersInRound: {} // Her turda kimlerin cevap verdiğini takip eder: { playerId: { choiceIndex: number, points: number, timeLeft: number } }
};

// Yedek Soru Havuzu (Fetch başarısız olursa diye)
const fallbackQuestions = [
    { kategori: ["Genel Kültür"], soru_metni: "Türkiye'nin başkenti neresidir?", dogru_cevap: "Ankara", yanlis_secenekler: ["İstanbul", "İzmir", "Bursa"], zorluk: 10 },
    { kategori: ["Bilim"], soru_metni: "Su hangi iki elementten oluşur?", dogru_cevap: "Hidrojen ve Oksijen", yanlis_secenekler: ["Azot ve Oksijen", "Helyum ve Hidrojen", "Kükürt ve Oksijen"], zorluk: 20 }
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

    // Add a lowpass filter to make all sounds softer/less piercing
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1200; // soft treble

    osc.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    const now = audioCtx.currentTime;

    if (type === 'correct') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, now); // A4
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.1); // up to A5
        gainNode.gain.setValueAtTime(0.0, now);
        gainNode.gain.linearRampToValueAtTime(0.1, now + 0.05);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
        osc.start(now); osc.stop(now + 0.4);
    } else if (type === 'taboo' || type === 'wrong') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.exponentialRampToValueAtTime(150, now + 0.3);
        gainNode.gain.setValueAtTime(0.0, now);
        gainNode.gain.linearRampToValueAtTime(0.1, now + 0.05);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
        osc.start(now); osc.stop(now + 0.4);
    } else if (type === 'tick') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(600, now);
        gainNode.gain.setValueAtTime(0.0, now);
        gainNode.gain.linearRampToValueAtTime(0.05, now + 0.02);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        osc.start(now); osc.stop(now + 0.1);
    } else if (type === 'end') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.exponentialRampToValueAtTime(220, now + 0.5);
        gainNode.gain.setValueAtTime(0.0, now);
        gainNode.gain.linearRampToValueAtTime(0.1, now + 0.1);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 1.0);
        osc.start(now); osc.stop(now + 1.0);
    } else if (type === 'pass') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(800, now);
        gainNode.gain.setValueAtTime(0.0, now);
        gainNode.gain.linearRampToValueAtTime(0.05, now + 0.01);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        osc.start(now); osc.stop(now + 0.1);
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
        allQuestions = Array.isArray(data) ? data : fallbackQuestions;
    } catch {
        allQuestions = fallbackQuestions;
    }
    populateCategories();
    document.body.addEventListener('click', initAudio, { once: true });
});

function seededShuffle(arr, seed) {
    const rng = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

function populateCategories() {
    const container = document.getElementById('category-selection');
    if (!container) return;
    const cats = [...new Set(allQuestions.flatMap(w => w.kategori).filter(Boolean))];
    container.innerHTML = '';
    cats.forEach(cat => {
        const lbl = document.createElement('label');
        lbl.className = 'category-pill';
        lbl.innerHTML = `<input type="checkbox" value="${escapeHtml(cat)}" checked> ${escapeHtml(cat)}`;
        container.appendChild(lbl);
    });
}

// --- OYUN AKIŞI (HOST) ---
document.getElementById('btn-start-game')?.addEventListener('click', () => {
    if (!isHost) return;
    if (Object.keys(state.players).length < 2) { showToast("Oyuna başlamak için en az 2 kişi olmalı!", "warning"); return; }

    state.turnDuration = Math.max(5, parseInt(document.getElementById('turn-duration').value) || 20);
    state.totalRounds = Math.max(1, parseInt(document.getElementById('round-count').value) || 10);
    state.wrongPenalty = document.getElementById('wrong-penalty').checked;

    let minD = parseInt(document.getElementById('min-difficulty').value, 10) || 1;
    let maxD = parseInt(document.getElementById('max-difficulty').value, 10) || 100;
    if (minD > maxD) [minD, maxD] = [maxD, minD];
    const selCats = Array.from(document.querySelectorAll('.category-pill input:checked')).map(cb => cb.value);

    let filtered = allQuestions.filter(q => {
        const matchesCategory = selCats.length === 0 || (q.kategori && q.kategori.some(cat => selCats.includes(cat)));
        const matchesDifficulty = q.zorluk >= minD && q.zorluk <= maxD;
        return matchesCategory && matchesDifficulty;
    });

    if (filtered.length === 0) {
        showToast("Seçilen kategorilerde soru bulunamadı, tüm sorular yükleniyor.", "info");
        filtered = [...allQuestions];
    }

    if (filtered.length < state.totalRounds) {
         state.totalRounds = filtered.length;
         showToast(`Yeterli soru yok, oyun ${state.totalRounds} tur sürecek.`, "warning");
    }

    state.gameSeed = (state.gameSeed || 1) * 0x7fff + Date.now();
    state.activeQuestions = seededShuffle([...filtered], state.gameSeed).slice(0, state.totalRounds);

    // Her oyuncunun skorunu sıfırla
    Object.keys(state.players).forEach(pId => state.players[pId].score = 0);

    state.round = 1;
    state.status = 'playing';

    showScreen('game-screen');
    startTurn();
});

function getShuffledChoices(questionObj, seed) {
    const rng = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    const choices = [
        questionObj.dogru_cevap,
        questionObj.yanlis_secenekler[0],
        questionObj.yanlis_secenekler[1],
        questionObj.yanlis_secenekler[2]
    ];
    // İndisleri karıştır, böylece doğru cevabın yeni indeksini bulabiliriz
    let indices = [0, 1, 2, 3];
    for (let i = indices.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [indices[i], indices[j]] = [indices[j], indices[i]];
    }

    let correctIndex = indices.indexOf(0); // 0. eleman orjinal doğru cevaptı
    let shuffledTexts = indices.map(idx => choices[idx]);

    return { shuffledTexts, correctIndex };
}

function startTurn() {
    if (!isHost) return;
    if (turnTimeout) { clearInterval(turnTimeout); turnTimeout = null; }

    state.answersInRound = {}; // Yeni tur için cevapları temizle

    const currentQData = state.activeQuestions[state.round - 1];
    if (!currentQData) { showWinnerScreen(); return; }

    const seed = state.gameSeed + state.round;
    const { shuffledTexts, correctIndex } = getShuffledChoices(currentQData, seed);

    state.currentQuestion = {
        category: currentQData.kategori ? currentQData.kategori.join(', ') : "",
        question_text: currentQData.soru_metni,
        shuffled_choices: shuffledTexts,
        correct_answer_index: correctIndex // Sadece Host'ta kalacak (network.js'te clienta giderken silinir)
    };

    localTurnEndTime = Date.now() + (state.turnDuration * 1000);
    lastTickSec = -1;

    broadcastSync();
    updateUI();
    startRenderTimer();

    turnTimeout = setInterval(() => {
        if (Date.now() >= localTurnEndTime) {
            endRoundEarly(); // Süre bitince zorla bitir
        }
    }, 1000);
}

function handleClientAnswer(playerId, choiceIndex) {
    if (!isHost || state.status !== 'playing') return;
    if (state.answersInRound[playerId]) return; // Zaten cevaplamış

    const timeRemaining = Math.max(0, localTurnEndTime - Date.now());
    const secondsLeft = Math.ceil(timeRemaining / 1000);

    const isCorrect = choiceIndex === state.currentQuestion.correct_answer_index;

    let pointsEarned = 0;
    if (isCorrect) {
        pointsEarned = secondsLeft;
        state.players[playerId].score += pointsEarned;
    } else {
        if (state.wrongPenalty) {
            pointsEarned = -5;
            state.players[playerId].score += pointsEarned;
        }
    }

    state.answersInRound[playerId] = {
        choiceIndex,
        isCorrect,
        pointsEarned
    };

    broadcastSync();
    updateUI();

    // Herkes cevapladıysa turu beklemeden bitir
    if (checkAllPlayersAnswered()) {
        endRoundEarly();
    }
}

function checkAllPlayersAnswered() {
    if (!isHost) return false;
    const expectedPlayersCount = Object.keys(state.players).length;
    const answeredPlayersCount = Object.keys(state.answersInRound).length;
    return answeredPlayersCount >= expectedPlayersCount;
}

function endRoundEarly() {
    if (!isHost) return;
    if (turnTimeout) { clearInterval(turnTimeout); turnTimeout = null; }

    // Tüm cevapları açıkla / Ses çal (Clientlara kısa süreliğine doğru cevabı gösterebiliriz)
    // Şimdilik doğrudan diğer tura geçiyoruz veya bitiriyoruz. İsterseniz 2 saniye bekletip geçebilirsiniz.
    playSound('end');
    broadcast({ type: 'PLAY_SOUND', sound: 'end' });

    // Küçük bir bekleme (doğruyu göstermek için UI'ı kısa bir kitleme)
    setTimeout(() => {
        state.round++;
        if (state.round > state.totalRounds) {
            showWinnerScreen();
        } else {
            startTurn();
        }
    }, 1500); // 1.5 saniye sonuçları görmeleri için beklet
}


function showWinnerScreen() {
    state.status = 'finished';

    const ul = document.getElementById('final-scoreboard-list');
    ul.innerHTML = '';

    const sortedPlayers = Object.values(state.players).sort((a, b) => b.score - a.score);

    sortedPlayers.forEach((p, idx) => {
        const li = document.createElement('li');
        li.style.padding = '12px 20px';
        li.style.borderBottom = '1px solid rgba(255,255,255,0.1)';
        li.style.display = 'flex';
        li.style.justifyContent = 'space-between';
        li.style.fontSize = idx === 0 ? '1.4rem' : '1.1rem';
        li.style.color = idx === 0 ? 'var(--neon-purple)' : 'var(--text-main)';
        li.style.fontWeight = idx === 0 ? '800' : '500';

        li.innerHTML = `<span>${idx + 1}. ${escapeHtml(p.name)} ${p.id === myId ? '(Sen)' : ''}</span> <span>${p.score} Puan</span>`;
        ul.appendChild(li);
    });

    showScreen('winner-screen');
    broadcastSync();
}

document.getElementById('btn-back-to-lobby')?.addEventListener('click', () => {
    state.status = 'lobby';
    Object.keys(state.players).forEach(pId => state.players[pId].score = 0);
    state.round = 1;
    showScreen('lobby-screen');
    broadcastSync();
});

// Timer Animasyonu
function startRenderTimer() {
    if (renderFrame) cancelAnimationFrame(renderFrame);
    const timerEl = document.getElementById('timer-display');
    if (!timerEl) return;

    const tick = () => {
        if (state.status !== 'playing') return;

        const left = Math.max(0, localTurnEndTime - Date.now());
        const secs = Math.ceil(left / 1000);
        const m = Math.floor(secs / 60).toString().padStart(2, '0');
        const s = (secs % 60).toString().padStart(2, '0');
        timerEl.innerText = `${m}:${s}`;

        if (secs <= 5 && secs > 0) {
            timerEl.style.color = 'var(--danger)';
            if (lastTickSec !== secs) { playSound('tick'); lastTickSec = secs; }
        } else {
            timerEl.style.color = 'var(--lilac)';
        }

        renderFrame = requestAnimationFrame(tick);
    };
    renderFrame = requestAnimationFrame(tick);
}

// --- UI GÜNCELLEME ---
function updateUI() {
    const playerCount = Object.keys(state.players).length;
    const playerCountEl = document.getElementById('player-count');
    if (playerCountEl) playerCountEl.innerText = playerCount;

    const btnStart = document.getElementById('btn-start-game');
    if (btnStart) {
        if (playerCount >= 2) btnStart.classList.remove('disabled');
        else btnStart.classList.add('disabled');
    }

    const pList = document.getElementById('players-list');
    if (pList) {
        pList.innerHTML = '';
        Object.values(state.players).forEach(p => {
            const li = document.createElement('li');
            li.innerHTML = `<span>${p.isHost ? '👑 ' : ''}${escapeHtml(p.name)} ${p.id === myId ? '(Sen)' : ''}</span> <strong>${p.score || 0} Puan</strong>`;
            pList.appendChild(li);
        });
    }

    if (state.status === 'playing') {
        document.getElementById('round-indicator').innerText = `Soru ${state.round} / ${state.totalRounds}`;

        // Üst Scoreboard'u güncelle
        const scb = document.getElementById('in-game-scoreboard');
        if (scb) {
            scb.innerHTML = '';
            const sortedPlayers = Object.values(state.players).sort((a, b) => b.score - a.score);
            sortedPlayers.forEach(p => {
                const badge = document.createElement('div');
                badge.style.background = 'rgba(0,0,0,0.3)';
                badge.style.padding = '6px 12px';
                badge.style.borderRadius = '8px';
                badge.style.fontSize = '0.9rem';
                badge.style.border = p.id === myId ? '1px solid var(--primary-purple)' : '1px solid transparent';
                badge.innerHTML = `<strong>${escapeHtml(p.name)}:</strong> ${p.score}`;
                scb.appendChild(badge);
            });
        }

        const qCard = document.getElementById('question-card');
        const qMsg = document.getElementById('game-status-message');
        const qCategory = document.getElementById('question-category');
        const qMain = document.getElementById('main-question');

        if (state.currentQuestion) {
            qCard.classList.remove('hidden');
            qCategory.innerText = state.currentQuestion.category;
            qMain.innerText = state.currentQuestion.question_text;

            const myAnswer = state.answersInRound[myId];

            if (myAnswer) {
                qMsg.innerText = "Cevabın Kaydedildi! Diğer oyuncular bekleniyor...";
                qMsg.className = "status-badge";
            } else {
                qMsg.innerText = "Doğru şıkkı seç, süreyi avantaja çevir!";
                qMsg.className = "status-badge guesser-mode";
            }

            const choicesContainer = document.getElementById('choices-container');
            choicesContainer.innerHTML = '';

            const letters = ['A', 'B', 'C', 'D'];

            state.currentQuestion.shuffled_choices.forEach((choiceText, idx) => {
                const btn = document.createElement('button');
                btn.className = 'btn btn-secondary choice-btn';
                btn.style.padding = '1.2rem';
                btn.style.fontSize = '1.1rem';
                btn.style.height = 'auto';
                btn.style.whiteSpace = 'normal';
                btn.innerHTML = `<strong>${letters[idx]})</strong> ${escapeHtml(choiceText)}`;

                // Eğer oyuncu zaten cevap verdiyse butonları kilitle
                if (myAnswer) {
                    btn.classList.add('disabled');
                    // Kullanıcının seçtiği butonu vurgula
                    if (myAnswer.choiceIndex === idx) {
                        btn.classList.add('btn-selected');
                    }
                } else {

                    // Hızlı tepki için pointerdown ve click olaylarını dinle.
                    // touch cihazlarda pointerdown çok daha hızlı çalışır.
                    const handleChoice = (e) => {
                        e.preventDefault(); // Olası scroll/double-tap sorunlarını önler
                        if (btn.classList.contains('disabled')) return;

                        // Tıklandığı an UI geri bildirimi ver (Hızlı tepki)
                        btn.classList.add('btn-selected');
                        playSound('pass'); // Basit bir tık sesi

                        sendAnswer(idx);

                        // Sadece bir kere çalışsın diye kendisini kaldırıyoruz
                        btn.removeEventListener('pointerdown', handleChoice);
                        btn.removeEventListener('click', handleChoice);
                    };

                    btn.addEventListener('pointerdown', handleChoice);
                    btn.addEventListener('click', handleChoice);

                }

                choicesContainer.appendChild(btn);
            });

        } else {
            qCard.classList.add('hidden');
            qMsg.innerText = "Soru Yükleniyor...";
            qMsg.className = "status-badge";
        }
    }
}
