document.addEventListener('DOMContentLoaded', () => {
    // SessionStorage'ı temizle - Temizleme işlemini daha garantiye almak için her açılışta yapıyoruz.
    const keysToRemove = ['playerName', 'username', 'isHost', 'roomCode', 'myId', 'isSolo'];
    keysToRemove.forEach(key => sessionStorage.removeItem(key));

    const btnHost = document.getElementById('btn-host');
    const btnJoin = document.getElementById('btn-join');
    const btnSolo = document.getElementById('btn-solo');
    const usernameInput = document.getElementById('username-input');
    const roomCodeInput = document.getElementById('room-code-input');

    const handleLogin = (isHosting, isSolo = false) => {
        if (window.PairaAudio) window.PairaAudio.init();
        
        let nameInput = '';
        if (usernameInput) {
            nameInput = usernameInput.value.trim();
        }
        
        if (!nameInput) {
            if (window.showToast) window.showToast("Lütfen bir ad girin", "error");
            return;
        }

        if (nameInput.length > 25) {
            if (window.showToast) window.showToast('Oyuncu adı çok uzun!', 'error');
            return;
        }

        let roomCode = '';
        if (!isHosting && !isSolo) {
            if (roomCodeInput) {
                roomCode = roomCodeInput.value.trim().toUpperCase();
            }
            if (!roomCode) {
                if (window.showToast) window.showToast("Oda kodu gerekli", "error");
                return;
            }
        }

        // Check Easter Egg
        const delay = window.checkEasterEgg ? window.checkEasterEgg(nameInput) : 0;

        // Store info in sessionStorage to use in app.js / network.js / game.js
        // We set both 'username' and 'playerName' to ensure compatibility with all games
        sessionStorage.setItem('username', nameInput);
        sessionStorage.setItem('playerName', nameInput);
        sessionStorage.setItem('isHost', isHosting);
        sessionStorage.setItem('isSolo', isSolo);
        
        if (isSolo) {
            // No room code needed for solo
            sessionStorage.removeItem('roomCode');
        } else if (!isHosting) {
            sessionStorage.setItem('roomCode', roomCode);
        } else {
            // Generate room code here, as some apps expect it to exist if hosting
            if (window.generateRoomCode) {
                sessionStorage.setItem('roomCode', window.generateRoomCode());
            }
        }

        setTimeout(() => {
            window.location.href = 'game.html';
        }, delay);
    };

    if (btnHost) btnHost.addEventListener('click', () => handleLogin(true));
    if (btnJoin) btnJoin.addEventListener('click', () => handleLogin(false));
    if (btnSolo) btnSolo.addEventListener('click', () => handleLogin(true, true));

    if (usernameInput) {
        usernameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (btnHost) {
                    // Default enter behavior if room code isn't focused
                    if (roomCodeInput && roomCodeInput.value.trim() !== '') {
                        handleLogin(false);
                    } else {
                        handleLogin(true);
                    }
                }
            }
        });
    }

    if (roomCodeInput) {
        roomCodeInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleLogin(false);
            }
        });
    }
});
