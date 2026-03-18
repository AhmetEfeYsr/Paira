// index.js - Handles landing page logic and redirection for KelimeAvi

document.addEventListener('DOMContentLoaded', () => {
    const btnHost = document.getElementById('btn-host');
    const btnJoin = document.getElementById('btn-join');
    const nameInputEl = document.getElementById('username-input');
    const roomCodeInputEl = document.getElementById('room-code-input');

    const handleLogin = (isHosting) => {
        const nameInput = nameInputEl.value.trim();
        if (!nameInput) {
            window.showToast("Lütfen bir ad girin", "error");
            return;
        }

        const roomCodeInput = roomCodeInputEl.value.trim().toUpperCase();
        if (!isHosting && !roomCodeInput) {
            window.showToast("Oda kodu gerekli", "error");
            return;
        }

        // Store info in sessionStorage to use in game.html
        sessionStorage.setItem('playerName', nameInput);
        sessionStorage.setItem('isHost', isHosting);
        if (!isHosting) {
            sessionStorage.setItem('roomCode', roomCodeInput);
        }

        // Redirect to game.html
        window.location.href = 'game.html';
    };

    if (btnHost) btnHost.addEventListener('click', () => handleLogin(true));
    if (btnJoin) btnJoin.addEventListener('click', () => handleLogin(false));
    
    if (nameInputEl) {
        nameInputEl.addEventListener('keypress', (e) => {
            if(e.key === 'Enter') handleLogin(true);
        });
    }
    
    if (roomCodeInputEl) {
        roomCodeInputEl.addEventListener('keypress', (e) => {
            if(e.key === 'Enter') handleLogin(false);
        });
    }
});
