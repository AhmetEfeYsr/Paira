/**
 * PairaSharedUI - Encapsulates theme management and shared UI injection.
 */
class PairaSharedUI {
    constructor() {
        this.initTheme();
        
        const initUI = () => {
            this.injectSharedUI();
            this.injectSEOFooter();
            this.updateLogos(localStorage.getItem('paira_theme') || 'paira');
            this.initFullscreenToggle();
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
                img.setAttribute('src', `${replaceStr}/${base}_${themeName}.svg`);
            }
        });
    }

    injectSharedUI() {
        const basePath = this.getBasePath();
        const isGamePage = window.location.pathname.endsWith('game.html');

        // Top Navigation (Theme Switcher only, on the right)
        const savedTheme = localStorage.getItem('paira_theme') || 'paira';
        let topNavHTML = `
            <div class="floating-top-nav">
                <select class="theme-select-btn" onchange="window.pairaUI.switchTheme(this.value)">
                    <option value="paira" ${savedTheme === 'paira' ? 'selected' : ''}>Paira</option>
                    <option value="space" ${savedTheme === 'space' ? 'selected' : ''}>Space</option>
                    <option value="light" ${savedTheme === 'light' ? 'selected' : ''}>Light</option>
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
                console.warn(`Time API sync failed for ${api}`, e);
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
