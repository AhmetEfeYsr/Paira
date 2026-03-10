// GarticPhone/game.js

import { networkState, broadcastAction, isHost, myId } from './network.js';

let drawingBoard;
let timerInterval;
let currentStoryIdx = 0; // Host uses this to iterate albums
let currentStepIdx = 0;

export function initGameUI() {
    // Only init board once
    if (!drawingBoard) {
        const canvasElement = document.getElementById('drawing-board');
        drawingBoard = new window.AdvancedDrawingBoard(canvasElement, {
            defaultColor: '#000000',
            defaultSize: 8,
            readOnly: false // Players must draw
        });

        // Tools Setup
        document.querySelectorAll('.color-swatch').forEach(swatch => {
            swatch.addEventListener('click', (e) => {
                document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
                e.target.classList.add('active');
                drawingBoard.setColor(e.target.dataset.color);
                if (e.target.dataset.color === '#ffffff') drawingBoard.setTool('eraser');
                else drawingBoard.setTool('brush');
            });
        });

        document.querySelectorAll('.size-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.size-btn').forEach(b => b.classList.remove('active'));
                const target = e.target.closest('.size-btn');
                target.classList.add('active');
                drawingBoard.setSize(parseInt(target.dataset.size));
            });
        });

        document.getElementById('btn-clear').addEventListener('click', () => {
            drawingBoard.clear(false);
        });

        // Submit logic
        document.getElementById('btn-submit-prompt').addEventListener('click', submitPrompt);
        document.getElementById('prompt-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') submitPrompt();
        });

        document.getElementById('btn-submit-drawing').addEventListener('click', submitDrawing);
    }
}

export function updateGameStateUI() {
    const state = networkState.state;
    const isCompleted = networkState.completedTasks[myId];

    document.getElementById('prompt-container').style.display = 'none';
    document.getElementById('draw-container').style.display = 'none';
    document.getElementById('wait-container').style.display = 'none';

    if (isCompleted) {
        document.getElementById('wait-container').style.display = 'flex';
        return;
    }

    const assignedBookOwner = networkState.assignments[myId];
    const storyHistory = networkState.stories[assignedBookOwner];
    const lastEntry = storyHistory.length > 0 ? storyHistory[storyHistory.length - 1] : null;

    if (state === 'WRITE') {
        document.getElementById('prompt-container').style.display = 'flex';
        document.getElementById('task-title').textContent = 'Ne Çizildiğini Tahmin Et / Yaz!';
        document.getElementById('prompt-input').value = '';

        if (lastEntry && lastEntry.type === 'draw') {
            document.getElementById('previous-drawing-container').style.display = 'block';
            document.getElementById('previous-drawing').src = lastEntry.content;
            document.getElementById('prompt-instruction').textContent = "Bu çizim sence ne?";
        } else {
            document.getElementById('previous-drawing-container').style.display = 'none';
            document.getElementById('prompt-instruction').textContent = "Çizilmesi için uçuk bir fikir yaz!";
        }

    } else if (state === 'DRAW') {
        document.getElementById('draw-container').style.display = 'flex';
        document.getElementById('task-title').textContent = 'Aşağıdakini Çiz!';
        drawingBoard.clear(false);

        if (lastEntry && lastEntry.type === 'text') {
            document.getElementById('word-to-draw').textContent = lastEntry.content;
        } else {
            document.getElementById('word-to-draw').textContent = "SERBEST ÇİZİM!"; // Fallback
        }
    }
}

function submitPrompt() {
    const input = document.getElementById('prompt-input');
    const text = input.value.trim();
    if(!text) return showToast("Bir şeyler yazmalısın!", "warning");

    // Disable inputs and show wait
    document.getElementById('prompt-container').style.display = 'none';
    document.getElementById('wait-container').style.display = 'flex';

    broadcastAction({ type: 'SUBMIT_TASK', taskType: 'text', content: text });
}

function submitDrawing() {
    const dataURL = drawingBoard.getDataURL();

    document.getElementById('draw-container').style.display = 'none';
    document.getElementById('wait-container').style.display = 'flex';

    broadcastAction({ type: 'SUBMIT_TASK', taskType: 'draw', content: dataURL });
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
            if (timeLeft <= 10) display.style.color = "var(--danger)";
            else display.style.color = "var(--warning)";
        } else {
            clearInterval(timerInterval);
            // Time is up, auto submit
            if (!networkState.completedTasks[myId]) {
                if (networkState.state === 'WRITE') submitPromptFallback();
                else if (networkState.state === 'DRAW') submitDrawingFallback();
            }
        }
    }, 1000);
}

function submitPromptFallback() {
    const input = document.getElementById('prompt-input');
    const text = input.value.trim() || "... (Zamanında yazılamadı)";
    broadcastAction({ type: 'SUBMIT_TASK', taskType: 'text', content: text });
}

function submitDrawingFallback() {
    const dataURL = drawingBoard.getDataURL();
    broadcastAction({ type: 'SUBMIT_TASK', taskType: 'draw', content: dataURL });
}

export function stopTimer() {
    clearInterval(timerInterval);
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

// ALBUM LOGIC (End of Game)

window.initAlbumUI = function() {
    document.getElementById('album-screen').classList.remove('hidden');
    document.getElementById('album-screen').classList.add('active');

    if (isHost) {
        document.getElementById('btn-next-story').style.display = 'inline-block';
        document.getElementById('btn-next-story').addEventListener('click', () => {
            broadcastAction({ type: 'ALBUM_NEXT' });
        });

        document.getElementById('btn-back-to-lobby').addEventListener('click', () => {
            window.location.href = 'index.html'; // Or reset state
        });
    }

    // Initial render setup
    currentStoryIdx = 0;
    currentStepIdx = 0;
    renderAlbumStep(true);
};

export function showAlbumStep() {
    const owners = Object.keys(networkState.stories);
    if (currentStoryIdx >= owners.length) return;

    const ownerId = owners[currentStoryIdx];
    const story = networkState.stories[ownerId];

    currentStepIdx++;

    if (currentStepIdx >= story.length) {
        currentStoryIdx++;
        currentStepIdx = 0;

        if (currentStoryIdx >= owners.length) {
            document.getElementById('btn-next-story').style.display = 'none';
            document.getElementById('btn-back-to-lobby').style.display = 'inline-block';
            showToast("Bütün hikayeler bitti!", "success");
            return;
        }
        renderAlbumStep(true); // new book, clear container
        return;
    }

    renderAlbumStep(false); // just append the next step
}

function renderAlbumStep(isNewBook) {
    const container = document.getElementById('album-container');
    const owners = Object.keys(networkState.stories);

    if (currentStoryIdx >= owners.length) return;

    const ownerId = owners[currentStoryIdx];
    const story = networkState.stories[ownerId];
    const step = story[currentStepIdx];

    if (isNewBook) {
        container.innerHTML = `<h2 style="color:var(--neon-purple); border-bottom:1px solid rgba(255,255,255,0.2); padding-bottom:10px; width:100%; text-align:center; font-size:2rem; margin-top:20px;">${networkState.players[ownerId].name}'in Başlattığı Hikaye</h2>`;
    }

    if (!step) return;

    const authorName = networkState.players[step.authorId]?.name || "Bilinmeyen";
    const entryDiv = document.createElement('div');
    entryDiv.className = 'card';
    entryDiv.style.width = '100%';
    entryDiv.style.maxWidth = '600px';
    entryDiv.style.padding = '15px';
    entryDiv.style.background = 'rgba(0,0,0,0.5)';
    entryDiv.style.animation = 'fadeInUp 0.5s ease-out';

    const authorTag = document.createElement('div');
    authorTag.style.fontWeight = 'bold';
    authorTag.style.color = 'var(--text-muted)';
    authorTag.style.marginBottom = '10px';
    authorTag.textContent = `${authorName} ${step.type === 'text' ? 'yazdı:' : 'çizdi:'}`;
    entryDiv.appendChild(authorTag);

    if (step.type === 'text') {
        const textContent = document.createElement('div');
        textContent.style.fontSize = '1.5rem';
        textContent.style.color = 'var(--text-main)';
        textContent.style.textAlign = 'center';
        textContent.textContent = step.content;
        entryDiv.appendChild(textContent);
    } else if (step.type === 'draw') {
        const img = document.createElement('img');
        img.src = step.content;
        img.style.width = '100%';
        img.style.borderRadius = '8px';
        img.style.background = 'white';
        entryDiv.appendChild(img);
    }

    container.appendChild(entryDiv);
    container.scrollTop = container.scrollHeight;
}

// Ensure the UI shows the right state from network events globally
window.updateGameStateUI = updateGameStateUI;
