class KatiplikLobby {
    constructor() {
        this.btnSolo = document.getElementById('btn-solo');
        this.btnHost = document.getElementById('btn-host');
        this.btnJoin = document.getElementById('btn-join');
        this.nameInput = document.getElementById('username-input');
        this.roomCodeInput = document.getElementById('room-code-input');

        this.bindEvents();
    }

    bindEvents() {
        if (this.nameInput) {
            this.nameInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    if (this.roomCodeInput && this.roomCodeInput.value.trim()) {
                        if (this.btnJoin) this.btnJoin.click();
                    } else {
                        if (this.btnHost) this.btnHost.click();
                    }
                }
            });

            this.nameInput.addEventListener('input', (e) => {
                const val = e.target.value.toLowerCase().trim();
                if (val === 'paira' || val === 'pai' || val === 'paiko') {
                    this.showToast('canım ablam 💜', 'info');
                }
            });
        }

        if (this.roomCodeInput) {
            this.roomCodeInput.addEventListener('keypress', (e) => {
                if(e.key === 'Enter') {
                    if (this.btnJoin) this.btnJoin.click();
                }
            });
        }

        if (this.btnSolo) {
            this.btnSolo.addEventListener('click', () => this.handleLogin('solo'));
        }
        if (this.btnHost) {
            this.btnHost.addEventListener('click', () => this.handleLogin('host'));
        }
        if (this.btnJoin) {
            this.btnJoin.addEventListener('click', () => this.handleLogin('join'));
        }
    }

    handleLogin(mode) {
        const nameVal = this.nameInput ? this.nameInput.value.trim() : '';
        if (!nameVal) {
            this.showToast("Lütfen bir ad girin", "error");
            return;
        }

        if (mode === 'solo') {
            sessionStorage.setItem('playerName', nameVal);
            sessionStorage.setItem('isSolo', 'true');
            sessionStorage.setItem('isHost', 'true');
            sessionStorage.removeItem('roomCode');
        } else if (mode === 'host') {
            sessionStorage.setItem('playerName', nameVal);
            sessionStorage.setItem('isSolo', 'false');
            sessionStorage.setItem('isHost', 'true');
            sessionStorage.removeItem('roomCode');
        } else if (mode === 'join') {
            const codeVal = this.roomCodeInput ? this.roomCodeInput.value.trim().toUpperCase() : '';
            if (!codeVal) {
                this.showToast("Oda kodu gerekli", "error");
                return;
            }
            sessionStorage.setItem('playerName', nameVal);
            sessionStorage.setItem('isSolo', 'false');
            sessionStorage.setItem('isHost', 'false');
            sessionStorage.setItem('roomCode', codeVal);
        }

        window.location.href = 'game.html';
    }

    showToast(msg, type = "info") {
        let container = document.getElementById('toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toast-container';
            container.className = 'toast-container';
            document.body.appendChild(container);
        }
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;

        const colors = {
            error: 'var(--danger)',
            success: 'var(--success)',
            warning: 'var(--warning)',
            info: 'var(--primary-purple)'
        };
        toast.style.borderLeftColor = colors[type] || colors.info;
        toast.textContent = msg;

        container.appendChild(toast);
        setTimeout(() => toast.remove(), 4000);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('btn-host')) {
        new KatiplikLobby();
    }
});