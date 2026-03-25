/**
 * HizliIsimSehirGameEngine - Core game logic
 */
class HizliIsimSehirGameEngine {
    constructor(isHost = true) {
        this.isHost = isHost;
        this.state = {
            status: 'LOBBY',
            round: 1,
            letter: '',
            currentCategory: null,
            currentPlayerIndex: 0,
            players: {},
            playerAnswers: {},
            endTime: null,
            appealTimeout: null,
            pendingNextTurn: null,
            votes: { yes: 0, no: 0, votedPlayers: new Set() }
        };
        this.config = {
            rounds: 3,
            endValue: 15,
            categories: []
        };
        this.alphabet = "A B C Ç D E F G H I İ J K L M N O Ö P R S Ş T U Ü V Y Z".split(" ");
        this.apiCache = {};
        this.validationCache = {};

        this.onStateChange = null;
        this.onTurnResult = null;
        this.onScoreUpdate = null;
        this.onVoteStart = null;
        this.onVoteResult = null;
    }

    setState(newState) {
        this.state = { ...this.state, ...newState };
        if (this.onStateChange) this.onStateChange(this.state);
    }

    addPlayer(id, name, isHost) {
        this.state.players[id] = { id, name, isHost, score: 0 };
        this.setState({ players: this.state.players });
    }

    removePlayer(id) {
        const playersArr = Object.values(this.state.players);
        const index = playersArr.findIndex(p => p.id === id);
        
        delete this.state.players[id];
        
        if (index !== -1 && index < this.state.currentPlayerIndex) {
            this.state.currentPlayerIndex--;
        } else if (index !== -1 && index === this.state.currentPlayerIndex) {
            if (this.state.status === 'PLAYING' || this.state.status === 'WAITING_APPEAL' || this.state.status === 'VOTING') {
                this.state.status = 'PLAYING';
                const totalPlayers = Object.keys(this.state.players).length;
                if (this.state.currentPlayerIndex >= totalPlayers) {
                    if (this.onScoreUpdate) this.onScoreUpdate(this.getFinalScores(null, 0));
                } else {
                    this.startNextTurn(this.state.round, this.state.currentPlayerIndex);
                }
            }
        }
        
        this.setState({ players: this.state.players });
    }

    getRandomLetter() {
        const array = new Uint32Array(1);
        window.crypto.getRandomValues(array);
        return this.alphabet[array[0] % this.alphabet.length];
    }

    startGame(config) {
        if (!this.isHost) return;
        this.config = config;
        
        for (const pId in this.state.players) {
            this.state.players[pId].score = 0;
        }

        this.startNextTurn(1, 0);
    }

    startNextTurn(round, playerIndex) {
        if (!this.isHost) return;
        
        const letter = this.getRandomLetter();
        const category = this.config.categories[Math.floor(Math.random() * this.config.categories.length)];
        
        this.state.round = round;
        this.state.currentPlayerIndex = playerIndex;
        this.state.letter = letter;
        this.state.currentCategory = category;
        this.state.status = 'PLAYING';
        this.state.playerAnswers = {};
        
        this.setState(this.state);
    }

    normalizeForSearch(text) {
        if (!text) return "";
        return text.toString().toLocaleLowerCase('tr-TR')
            .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's')
            .replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c')
            .replace(/â/g, 'a').replace(/î/g, 'i').replace(/û/g, 'u')
            .trim();
    }

    async checkWikipedia(word, keywords, requiredLetterLower) {
        const wikiUrl = `https://tr.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(word)}&utf8=&format=json&srlimit=5&origin=*`;
        try {
            const wikiRes = await fetch(wikiUrl);
            const wikiData = await wikiRes.json();
            if (wikiData.query && wikiData.query.search) {
                const lowerWord = word.toLocaleLowerCase('tr-TR');
                const normWord = this.normalizeForSearch(lowerWord);
                for (let item of wikiData.query.search) {
                    const snippet = item.snippet.toLocaleLowerCase('tr-TR');
                    const title = item.title.toLocaleLowerCase('tr-TR');
                    
                    if (requiredLetterLower && !title.startsWith(requiredLetterLower)) {
                        continue;
                    }
                    
                    const normTitle = this.normalizeForSearch(title);
                    const normSnippet = this.normalizeForSearch(snippet);
                    
                    if (title === lowerWord || normTitle === normWord) return true;
                    
                    if (title.includes(lowerWord) || snippet.includes(lowerWord) || normTitle.includes(normWord) || normSnippet.includes(normWord)) {
                        if (keywords.length === 0 || keywords.some(kw => {
                            const normKw = this.normalizeForSearch(kw);
                            return snippet.includes(kw) || title.includes(kw) || normSnippet.includes(normKw) || normTitle.includes(normKw);
                        })) return true;
                    }
                }
            }
        } catch (e) {}
        return false;
    }

    async validateViaLlm(catName, word, requiredLetter) {
        try {
            const prompt = `Sen bir İsim Şehir oyunu hakemisin.
Kategori: "${catName}"
Harf: "${requiredLetter}"
Kelime: "${word}"

Bu kelime bu kategoriye uygun mu ve belirtilen harfle mi başlıyor? 
Yanıtını şu JSON formatında ver: {"valid": boolean, "reason": "kısa açıklama"}`;

            const response = await fetch('/api/ai/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: 'gemini-1.5-flash',
                    prompt: prompt,
                    temperature: 0.5
                })
            });
            const data = await response.json();
            const result = JSON.parse(data.text);
            return { valid: !!result.valid, reason: result.reason || "" };
        } catch (e) {
            console.error("LLM Validation Error:", e);
            return { valid: false, reason: "Yapay zeka doğrulaması başarısız oldu." };
        }
    }

    async validateViaApi(catId, word, requiredLetterLower) {
        if (!word) return false;
        const cacheKey = `${catId}_${word}_${requiredLetterLower}`;
        if (this.apiCache[cacheKey] !== undefined) return this.apiCache[cacheKey];

        let result = false;
        try {
            if (catId === 'sehir') {
                const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(word)}&format=json&addressdetails=1&limit=1&accept-language=tr`;
                const response = await fetch(url, { headers: { 'User-Agent': 'PairaGames/1.0 (contact@pairagames.com)' } });
                const data = await response.json();
                result = data.length > 0 && ['city', 'administrative', 'town', 'province', 'state'].includes(data[0].type || data[0].addresstype);
                if (result) {
                    const nameLower = data[0].name.toLocaleLowerCase('tr-TR');
                    if (!nameLower.startsWith(requiredLetterLower)) result = false;
                }
                if (!result) result = await this.checkWikipedia(word, ['şehir', 'ilçe', 'kasaba', 'başkent'], requiredLetterLower);
            }
            else if (catId === 'ulke') {
                const url = `https://restcountries.com/v3.1/translation/${encodeURIComponent(word)}`;
                const response = await fetch(url);
                if (response.ok) {
                    const data = await response.json();
                    result = Array.isArray(data) && data.length > 0;
                    if (result) {
                        const trName = data[0].translations?.tur?.common?.toLocaleLowerCase('tr-TR');
                        if (trName && !trName.startsWith(requiredLetterLower)) {
                            result = false;
                        }
                    }
                }
                if (!result) result = await this.checkWikipedia(word, ['ülke', 'cumhuriyet', 'devlet'], requiredLetterLower);
            }
            else if (catId === 'film_dizi') {
                const url = `https://itunes.apple.com/search?term=${encodeURIComponent(word)}&country=tr&limit=5`;
                const response = await fetch(url);
                if (response.ok) {
                    const data = await response.json();
                    if (data.results) {
                        const match = data.results.find(item => 
                            item.wrapperType === 'track' && 
                            (item.kind === 'feature-movie' || item.kind === 'tv-episode') &&
                            item.trackName.toLocaleLowerCase('tr-TR').startsWith(requiredLetterLower)
                        );
                        result = !!match;
                    }
                }
                if (!result) result = await this.checkWikipedia(word, ['dizi', 'film', 'sinema', 'televizyon', 'belgesel'], requiredLetterLower);
            }
            else if (catId === 'muzik') {
                const url = `https://itunes.apple.com/search?term=${encodeURIComponent(word)}&entity=musicArtist,song&country=tr&limit=5`;
                const response = await fetch(url);
                if (response.ok) {
                    const data = await response.json();
                    if (data.results) {
                        const match = data.results.find(item => 
                            ((item.wrapperType === 'track' && item.kind === 'song') || item.wrapperType === 'artist') &&
                            (item.trackName?.toLocaleLowerCase('tr-TR').startsWith(requiredLetterLower) || item.artistName?.toLocaleLowerCase('tr-TR').startsWith(requiredLetterLower))
                        );
                        result = !!match;
                    }
                }
                if (!result) result = await this.checkWikipedia(word, ['şarkı', 'albüm', 'müzik', 'tekli', 'single'], requiredLetterLower);
            }
            else if (catId === 'sarkici') {
                const url = `https://musicbrainz.org/ws/2/artist/?query=artist:${encodeURIComponent(word)}&fmt=json`;
                const response = await fetch(url, { headers: { 'Accept': 'application/json', 'User-Agent': 'PairaGames/1.0 (contact@pairagames.com)' } });
                if (response.ok) {
                    const data = await response.json();
                    if (data.artists && data.artists.length > 0) {
                        const normWord = this.normalizeForSearch(word);
                        result = data.artists.some(artist => {
                            const artistName = artist.name.toLocaleLowerCase('tr-TR');
                            const normArtistName = this.normalizeForSearch(artistName);
                            const matchesName = artistName.includes(word.toLocaleLowerCase('tr-TR')) || normArtistName.includes(normWord) ||
                                (artist.aliases && artist.aliases.some(a => {
                                    const aliasName = a.name.toLocaleLowerCase('tr-TR');
                                    return aliasName.includes(word.toLocaleLowerCase('tr-TR')) || this.normalizeForSearch(aliasName).includes(normWord);
                                }));
                            return matchesName && artistName.startsWith(requiredLetterLower);
                        });
                    }
                }
                if (!result) result = await this.checkWikipedia(word, ['şarkıcı', 'müzisyen', 'grup', 'rapçi', 'solist'], requiredLetterLower);
            }
            else if (catId === 'yazar') {
                const url = `https://openlibrary.org/search/authors.json?q=${encodeURIComponent(word)}`;
                const response = await fetch(url);
                if (response.ok) {
                    const data = await response.json();
                    if (data.docs) {
                        result = data.docs.some(doc => doc.name.toLocaleLowerCase('tr-TR').startsWith(requiredLetterLower));
                    }
                }
                if (!result) result = await this.checkWikipedia(word, ['yazar', 'şair', 'roman', 'edebiyat'], requiredLetterLower);
            }
            else if (catId === 'hastalik') {
                result = await this.checkWikipedia(word, ['hastalık', 'sendrom', 'virüs', 'enfeksiyon', 'tıp', 'belirti', 'hastalığı'], requiredLetterLower);
            }
            else if (catId === 'spor') {
                result = await this.checkWikipedia(word, ['spor', 'oyun', 'takım', 'turnuva', 'olimpiyat'], requiredLetterLower);
            }
        } catch (e) {
            result = false;
        }

        this.apiCache[cacheKey] = result;
        return result;
    }

    async loadDictionary(catId) {
        if (this.validationCache[catId]) return this.validationCache[catId];
        try {
            const response = await fetch(`../IsimSehir/data/${catId}.json`);
            if (response.ok) {
                const arr = await response.json();
                const dict = new Set();
                const normDict = new Map();
                arr.forEach(w => {
                    const lower = w.toLocaleLowerCase('tr-TR');
                    dict.add(lower);
                    const norm = this.normalizeForSearch(lower);
                    if (!normDict.has(norm)) {
                        normDict.set(norm, new Set());
                    }
                    normDict.get(norm).add(lower);
                });
                this.validationCache[catId] = { dict, normDict };
            } else {
                this.validationCache[catId] = { dict: new Set(), normDict: new Map() };
            }
        } catch (e) {
            this.validationCache[catId] = { dict: new Set(), normDict: new Map() };
        }
        return this.validationCache[catId];
    }

    async handleTurnSubmit(playerId, answers) {
        if (!this.isHost || this.state.status !== 'PLAYING') return;
        
        const activePlayerObj = Object.values(this.state.players)[this.state.currentPlayerIndex];
        if (activePlayerObj && activePlayerObj.id === playerId) {
            if (this.state.playerAnswers[playerId] !== undefined) return;
            this.state.playerAnswers[playerId] = answers;
            await this.processAnswers(playerId);
        }
    }

    async processAnswers(playerId) {
        const answers = this.state.playerAnswers[playerId] || {};
        let word = answers[this.state.currentCategory.id] || "";
        word = word.trim().toLocaleLowerCase('tr-TR');
        
        const normWord = this.normalizeForSearch(word);
        const letterLower = this.state.letter.toLocaleLowerCase('tr-TR');
        const normLetter = this.normalizeForSearch(this.state.letter);

        let score = 0;
        let llmReason = "";

        if (word.length > 0 && normWord.startsWith(normLetter)) {
            const isCustomCat = this.state.currentCategory.id.startsWith('custom_');
            let isValidInDict = false;

            if (isCustomCat) {
                isValidInDict = word.startsWith(letterLower);
            } else {
                const dictObj = await this.loadDictionary(this.state.currentCategory.id);
                if (dictObj) {
                    if (dictObj.dict.has(word) && word.startsWith(letterLower)) {
                        isValidInDict = true;
                    } else if (dictObj.normDict.has(normWord)) {
                        const originals = dictObj.normDict.get(normWord);
                        for (const ow of originals) {
                            if (ow.startsWith(letterLower)) {
                                isValidInDict = true;
                                word = ow; // Update to original correct spelling
                                break;
                            }
                        }
                    }
                }
                
                if (!isValidInDict && ['sehir', 'ulke', 'film_dizi', 'muzik', 'sarkici', 'yazar', 'hastalik', 'spor'].includes(this.state.currentCategory.id)) {
                    isValidInDict = await this.validateViaApi(this.state.currentCategory.id, word, letterLower);
                }
                
                // Gemini Fallback if still invalid
                if (!isValidInDict) {
                    const llmRes = await this.validateViaLlm(this.state.currentCategory.name, word, this.state.letter);
                    if (llmRes.valid) {
                        isValidInDict = true;
                        llmReason = llmRes.reason;
                    }
                }
            }

            if (isValidInDict) {
                score = word.length;
            }
        }

        if (!this.state.players[playerId]) return;
        this.state.players[playerId].score += score;
        const canAppeal = (score === 0 && word.length > 0);

        if (this.onTurnResult) this.onTurnResult({ word, score, playerId, canAppeal, llmReason });

        if (canAppeal) {
            this.state.status = 'WAITING_APPEAL';
            this.state.pendingNextTurn = { playerId, word, score, category: this.state.currentCategory };
            this.state.appealTimeout = setTimeout(() => {
                if (this.state.status === 'WAITING_APPEAL') {
                    this.advanceTurn();
                }
            }, 3000);
        } else {
            setTimeout(() => {
                this.advanceTurn();
            }, 3000);
        }
    }

    handleAppeal(playerId) {
        if (!this.isHost || this.state.status !== 'WAITING_APPEAL') return;
        if (this.state.pendingNextTurn && this.state.pendingNextTurn.playerId === playerId) {
            clearTimeout(this.state.appealTimeout);
            this.state.status = 'VOTING';
            this.state.votes = { yes: 0, no: 0, votedPlayers: new Set() };
            if (this.onVoteStart) this.onVoteStart(this.state.pendingNextTurn.word, this.state.pendingNextTurn.category.name);
        }
    }

    handleVote(playerId, voteStr) {
        if (!this.isHost || this.state.status !== 'VOTING') return;
        if (!this.state.votes.votedPlayers.has(playerId)) {
            this.state.votes.votedPlayers.add(playerId);
            if (voteStr === 'yes') this.state.votes.yes++;
            else this.state.votes.no++;
            
            if (this.state.votes.votedPlayers.size >= Object.keys(this.state.players).length) {
                this.endVote();
            }
        }
    }

    endVote() {
        if (!this.isHost || this.state.status !== 'VOTING') return;
        this.state.status = 'PLAYING';
        
        const { yes, no } = this.state.votes;
        const totalVotes = yes + no;
        const isAccepted = totalVotes > 0 && yes > totalVotes / 2;
        
        const { playerId, word } = this.state.pendingNextTurn;
        
        let score = 0;
        if (isAccepted) {
            score = word.length;
            this.state.players[playerId].score += score;
        }
        
        if (this.onVoteResult) this.onVoteResult({ isAccepted, word, score, playerId });
        
        setTimeout(() => {
            this.advanceTurn();
        }, 2000);
    }

    getFinalScores(roundPlayerId, roundScore) {
        const scores = {};
        for (const pId in this.state.players) {
            scores[pId] = {
                id: pId,
                name: this.state.players[pId].name,
                roundScore: (pId === roundPlayerId) ? roundScore : 0,
                totalScore: this.state.players[pId].score
            };
        }
        return scores;
    }

    advanceTurn() {
        if (!this.isHost) return;
        
        this.state.currentPlayerIndex++;
        const totalPlayers = Object.keys(this.state.players).length;

        if (this.state.currentPlayerIndex >= totalPlayers) {
            if (this.onScoreUpdate) this.onScoreUpdate(this.getFinalScores(null, 0));
        } else {
            this.startNextTurn(this.state.round, this.state.currentPlayerIndex);
        }
    }
    
    nextRound() {
        if (!this.isHost) return;
        if (this.state.round >= this.config.rounds) {
            this.state.status = 'LOBBY';
            this.state.round = 1;
            for (const pId in this.state.players) {
                this.state.players[pId].score = 0;
            }
            this.setState(this.state);
        } else {
            this.startNextTurn(this.state.round + 1, 0);
        }
    }

    extendGame(extraRounds) {
        if (!this.isHost) return;
        this.config.rounds += extraRounds;
    }
}

/**
 * HizliIsimSehirView - Handles DOM
 */
class HizliIsimSehirView {
    constructor(callbacks) {
        this.callbacks = callbacks;
        this.myId = null;
        this.currentTimer = null;
        this.voteTimer = null;
        this.autoNextRoundTimer = null;
        
        this.defaultCategories = [
            { id: 'isim', name: 'İsim' }, { id: 'sehir', name: 'Şehir' }, { id: 'hayvan', name: 'Hayvan' },
            { id: 'bitki', name: 'Bitki' }, { id: 'esya', name: 'Eşya' }, { id: 'ulke', name: 'Ülke' },
            { id: 'unlu', name: 'Ünlü' }, { id: 'meslek', name: 'Meslek' }, { id: 'renk', name: 'Renk' },
            { id: 'film_dizi', name: 'Film/Dizi' }, { id: 'marka', name: 'Marka' }, { id: 'yiyecek', name: 'Yiyecek' },
            { id: 'oyun', name: 'Oyun' }, { id: 'muzik', name: 'Müzik' }, { id: 'spor', name: 'Spor' },
            { id: 'hastalik', name: 'Hastalık' }, { id: 'yazar', name: 'Yazar' }, { id: 'sarkici', name: 'Şarkıcı' }
        ];

        this.bindEvents();
        this.renderCategories();
    }

    setMyId(id) {
        this.myId = id;
    }

    escapeHtml(text) {
        if (text == null) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    switchScreen(screenId) {
        ['lobby-screen', 'game-screen', 'score-screen'].forEach(id => {
            const el = document.getElementById(id);
            if(el) {
                el.classList.remove('active');
                el.classList.add('hidden');
            }
        });
        const target = document.getElementById(screenId);
        if(target) {
            target.classList.remove('hidden');
            target.classList.add('active');
        }
    }

    renderCategories() {
        const sel = document.getElementById('category-selection');
        if (!sel) return;
        sel.innerHTML = '';
        this.defaultCategories.forEach(cat => {
            const label = document.createElement('label');
            label.className = 'cat-checkbox';
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.value = cat.id;
            checkbox.dataset.name = cat.name;
            if (['isim', 'sehir', 'hayvan', 'esya', 'bitki'].includes(cat.id)) checkbox.checked = true;
            
            checkbox.addEventListener('change', () => this.callbacks.onConfigUpdate(this.getLocalConfig()));
            label.appendChild(checkbox);
            label.appendChild(document.createTextNode(' ' + cat.name));
            sel.appendChild(label);
        });
    }

    getLocalConfig() {
        const categories = [];
        document.querySelectorAll('#category-selection input:checked').forEach(cb => {
            categories.push({ id: cb.value, name: cb.dataset.name });
        });
        return {
            rounds: parseInt(document.getElementById('setting-rounds')?.value) || 3,
            endValue: parseInt(document.getElementById('setting-end-value')?.value) || 15,
            categories
        };
    }

    bindEvents() {
        document.getElementById('setting-rounds')?.addEventListener('change', () => this.callbacks.onConfigUpdate(this.getLocalConfig()));
        document.getElementById('setting-end-value')?.addEventListener('change', () => this.callbacks.onConfigUpdate(this.getLocalConfig()));

        document.getElementById('btn-add-custom-cat')?.addEventListener('click', () => {
            const input = document.getElementById('custom-cat-input');
            const val = input.value.trim();
            if (val) {
                const id = 'custom_' + Date.now();
                const label = document.createElement('label');
                label.className = 'cat-checkbox';
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.value = id;
                checkbox.dataset.name = val;
                checkbox.checked = true;
                checkbox.addEventListener('change', () => this.callbacks.onConfigUpdate(this.getLocalConfig()));
                
                label.appendChild(checkbox);
                label.appendChild(document.createTextNode(' ' + val));
                document.getElementById('category-selection').appendChild(label);
                
                input.value = '';
                this.callbacks.onConfigUpdate(this.getLocalConfig());
            }
        });

        document.getElementById('btn-start-game')?.addEventListener('click', () => {
            const config = this.getLocalConfig();
            if (config.categories.length === 0) {
                if (window.showToast) window.showToast("En az bir kategori seçin.", "warning");
                return;
            }
            this.callbacks.onStartGame(config);
        });

        document.getElementById('btn-finish-turn')?.addEventListener('click', () => {
            const btn = document.getElementById('btn-finish-turn');
            if (btn.disabled) return;
            btn.disabled = true;
            btn.classList.remove('pulse');
            document.getElementById('finish-status-text').textContent = 'Cevap gönderildi...';
            
            const input = document.getElementById('compact-game-input');
            if (input) input.disabled = true;
            
            const answers = {};
            if (input && input.dataset.catId) {
                answers[input.dataset.catId] = input.value.trim();
            }
            this.callbacks.onFinishTurn(answers);
        });

        document.getElementById('compact-game-input')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') document.getElementById('btn-finish-turn')?.click();
        });

        document.getElementById('btn-appeal')?.addEventListener('click', () => {
            const btn = document.getElementById('btn-appeal');
            btn.disabled = true;
            btn.textContent = 'İtiraz Edildi!';
            this.callbacks.onAppeal();
        });

        document.getElementById('btn-vote-yes')?.addEventListener('click', () => {
            document.getElementById('btn-vote-yes').disabled = true;
            document.getElementById('btn-vote-no').disabled = true;
            this.callbacks.onVote('yes');
        });
        
        document.getElementById('btn-vote-no')?.addEventListener('click', () => {
            document.getElementById('btn-vote-yes').disabled = true;
            document.getElementById('btn-vote-no').disabled = true;
            this.callbacks.onVote('no');
        });

        document.getElementById('btn-next-round')?.addEventListener('click', () => {
            clearInterval(this.autoNextRoundTimer);
            this.callbacks.onNextRound();
        });

        document.getElementById('btn-extend-game')?.addEventListener('click', () => {
            const extra = parseInt(document.getElementById('extend-rounds-input')?.value) || 1;
            document.getElementById('extend-game-group').classList.add('hidden');
            document.getElementById('btn-next-round').textContent = 'Sonraki Tura Geç';
            this.callbacks.onExtendGame(extra);
        });
    }

    updateClientConfig(config) {
        const preview = document.getElementById('client-cats-preview');
        if (!preview) return;
        preview.innerHTML = `<strong>Kategoriler (${config.categories.length}):</strong><br> ${config.categories.map(c=>c.name).join(', ')}`;
    }

    renderPlayersCircle(players, currentPlayerIndex) {
        const circle = document.getElementById('players-circle');
        if (!circle) return;
        circle.innerHTML = '';
        const playersArr = Object.values(players);
        const rx = 40; const ry = 38;
        const startAngle = 180;
        
        playersArr.forEach((p, index) => {
            const node = document.createElement('div');
            node.className = `player-node ${index === currentPlayerIndex ? 'active-turn' : ''}`;
            const angle = startAngle + (index * (360 / playersArr.length));
            const rad = angle * (Math.PI / 180);
            node.style.left = `calc(50% + ${Math.cos(rad) * rx}%)`;
            node.style.top = `calc(50% + ${Math.sin(rad) * ry}%)`;
            
            node.innerHTML = `
                <div class="node-avatar">👽</div>
                <div class="node-name">${this.escapeHtml(p.name)}</div>
                <div class="node-score">${p.score || 0}</div>
            `;
            circle.appendChild(node);
        });
    }

    updateGameUI(state) {
        this.switchScreen('game-screen');
        this.renderPlayersCircle(state.players, state.currentPlayerIndex);
        
        const playersArr = Object.values(state.players);
        const currentPlayer = playersArr[state.currentPlayerIndex];
        const isMyTurn = currentPlayer && currentPlayer.id === this.myId;

        document.getElementById('current-letter').textContent = state.letter;
        document.getElementById('current-category-name').textContent = state.currentCategory.name;

        const turnInd = document.getElementById('turn-indicator-text');
        if (turnInd) {
            if (isMyTurn) {
                turnInd.textContent = "Senin Sıran!";
                turnInd.style.color = "var(--lilac)";
                turnInd.style.fontWeight = "bold";
            } else {
                turnInd.textContent = `Sıra: ${currentPlayer ? this.escapeHtml(currentPlayer.name) : 'Bekleniyor'}`;
                turnInd.style.color = "var(--text-main)";
                turnInd.style.fontWeight = "normal";
            }
        }

        document.getElementById('finish-status-text').textContent = '';
        document.getElementById('appeal-area').classList.add('hidden');

        const input = document.getElementById('compact-game-input');
        if (input) {
            input.value = '';
            input.dataset.catId = state.currentCategory.id;
            input.disabled = !isMyTurn;
            input.oninput = (e) => {
                if (e.target.value.length > 0) {
                    e.target.value = e.target.value.charAt(0).toLocaleUpperCase('tr-TR') + e.target.value.slice(1);
                }
            };
            if (isMyTurn) setTimeout(() => input.focus(), 100);
        }

        const btnFinish = document.getElementById('btn-finish-turn');
        if (btnFinish) {
            btnFinish.disabled = !isMyTurn;
            if (isMyTurn) btnFinish.classList.add('pulse');
            else btnFinish.classList.remove('pulse');
        }
    }

    startTimer(endTime) {
        clearInterval(this.currentTimer);
        const tick = () => {
            const left = Math.max(0, Math.floor((endTime - window.PairaTime.now()) / 1000));
            const m = Math.floor(left / 60).toString().padStart(2, '0');
            const s = (left % 60).toString().padStart(2, '0');
            const d = document.getElementById('timer-display');
            if (d) d.textContent = `${m}:${s}`;
            
            const st = document.getElementById('timer-status-text');
            if (st) { st.style.display = 'block'; st.textContent = 'Süre başladı!'; }
            
            if (left <= 0) {
                clearInterval(this.currentTimer);
                this.callbacks.onTimeUp();
            }
        };
        tick();
        this.currentTimer = setInterval(tick, 1000);
    }

    stopTimer() {
        clearInterval(this.currentTimer);
    }

    showTurnResult(word, score, playerId, canAppeal) {
        const text = document.getElementById('finish-status-text');
        if (text) {
            if (score > 0) {
                text.textContent = `Doğru! "${word}" = +${score} puan`;
                text.style.color = 'var(--success)';
            } else {
                text.textContent = `Yanlış veya Boş! +0 puan`;
                text.style.color = 'var(--danger)';
            }
        }
        
        const appealArea = document.getElementById('appeal-area');
        const btnAppeal = document.getElementById('btn-appeal');
        if (appealArea && btnAppeal) {
            if (canAppeal && playerId === this.myId) {
                appealArea.classList.remove('hidden');
                let secs = 3;
                btnAppeal.textContent = `İtiraz Et (${secs})`;
                btnAppeal.disabled = false;
                const ival = setInterval(() => {
                    secs--;
                    if (secs <= 0) { clearInterval(ival); appealArea.classList.add('hidden'); }
                    else if (!btnAppeal.disabled) btnAppeal.textContent = `İtiraz Et (${secs})`;
                }, 1000);
            } else {
                appealArea.classList.add('hidden');
            }
        }
    }

    showVotingUI(word, categoryName) {
        document.getElementById('voting-overlay')?.classList.remove('hidden');
        document.getElementById('voting-text').innerHTML = `<strong>${this.escapeHtml(categoryName)}</strong> kategorisi için <strong>"${this.escapeHtml(word)}"</strong> kelimesi kabul edilsin mi?`;
        document.getElementById('vote-yes-count').textContent = '0';
        document.getElementById('vote-no-count').textContent = '0';
        document.getElementById('voting-status-text').textContent = '';
        
        document.getElementById('btn-vote-yes').disabled = false;
        document.getElementById('btn-vote-no').disabled = false;
        
        let secs = 10;
        const tel = document.getElementById('voting-timer');
        if (tel) tel.textContent = `Süre: ${secs}`;
        clearInterval(this.voteTimer);
        this.voteTimer = setInterval(() => {
            secs--;
            if (tel) tel.textContent = `Süre: ${secs}`;
            if (secs <= 0) { clearInterval(this.voteTimer); if (this.callbacks.onVoteTimeout) this.callbacks.onVoteTimeout(); }
        }, 1000);
    }
    
    updateVoteCount(yes, no) {
        document.getElementById('vote-yes-count').textContent = yes;
        document.getElementById('vote-no-count').textContent = no;
    }

    showVoteResult(isAccepted) {
        const text = document.getElementById('voting-status-text');
        if (text) {
            if (isAccepted) {
                text.textContent = 'Oylama Sonucu: KABUL EDİLDİ!';
                text.style.color = 'var(--success)';
            } else {
                text.textContent = 'Oylama Sonucu: REDDEDİLDİ!';
                text.style.color = 'var(--danger)';
            }
        }
        setTimeout(() => {
            document.getElementById('voting-overlay')?.classList.add('hidden');
            clearInterval(this.voteTimer);
        }, 2000);
    }

    renderScoreboard(scores, isHost, currentRound, totalRounds) {
        this.switchScreen('score-screen');
        const body = document.getElementById('scoreboard-body');
        if (!body) return;
        body.innerHTML = '';
        const sorted = Object.values(scores).sort((a,b) => b.totalScore - a.totalScore);
        
        sorted.forEach((s, idx) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${idx+1}</td>
                <td>${this.escapeHtml(s.name)}${s.id === this.myId ? ' (Sen)' : ''}</td>
                <td>+${s.roundScore}</td>
                <td><strong>${s.totalScore}</strong></td>
            `;
            body.appendChild(tr);
        });

        if (isHost) {
            const btn = document.getElementById('btn-next-round');
            const ext = document.getElementById('extend-game-group');
            if (btn) {
                btn.classList.remove('hidden');
                clearInterval(this.autoNextRoundTimer);
                if (currentRound > totalRounds) {
                    btn.textContent = 'Lobiye Dön';
                    if (ext) ext.classList.remove('hidden');
                } else {
                    if (ext) ext.classList.add('hidden');
                    let secs = 5;
                    btn.textContent = `Sonraki Tura Geç (${secs})`;
                    this.autoNextRoundTimer = setInterval(() => {
                        secs--;
                        if (secs <= 0) { clearInterval(this.autoNextRoundTimer); btn.click(); }
                        else btn.textContent = `Sonraki Tura Geç (${secs})`;
                    }, 1000);
                }
            }
        }
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { HizliIsimSehirGameEngine, HizliIsimSehirView };
} else {
    window.HizliIsimSehirGameEngine = HizliIsimSehirGameEngine;
    window.HizliIsimSehirView = HizliIsimSehirView;
}
