class KatiplikGame {
    constructor() {
        this.playerName = sessionStorage.getItem('playerName') || 'Misafir';
        this.isHost = sessionStorage.getItem('isHost') === 'true';
        this.isSolo = sessionStorage.getItem('isSolo') === 'true';
        this.roomCode = sessionStorage.getItem('roomCode');
        
        // Oyun Değişkenleri
        this.targetText = "";
        this.words = [];
        this.currentWordIndex = 0;
        this.startTime = null;
        this.timerInterval = null;
        this.totalKeystrokes = 0;
        this.correctKeystrokes = 0;
        this.isFinished = false;
        
        // Rakip Durumu
        this.opponentName = "Rakip";
        this.opponentFinishedTime = null;
        this.opponentWpm = 0;
        this.opponentAccuracy = 0;

        // Ağ Yöneticisi
        if (!this.isSolo) {
            this.network = new KatiplikNetwork(this);
            this.network.initialize(this.isHost, this.roomCode);
        } else {
            this.setupSoloGame();
        }

        this.bindEvents();
        this.updateUIPlayerNames();
    }

    bindEvents() {
        const textInput = document.getElementById('text-input');
        this._spaceHandledByKeydown = false;
        
        textInput.addEventListener('keydown', (e) => {
            if (this.isFinished) return;
            // Prevent default space behavior for immediate visual feedback on desktop
            if (e.code === 'Space' || e.key === ' ') {
                e.preventDefault();
                this._spaceHandledByKeydown = true;
                this.handleWordCompletion(textInput.value.trim());
            }
        });
        
        textInput.addEventListener('input', (e) => {
            if (this.isFinished) return;
            const val = e.target.value;
            // Handle space or newline entered via input (especially for mobile where keydown may not fire)
            if (val.length > 0 && (val.endsWith(' ') || val.endsWith('\n'))) {
                if (!this._spaceHandledByKeydown) {
                    this.handleWordCompletion(val.trim());
                }
                this._spaceHandledByKeydown = false;
            } else {
                this._spaceHandledByKeydown = false;
                this.handleTyping(e);
            }
        });
        
        document.getElementById('btn-start-game')?.addEventListener('click', () => {
            this.initGameWithSelectedCategory();
        });

        document.getElementById('btn-play-again')?.addEventListener('click', () => {
            if (this.isSolo) {
                this.resetGame();
                this.loadCategories();
            } else if (this.isHost) {
                this.network.sendMessage({ type: 'play_again' });
                this.resetGame();
                this.loadCategories();
            }
        });

        document.getElementById('btn-cancel-wait')?.addEventListener('click', () => {
            if (this.network) this.network.leaveRoom();
            else window.location.href = 'index.html';
        });

        document.getElementById('btn-leave')?.addEventListener('click', () => {
            if (this.network) this.network.leaveRoom();
            else window.location.href = 'index.html';
        });
    }

    updateUIPlayerNames() {
        document.getElementById('p1-name').textContent = this.playerName;
        if (this.isSolo) {
            document.getElementById('player2-info').style.display = 'none';
        } else {
            document.getElementById('p2-name').textContent = this.isHost ? 'Bekleniyor...' : this.opponentName;
        }
    }

    setupSoloGame() {
        window.showScreen('game-screen');
        this.loadCategories();
    }

    async loadCategories() {
        window.showScreen('game-screen');
        document.getElementById('result-screen').style.display = 'none';
        document.getElementById('typing-area').style.display = 'none';

        if (this.isHost || this.isSolo) {
            document.getElementById('category-selection').style.display = 'block';
            
            try {
                const response = await fetch('tr.json');
                const data = await response.json();
                this.categories = data; // JSON kök dizini bir array
                this.renderCategories();
            } catch (err) {
                console.error("Kategoriler yüklenemedi", err);
                window.showToast("Metinler yüklenemedi", "error");
            }
        } else {
            document.getElementById('category-selection').style.display = 'none';
            document.getElementById('typing-area').style.display = 'flex';
            document.getElementById('text-display').innerHTML = '<h3 style="text-align:center; margin-top:2rem; width:100%; color:var(--text-muted);">Kurucunun metin seçmesi bekleniyor...</h3>';
        }
    }

    renderCategories() {
        const select = document.getElementById('category-select');
        const startBtn = document.getElementById('btn-start-game');
        const searchInput = document.getElementById('category-search');
        
        if (select) {
            this.selectedCategory = null;
            startBtn.disabled = true;

            const renderOptions = (filterText = '') => {
                select.innerHTML = '';
                const lowerFilter = filterText.toLocaleLowerCase('tr-TR');
                
                this.categories.forEach((cat, index) => {
                    const titleText = `Metin ${index + 1} - ${cat.title}`;
                    if (!filterText || window.normalizeTurkishChars(titleText).includes(window.normalizeTurkishChars(filterText))) {
                        const option = document.createElement('option');
                        option.value = index;
                        option.textContent = titleText;
                        select.appendChild(option);
                    }
                });
            };

            renderOptions();

            // Prevent duplicate listeners by cloning and replacing elements
            if (searchInput && !searchInput._katipBound) {
                searchInput._katipBound = true;
                searchInput.value = '';
                searchInput.addEventListener('input', (e) => {
                    renderOptions(e.target.value);
                });
            } else if (searchInput) {
                // Just re-render options with current search value
                renderOptions(searchInput.value);
            }

            if (!select._katipBound) {
                select._katipBound = true;
                select.addEventListener('change', (e) => {
                    const selectedIndex = parseInt(e.target.value, 10);
                    if (!isNaN(selectedIndex) && this.categories[selectedIndex]) {
                        this.selectedCategory = this.categories[selectedIndex];
                        startBtn.disabled = false;
                    }
                });
            }
        }
    }

    initGameWithSelectedCategory() {
        if (!this.selectedCategory) return;
        
        let text = this.selectedCategory.text;
        const type = this.selectedCategory.type; // 'random' or 'sorted'
        
        const imlaMode = document.querySelector('input[name="imla-mode"]:checked')?.value || 'imlali';
        const kbMode = document.querySelector('input[name="kb-mode"]:checked')?.value || 'tr';
        
        let words = text.split(/[\s\n\r]+/).filter(w => w.trim() !== "");
        
        if (type === 'random') {
            for (let i = words.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [words[i], words[j]] = [words[j], words[i]];
            }
        }
        
        const processedText = words.join(' ');
        
        if (!this.isSolo) {
            this.network.sendMessage({
                type: 'game_start',
                text: processedText,
                imlaMode: imlaMode,
                kbMode: kbMode
            });
        }
        
        this.startGame(processedText, imlaMode, kbMode);
    }

    startGame(text, imlaMode = 'imlali', kbMode = 'tr') {
        this.imlaMode = imlaMode;
        this.kbMode = kbMode;
        document.getElementById('category-selection').style.display = 'none';
        document.getElementById('result-screen').style.display = 'none';
        document.getElementById('waiting-rematch-text').style.display = 'none';
        document.getElementById('typing-area').style.display = 'flex';
        
        this.targetText = text;
        this.words = text.split(/[\s\n\r]+/).filter(w => w.trim() !== "");
        this.currentWordIndex = 0;
        this.totalKeystrokes = 0;
        this.correctKeystrokes = 0;
        this.isFinished = false;
        
        // Rakip sıfırlama
        this.opponentFinishedTime = null;
        this.opponentWpm = 0;
        this.opponentAccuracy = 0;
        document.getElementById('p2-progress').style.width = '0%';
        document.getElementById('p2-wpm').textContent = '0 WPM';
        
        this.renderText();
        
        const textDisplay = document.getElementById('text-display');
        textDisplay.scrollTop = 0;
        
        const textInput = document.getElementById('text-input');
        textInput.disabled = false;
        textInput.value = '';
        textInput.focus();
        
        this.startTime = window.PairaTime.now();
        this.startTimer();
    }

    normalizeWord(text) {
        if (!text) return "";
        let result = text;
        
        if (this.imlaMode === 'imlasiz') {
            result = result.replace(/[^\p{L}\p{N}]/gu, '');
            result = result.toLocaleLowerCase('tr-TR');
        }
        
        if (this.kbMode === 'en') {
            const charMap = {
                'ı': 'i', 'ı': 'i', 'İ': 'I',
                'â': 'a', 'î': 'i', 'û': 'u',
                'Â': 'A', 'Î': 'I', 'Û': 'U',
                'ç': 'c', 'ğ': 'g', 'ö': 'o', 'ş': 's', 'ü': 'u',
                'Ç': 'C', 'Ğ': 'G', 'Ö': 'O', 'Ş': 'S', 'Ü': 'U'
            };
            result = result.replace(/[ıİâîûÂÎÛçğöşüÇĞÖŞÜ]/g, char => charMap[char] || char);
            
            // If imlasiz was applied, lower case is already handled.
            // If imlali with 'en' keyboard, we also handle case check correctly
        }
        
        return result;
    }

    renderText() {
        const display = document.getElementById('text-display');
        display.innerHTML = '';
        
        this.words.forEach((word, index) => {
            const span = document.createElement('span');
            span.textContent = word + ' ';
            span.className = 'word';
            if (index === this.currentWordIndex) {
                span.classList.add('current');
            }
            display.appendChild(span);
        });
    }

    handleTyping(e) {
        if (this.isFinished) return;
        
        const inputVal = e.target.value.trim();
        const currentWord = this.words[this.currentWordIndex];
        const displayWords = document.getElementById('text-display').children;
        const wordSpan = displayWords[this.currentWordIndex];
        
        const normInput = this.normalizeWord(inputVal);
        const normExpected = this.normalizeWord(currentWord);

        // Hata kontrolü
        if (normInput && !normExpected.startsWith(normInput)) {
            wordSpan.classList.add('error');
        } else {
            wordSpan.classList.remove('error');
        }
        
        this.calculateWPM();
        this.updateProgress();
    }

    handleWordCompletion(typedWord) {
        if (!typedWord || this.isFinished) return;
        
        const expectedWord = this.words[this.currentWordIndex];
        const displayWords = document.getElementById('text-display').children;
        const wordSpan = displayWords[this.currentWordIndex];
        
        const normInput = this.normalizeWord(typedWord);
        const normExpected = this.normalizeWord(expectedWord);
        
        this.totalKeystrokes += typedWord.length + 1; // +1 for space
        
        wordSpan.classList.remove('current', 'error');
        
        if (normInput === normExpected) {
            wordSpan.classList.add('correct');
            this.correctKeystrokes += typedWord.length + 1;
        } else {
            wordSpan.classList.add('incorrect');
        }
        
        this.currentWordIndex++;
        
        const textInput = document.getElementById('text-input');
        textInput.value = '';
        
        this.calculateWPM();
        this.updateProgress();

        if (this.currentWordIndex >= this.words.length) {
            this.finishGame();
        } else {
            const nextWordSpan = displayWords[this.currentWordIndex];
            nextWordSpan.classList.add('current');
            
            // Otomatik kaydırma
            const display = document.getElementById('text-display');
            const displayRect = display.getBoundingClientRect();
            const spanRect = nextWordSpan.getBoundingClientRect();
            
            if (spanRect.bottom > displayRect.bottom - 40) {
                display.scrollBy({
                    top: spanRect.bottom - displayRect.bottom + 60,
                    behavior: 'smooth'
                });
            }
        }
    }

    calculateWPM() {
        if (!this.startTime || this.isFinished) {
            const currentWpmText = document.getElementById('p1-wpm').textContent;
            return parseInt(currentWpmText) || 0;
        }
        
        const timeElapsed = (window.PairaTime.now() - this.startTime) / 60000; // minutes
        
        if (timeElapsed < 0.05) return 0;
        
        // Calculate correct characters in progress for current word to prevent WPM dropping mid-word
        let currentWordCorrectChars = 0;
        const textInput = document.getElementById('text-input');
        if (textInput && !this.isFinished) {
            const inputVal = textInput.value.trim();
            const currentWord = this.words[this.currentWordIndex];
            if (inputVal && currentWord) {
                const normInput = this.normalizeWord(inputVal);
                const normExpected = this.normalizeWord(currentWord);
                if (normExpected.startsWith(normInput)) {
                    currentWordCorrectChars = inputVal.length;
                }
            }
        }
        
        const totalCorrect = this.correctKeystrokes + currentWordCorrectChars;
        const wpm = Math.round((totalCorrect / 5) / timeElapsed);
        const finalWpm = isNaN(wpm) || wpm < 0 || !isFinite(wpm) ? 0 : wpm;
        
        document.getElementById('p1-wpm').textContent = `${finalWpm} WPM`;
        return finalWpm;
    }

    updateProgress() {
        const progress = (this.currentWordIndex / this.words.length) * 100;
        document.getElementById('p1-progress').style.width = `${progress}%`;
        
        if (!this.isSolo) {
            this.network.sendMessage({
                type: 'progress_update',
                progress: progress,
                wpm: this.calculateWPM()
            });
        }
    }

    updateOpponentProgress(progress, wpm) {
        document.getElementById('p2-progress').style.width = `${progress}%`;
        document.getElementById('p2-wpm').textContent = `${wpm} WPM`;
    }

    startTimer() {
        clearInterval(this.timerInterval);
        const timerElement = document.getElementById('game-timer');
        
        this.timerInterval = setInterval(() => {
            const timeElapsed = Math.floor((window.PairaTime.now() - this.startTime) / 1000);
            const minutes = Math.floor(timeElapsed / 60).toString().padStart(2, '0');
            const seconds = (timeElapsed % 60).toString().padStart(2, '0');
            timerElement.textContent = `${minutes}:${seconds}`;
        }, 1000);
    }

    finishGame() {
        if (this.isFinished) return;
        this.isFinished = true;
        clearInterval(this.timerInterval);
        
        const textInput = document.getElementById('text-input');
        textInput.disabled = true;
        
        const finalTime = Math.max(1, Math.floor((window.PairaTime.now() - this.startTime) / 1000));
        
        this.isFinished = false; 
        const finalWpm = this.calculateWPM();
        this.isFinished = true;
        
        const accuracy = this.totalKeystrokes > 0 ? Math.round((this.correctKeystrokes / this.totalKeystrokes) * 100) : 0;
        
        if (!this.isSolo) {
            this.network.sendMessage({
                type: 'game_finished',
                time: finalTime,
                wpm: finalWpm,
                accuracy: accuracy
            });
        }
        
        if (window.PairaAudio && window.PairaAudio.play) {
            window.PairaAudio.play('end');
        }
        
        this.showResult(finalTime, finalWpm, accuracy);
    }

    opponentFinished(time, wpm, accuracy) {
        this.opponentFinishedTime = time;
        this.opponentWpm = wpm;
        this.opponentAccuracy = accuracy;
        
        document.getElementById('p2-progress').style.width = '100%';
        document.getElementById('p2-wpm').textContent = `${wpm} WPM`;
        
        if (this.isFinished) {
            this.determineWinner();
        }
    }

    showResult(time, wpm, accuracy) {
        document.getElementById('typing-area').style.display = 'none';
        const resultScreen = document.getElementById('result-screen');
        resultScreen.style.display = 'block';
        
        document.getElementById('final-wpm').textContent = wpm;
        document.getElementById('final-accuracy').textContent = `%${accuracy}`;
        document.getElementById('final-time').textContent = `${time}s`;
        
        if (this.isSolo) {
            document.getElementById('result-title').textContent = "Pratik Tamamlandı!";
            document.getElementById('result-title').style.color = "var(--success)";
            document.getElementById('btn-play-again').style.display = 'inline-block';
        } else {
            if (this.opponentFinishedTime) {
                this.determineWinner();
            } else {
                document.getElementById('result-title').textContent = "Rakibin bitirmesi bekleniyor...";
                document.getElementById('result-title').style.color = "var(--text-main)";
                document.getElementById('btn-play-again').style.display = 'none';
                document.getElementById('waiting-rematch-text').style.display = 'none';
            }
        }
    }

    determineWinner() {
        const title = document.getElementById('result-title');
        const playAgainBtn = document.getElementById('btn-play-again');
        const waitingText = document.getElementById('waiting-rematch-text');
        
        // Show opponent stats
        const oppStats = document.getElementById('opponent-stats');
        if (oppStats && !this.isSolo) {
            oppStats.style.display = 'block';
            document.getElementById('opp-final-wpm').textContent = this.opponentWpm || 0;
            document.getElementById('opp-final-accuracy').textContent = `%${this.opponentAccuracy || 0}`;
            document.getElementById('opp-final-time').textContent = `${this.opponentFinishedTime || 0}s`;
        }
        
        const wpmText = document.getElementById('final-wpm').textContent;
        const myWpm = parseInt(wpmText) || 0;
        const opWpm = this.opponentWpm || 0;
        
        if (myWpm > opWpm) {
            title.textContent = "🏆 Kazandın! 🏆";
            title.style.color = "var(--success)";
            if (window.PairaAudio && window.PairaAudio.play) window.PairaAudio.play('correct');
        } else if (opWpm > myWpm) {
            title.textContent = "❌ Kaybettin! ❌";
            title.style.color = "var(--danger)";
            if (window.PairaAudio && window.PairaAudio.play) window.PairaAudio.play('wrong');
        } else {
            title.textContent = "🤝 Berabere! 🤝";
            title.style.color = "var(--warning)";
            if (window.PairaAudio && window.PairaAudio.play) window.PairaAudio.play('pass');
        }
        
        if (this.isHost) {
            playAgainBtn.style.display = 'inline-block';
            waitingText.style.display = 'none';
        } else {
            playAgainBtn.style.display = 'none';
            waitingText.style.display = 'block';
        }
    }

    resetGame() {
        clearInterval(this.timerInterval);
        this.isFinished = false;
        
        document.getElementById('game-timer').textContent = "00:00";
        document.getElementById('p1-progress').style.width = "0%";
        document.getElementById('p2-progress').style.width = "0%";
        document.getElementById('p1-wpm').textContent = "0 WPM";
        document.getElementById('p2-wpm').textContent = "0 WPM";
        
        const oppStats = document.getElementById('opponent-stats');
        if (oppStats) oppStats.style.display = 'none';
        
        const textInput = document.getElementById('text-input');
        if (textInput) {
            textInput.value = '';
            textInput.disabled = true;
        }
        
        if (!this.isHost && !this.isSolo) {
            document.getElementById('result-screen').style.display = 'none';
            document.getElementById('typing-area').style.display = 'flex';
            document.getElementById('text-display').innerHTML = '<h3 style="text-align:center; margin-top:2rem; width:100%; color:var(--text-muted);">Kurucunun yeni metin seçmesi bekleniyor...</h3>';
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('app-container')) {
        new KatiplikGame();
    }
});