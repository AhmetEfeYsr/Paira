// index.js - Giriş Ekranı ve Kurucu/Katılımcı Yönlendirmeleri

document.addEventListener('DOMContentLoaded', () => {
    // SessionStorage'ı temizle
    sessionStorage.removeItem('playerName');
    sessionStorage.removeItem('isHost');
    sessionStorage.removeItem('roomCode');

    const usernameInput = document.getElementById('username-input');
    const roomCodeInput = document.getElementById('room-code-input');
    const btnHost = document.getElementById('btn-host');
    const btnJoin = document.getElementById('btn-join');

    // Enter tuşu desteği
    usernameInput.addEventListener('keypress', (e) => {
        if(e.key === 'Enter') btnHost.click();
    });
    roomCodeInput.addEventListener('keypress', (e) => {
        if(e.key === 'Enter') btnJoin.click();
    });

    // Paira Easter Egg
    usernameInput.addEventListener('input', (e) => {
        const val = e.target.value.toLowerCase().trim();
        if (val === 'paira' || val === 'pai' || val === 'paiko') {
            showToast('canım ablam 💜', 'info');
        }
    });

    btnHost.addEventListener('click', () => {
        const name = usernameInput.value.trim();
        if (!name) { showToast('Lütfen bir oyuncu adı girin!', 'error'); return; }
        if (name.length > 25) { showToast('Oyuncu adı çok uzun!', 'error'); return; }

        sessionStorage.setItem('playerName', name);
        sessionStorage.setItem('isHost', 'true');
        window.location.href = 'game.html';
    });

    btnJoin.addEventListener('click', () => {
        const name = usernameInput.value.trim();
        const code = roomCodeInput.value.trim().toUpperCase();

        if (!name) { showToast('Lütfen bir oyuncu adı girin!', 'error'); return; }
        if (name.length > 25) { showToast('Oyuncu adı çok uzun!', 'error'); return; }
        if (!code) { showToast('Lütfen katılmak için bir oda kodu girin!', 'error'); return; }

        sessionStorage.setItem('playerName', name);
        sessionStorage.setItem('isHost', 'false');
        sessionStorage.setItem('roomCode', code);
        window.location.href = 'game.html';
    });
});

// Yardımcı UI Fonksiyonları
function showToast(msg, type = "info") {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const colors = { error: 'var(--danger)', success: 'var(--success)', warning: 'var(--warning)', info: 'var(--primary-purple)' };
    toast.style.borderLeftColor = colors[type] || colors.info;
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
}
