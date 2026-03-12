/**
 * PairaSharedUI - Encapsulates theme management and shared UI injection.
 */
class PairaSharedUI {
    constructor() {
        this.initTheme();
        document.addEventListener('DOMContentLoaded', () => {
            this.injectSharedUI();
            this.injectSEOFooter();
            this.updateLogos(localStorage.getItem('paira_theme') || 'paira');
        });
    }

    initTheme() {
        const savedTheme = localStorage.getItem('paira_theme') || 'paira';
        document.documentElement.setAttribute('data-theme', savedTheme);
    }

    switchTheme(themeName) {
        document.documentElement.setAttribute('data-theme', themeName);
        localStorage.setItem('paira_theme', themeName);
        this.updateLogos(themeName);
    }

    updateLogos(themeName) {
        const logos = document.querySelectorAll('.game-icon img');
        logos.forEach(img => {
            const src = img.getAttribute('src');
            if (src && src.includes('logolar/')) {
                const parts = src.split('/');
                const filename = parts[parts.length - 1];
                const base = filename.split('_')[0].split('.')[0];
                const replaceStr = src.includes('../logolar') ? '../logolar' : 'logolar';
                img.setAttribute('src', `${replaceStr}/${base}_${themeName}.svg`);
            }
        });
    }

    injectSharedUI() {
        const footerHTML = `
        <footer class="app-footer">
            <div class="footer-text">Paira Games &copy; ${new Date().getFullYear()} • Tüm Hakları Saklıdır</div>
            <div class="footer-links">
                <a href="https://github.com/AhmetEfeYSR" target="_blank" rel="noopener noreferrer" class="social-link">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"></path></svg>
                    <span>GitHub</span>
                </a>
                <a href="https://kick.com/Pairaaa" target="_blank" rel="noopener noreferrer" class="social-link kick-link">
                    <svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" id="Kick--Streamline-Simple-Icons" height="18" width="18"><path d="M1.333 0h8v5.333H12V2.667h2.667V0h8v8H20v2.667h-2.667v2.666H20V16h2.667v8h-8v-2.667H12v-2.666H9.333V24h-8Z" fill="#53fc18" stroke-width="1"></path></svg>
                    <span>Paira</span>
                </a>
                <span class="social-link" onclick="window.pairaUI.openTermsModal()">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                    <span>Kullanım Koşulları & Gizlilik</span>
                </span>
            </div>
        </footer>
        `;

        const existingFooter = document.querySelector('.app-footer');
        if (existingFooter) {
            existingFooter.outerHTML = footerHTML;
        } else {
            document.body.insertAdjacentHTML('beforeend', footerHTML);
        }

        const modalHTML = `
        <div id="termsModal" class="modal-overlay">
            <div class="modal-content">
                <div class="modal-header">
                    <h2>Kullanım Koşulları ve Gizlilik Politikası</h2>
                    <button class="modal-close" onclick="window.pairaUI.closeTermsModal()">&times;</button>
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

        const cookieHTML = `
        <div id="cookieBanner" class="cookie-banner">
            <div class="cookie-text">
                Sitemiz deneyiminizi geliştirmek için çerezleri (cookies) ve yerel depolama teknolojilerini kullanır. Oyuna devam ederek <a href="#" onclick="event.preventDefault(); window.pairaUI.openTermsModal();">Kullanım Koşulları ve Gizlilik Politikamızı</a> kabul etmiş olursunuz.
            </div>
            <button class="cookie-btn" onclick="window.pairaUI.acceptCookies()">Anladım</button>
        </div>
        `;
        document.body.insertAdjacentHTML('beforeend', cookieHTML);

        if (!localStorage.getItem('paira_cookies_accepted')) {
            setTimeout(() => {
                const banner = document.getElementById('cookieBanner');
                if (banner) banner.classList.add('show');
            }, 1000);
        }

        const modal = document.getElementById('termsModal');
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) this.closeTermsModal();
            });
        }
    }

    injectSEOFooter() {
        // Let's determine the correct base path using the script source approach for robustness
        const scripts = document.getElementsByTagName('script');
        let basePath = '';
        for (let script of scripts) {
            if (script.src.includes('shared.js')) {
                // If script src is like "../shared/shared.js", the root is "../"
                // If it is "shared/shared.js", the root is ""
                const srcStr = script.getAttribute('src');
                if (srcStr.startsWith('../')) {
                    basePath = '../';
                }
                break;
            }
        }

        const seoFooterHTML = `
        <footer id="seo-footer" style="width: 100%; text-align: center; padding: 1rem; margin-top: 1rem; background: var(--footer-bg); font-family: 'Poppins', sans-serif; font-size: 0.85rem; color: var(--text-muted); border-top: 1px solid var(--btn-secondary-bg);">
            <div style="display: flex; justify-content: center; gap: 1rem; flex-wrap: wrap;">
                <a href="${basePath}gizlilik-politikasi.html" style="color: var(--neon-purple); text-decoration: none;">Gizlilik Politikası</a>
                <span style="color: var(--text-muted);">|</span>
                <a href="${basePath}kullanim-kosullari.html" style="color: var(--neon-purple); text-decoration: none;">Kullanım Koşulları</a>
                <span style="color: var(--text-muted);">|</span>
                <a href="${basePath}iletisim.html" style="color: var(--neon-purple); text-decoration: none;">İletişim</a>
            </div>
            <div style="margin-top: 0.5rem;">Paira Games &copy; ${new Date().getFullYear()}</div>
        </footer>
        `;

        // Only append if it doesn't already exist
        if (!document.getElementById('seo-footer')) {
            document.body.insertAdjacentHTML('beforeend', seoFooterHTML);
        }
    }

    openTermsModal() {
        const modal = document.getElementById('termsModal');
        if (modal) {
            modal.style.display = 'flex';
            void modal.offsetWidth;
            modal.classList.add('show');
        }
    }

    closeTermsModal() {
        const modal = document.getElementById('termsModal');
        if (modal) {
            modal.classList.remove('show');
            setTimeout(() => {
                modal.style.display = 'none';
            }, 300);
        }
    }

    acceptCookies() {
        localStorage.setItem('paira_cookies_accepted', 'true');
        const banner = document.getElementById('cookieBanner');
        if (banner) {
            banner.classList.remove('show');
            setTimeout(() => {
                banner.style.display = 'none';
            }, 500);
        }
    }
}

window.pairaUI = new PairaSharedUI();
