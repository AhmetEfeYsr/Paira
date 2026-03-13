document.addEventListener('DOMContentLoaded', () => {
    const btnHost = document.getElementById('btn-host');
    const btnJoin = document.getElementById('btn-join');
    const nameInput = document.getElementById('username-input');
    const codeInput = document.getElementById('room-code-input');

    // Load previously saved name
    const savedName = sessionStorage.getItem('playerName');
    if (savedName) {
        nameInput.value = savedName;
    }

    const showToast = (msg) => {
        let container = document.getElementById('toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toast-container';
            container.className = 'toast-container';
            document.body.appendChild(container);
        }
        const toast = document.createElement('div');
        toast.className = 'toast error';
        toast.style.borderLeftColor = 'var(--danger)';
        toast.textContent = msg;
        container.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    };

    const joinGame = (isHost) => {
        const pName = nameInput.value.trim();
        if (pName.length < 3) {
            showToast("İsim en az 3 karakter olmalıdır!");
            return;
        }

        sessionStorage.setItem('playerName', pName);
        sessionStorage.setItem('isHost', isHost ? 'true' : 'false');

        if (isHost) {
            sessionStorage.removeItem('roomCode'); // Generate new in game
        } else {
            const code = codeInput.value.trim().toUpperCase();
            if (code.length < 4) {
                showToast("Geçerli bir oda kodu giriniz!");
                return;
            }
            sessionStorage.setItem('roomCode', code);
        }

        window.location.href = 'game.html';
    };

    // Touch-optimized binds
    const bindInteraction = (el, callback) => {
        if(!el) return;
        const handler = (e) => {
            e.preventDefault();
            callback(e);
        };
        el.addEventListener('pointerdown', handler);
        el.addEventListener('click', handler);
    };

    bindInteraction(btnHost, () => joinGame(true));
    bindInteraction(btnJoin, () => joinGame(false));

    codeInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') joinGame(false);
    });

    nameInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            if (codeInput.value.trim()) joinGame(false);
            else joinGame(true);
        }
    });
});