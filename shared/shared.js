/**
 * PairaSharedUI - Encapsulates theme management and shared UI injection.
 */
class PairaSharedUI {
    constructor() {
        this.initTheme();
        
        const initUI = () => {
            this.injectSharedUI();
            this.injectSEOFooter();
            this.injectAds();
            this.updateLogos(localStorage.getItem('paira_theme') || 'paira');
            this.initFullscreenToggle();
            this.initAds();
        };

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initUI);
        } else {
            initUI();
        }
    }

    getBasePath() {
        if (this._basePath !== undefined) return this._basePath;
        const scripts = document.getElementsByTagName('script');
        for (let script of scripts) {
            if (script.src.includes('shared.js')) {
                const srcStr = script.getAttribute('src');
                this._basePath = (srcStr && srcStr.startsWith('../')) ? '../' : '';
                return this._basePath;
            }
        }
        this._basePath = '';
        return '';
    }

    initTheme() {
        const savedTheme = localStorage.getItem('paira_theme') || 'paira';
        document.documentElement.setAttribute('data-theme', savedTheme);
    }

    initAds() {
        // Dinamik olarak ad_manager.js'i yükle
        const script = document.createElement('script');
        script.src = this.getBasePath() + 'shared/ad_manager.js';
        script.onload = () => {
            if (window.PairaAdManager) {
                const adManager = new window.PairaAdManager();
                adManager.init();
            }
        };
        document.head.appendChild(script);
    }

    switchTheme(themeName) {
        document.documentElement.setAttribute('data-theme', themeName);
        localStorage.setItem('paira_theme', themeName);
        this.updateLogos(themeName);
    }

    updateLogos(themeName) {
        const logos = document.querySelectorAll('.game-icon img, .game-logo-container img');
        logos.forEach(img => {
            const src = img.getAttribute('src');
            if (src && src.includes('logolar/')) {
                const parts = src.split('/');
                const filename = parts[parts.length - 1];
                const base = filename.split('_')[0].split('.')[0];
                const replaceStr = src.includes('../logolar') ? '../logolar' : 'logolar';
                
                // AVIF system implementation: Try to load AVIF first, if it fails or by default use AVIF
                // We use generated_logos folder for the high-end logos
                const newSrc = `${replaceStr}/generated_logos/${base}_${themeName}.avif`;
                img.setAttribute('src', newSrc);
                
                // Fallback to base AVIF if themed AVIF doesn't exist (optional, but good for robustness)
                img.onerror = () => {
                    if (!img.src.endsWith(`${base}.avif`)) {
                        img.src = `${replaceStr}/${base}.avif`;
                    }
                };
            }
        });
    }

    injectSharedUI() {
        const basePath = this.getBasePath();
        const isGamePage = window.location.pathname.endsWith('game.html');

        // Oyun sayfasına doğrudan girişi engelle (Eğer gerekli bilgiler sessionStorage'da yoksa)
        if (isGamePage) {
            const hasUsername = sessionStorage.getItem('username') || sessionStorage.getItem('playerName');
            const isSolo = sessionStorage.getItem('isSolo') === 'true';
            const hasRoomCode = sessionStorage.getItem('roomCode');
            const isHost = sessionStorage.getItem('isHost') === 'true';

            // Tek kişilik oyun değilse ve oda kodu yoksa (veya host değilse) ya da kullanıcı adı yoksa
            if (!hasUsername || (!isSolo && !hasRoomCode && !isHost)) {
                window.location.href = 'index.html';
                return;
            }
        }

        // Top Navigation (Theme Switcher only, on the right)
        const savedTheme = localStorage.getItem('paira_theme') || 'paira';
        let topNavHTML = `
            <div class="floating-top-nav">
                <select class="theme-select-btn" onchange="window.pairaUI.switchTheme(this.value)">
                    <option value="paira" ${savedTheme === 'paira' ? 'selected' : ''}>Paira</option>
                    <option value="space" ${savedTheme === 'space' ? 'selected' : ''}>Space</option>
                </select>
            </div>`;

        // Left Navigation (Back Home, on the left)
        const isLegalPage = window.location.href.includes('iletisim.html') || 
                            window.location.href.includes('gizlilik-politikasi.html') || 
                            window.location.href.includes('kullanim-kosullari.html');
        
        let leftNavHTML = '';
        if (basePath === '../' || isLegalPage) {
            leftNavHTML = `
            <div class="floating-left-nav">
                <a href="${basePath}index.html" class="home-icon-btn" title="Ana Sayfaya Dön">
                    <svg xmlns="http://www.w3.org/2000/svg" width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
                </a>
            </div>`;
        }

        const navWrapperHTML = `
            <div class="paira-global-nav">
                ${leftNavHTML}
                <div style="flex-grow: 1;"></div>
                ${topNavHTML}
            </div>
        `;
        document.body.insertAdjacentHTML('afterbegin', navWrapperHTML);

        if (!isGamePage) {
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
                    <button onclick="window.pairaUI.showSupportModal()" class="social-link support-link" title="Bize Destek Ol!">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
                        <span>Destek Ol</span>
                    </button>
                </div>
            </footer>
            `;

            const existingFooter = document.querySelector('.app-footer');
            if (existingFooter) {
                existingFooter.outerHTML = footerHTML;
            } else {
                document.body.insertAdjacentHTML('beforeend', footerHTML);
            }
        }

        const cookieHTML = `
        <div id="cookieBanner" class="cookie-banner">
            <div class="cookie-text">
                Deneyiminizi iyileştirmek için çerezleri kullanıyoruz. Paira'da eğlenceye devam ederek <a href="${basePath}kullanim-kosullari.html">Kullanım Koşulları ve Gizlilik Politikamızı</a> kabul etmiş sayılırsınız.
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

        const supportModalHTML = `
        <div id="supportModal" class="modal-overlay">
            <div class="modal-content" style="max-width: 400px; text-align: center;">
                <div class="modal-header">
                    <h2>Destek Ol</h2>
                    <button class="modal-close" onclick="window.pairaUI.hideSupportModal()">&times;</button>
                </div>
                <div class="modal-body">
                    <p style="margin-bottom: 1.5rem;">Bize destek olmak için bir reklama yönlendirileceksiniz. Onaylıyor musunuz?</p>
                    <div style="display: flex; gap: 10px;">
                        <button class="btn btn-secondary btn-block" onclick="window.pairaUI.hideSupportModal()" style="margin:0;">Vazgeç</button>
                        <button class="btn btn-primary btn-block" onclick="window.pairaUI.handleSupportRedirect()" style="margin:0;">Onayla</button>
                    </div>
                </div>
            </div>
        </div>
        `;
        document.body.insertAdjacentHTML('beforeend', supportModalHTML);
    }

    injectSEOFooter() {
        const isGamePage = window.location.pathname.endsWith('game.html');
        if (isGamePage) return; // Do not inject SEO footer on game pages

        const basePath = this.getBasePath();

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

    showSupportModal() {
        const modal = document.getElementById('supportModal');
        if (modal) modal.classList.add('show');
    }

    hideSupportModal() {
        const modal = document.getElementById('supportModal');
        if (modal) modal.classList.remove('show');
    }

    handleSupportRedirect() {
        this.hideSupportModal();
        window.open('https://www.profitablecpmratenetwork.com/cvk6m0b8e9?key=972046d37116c79934d8e30dbe41ecd8', '_blank');
    }

    injectAds() {
        // Reduced ad load based on user feedback to prioritize UX.
        // Mobile-specific logic added to minimize intrusion.
        const isMobile = window.innerWidth <= 768;
        const path = window.location.pathname;
        const isIndexPage = path.endsWith('index.html') || path.endsWith('/') || path === '';
        const isGamePage = path.endsWith('game.html');
        const basePath = this.getBasePath();
        const isPortal = isIndexPage && basePath === '';

        // 1. Social Bar (Global Desktop Only) - Disabled on mobile for better UX.
        if (!isMobile) {
            this.injectSocialBar();
        }

        // 2. Banner (Portal Only) - A single banner on the main page for visibility.
        if (isPortal) {
            this.injectPortalBanner();
        }

        // 3. Native Banner (Game Landing Only) - Integrated into the pre-game screen.
        if (isIndexPage && !isPortal) {
            this.injectGameIndexNative();
        }

        // 4. Lobby Waiting Ad (Multiplayer Lobby Desktop Only) - Keep mobile lobbies clean.
        if (isGamePage && !isMobile) {
            this.injectLobbyWaitingAd();
        }
    }

    injectSocialBar() {
        const script = document.createElement('script');
        script.src = "//pl29061335.profitablecpmratenetwork.com/23/fc/2b/23fc2b275deb25a844e1bacaa2e0ce40.js";
        script.async = true;
        document.body.appendChild(script);
    }

    injectPortalBanner() {
        const categories = document.querySelectorAll('.category-section');
        if (categories.length > 0) {
            const target = categories[1] || categories[0];
            const adWrapper = document.createElement('div');
            adWrapper.className = 'ad-placeholder banner-ad-wrapper portal-banner';

            const optionsScript = document.createElement('script');
            optionsScript.innerHTML = `
                atOptions = {
                    'key' : '60edc3c873bc1a0fd87b13486769ddb0',
                    'format' : 'iframe',
                    'height' : 90,
                    'width' : 728,
                    'params' : {}
                };
            `;

            const invokeScript = document.createElement('script');
            invokeScript.src = "//www.highperformanceformat.com/60edc3c873bc1a0fd87b13486769ddb0/invoke.js";

            adWrapper.appendChild(optionsScript);
            adWrapper.appendChild(invokeScript);
            target.after(adWrapper);
        }
    }

    injectGameIndexNative() {
        const rulesContainer = document.querySelector('.seo-rules-container');
        if (rulesContainer) {
            const adWrapper = document.createElement('div');
            adWrapper.className = 'ad-placeholder native-ad-wrapper game-index-native';

            const container = document.createElement('div');
            container.id = "container-29e233fdeff1131a7527d2f7fcf75c1e";

            const script = document.createElement('script');
            script.async = true;
            script.dataset.cfasync = "false";
            script.src = "//pl29061336.profitablecpmratenetwork.com/29e233fdeff1131a7527d2f7fcf75c1e/invoke.js";

            adWrapper.appendChild(container);
            adWrapper.appendChild(script);
            rulesContainer.before(adWrapper);
        }
    }

    injectLobbyWaitingAd() {
        const clientWaiting = document.getElementById('client-waiting');
        if (clientWaiting) {
            const adWrapper = document.createElement('div');
            adWrapper.className = 'ad-placeholder square-ad-wrapper lobby-waiting-ad';

            const optionsScript = document.createElement('script');
            optionsScript.innerHTML = `
                atOptions = {
                    'key' : '1663d5714d42552b6ac37bcfb8f4c0bd',
                    'format' : 'iframe',
                    'height' : 250,
                    'width' : 300,
                    'params' : {}
                };
            `;

            const invokeScript = document.createElement('script');
            invokeScript.src = "//www.highperformanceformat.com/1663d5714d42552b6ac37bcfb8f4c0bd/invoke.js";

            adWrapper.appendChild(optionsScript);
            adWrapper.appendChild(invokeScript);
            clientWaiting.appendChild(adWrapper);
        }
    }

    initFullscreenToggle() {
        const btnToggle = document.getElementById('btn-fullscreen-toggle');
        if (!btnToggle) return;

        let isFullscreen = false;

        btnToggle.addEventListener('click', () => {
            isFullscreen = !isFullscreen;
            if (isFullscreen) {
                document.body.classList.add('fullscreen-active');
                btnToggle.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"></path></svg>';
                btnToggle.setAttribute('title', 'Tam Ekrandan Çık');
                
                // Trigger window resize so canvas scales
                setTimeout(() => window.dispatchEvent(new Event('resize')), 50);
            } else {
                document.body.classList.remove('fullscreen-active');
                btnToggle.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path></svg>';
                btnToggle.setAttribute('title', 'Tam Ekran Çizim');

                // Trigger window resize so canvas scales back
                setTimeout(() => window.dispatchEvent(new Event('resize')), 50);
            }
        });
        
        // Handle ESC key to exit fullscreen
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && isFullscreen) {
                btnToggle.click();
            }
        });
    }
}

window.pairaUI = new PairaSharedUI();

window.checkEasterEgg = function(username) {
    if (!username) return 0;
    const lowerName = username.toLowerCase();
    if (lowerName === 'paira' || lowerName === 'pai' || lowerName === 'paiko') {
        if (typeof window.showToast === 'function') {
            window.showToast('canım ablam 💜', 'info'); // Many use "info" or "success"
        }
        return 1000;
    }
    return 0;
};

window.showToast = function(msg, type = "info") {
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
    
    // Play sound based on toast type if audio is initialized
    if (window.PairaAudio && window.PairaAudio.ctx) {
        if (type === 'error') window.PairaAudio.play('wrong');
        else if (type === 'success') window.PairaAudio.play('correct');
        else window.PairaAudio.play('tick');
    }

    setTimeout(() => {
        toast.style.animation = 'slideIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275) reverse forwards';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
};

window.PairaTime = {
    offset: 0,
    async sync() {
        const apis = [
            'https://worldtimeapi.org/api/timezone/Etc/UTC',
            'https://timeapi.io/api/Time/current/zone?timeZone=UTC'
        ];
        
        for (const api of apis) {
            try {
                const start = performance.now();
                const res = await fetch(api);
                if (!res.ok) continue;
                const data = await res.json();
                const latency = (performance.now() - start) / 2;
                
                let serverTime;
                if (data.utc_datetime) { // worldtimeapi
                    serverTime = new Date(data.utc_datetime).getTime() + latency;
                } else if (data.dateTime) { // timeapi.io
                    serverTime = new Date(data.dateTime + 'Z').getTime() + latency;
                }
                
                if (serverTime) {
                    this.offset = serverTime - Date.now();
                    console.log(`Time synchronized via ${api}. Offset:`, this.offset);
                    return;
                }
            } catch (e) {
                // Silently fail individual APIs as we have fallbacks
            }
        }
        console.warn("All Time API syncs failed, using local time.");
    },
    now() {
        return Date.now() + this.offset;
    }
};
window.PairaTime.sync();

window.PairaAudio = {
    ctx: null,
    init() {
        if (!this.ctx) {
            try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return; }
        }
        if (this.ctx?.state === 'suspended') this.ctx.resume();
    },
    play(type) {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gainNode = this.ctx.createGain();

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 1200; 

        osc.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(this.ctx.destination);

        const now = this.ctx.currentTime;

        if (type === 'correct') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(440, now);
            osc.frequency.exponentialRampToValueAtTime(880, now + 0.1);
            gainNode.gain.setValueAtTime(0.0, now);
            gainNode.gain.linearRampToValueAtTime(0.1, now + 0.05);
            gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
            osc.start(now); osc.stop(now + 0.4);
        } else if (type === 'taboo' || type === 'wrong') {
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(300, now);
            osc.frequency.exponentialRampToValueAtTime(150, now + 0.3);
            gainNode.gain.setValueAtTime(0.0, now);
            gainNode.gain.linearRampToValueAtTime(0.1, now + 0.05);
            gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
            osc.start(now); osc.stop(now + 0.4);
        } else if (type === 'tick') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(600, now);
            gainNode.gain.setValueAtTime(0.0, now);
            gainNode.gain.linearRampToValueAtTime(0.05, now + 0.02);
            gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
            osc.start(now); osc.stop(now + 0.1);
        } else if (type === 'end') {
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(440, now);
            osc.frequency.exponentialRampToValueAtTime(220, now + 0.5);
            gainNode.gain.setValueAtTime(0.0, now);
            gainNode.gain.linearRampToValueAtTime(0.1, now + 0.1);
            gainNode.gain.exponentialRampToValueAtTime(0.001, now + 1.0);
            osc.start(now); osc.stop(now + 1.0);
        } else if (type === 'pass') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(800, now);
            gainNode.gain.setValueAtTime(0.0, now);
            gainNode.gain.linearRampToValueAtTime(0.05, now + 0.01);
            gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
            osc.start(now); osc.stop(now + 0.1);
        }
    }
};

window.generateRoomCode = function() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    const array = new Uint32Array(6);
    if (window.crypto && window.crypto.getRandomValues) {
        window.crypto.getRandomValues(array);
        for (let i = 0; i < 6; i++) code += chars[array[i] % chars.length];
    } else {
        for (let i = 0; i < 6; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
};

window.showScreen = function(screenId) {
    document.querySelectorAll('.view-state').forEach(el => {
        if (el.id === screenId) {
            el.classList.remove('hidden');
            el.classList.add('active');
        } else {
            el.classList.add('hidden');
            el.classList.remove('active');
        }
    });
};

window.normalizeTurkishChars = function(str) {
    const charMap = {
        'I': 'i', 'İ': 'i', 'ı': 'i',
        'â': 'a', 'î': 'i', 'û': 'u',
        'Â': 'a', 'Î': 'i', 'Û': 'u',
        'ç': 'c', 'ğ': 'g', 'ö': 'o', 'ş': 's', 'ü': 'u',
        'Ç': 'c', 'Ğ': 'g', 'Ö': 'o', 'Ş': 's', 'Ü': 'u'
    };
    return str.replace(/[IİıâîûÂÎÛçğöşüÇĞÖŞÜ]/g, char => charMap[char] || char).toLowerCase();
};

window.getTodayDateTR = function() {
    const today = new Date();
    const utc = today.getTime() + (today.getTimezoneOffset() * 60000);
    const trDate = new Date(utc + (3600000 * 3)); // UTC + 3 saat

    const yyyy = trDate.getFullYear();
    const mm = String(trDate.getMonth() + 1).padStart(2, '0');
    const dd = String(trDate.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
};

window.escapeHtml = function(text) {
    if (text == null) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
};

class FuzzyMatcher {
    constructor() {
        this.qwertyMap = {
            'q': ['w','a','s'], 'w': ['q','e','a','s','d'], 'e': ['w','r','s','d','f'],
            'r': ['e','t','d','f','g'], 't': ['r','y','f','g','h'], 'y': ['t','u','g','h','j'],
            'u': ['y','ı','i','h','j','k'], 'ı': ['u','o','j','k','l'], 'o': ['ı','p','k','l','ş'],
            'p': ['o','ğ','l','ş','i'], 'ğ': ['p','ü','ş','i'], 'ü': ['ğ','ş'],
            'a': ['q','w','s','z','x'], 's': ['a','d','w','e','z','x','c'], 'd': ['s','f','e','r','x','c','v'],
            'f': ['d','g','r','t','c','v','b'], 'g': ['f','h','t','y','v','b','n'], 'h': ['g','j','y','u','b','n','m'],
            'j': ['h','k','u','ı','n','m','ö'], 'k': ['j','l','ı','o','m','ö','ç'], 'l': ['k','ş','o','p','ö','ç'],
            'ş': ['l','i','p','ğ','ç'], 'i': ['ş','p','ğ'],
            'z': ['a','s','x'], 'x': ['z','c','s','d'], 'c': ['x','v','d','f'],
            'v': ['c','b','f','g'], 'b': ['v','n','g','h'], 'n': ['b','m','h','j'],
            'm': ['n','ö','j','k'], 'ö': ['m','ç','k','l'], 'ç': ['ö','l','ş']
        };
    }

    isAdjacent(char1, char2) {
        if (!this.qwertyMap[char1]) return false;
        return this.qwertyMap[char1].includes(char2);
    }

    getDistance(word1, word2) {
        if (!word1) word1 = "";
        if (!word2) word2 = "";
        if (word1.length > 50) word1 = word1.substring(0, 50);
        if (word2.length > 50) word2 = word2.substring(0, 50);
        
        word1 = word1.toLocaleLowerCase('tr-TR');
        word2 = word2.toLocaleLowerCase('tr-TR');

        const len1 = word1.length;
        const len2 = word2.length;
        const matrix = Array(len1 + 1).fill(null).map(() => Array(len2 + 1).fill(0));

        for (let i = 0; i <= len1; i++) matrix[i][0] = i;
        for (let j = 0; j <= len2; j++) matrix[0][j] = j;

        for (let i = 1; i <= len1; i++) {
            for (let j = 1; j <= len2; j++) {
                const cost = word1[i - 1] === word2[j - 1] ? 0 :
                            (this.isAdjacent(word1[i - 1], word2[j - 1]) ? 0.4 : 1);

                matrix[i][j] = Math.min(
                    matrix[i - 1][j] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j - 1] + cost
                );

                if (i > 1 && j > 1 && word1[i - 1] === word2[j - 2] && word1[i - 2] === word2[j - 1]) {
                    matrix[i][j] = Math.min(matrix[i][j], matrix[i - 2][j - 2] + 0.5);
                }
            }
        }
        return matrix[len1][len2];
    }

    isMatch(word1, word2, tolerance = 1.2) {
        return this.getDistance(word1, word2) <= tolerance;
    }
}
window.FuzzyMatcher = FuzzyMatcher;
