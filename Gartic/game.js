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
const canvas = document.getElementById('drawing-board');
const ctx = canvas.getContext('2d');
let isDrawing = false;
let currentColor = '#000000';
let currentSize = 8;
let lastX = 0;
let lastY = 0;

// Set up Canvas internal scale for high DPI and CSS scaling
function resizeCanvas() {
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.width * (9/16); // 16:9 aspect ratio

    // Fill white
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
}

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
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    // Touch & Mouse Events
    const startDrawing = (e) => {
        isDrawing = true;
        const pos = getPos(e);
        lastX = pos.x;
        lastY = pos.y;
        draw(e);
    };

    const draw = (e) => {
        if (!isDrawing) return;
        e.preventDefault();
        const pos = getPos(e);

        ctx.beginPath();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = currentColor;
        ctx.lineWidth = currentSize;
        ctx.moveTo(lastX, lastY);
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();

        lastX = pos.x;
        lastY = pos.y;
    };

    const stopDrawing = () => {
        isDrawing = false;
        ctx.beginPath();
    };

    const getPos = (e) => {
        const rect = canvas.getBoundingClientRect();
        // Calculate scale because CSS width != internal canvas width
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
    };

    canvas.addEventListener('mousedown', startDrawing);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', stopDrawing);
    canvas.addEventListener('mouseout', stopDrawing);

    canvas.addEventListener('touchstart', startDrawing, {passive: false});
    canvas.addEventListener('touchmove', draw, {passive: false});
    canvas.addEventListener('touchend', stopDrawing);

    // Toolbar logic
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
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    });
}

function initGame() {
    const channel = sessionStorage.getItem('cizbil_channel');
    const platform = sessionStorage.getItem('cizbil_platform');

    if (!channel || !platform) {
        window.location.href = 'index.html';
        return;
    }

    document.getElementById('channel-name-display').textContent = `${platform.toUpperCase()} / ${channel}`;

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
    document.getElementById('btn-skip').addEventListener('click', nextWord);
    document.getElementById('btn-next').addEventListener('click', nextWord);
    document.getElementById('btn-leave').addEventListener('click', () => {
        chatListener.stop();
        window.location.href = 'index.html';
    });

    nextWord();
}

function nextWord() {
    currentWordIndex = (currentWordIndex + 1) % wordDatabase.length;
    currentWord = wordDatabase[currentWordIndex];

    document.getElementById('main-word').textContent = currentWord;

    // Clear canvas
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

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
