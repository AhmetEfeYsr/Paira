// CizBil/game.js

import { networkState, broadcastAction, isHost, myId } from './network.js';

let drawingBoard;

let timerInterval;

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

export const isMatch = (guess, target) => {
    const nGuess = normalizeTurkish(guess);
    const nTarget = normalizeTurkish(target);

    if (nGuess === nTarget) return true;

    if (nTarget.length > 4) {
        const distance = levenshtein(nGuess, nTarget);
        if (distance <= 1) return true;
    }
    return false;
};

export function initGameUI() {
    const canvasElement = document.getElementById('drawing-board');
    drawingBoard = new AdvancedDrawingBoard(canvasElement, {
        defaultColor: '#000000',
        defaultSize: 8,
        onDrawEvent: (eventData) => {
            if (networkState.currentDrawer === myId) {
                // Stream drawing events in real-time
                broadcastAction({ type: 'DRAW_EVENT', data: eventData });
            }
        }
    });

    // To prevent non-drawers from interacting visually
    document.getElementById('canvas-overlay').addEventListener('mousedown', (e) => {
        if (networkState.currentDrawer !== myId) e.stopPropagation();
    }, true);
    document.getElementById('canvas-overlay').addEventListener('touchstart', (e) => {
        if (networkState.currentDrawer !== myId) e.stopPropagation();
    }, {passive: false, capture: true});

    // Tools
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
            else drawingBoard.setTool('brush'); // default fallback if a tool was active
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
        if(networkState.currentDrawer === myId) {
            drawingBoard.clear(true);
        }
    });

    const btnUndo = document.getElementById('btn-undo');
    if (btnUndo) {
        bindInteraction(btnUndo, () => {
            if(networkState.currentDrawer === myId) drawingBoard.undo(true);
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

    // Chat
    document.getElementById('btn-send-chat').addEventListener('click', sendGuess);
    document.getElementById('chat-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendGuess();
    });

    // Word choice listeners
    document.getElementById('btn-choice-1').addEventListener('click', (e) => {
        broadcastAction({ type: 'CHOOSE_WORD', word: e.target.textContent });
    });
    document.getElementById('btn-choice-2').addEventListener('click', (e) => {
        broadcastAction({ type: 'CHOOSE_WORD', word: e.target.textContent });
    });
}

// Global exported sync function used by network.js to replay events
export function syncCanvasEvent(data) {
    if(drawingBoard) drawingBoard.replayEvent(data);
}

export function clearCanvas() {
    if(drawingBoard) drawingBoard.clear(false);
}

export function showToast(msg, type = "info") {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const colors = { error: 'var(--danger)', success: 'var(--success)', warning: 'var(--warning)', info: 'var(--primary-purple)' };
    toast.style.borderLeftColor = colors[type] || colors.info;
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
}

export function updateGameStateUI(choices = null) {
    document.getElementById('current-drawer').textContent = networkState.players[networkState.currentDrawer]?.name || '...';

    // Update Scoreboard
    const list = document.getElementById('game-scores-list');
    list.innerHTML = '';
    const sorted = Object.values(networkState.players).sort((a,b) => b.score - a.score);
    sorted.forEach(p => {
        const li = document.createElement('li');
        li.style.display = 'flex';
        li.style.justifyContent = 'space-between';
        li.style.padding = '5px 0';
        li.innerHTML = `<span>${p.name}</span> <strong style="color:var(--primary);">${p.score}</strong>`;
        list.appendChild(li);
    });

    if (networkState.currentDrawer === myId) {
        document.getElementById('toolbar').style.display = 'flex';
        document.getElementById('canvas-overlay').style.display = 'none';

        if (choices) {
            document.getElementById('word-choice-overlay').style.display = 'flex';
            document.getElementById('btn-choice-1').textContent = choices[0];
            document.getElementById('btn-choice-2').textContent = choices[1];
            document.getElementById('main-word').textContent = "KELİME SEÇİLİYOR...";
        } else {
            document.getElementById('word-choice-overlay').style.display = 'none';
            document.getElementById('main-word').textContent = networkState.currentWord;
        }
    } else {
        document.getElementById('toolbar').style.display = 'none';
        document.getElementById('canvas-overlay').style.display = 'block';
        document.getElementById('word-choice-overlay').style.display = 'none';

        if (choices) {
            document.getElementById('main-word').textContent = "KELİME SEÇİLİYOR...";
        } else {
                        document.getElementById('main-word').textContent = networkState.currentWord ? networkState.currentWord.replace(/[^\s]/g, '_ ') : '...';

export function startTimer(duration) {
    clearInterval(timerInterval);
    let timeLeft = duration;

    const display = document.getElementById('timer-display');
    display.textContent = timeLeft;

    timerInterval = setInterval(() => {
        timeLeft--;
        if(timeLeft >= 0) {
            display.textContent = timeLeft;
        } else {
            clearInterval(timerInterval);
            if(isHost) {
                // Time up logic handled in host network.js via Timeout or event
            }
        }
    }, 1000);
}

export function stopTimer() {
    clearInterval(timerInterval);
}

function sendGuess() {
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    if(!text || networkState.currentDrawer === myId) return;

    input.value = '';

    broadcastAction({ type: 'GUESS', text: text });
}

export function addChatMessage(name, text, isCorrect) {
    const container = document.getElementById('messages-container');
    const msg = document.createElement('div');
    msg.className = 'chat-msg' + (isCorrect ? ' correct' : '');

    if (isCorrect) {
        msg.innerHTML = `<strong style="color:var(--success)">${name}</strong> doğru bildi! 🎉`;
    } else {
        msg.innerHTML = `<strong>${name}:</strong> <span>${text}</span>`;
    }

    container.appendChild(msg);
    container.scrollTop = container.scrollHeight;
}
