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

export const isMatch = (guess, target) => {
    const nGuess = normalizeTurkish(guess);
    const nTarget = normalizeTurkish(target);

    if (nGuess === nTarget) return true;

    if (nTarget.length > 4 && Math.abs(nGuess.length - nTarget.length) <= 1) {
       let diff = 0;
       for (let i = 0; i < Math.max(nGuess.length, nTarget.length); i++) {
           if (nGuess[i] !== nTarget[i]) diff++;
       }
       if (diff <= 1) return true;
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

    // Chat
    document.getElementById('btn-send-chat').addEventListener('click', sendGuess);
    document.getElementById('chat-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendGuess();
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

export function updateGameStateUI() {
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
        document.getElementById('main-word').textContent = networkState.currentWord;
    } else {
        document.getElementById('toolbar').style.display = 'none';
        document.getElementById('canvas-overlay').style.display = 'block';
        document.getElementById('main-word').textContent = networkState.currentWord.replace(/[A-ZĞÜŞİÖÇ]/g, '_ ');
    }
}

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
