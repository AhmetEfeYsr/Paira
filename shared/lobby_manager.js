/**
 * SharedLobbyUI - Centralizes standard Paira Games lobby elements.
 * Manages Room Code toggling, copying, and Player List rendering.
 */
class SharedLobbyUI {
    /**
     * @param {Object} options
     * @param {string} [options.roomCode] - Initial room code to display.
     * @param {boolean} [options.isHost] - If true, enables kick buttons.
     * @param {function(string)} [options.onKickPlayer] - Callback when kick is pressed.
     * @param {function(string)} [options.onRoomStart] - Callback for when start game button is pressed.
     */
    constructor(options = {}) {
        this.roomCode = options.roomCode || '';
        this.isHost = options.isHost || false;
        this.onKickPlayer = options.onKickPlayer || null;
        this.onRoomStart = options.onRoomStart || null;

        this.isCodeVisible = false;

        this.elements = {
            displayRoomCode: document.getElementById('display-room-code'),
            btnToggleCode: document.getElementById('btn-toggle-code'),
            btnCopyRoom: document.getElementById('btn-copy-room'),
            playersList: document.getElementById('players-list'),
            playerCount: document.getElementById('player-count'),
            iconEyeOpen: document.getElementById('icon-eye-open'),
            iconEyeClosed: document.getElementById('icon-eye-closed'),
            btnStartGame: document.getElementById('btn-start-game')
        };

        this._bindEvents();
        this._updateRoomCodeDisplay();
    }

    _bindEvents() {
        if (this.elements.btnToggleCode) {
            this.elements.btnToggleCode.addEventListener('click', () => {
                this.isCodeVisible = !this.isCodeVisible;
                this._updateRoomCodeDisplay();
            });
        }

        if (this.elements.btnCopyRoom) {
            this.elements.btnCopyRoom.addEventListener('click', () => {
                if (this.roomCode) {
                    navigator.clipboard.writeText(this.roomCode).then(() => {
                        if (window.showToast) window.showToast('Oda kodu kopyalandı!', 'success');
                    }).catch(() => console.error('Kopyalama başarısız'));
                }
            });
        }

        if (this.elements.btnStartGame && this.onRoomStart) {
            // Unbind any previous event handlers in the game script
            const newBtn = this.elements.btnStartGame.cloneNode(true);
            this.elements.btnStartGame.replaceWith(newBtn);
            this.elements.btnStartGame = newBtn;
            this.elements.btnStartGame.addEventListener('click', () => this.onRoomStart());
        }
    }

    _updateRoomCodeDisplay() {
        if (this.elements.displayRoomCode) {
            this.elements.displayRoomCode.textContent = this.isCodeVisible ? this.roomCode : '••••••••';
            this.elements.displayRoomCode.dataset.code = this.roomCode;
        }

        if (this.elements.iconEyeOpen && this.elements.iconEyeClosed) {
            if (this.isCodeVisible) {
                this.elements.iconEyeOpen.classList.remove('hidden');
                this.elements.iconEyeClosed.classList.add('hidden');
            } else {
                this.elements.iconEyeOpen.classList.add('hidden');
                this.elements.iconEyeClosed.classList.remove('hidden');
            }
        } else if (this.elements.btnToggleCode && !this.elements.iconEyeOpen) {
            // Fallback for simple emoji buttons
            this.elements.btnToggleCode.innerText = this.isCodeVisible ? '🙈' : '👁️';
        }
    }

    /**
     * Updates the room code displayed.
     */
    setRoomCode(code) {
        this.roomCode = code;
        this._updateRoomCodeDisplay();
    }

    /**
     * Renders the player list in the UI.
     * @param {Object} players - Players object mapped by ID { id: { name, ... } }
     * @param {string} myId - The local player's ID
     * @param {function(Object): string} [customFormatter] - Optional HTML formatter for specific games (e.g. for showing teams)
     */
    renderPlayers(players, myId, customFormatter = null) {
        if (!this.elements.playersList) return;
        
        this.elements.playersList.innerHTML = '';
        const playerIds = Object.keys(players);

        if (this.elements.playerCount) {
            this.elements.playerCount.innerText = playerIds.length;
        }

        // Auto-disable start button if less than 2 players
        if (this.elements.btnStartGame) {
            if (playerIds.length >= 2) this.elements.btnStartGame.classList.remove('disabled');
            else this.elements.btnStartGame.classList.add('disabled');
        }

        playerIds.forEach(id => {
            const p = players[id];
            const li = document.createElement('li');
            li.style.display = 'flex';
            li.style.justifyContent = 'space-between';
            li.style.alignItems = 'center';

            const safeName = p.name ? p.name.replace(/</g, "<").replace(/>/g, ">") : 'Bilinmeyen';
            
            const infoSpan = document.createElement('span');
            if (customFormatter) {
                infoSpan.innerHTML = customFormatter(p, id === myId);
            } else {
                infoSpan.innerHTML = `<span>${p.isHost ? '👑 ' : ''}${safeName} ${id === myId ? '(Sen)' : ''}</span>`;
            }
            li.appendChild(infoSpan);

            // Add Kick Button for Host (but not for themselves)
            if (this.isHost && id !== myId && this.onKickPlayer) {
                const kickBtn = document.createElement('button');
                kickBtn.className = 'btn btn-danger btn-icon';
                kickBtn.style.padding = '4px 8px';
                kickBtn.style.marginLeft = '8px';
                kickBtn.title = "Oyuncuyu At";
                kickBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
                kickBtn.onclick = () => this.onKickPlayer(id);
                li.appendChild(kickBtn);
            }

            this.elements.playersList.appendChild(li);
        });
    }
}

window.SharedLobbyUI = SharedLobbyUI;
