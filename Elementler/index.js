// index.js - Handles landing page logic and redirection for Elementler

document.addEventListener('DOMContentLoaded', () => {
    const btnHost = document.getElementById('btn-host');
    const btnJoin = document.getElementById('btn-join');

    const handleLogin = (isHosting) => {
        const nameInput = document.getElementById('username-input').value.trim();
        if (!nameInput) {
            showToast("Lütfen bir ad girin", "error");
            return;
        }

        const roomCodeInput = document.getElementById('room-code-input').value.trim().toUpperCase();
        if (!isHosting && !roomCodeInput) {
            showToast("Oda kodu gerekli", "error");
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
});

function showToast(msg, type = "info") {
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