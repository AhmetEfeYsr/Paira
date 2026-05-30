// ÇizimZinciri/game.js

import { broadcastAction, isHost } from './network.js';

let drawingBoard;
let timerInterval;

export function initGameUI(networkState, myId) {
    // Only init board once
    if (!drawingBoard) {
        const canvasElement = document.getElementById('drawing-board');
        drawingBoard = new window.AdvancedDrawingBoard(canvasElement, {
            defaultColor: '#000000',
            defaultSize: 8,
            readOnly: false // Players must draw
        });

        // Tools Setup
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
                } else {
                    drawingBoard.setTool('brush');
                    document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
                    document.querySelector('.tool-btn[data-tool="brush"]').classList.add('active');
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
                
                if (target.dataset.tool !== 'eraser') {
                    const activeSwatch = document.querySelector('.color-swatch.active');
                    if (activeSwatch && activeSwatch.dataset.color === '#ffffff') {
                        document.querySelector('.color-swatch[data-color="#000000"]').click();
                    }
                }
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

        // Submit logic
        document.getElementById('btn-submit-prompt').addEventListener('click', () => submitPrompt(window._networkState, window._myId));
        document.getElementById('prompt-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') submitPrompt(window._networkState, window._myId);
        });

        // Character counter for prompt input
        const promptInput = document.getElementById('prompt-input');
        const charCounter = document.getElementById('char-counter');
        if (promptInput && charCounter) {
            promptInput.addEventListener('input', () => {
                const len = promptInput.value.length;
                const max = promptInput.maxLength || 60;
                charCounter.textContent = `${len}/${max}`;
                charCounter.style.color = len >= max ? 'var(--danger)' : 'var(--text-muted)';
            });
        }

        document.getElementById('btn-submit-drawing').addEventListener('click', () => submitDrawing(window._networkState, window._myId));
    }
}

export function updateGameStateUI(networkState, myId) {
    window._networkState = networkState;
    window._myId = myId;
    
    if (!networkState || !networkState.state) return;
    
    const state = networkState.state;
    const isCompleted = networkState.completedTasks[myId];

    document.getElementById('prompt-container').style.display = 'none';
    document.getElementById('draw-container').style.display = 'none';
    document.getElementById('wait-container').style.display = 'none';

    if (isCompleted) {
        document.getElementById('wait-container').style.display = 'flex';
        return;
    }

    const assignedBookOwner = networkState.assignments ? networkState.assignments[myId] : null;
    const storyHistory = (assignedBookOwner && networkState.stories) ? (networkState.stories[assignedBookOwner] || []) : [];
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

function submitPrompt(networkState, myId) {
    const input = document.getElementById('prompt-input');
    const text = input.value.trim();
    if(!text) {
        if(window.showToast) window.showToast("Bir şeyler yazmalısın!", "warning");
        return;
    }

    // Disable inputs and show wait
    document.getElementById('prompt-container').style.display = 'none';
    document.getElementById('wait-container').style.display = 'flex';

    if (window.PairaAudio) window.PairaAudio.play('pass');

    broadcastAction({ type: 'SUBMIT_TASK', taskType: 'text', content: text, round: networkState.roundCount });
}

function submitDrawing(networkState, myId) {
    const dataURL = drawingBoard.getDataURL();

    document.getElementById('draw-container').style.display = 'none';
    document.getElementById('wait-container').style.display = 'flex';

    if (window.PairaAudio) window.PairaAudio.play('pass');

    broadcastAction({ type: 'SUBMIT_TASK', taskType: 'draw', content: dataURL, round: networkState.roundCount });
}

export function startTimer(duration, networkState, myId) {
    clearInterval(timerInterval);
    let timeLeft = duration;

    const display = document.getElementById('timer-display');
    display.textContent = timeLeft;

    timerInterval = setInterval(() => {
        timeLeft--;
        if(timeLeft >= 0) {
            display.textContent = timeLeft;
            if (timeLeft <= 10) {
                display.style.color = "var(--danger)";
                if (window.PairaAudio) window.PairaAudio.play('tick');
            }
            else display.style.color = "var(--warning)";
        } else {
            clearInterval(timerInterval);
            if (window.PairaAudio) window.PairaAudio.play('end');
            // Time is up, auto submit
            if (!networkState.completedTasks[myId]) {
                if (networkState.state === 'WRITE') submitPromptFallback(networkState, myId);
                else if (networkState.state === 'DRAW') submitDrawingFallback(networkState, myId);
            }
        }
    }, 1000);
}

function submitPromptFallback(networkState, myId) {
    const input = document.getElementById('prompt-input');
    let text = input.value.trim();
    if (!text) {
        if (window.cizbilWords && window.cizbilWords.length > 0) {
            text = window.cizbilWords[Math.floor(Math.random() * window.cizbilWords.length)];
        } else {
            text = "... (Zamanında yazılamadı)";
        }
    }
    broadcastAction({ type: 'SUBMIT_TASK', taskType: 'text', content: text, round: networkState.roundCount });
}

function submitDrawingFallback(networkState, myId) {
    const dataURL = drawingBoard.getDataURL();
    broadcastAction({ type: 'SUBMIT_TASK', taskType: 'draw', content: dataURL, round: networkState.roundCount });
}

export function stopTimer() {
    clearInterval(timerInterval);
}

// ALBUM LOGIC (End of Game)
export function renderAlbumState(networkState) {
    const container = document.getElementById('album-container');
    const seq = networkState.albumSequence;
    const idx = networkState.albumIndex;
    
    if (!seq || idx < 0 || idx >= seq.length) return;

    container.innerHTML = '';
    
    for (let i = 0; i <= idx; i++) {
        const item = seq[i];
        
        if (item.type === 'TITLE') {
            const title = document.createElement('h2');
            title.style.color = 'var(--neon-purple)';
            title.style.borderBottom = '1px solid var(--btn-secondary-border)';
            title.style.paddingBottom = '10px';
            title.style.width = '100%';
            title.style.textAlign = 'center';
            title.style.fontSize = '2rem';
            title.style.marginTop = '20px';
            title.textContent = `${networkState.players[item.ownerId]?.name || 'Bilinmeyen'}'in Başlattığı Hikaye`;
            container.appendChild(title);
        } else if (item.type === 'ENTRY') {
            const step = item.stepData;
            const authorName = networkState.players[step.authorId]?.name || "Bilinmeyen";
            
            const entryDiv = document.createElement('div');
            entryDiv.className = 'card pop-animation';
            entryDiv.style.width = '100%';
            entryDiv.style.maxWidth = '600px';
            entryDiv.style.padding = '15px';
            entryDiv.style.background = 'var(--item-bg)';
            entryDiv.style.margin = '0 auto';
            entryDiv.style.marginBottom = '15px';
            
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
                img.style.background = 'white'; // White is necessary for transparent drawn lines
                entryDiv.appendChild(img);
            }
            container.appendChild(entryDiv);
        } else if (item.type === 'END') {
            const endMsg = document.createElement('h2');
            endMsg.style.color = 'var(--success)';
            endMsg.style.textAlign = 'center';
            endMsg.style.marginTop = '30px';
            endMsg.textContent = 'Bütün hikayeler bitti!';
            container.appendChild(endMsg);
            
            if (isHost) {
                document.getElementById('btn-next-story').style.display = 'none';
                document.getElementById('btn-back-to-lobby').style.display = 'inline-block';
            }
        }
    }
    
    // Scroll to bottom
    container.scrollTop = container.scrollHeight;
}

// Ensure the UI shows the right state from network events globally
window.updateGameStateUI = (state, id) => updateGameStateUI(state || window._networkState, id || window._myId);
