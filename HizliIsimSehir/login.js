document.addEventListener('DOMContentLoaded', () => {
    const btnHost = document.getElementById('btn-host');
    const btnJoin = document.getElementById('btn-join');

    const handleLogin = (isHosting) => {
        if (window.PairaAudio) window.PairaAudio.init();
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

        // Check Easter Egg
        const lowerName = nameInput.toLowerCase();
        if (lowerName === 'paira' || lowerName === 'pai' || lowerName === 'paiko') {
            showToast('canım ablam 💜', 'success');
        }

        // Store info in sessionStorage to use in app.js
        sessionStorage.setItem('username', nameInput);
        sessionStorage.setItem('isHost', isHosting);
        if (!isHosting) {
            sessionStorage.setItem('roomCode', roomCodeInput);
        } else {
            // Generate room code here, as app.js expects it to exist if hosting
            sessionStorage.setItem('roomCode', generateRoomCode());
        }

        // Delay slightly if easter egg triggered, otherwise immediate
        const delay = (lowerName === 'paira' || lowerName === 'pai' || lowerName === 'paiko') ? 1000 : 0;

        setTimeout(() => {
            window.location.href = 'game.html';
        }, delay);
    };

    if (btnHost) btnHost.addEventListener('click', () => handleLogin(true));
    if (btnJoin) btnJoin.addEventListener('click', () => handleLogin(false));
});

function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    const array = new Uint32Array(6);
    window.crypto.getRandomValues(array);
    for (let i = 0; i < 6; i++) {
        code += chars[array[i] % chars.length];
    }
    return code;
}

