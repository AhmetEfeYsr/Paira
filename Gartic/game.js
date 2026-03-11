// --- ÇizBil (Gartic) Logic ---

// cizbilWords is loaded globally from shared/cizbil_words.js
let wordDatabase = [...window.cizbilWords];
let currentWordIndex = 0;
let currentWord = "";
let chatListener = null;

let state = {
    platform: '',
    channel: '',
    scores: {},
    isPaused: false
};

// Canvas variables
let drawingBoard;

// Fuzzy Matcher implementation
const normalizeTurkish = (str) => {
    return str.replace(/İ/g, 'I').replace(/ı/g, 'I')
              .replace(/Ş/g, 'S').replace(/ş/g, 'S')
              .replace(/Ğ/g, 'G').replace(/ğ/g, 'G')
              .replace(/Ü/g, 'U').replace(/ü/g, 'U')
              .replace(/Ö/g, 'O').replace(/ö/g, 'O')
              .replace(/Ç/g, 'C').replace(/ç/g, 'C')
              .toUpperCase().trim();
};

const isMatch = (guess, target) => {
    const nGuess = normalizeTurkish(guess);
    const nTarget = normalizeTurkish(target);

    // Direct match
    if (nGuess === nTarget) return true;

    // We allow small typos for words >= 5 letters (no levenshtein needed for very strict gartic rules, but lets keep it simple)
    if (nTarget.length > 4 && Math.abs(nGuess.length - nTarget.length) <= 1) {
       // Simple check if they are almost same
       let diff = 0;
       for (let i = 0; i < Math.max(nGuess.length, nTarget.length); i++) {
           if (nGuess[i] !== nTarget[i]) diff++;
       }
       if (diff <= 1) return true;
    }
    return false;
};

document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('main-word')) {
        initGame();
        initCanvas();
    }
});

function initCanvas() {
    const canvasElement = document.getElementById('drawing-board');
    drawingBoard = new AdvancedDrawingBoard(canvasElement, {
        defaultColor: '#000000',
        defaultSize: 8
    });

    // Toolbar logic
    const bindInteraction = (el, handler) => {
        el.addEventListener('pointerdown', (e) => { e.preventDefault(); handler(e); });
        el.addEventListener('click', (e) => { e.preventDefault(); handler(e); });
        el.style.touchAction = 'none';
    };

    document.querySelectorAll('.color-swatch').forEach(swatch => {
        bindInteraction(swatch, (e) => {
            document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
            const target = e.target.closest('.color-swatch');
            target.classList.add('active');
            drawingBoard.setColor(target.dataset.color);
            if (target.dataset.color === '#ffffff') drawingBoard.setTool('eraser');
            else drawingBoard.setTool('brush');
        });
    });

    document.querySelectorAll('.size-btn').forEach(btn => {
        bindInteraction(btn, (e) => {
            document.querySelectorAll('.size-btn').forEach(b => b.classList.remove('active'));
            const target = e.target.closest('.size-btn');
            target.classList.add('active');
            drawingBoard.setSize(parseInt(target.dataset.size));
        });
    });

    document.querySelectorAll('.tool-btn').forEach(btn => {
        bindInteraction(btn, (e) => {
            document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
            const target = e.target.closest('.tool-btn');
            target.classList.add('active');
            drawingBoard.setTool(target.dataset.tool);
        });
    });

    bindInteraction(document.getElementById('btn-clear'), () => {
        drawingBoard.clear(false);
    });

    const btnUndo = document.getElementById('btn-undo');
    if (btnUndo) {
        bindInteraction(btnUndo, () => {
            drawingBoard.undo(false);
        });
    }
}

async function initGame() {
    const channel = sessionStorage.getItem('cizbil_channel');
    const platform = sessionStorage.getItem('cizbil_platform');

    if (!channel || !platform) {
        window.location.href = 'index.html';
        return;
    }

    document.getElementById('channel-name-display').textContent = `${platform.toUpperCase()} / ${channel}`;

    if (window.loadGarticWords) {
        await window.loadGarticWords();
    }

    // Update word database after loading
    wordDatabase = [...window.cizbilWords];

    // Shuffle words
    wordDatabase.sort(() => (window.crypto.getRandomValues(new Uint32Array(1))[0] % 100) - 50);

    if (typeof ChatListener === 'undefined') {
        alert('ChatListener yüklenemedi!');
        return;
    }

    chatListener = new ChatListener(platform, channel, handleChatMessage);

    const statusBadge = document.getElementById('status-badge');
    statusBadge.textContent = 'Bağlanıyor...';

    chatListener.start();

    setTimeout(() => {
        statusBadge.textContent = 'Bağlandı';
        statusBadge.style.color = 'var(--success)';
    }, 2000);

    // Controls
    document.getElementById('btn-skip').addEventListener('click', presentWordChoices);
    document.getElementById('btn-next').addEventListener('click', presentWordChoices);
    document.getElementById('btn-leave').addEventListener('click', () => {
        chatListener.stop();
        window.location.href = 'index.html';
    });

    // Setup word choice handlers
    document.getElementById('btn-choice-1').addEventListener('click', (e) => startWord(e.target.textContent));
    document.getElementById('btn-choice-2').addEventListener('click', (e) => startWord(e.target.textContent));

    presentWordChoices();
}

function presentWordChoices() {
    state.isPaused = true;

    // Pick two random distinct words
    let word1 = wordDatabase[currentWordIndex];
    currentWordIndex = (currentWordIndex + 1) % wordDatabase.length;
    let word2 = wordDatabase[currentWordIndex];
    currentWordIndex = (currentWordIndex + 1) % wordDatabase.length;

    document.getElementById('btn-choice-1').textContent = word1;
    document.getElementById('btn-choice-2').textContent = word2;
    document.getElementById('word-choice-overlay').style.display = 'flex';
    document.getElementById('main-word').textContent = "SEÇİM YAPILIYOR...";
    document.getElementById('btn-next').style.display = 'none';
    document.getElementById('btn-skip').style.display = 'none';

    if (drawingBoard) {
        drawingBoard.clear(false);
    }
}

function startWord(selectedWord) {
    document.getElementById('word-choice-overlay').style.display = 'none';
    currentWord = selectedWord;
    document.getElementById('main-word').textContent = currentWord;

    state.isPaused = false;
    document.getElementById('btn-next').style.display = 'none';
    document.getElementById('btn-skip').style.display = 'inline-block';
}

function handleChatMessage(username, message) {
    if (state.isPaused || !currentWord) return;

    const chatFeed = document.getElementById('chat-feed');
    const msgDiv = document.createElement('div');
    msgDiv.className = 'chat-msg';

    const usernameSpan = document.createElement('strong');
    usernameSpan.textContent = username + ': ';
    const textSpan = document.createElement('span');
    textSpan.textContent = message;

    msgDiv.appendChild(usernameSpan);
    msgDiv.appendChild(textSpan);

    if (isMatch(message, currentWord)) {
        msgDiv.classList.add('correct');
        textSpan.textContent += ' (🎉 DOĞRU BİLDİ!)';
        handleCorrectGuess(username);
    }

    chatFeed.appendChild(msgDiv);
    chatFeed.scrollTop = chatFeed.scrollHeight;
}

function handleCorrectGuess(username) {
    state.isPaused = true;

    if (!state.scores[username]) state.scores[username] = 0;
    state.scores[username] += 1;

    updateLeaderboard();

    document.getElementById('btn-next').style.display = 'inline-block';
    document.getElementById('btn-skip').style.display = 'none';

    document.querySelector('.canvas-container').style.borderColor = 'var(--success)';
    document.querySelector('.canvas-container').style.boxShadow = '0 0 30px rgba(46, 204, 113, 0.6)';

    setTimeout(() => {
        document.querySelector('.canvas-container').style.borderColor = 'var(--border-color)';
        document.querySelector('.canvas-container').style.boxShadow = '0 10px 30px rgba(0,0,0,0.5)';
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
