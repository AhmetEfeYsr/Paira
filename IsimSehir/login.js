document.addEventListener('DOMContentLoaded', () => {
    const usernameInput = document.getElementById('username-input');
    const roomInput = document.getElementById('room-input');
    const hostBtn = document.getElementById('host-btn');
    const joinBtn = document.getElementById('join-btn');

    // Load saved username
    const savedName = localStorage.getItem('isimsehir_username');
    if (savedName) usernameInput.value = savedName;

    function checkEasterEgg(name) {
        const lowerName = name.toLowerCase().trim();
        if (lowerName === 'paira' || lowerName === 'pai' || lowerName === 'paiko') {
            showToast('canım ablam 💜');
        }
    }

    function showToast(message) {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = message;
        container.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }

    function generateRoomCode() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let code = '';
        for (let i = 0; i < 6; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return code;
    }

    function proceedToGame(isHost, roomCode) {
        let username = usernameInput.value.trim();
        if (!username) {
            username = "Misafir_" + Math.floor(Math.random() * 1000);
        }

        localStorage.setItem('isimsehir_username', username);
        checkEasterEgg(username);

        // Store session data for game.html
        sessionStorage.setItem('isHost', isHost);
        sessionStorage.setItem('roomCode', roomCode);
        sessionStorage.setItem('username', username);

        // Redirect with a tiny delay if easter egg triggered, otherwise immediate
        const delay = (username.toLowerCase().trim() === 'paira' || username.toLowerCase().trim() === 'pai' || username.toLowerCase().trim() === 'paiko') ? 1000 : 0;

        setTimeout(() => {
            window.location.href = 'game.html';
        }, delay);
    }

    hostBtn.addEventListener('click', () => {
        const roomCode = generateRoomCode();
        proceedToGame(true, roomCode);
    });

    joinBtn.addEventListener('click', () => {
        const roomCode = roomInput.value.trim().toUpperCase();
        if (!roomCode) {
            alert("Lütfen bir oda kodu girin.");
            return;
        }
        proceedToGame(false, roomCode);
    });

    // Auto-uppercase room code input
    roomInput.addEventListener('input', (e) => {
        e.target.value = e.target.value.toUpperCase();
    });
});
