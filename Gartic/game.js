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

    if (nGuess === nTarget) return true;

    if (nTarget.length > 4) {
        const distance = levenshtein(nGuess, nTarget);
        if (distance <= 1) return true;
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

    document.querySelectorAll('.color-swatch:not(.custom-color-btn)').forEach(swatch => {
        bindInteraction(swatch, (e) => {
            document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
            const target = e.target.closest('.color-swatch');
            target.classList.add('active');
            drawingBoard.setColor(target.dataset.color);
            if (target.dataset.color === '#ffffff') {
                drawingBoard.setTool('eraser');
                document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
                const eraserBtn = document.querySelector('.tool-btn[data-tool="eraser"]');
                if (eraserBtn) eraserBtn.classList.add('active');
            } else {
                const currentToolBtn = document.querySelector('.tool-btn.active');
                if (!currentToolBtn || currentToolBtn.dataset.tool === 'eraser') {
                    drawingBoard.setTool('brush');
                    document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
                    const brushBtn = document.querySelector('.tool-btn[data-tool="brush"]');
                    if (brushBtn) brushBtn.classList.add('active');
                } else {
                    drawingBoard.setTool(currentToolBtn.dataset.tool);
                }
            }
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
            
            // If selecting a tool, ensure a non-white color is active if eraser was active
            if (target.dataset.tool !== 'eraser') {
                const activeSwatch = document.querySelector('.color-swatch.active');
                if (activeSwatch && activeSwatch.dataset.color === '#ffffff') {
                    // Revert to black or last used color
                    document.querySelector('.color-swatch[data-color="#000000"]').click();
                }
            }
        });
    });

    bindInteraction(document.getElementById('btn-clear'), () => {
        drawingBoard.clear(false);
        if (window.showToast) window.showToast("Tuval temizlendi", "info");
    });

    const btnUndo = document.getElementById('btn-undo');
    if (btnUndo) {
        bindInteraction(btnUndo, () => {
            drawingBoard.undo(false);
        });
    }

    const customColorInput = document.querySelector('.custom-color-input');
    const customColorBtn = document.querySelector('.custom-color-btn');
    if (customColorInput && customColorBtn) {
        customColorInput.addEventListener('input', (e) => {
            const newColor = e.target.value;
            customColorBtn.dataset.color = newColor;
            customColorBtn.style.background = newColor;
            customColorBtn.querySelector('span').style.display = 'none'; // Hide the + icon
            document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
            customColorBtn.classList.add('active');
            drawingBoard.setColor(newColor);
            drawingBoard.setTool('brush');
        });
        customColorInput.addEventListener('change', (e) => {
            if (window.showToast) window.showToast("Özel renk seçildi", "info");
        });
        customColorInput.addEventListener('pointerdown', e => {
            e.stopPropagation();
            // Proactively set the current custom color in case they just click and dismiss
            const newColor = customColorInput.value;
            document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
            customColorBtn.classList.add('active');
            drawingBoard.setColor(newColor);
            drawingBoard.setTool('brush');
        });
        customColorInput.addEventListener('click', e => e.stopPropagation());
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

    // Shuffle words using Fisher-Yates
    for (let i = wordDatabase.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [wordDatabase[i], wordDatabase[j]] = [wordDatabase[j], wordDatabase[i]];
    }

    if (typeof ChatListener === 'undefined') {
        if (window.showToast) window.showToast('ChatListener yüklenemedi!', 'error');
        return;
    }

    chatListener = new ChatListener(platform, channel, handleChatMessage);

    const statusBadge = document.getElementById('status-badge');
    statusBadge.textContent = 'Bağlanıyor...';

    chatListener.start();

    setTimeout(() => {
        statusBadge.textContent = 'Bağlandı';
        statusBadge.style.color = 'var(--success)';
        statusBadge.style.borderColor = 'var(--success)';
        if (window.showToast) window.showToast('Chat bağlantısı başarılı.', 'success');
    }, 2000);

    // Controls
    document.getElementById('btn-skip').addEventListener('click', () => {
        if (window.PairaAudio) window.PairaAudio.play('pass');
        presentWordChoices();
    });
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
    document.getElementById('word-choice-overlay-bg').style.display = 'block';
    document.getElementById('word-choice-overlay').style.display = 'flex';
    document.getElementById('main-word').textContent = "SEÇİM YAPILIYOR...";
    document.getElementById('btn-next').style.display = 'none';
    document.getElementById('btn-skip').style.display = 'none';

    if (drawingBoard) {
        drawingBoard.clear(false);
    }
}

function startWord(selectedWord) {
    document.getElementById('word-choice-overlay-bg').style.display = 'none';
    document.getElementById('word-choice-overlay').style.display = 'none';
    currentWord = selectedWord;
    document.getElementById('main-word').textContent = currentWord;

    state.isPaused = false;
    document.getElementById('btn-next').style.display = 'none';
    document.getElementById('btn-skip').style.display = 'inline-flex';
    if (window.showToast) window.showToast("Yeni kelime seçildi, çizime başlayabilirsiniz!", "info");
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
        textSpan.innerHTML = `<strong>🎉 ${message}</strong> (Doğru bildi!)`;
        handleCorrectGuess(username);
    }

    chatFeed.appendChild(msgDiv);
    chatFeed.scrollTop = chatFeed.scrollHeight;
    
    // Auto-remove old messages to prevent lag
    if (chatFeed.children.length > 50) {
        chatFeed.removeChild(chatFeed.firstChild);
    }
}

function handleCorrectGuess(username) {
    state.isPaused = true;

    if (!state.scores[username]) state.scores[username] = 0;
    state.scores[username] += 1;

    updateLeaderboard();

    document.getElementById('btn-next').style.display = 'inline-flex';
    document.getElementById('btn-skip').style.display = 'none';

    const canvasContainer = document.getElementById('canvas-container');
    canvasContainer.classList.add('canvas-correct');
    
    if (window.PairaAudio) window.PairaAudio.play('correct');
    if (window.showToast) window.showToast(`${username} doğru bildi!`, 'success');

    setTimeout(() => {
        canvasContainer.classList.remove('canvas-correct');
    }, 2000);
}

function updateLeaderboard() {
    const list = document.getElementById('leaderboard-list');
    list.innerHTML = '';

    const sortedScores = Object.entries(state.scores).sort((a, b) => b[1] - a[1]);

    if (sortedScores.length === 0) {
        list.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding-top: 1rem; font-size: 0.9rem;">Henüz doğru tahmin yok.</div>';
        return;
    }

    sortedScores.forEach(([uname, score]) => {
        const item = document.createElement('div');
        item.className = 'leaderboard-item';

        const nameSpan = document.createElement('span');
        nameSpan.className = 'uname';
        nameSpan.textContent = uname;

        const scoreSpan = document.createElement('span');
        scoreSpan.className = 'score';
        scoreSpan.textContent = `${score}`;

        item.appendChild(nameSpan);
        item.appendChild(scoreSpan);
        list.appendChild(item);
    });
}
