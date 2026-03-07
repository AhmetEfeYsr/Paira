// Apply theme immediately to prevent FOUC (Flash of Unstyled Content)
(function applyTheme() {
    const savedTheme = localStorage.getItem('paira_theme') || 'paira';
    document.documentElement.setAttribute('data-theme', savedTheme);
})();

document.addEventListener('DOMContentLoaded', () => {
    injectSharedUI();
});

function switchTheme(themeName) {
    document.documentElement.setAttribute('data-theme', themeName);
    localStorage.setItem('paira_theme', themeName);
    updateLogos(themeName);
}

function updateLogos(themeName) {
    const logos = document.querySelectorAll('.game-icon img');
    logos.forEach(img => {
        const src = img.getAttribute('src');
        if (src && src.includes('logolar/')) {
            // Find the base name (e.g. logolar/aglam.svg or logolar/aglam_paira.svg)
            const parts = src.split('/');
            const filename = parts[parts.length - 1];
            const base = filename.split('_')[0].split('.')[0];
            img.setAttribute('src', `../logolar/${base}_${themeName}.svg`.replace('../logolar', src.includes('../logolar') ? '../logolar' : 'logolar'));
        }
    });
}

// Initial logo update on load
document.addEventListener('DOMContentLoaded', () => {
    const savedTheme = localStorage.getItem('paira_theme') || 'paira';
    updateLogos(savedTheme);
});

function injectSharedUI() {
    // Inject Footer
    const footerHTML = `
    <footer class="app-footer">
        <div class="footer-text">Paira Games &copy; ${new Date().getFullYear()} • Tüm Hakları Saklıdır</div>
        <div class="footer-links">
            <a href="https://github.com/AhmetEfeYSR" target="_blank" rel="noopener noreferrer" class="social-link">
                <span>GitHub</span>
            </a>
            <a href="https://kick.com/Pairaaa" target="_blank" rel="noopener noreferrer" class="social-link kick-link">
                <span>Paira</span>
            </a>
            <span class="social-link" onclick="openTermsModal()">
                <span>Kullanım Koşulları & Gizlilik</span>
            </span>
        </div>
    </footer>
    `;

    // Only inject footer if body doesn't already have .app-footer
    // but we might need to replace existing footers in old games
    const existingFooter = document.querySelector('.app-footer');
    if (existingFooter) {
        existingFooter.outerHTML = footerHTML;
    } else {
        document.body.insertAdjacentHTML('beforeend', footerHTML);
    }

    // Inject Modal
    const modalHTML = `
    <div id="termsModal" class="modal-overlay">
        <div class="modal-content">
            <div class="modal-header">
                <h2>Kullanım Koşulları ve Gizlilik Politikası</h2>
                <button class="modal-close" onclick="closeTermsModal()">&times;</button>
            </div>
            <div class="modal-body">
                <h3>1. Kabul Edilme</h3>
                <p>Paira Games portalına ve oyunlarına ("Hizmet") erişerek bu kullanım koşullarını kabul etmiş sayılırsınız.</p>

                <h3>2. Hizmetin Kullanımı</h3>
                <p>Oyunlarımız kişisel ve ticari olmayan kullanım içindir. Çok oyunculu modlarda iletişim kurarken (kullanıcı adları, çizimler, tahminler) saygılı olmanız beklenir.</p>

                <h3>3. Gizlilik Politikası</h3>
                <p>Hizmetimiz WebRTC tabanlı (sunucusuz/Peer-to-Peer) bir altyapı kullanır. Oyun verileriniz doğrudan oyuncular arasında iletilir. Sunucularımızda kişisel sohbet, çizim veya oyun içi verileriniz <strong>saklanmaz</strong>.</p>

                <h3>4. Çerezler ve Yerel Depolama (Cookies & LocalStorage)</h3>
                <p>Tarayıcınızın yerel depolama özelliklerini (LocalStorage, SessionStorage) oyun durumunuzu kaydetmek, bağlantı tercihlerinizi hatırlamak ve analiz sağlamak amacıyla kullanmaktayız.</p>

                <h3>5. Sorumluluk Reddi</h3>
                <p>Hizmet "olduğu gibi" sunulmaktadır. Herhangi bir kesinti, veri kaybı veya kullanımınızdan doğacak doğrudan/dolaylı zararlardan sorumluluk kabul edilmez.</p>

                <p style="margin-top: 2rem; font-size: 0.85rem; text-align: center;">Son Güncelleme: 2024</p>
            </div>
        </div>
    </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHTML);

    // Inject Cookie Banner
    const cookieHTML = `
    <div id="cookieBanner" class="cookie-banner">
        <div class="cookie-text">
            Sitemiz deneyiminizi geliştirmek için çerezleri (cookies) ve yerel depolama teknolojilerini kullanır. Oyuna devam ederek <a href="#" onclick="event.preventDefault(); openTermsModal();">Kullanım Koşulları ve Gizlilik Politikamızı</a> kabul etmiş olursunuz.
        </div>
        <button class="cookie-btn" onclick="acceptCookies()">Anladım</button>
    </div>
    `;
    document.body.insertAdjacentHTML('beforeend', cookieHTML);

    // Check Cookie Status
    if (!localStorage.getItem('paira_cookies_accepted')) {
        setTimeout(() => {
            const banner = document.getElementById('cookieBanner');
            if (banner) banner.classList.add('show');
        }, 1000);
    }

    // Modal Close handlers (click outside)
    const modal = document.getElementById('termsModal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeTermsModal();
        });
    }
}

window.openTermsModal = function() {
    const modal = document.getElementById('termsModal');
    if (modal) {
        modal.style.display = 'flex';
        // Trigger reflow
        void modal.offsetWidth;
        modal.classList.add('show');
    }
}

window.closeTermsModal = function() {
    const modal = document.getElementById('termsModal');
    if (modal) {
        modal.classList.remove('show');
        setTimeout(() => {
            modal.style.display = 'none';
        }, 300);
    }
}

window.acceptCookies = function() {
    localStorage.setItem('paira_cookies_accepted', 'true');
    const banner = document.getElementById('cookieBanner');
    if (banner) {
        banner.classList.remove('show');
        setTimeout(() => {
            banner.style.display = 'none';
        }, 500);
    }
}
