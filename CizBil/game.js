// CizBil/game.js

import { networkState, broadcastAction, isHost, myId } from './network.js';

let canvas, ctx;
let isDrawing = false;
let currentColor = '#000000';
let currentSize = 8;
let lastX = 0, lastY = 0;

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
    canvas = document.getElementById('drawing-board');
    ctx = canvas.getContext('2d');

    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    // Tools
    document.querySelectorAll('.color-swatch').forEach(swatch => {
        swatch.addEventListener('click', (e) => {
            document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
            e.target.classList.add('active');
            currentColor = e.target.dataset.color;
        });
    });

    document.querySelectorAll('.size-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.size-btn').forEach(b => b.classList.remove('active'));
            const target = e.target.closest('.size-btn');
            target.classList.add('active');
            currentSize = parseInt(target.dataset.size);
        });
    });

    document.getElementById('btn-clear').addEventListener('click', () => {
        if(networkState.currentDrawer === myId) {
            clearCanvas();
            broadcastAction({ type: 'DRAW_CLEAR' });
        }
    });

    // Drawing Events
    const startDrawing = (e) => {
        if (networkState.currentDrawer !== myId) return;
        isDrawing = true;
        const pos = getPos(e);
        lastX = pos.x;
        lastY = pos.y;

        broadcastAction({ type: 'DRAW_START', pos: {x: lastX, y: lastY}, color: currentColor, size: currentSize });
        drawLocal(lastX, lastY, lastX, lastY, currentColor, currentSize);
    };

    const draw = (e) => {
        if (!isDrawing || networkState.currentDrawer !== myId) return;
        e.preventDefault();
        const pos = getPos(e);

        broadcastAction({ type: 'DRAW_MOVE', pos: {x: pos.x, y: pos.y}, lastPos: {x: lastX, y: lastY}, color: currentColor, size: currentSize });
        drawLocal(lastX, lastY, pos.x, pos.y, currentColor, currentSize);

        lastX = pos.x;
        lastY = pos.y;
    };

    const stopDrawing = () => {
        if (networkState.currentDrawer !== myId) return;
        isDrawing = false;
        ctx.beginPath();
        broadcastAction({ type: 'DRAW_END' });
    };

    canvas.addEventListener('mousedown', startDrawing);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', stopDrawing);
    canvas.addEventListener('mouseout', stopDrawing);

    canvas.addEventListener('touchstart', startDrawing, {passive: false});
    canvas.addEventListener('touchmove', draw, {passive: false});
    canvas.addEventListener('touchend', stopDrawing);

    // Chat
    document.getElementById('btn-send-chat').addEventListener('click', sendGuess);
    document.getElementById('chat-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendGuess();
    });
}

function resizeCanvas() {
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.width * (9/16);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function getPos(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    if (e.touches && e.touches.length > 0) {
        return {
            x: (e.touches[0].clientX - rect.left) * scaleX,
            y: (e.touches[0].clientY - rect.top) * scaleY
        };
    }
    return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY
    };
}

export function drawLocal(lx, ly, x, y, color, size) {
    ctx.beginPath();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = color;
    ctx.lineWidth = size;
    ctx.moveTo(lx, ly);
    ctx.lineTo(x, y);
    ctx.stroke();
}

export function clearCanvas() {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
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
