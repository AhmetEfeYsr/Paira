// ui.js
// Handles UI updates and rendering

const els = {
    screens: {
        lobby: document.getElementById('lobby-screen'),
        game: document.getElementById('game-screen'),
        score: document.getElementById('score-screen')
    },
    lobby: {
        codeDisplay: document.getElementById('display-room-code'),
        btnToggleCode: document.getElementById('btn-toggle-code'),
        btnCopy: document.getElementById('btn-copy-room'),
        playerCount: document.getElementById('player-count'),
        playersList: document.getElementById('players-list'),
        hostSettings: document.getElementById('host-settings'),
        clientWaiting: document.getElementById('client-waiting'),
        hostNameDisplay: document.getElementById('host-name-display'),
        btnStart: document.getElementById('btn-start-game'),
        discussionTime: document.getElementById('setting-discussion-time'),
        rmPlayerCount: document.getElementById('rm-player-count'),
        rmAssignedCount: document.getElementById('rm-assigned-count'),
        rmRemainingCount: document.getElementById('rm-remaining-count'),
        rolesContainer: document.getElementById('roles-container')
    },
    game: {
        phase: document.getElementById('current-phase'),
        day: document.getElementById('current-day'),
        myRole: document.getElementById('my-role'),
        myRoleContainer: document.getElementById('my-role-container'),
        roleTooltip: document.getElementById('role-tooltip'),
        timer: document.getElementById('timer-display'),
        actionTitle: document.getElementById('action-title'),
        actionPlayers: document.getElementById('action-players-container'),
        btnSkip: document.getElementById('btn-skip-action'),
        btnConfirm: document.getElementById('btn-confirm-action'),
        logs: document.getElementById('game-logs'),
        actionPanel: document.getElementById('action-panel'),
        rolesList: document.getElementById('roles-list'),
        privateLogs: document.getElementById('private-info-logs'),
        animOverlay: document.getElementById('animation-overlay'),
        animStatusText: document.getElementById('animation-status-text'),
        roleModal: document.getElementById('role-modal'),
        roleModalName: document.getElementById('role-modal-name'),
        roleModalDesc: document.getElementById('role-modal-desc'),
        btnCloseRoleModal: document.getElementById('btn-close-role-modal'),
        chatForm: document.getElementById('chat-form'),
        chatInput: document.getElementById('chat-input'),
        willNotes: document.getElementById('personal-notes')
    },
    score: {
        title: document.getElementById('end-game-title'),
        winner: document.getElementById('winner-text'),
        body: document.getElementById('endgame-body'),
        btnPlayAgain: document.getElementById('btn-play-again')
    }
};

function setupUI() {
    els.lobby.codeDisplay.dataset.code = roomCode;
    
    document.getElementById('btn-leave-lobby')?.addEventListener('click', async () => {
        const confirmed = await window.pairaConfirm({
            title: "Lobiden Ayrıl",
            message: "Lobiden ayrılmak istediğinize emin misiniz?",
            confirmText: "Ayrıl",
            cancelText: "Kal",
            confirmType: "danger"
        });
        if (confirmed) window.location.href = 'index.html';
    });

    document.getElementById('btn-leave-game')?.addEventListener('click', async () => {
        const confirmed = await window.pairaConfirm({
            title: "Oyundan Ayrıl",
            message: "Devam eden oyundan ayrılmak istediğinize emin misiniz?",
            confirmText: "Ayrıl",
            cancelText: "Oyuna Dön",
            confirmType: "danger"
        });
        if (confirmed) window.location.href = 'index.html';
    });

    els.lobby.btnToggleCode.addEventListener('click', () => {
        const isHidden = els.lobby.codeDisplay.textContent.includes('•');
        els.lobby.codeDisplay.textContent = isHidden ? roomCode : '••••••••';
        document.getElementById('icon-eye-open').classList.toggle('hidden', isHidden);
        document.getElementById('icon-eye-closed').classList.toggle('hidden', !isHidden);
        if (window.PairaAudio) window.PairaAudio.play('pop');
    });

    els.lobby.btnCopy.addEventListener('click', () => {
        window.copyToClipboard(roomCode, "Oda kodu panoya kopyalandı!");
    });

    if (isHost) {
        els.lobby.hostSettings.classList.remove('hidden');
        els.lobby.btnStart.addEventListener('click', handleStartGame);
        els.score.btnPlayAgain.classList.remove('hidden');
        els.score.btnPlayAgain.addEventListener('click', handlePlayAgain);
        initRoleManagementUI();
    } else {
        els.lobby.clientWaiting.classList.remove('hidden');
    }
    
    els.game.btnSkip.addEventListener('click', () => {
        submitAction('skip');
        if(window.gameScene) {
            Object.values(window.gameScene.playerModels).forEach(p => p.setHighlight(false));
        }
        showToast("Aksiyon pas geçildi.", "info");
        showWaitingActionPanel();
    });

    els.game.btnConfirm.addEventListener('click', () => {
        if (pendingActionTarget) {
            submitAction(pendingActionTarget);
            pendingActionTarget = null;
            if(window.gameScene) {
                Object.values(window.gameScene.playerModels).forEach(p => p.setHighlight(false));
            }
            showToast("Aksiyon onaylandı.", "success");
            showWaitingActionPanel();
        }
    });

    els.game.btnCloseRoleModal.addEventListener('click', () => {
        els.game.roleModal.classList.add('hidden');
    });

    document.getElementById('btn-role-info').addEventListener('click', () => {
        const myPlayer = gameState.players[myId];
        if (myPlayer && myPlayer.role) {
            const rDef = ROLES[myPlayer.role];
            if (rDef) {
                showRoleModal(rDef.name, rDef.desc || '');
            }
        }
    });

    // Hover & Click for Role (Mobile Support)
    els.game.myRoleContainer.addEventListener('mouseenter', () => {
        if (els.game.roleTooltip.textContent) {
            els.game.roleTooltip.classList.remove('hidden');
        }
    });
    els.game.myRoleContainer.addEventListener('mouseleave', () => {
        els.game.roleTooltip.classList.add('hidden');
    });
    els.game.myRoleContainer.addEventListener('click', () => {
        if (els.game.roleTooltip.textContent) {
            els.game.roleTooltip.classList.toggle('hidden');
        }
    });

    els.game.chatForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const msg = els.game.chatInput.value.trim();
        if(msg) {
            network.sendToHost({ type: 'CHAT_MESSAGE', msg: msg });
            els.game.chatInput.value = '';
        }
    });

    els.game.willNotes.addEventListener('input', () => {
        // Debounced will update
        clearTimeout(els.game.willNotes.timeout);
        els.game.willNotes.timeout = setTimeout(() => {
            const willText = els.game.willNotes.value.trim();
            network.sendToHost({ type: 'UPDATE_WILL', will: willText });
            
            // Show saved feedback
            let feedback = document.getElementById('will-saved-feedback');
            if(!feedback) {
                feedback = document.createElement('span');
                feedback.id = 'will-saved-feedback';
                feedback.style.color = 'var(--success)';
                feedback.style.fontSize = '0.75rem';
                feedback.style.marginLeft = '10px';
                feedback.innerHTML = '✓ Kaydedildi';
                
                // insert near h4
                const willHeader = els.game.willNotes.previousElementSibling;
                if(willHeader) {
                    willHeader.style.display = 'flex';
                    willHeader.style.justifyContent = 'space-between';
                    willHeader.appendChild(feedback);
                }
            }
            feedback.style.opacity = '1';
            setTimeout(() => { feedback.style.opacity = '0'; }, 2000);
            
        }, 1000);
    });
}

function showWaitingActionPanel() {
    els.game.actionTitle.textContent = "Diğer oyuncular bekleniyor...";
    els.game.actionPlayers.style.display = 'none';
    els.game.btnSkip.classList.add('hidden');
    els.game.btnConfirm.classList.add('hidden');
    // Ensure the panel is centered and visible
    els.game.actionPanel.style.left = '50%';
    els.game.actionPanel.style.top = '50%';
    els.game.actionPanel.style.display = 'flex';
}

function updateLobbyPlayersList(playersObj) {
    els.lobby.playersList.innerHTML = '';
    const players = Object.values(playersObj);
    els.lobby.playerCount.textContent = players.length;

    players.forEach(p => {
        const li = document.createElement('li');
        li.innerHTML = `<span>${window.escapeHtml(p.name)}</span>${p.isHost ? '<span style="font-size: 0.8rem; background: var(--lilac); color: var(--bg-deep); padding: 2px 8px; border-radius: 10px; font-weight: bold;">Kurucu</span>' : ''}`;
        els.lobby.playersList.appendChild(li);
        if (p.isHost) els.lobby.hostNameDisplay.textContent = p.name;
    });

    if (isHost) updateRoleManagementStats();
}

function initRoleManagementUI() {
    if (!els.lobby.rolesContainer) return;
    els.lobby.rolesContainer.innerHTML = '';
    
    // Default roles that we want to pre-fill (1 vampir, rest 0)
    const teams = {
        'RASTGELE': { name: 'Rastgele Seçenekler', color: 'var(--neon-purple)' },
        'KOY': { name: 'Yeşil Takım (İyiler)', color: 'var(--success)' },
        'VAMPIR': { name: 'Kırmızı Takım (Kötüler)', color: 'var(--danger)' },
        'TARAFSIZ': { name: 'Mavi Takım (Nötr)', color: '#3b82f6' }
    };
    
    const rolesByTeam = { 'RASTGELE': [], 'KOY': [], 'VAMPIR': [], 'TARAFSIZ': [] };
    
    Object.keys(ROLES).forEach(roleKey => {
        if (roleKey === 'KOYLU') return; // Köylü is calculated automatically
        const r = ROLES[roleKey];
        if (rolesByTeam[r.team]) rolesByTeam[r.team].push({ key: roleKey, ...r });
    });
    
    Object.keys(teams).forEach(teamKey => {
        if (rolesByTeam[teamKey].length === 0) return;
        
        const groupDiv = document.createElement('div');
        groupDiv.style.marginBottom = '10px';
        
        const header = document.createElement('h5');
        header.textContent = teams[teamKey].name;
        header.style.margin = '0 0 8px 0';
        header.style.color = teams[teamKey].color;
        header.style.borderBottom = '1px solid rgba(255,255,255,0.1)';
        header.style.paddingBottom = '4px';
        
        groupDiv.appendChild(header);
        
        const listDiv = document.createElement('div');
        listDiv.style.display = 'flex';
        listDiv.style.flexDirection = 'column';
        listDiv.style.gap = '6px';
        
        rolesByTeam[teamKey].forEach(role => {
            const roleRow = document.createElement('div');
            roleRow.style.display = 'flex';
            roleRow.style.justifyContent = 'space-between';
            roleRow.style.alignItems = 'center';
            roleRow.style.background = 'rgba(0,0,0,0.2)';
            roleRow.style.padding = '6px 10px';
            roleRow.style.borderRadius = '6px';
            
            const nameSpan = document.createElement('span');
            nameSpan.className = 'custom-tooltip-wrapper';
            nameSpan.textContent = role.name;
            nameSpan.style.fontSize = '0.9rem';
            if (role.uiColor) nameSpan.style.color = role.uiColor;
            
            const tooltipContent = document.createElement('span');
            tooltipContent.className = 'custom-tooltip-content';
            tooltipContent.textContent = role.desc;
            nameSpan.appendChild(tooltipContent);
            
            const ctrlDiv = document.createElement('div');
            
            if (['RASTGELE_IYI', 'RASTGELE_KOTU', 'RASTGELE_NOTR'].includes(role.key)) {
                const btnConfig = document.createElement('button');
                btnConfig.className = 'btn btn-secondary';
                btnConfig.innerHTML = '⚙️';
                btnConfig.title = 'Hangi rollerin seçilebileceğini ayarla';
                btnConfig.style.padding = '2px 6px';
                btnConfig.style.background = 'transparent';
                btnConfig.style.border = 'none';
                btnConfig.style.fontSize = '1.1rem';
                btnConfig.onclick = () => window.openRandomRoleConfig(role.key);
                ctrlDiv.appendChild(btnConfig);
            }
            ctrlDiv.style.display = 'flex';
            ctrlDiv.style.alignItems = 'center';
            ctrlDiv.style.gap = '8px';
            
            const btnMinus = document.createElement('button');
            btnMinus.className = 'btn btn-secondary';
            btnMinus.style.padding = '2px 8px';
            btnMinus.style.minWidth = '28px';
            btnMinus.textContent = '-';
            
            const valSpan = document.createElement('span');
            valSpan.className = 'role-count-val';
            valSpan.dataset.roleKey = role.key;
            valSpan.textContent = role.key === 'VAMPIR' ? '1' : '0';
            valSpan.style.width = '20px';
            valSpan.style.textAlign = 'center';
            valSpan.style.fontWeight = 'bold';
            
            const btnPlus = document.createElement('button');
            btnPlus.className = 'btn btn-secondary';
            btnPlus.style.padding = '2px 8px';
            btnPlus.style.minWidth = '28px';
            btnPlus.textContent = '+';
            
            btnMinus.onclick = () => {
                let v = parseInt(valSpan.textContent);
                if (v > 0) {
                    valSpan.textContent = v - 1;
                    updateRoleManagementStats();
                }
            };
            
            btnPlus.onclick = () => {
                let v = parseInt(valSpan.textContent);
                valSpan.textContent = v + 1;
                updateRoleManagementStats();
            };
            
            ctrlDiv.appendChild(btnMinus);
            ctrlDiv.appendChild(valSpan);
            ctrlDiv.appendChild(btnPlus);
            
            roleRow.appendChild(nameSpan);
            roleRow.appendChild(ctrlDiv);
            listDiv.appendChild(roleRow);
        });
        
        groupDiv.appendChild(listDiv);
        els.lobby.rolesContainer.appendChild(groupDiv);
    });
    
    updateRoleManagementStats();
}

window.customRandomPools = null;

window.openRandomRoleConfig = (roleKey) => {
    if (!window.customRandomPools) {
        window.customRandomPools = {
            'RASTGELE_IYI': [],
            'RASTGELE_KOTU': [],
            'RASTGELE_NOTR': []
        };
        Object.keys(ROLES).forEach(k => {
            let r = ROLES[k];
            if (r.isRandom || k === 'KOYLU') return;
            if (r.team === 'KOY') window.customRandomPools['RASTGELE_IYI'].push(k);
            else if (r.team === 'VAMPIR') window.customRandomPools['RASTGELE_KOTU'].push(k);
            else if (r.team === 'TARAFSIZ') window.customRandomPools['RASTGELE_NOTR'].push(k);
        });
    }

    let targetTeam = '';
    if (roleKey === 'RASTGELE_IYI') targetTeam = 'KOY';
    else if (roleKey === 'RASTGELE_KOTU') targetTeam = 'VAMPIR';
    else if (roleKey === 'RASTGELE_NOTR') targetTeam = 'TARAFSIZ';

    let availableRoles = Object.keys(ROLES).filter(k => {
        let r = ROLES[k];
        return !r.isRandom && k !== 'KOYLU' && r.team === targetTeam;
    });

    // Create Modal UI
    let modalOverlay = document.getElementById('random-roles-overlay');
    if (!modalOverlay) {
        modalOverlay = document.createElement('div');
        modalOverlay.id = 'random-roles-overlay';
        modalOverlay.className = 'random-roles-modal-overlay';
        document.body.appendChild(modalOverlay);

        const modal = document.createElement('div');
        modal.id = 'random-roles-modal';
        modal.className = 'random-roles-modal';
        
        modal.innerHTML = `
            <h3 id="rr-modal-title" style="margin-bottom: 5px;">Rol Havuzu</h3>
            <p style="font-size:0.85rem; color:#aaa; margin-bottom:10px;">Bu rastgele kategori için seçilebilecek rolleri işaretleyin.</p>
            <div id="rr-modal-list" class="random-roles-list"></div>
            <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:10px;">
                <button id="rr-modal-close" class="btn btn-primary">Tamam</button>
            </div>
        `;
        document.body.appendChild(modal);

        document.getElementById('rr-modal-close').onclick = () => {
            document.getElementById('random-roles-overlay').classList.add('hidden');
            document.getElementById('random-roles-modal').classList.add('hidden');
        };
    }

    document.getElementById('rr-modal-title').textContent = ROLES[roleKey].name + " Havuzu";
    const listDiv = document.getElementById('rr-modal-list');
    listDiv.innerHTML = '';

    availableRoles.forEach(k => {
        const lbl = document.createElement('label');
        const chk = document.createElement('input');
        chk.type = 'checkbox';
        chk.checked = window.customRandomPools[roleKey].includes(k);
        
        chk.onchange = (e) => {
            if (e.target.checked) {
                if (!window.customRandomPools[roleKey].includes(k)) {
                    window.customRandomPools[roleKey].push(k);
                }
            } else {
                window.customRandomPools[roleKey] = window.customRandomPools[roleKey].filter(id => id !== k);
            }
        };

        const span = document.createElement('span');
        span.textContent = ROLES[k].name;
        
        lbl.appendChild(chk);
        lbl.appendChild(span);
        listDiv.appendChild(lbl);
    });

    document.getElementById('random-roles-overlay').classList.remove('hidden');
    document.getElementById('random-roles-modal').classList.remove('hidden');
};

function updateRoleManagementStats() {
    if (!isHost || !els.lobby.rmPlayerCount) return;
    
    let pCount = Object.keys(gameState.players).length;
    if (pCount === 0 && network && network.players) pCount = Object.keys(network.players).length;
    
    els.lobby.rmPlayerCount.textContent = pCount;
    
    let assigned = 0;
    document.querySelectorAll('.role-count-val').forEach(el => {
        assigned += parseInt(el.textContent) || 0;
    });
    
    els.lobby.rmAssignedCount.textContent = assigned;
    
    let rem = pCount - assigned;
    els.lobby.rmRemainingCount.textContent = rem;
    
    if (rem < 0) {
        els.lobby.rmRemainingCount.style.color = 'var(--danger)';
    } else {
        els.lobby.rmRemainingCount.style.color = 'var(--success)';
    }
}

function switchScreen(screenId) {
    Object.values(els.screens).forEach(s => { s.classList.remove('active'); s.classList.add('hidden'); });
    const target = document.getElementById(screenId);
    if (target) { target.classList.remove('hidden'); target.classList.add('active'); }
    if (screenId === 'game-screen') {
        document.body.classList.add('game-active');
    } else {
        document.body.classList.remove('game-active');
    }
}

function updateUIForState() {
    if (gameState.status === 'LOBBY') switchScreen('lobby-screen');
    else if (gameState.status === 'END') { switchScreen('score-screen'); renderEndGame(); }
    else { switchScreen('game-screen'); renderGameScreen(); }
}

function renderRolesHUD() {
    els.game.rolesList.innerHTML = '';
    let roleCounts = gameState.roleCounts;
    if (!roleCounts) {
        roleCounts = {};
        Object.values(gameState.players).forEach(p => {
            let rKey = p.role;
            if (rKey) {
                roleCounts[rKey] = (roleCounts[rKey] || 0) + 1;
            }
        });
    }
    
    // roleCounts can contain roleKeys or roleNames depending on broadcast version,
    // we updated it to send proper counts, but let's handle both.
    // If it's a name, we try to match it back to find the icon.
    Object.entries(roleCounts).forEach(([rKeyOrName, count]) => {
        let roleDef = ROLES[rKeyOrName];
        if (!roleDef) {
            roleDef = Object.values(ROLES).find(r => r.name === rKeyOrName);
        }
        
        const span = document.createElement('span');
        span.className = 'custom-tooltip-wrapper';
        span.style.cursor = 'help';
        span.textContent = roleDef?.icon || '❓';
        
        const countBadge = document.createElement('div');
        countBadge.textContent = count;
        countBadge.style.position = 'absolute';
        countBadge.style.bottom = '-5px';
        countBadge.style.right = '-5px';
        countBadge.style.background = 'var(--bg-deep)';
        countBadge.style.color = 'white';
        countBadge.style.fontSize = '0.65rem';
        countBadge.style.width = '16px';
        countBadge.style.height = '16px';
        countBadge.style.borderRadius = '50%';
        countBadge.style.display = 'flex';
        countBadge.style.alignItems = 'center';
        countBadge.style.justifyContent = 'center';
        countBadge.style.border = '1px solid var(--neon-purple)';
        span.appendChild(countBadge);

        const tooltip = document.createElement('span');
        tooltip.className = 'custom-tooltip-content';
        tooltip.style.fontSize = '0.8rem';
        tooltip.style.whiteSpace = 'pre-wrap';
        tooltip.style.minWidth = '180px';
        tooltip.innerHTML = `<strong>${roleDef?.name || rKeyOrName}</strong><br/>${roleDef?.desc || ''}`;
        span.appendChild(tooltip);
        
        els.game.rolesList.appendChild(span);
    });
}

function showRoleModal(roleName, roleDesc) {
    els.game.roleModalName.textContent = roleName;
    els.game.roleModalDesc.textContent = roleDesc;
    els.game.roleModal.classList.remove('hidden');
}

function renderGameScreen() {
    renderRolesHUD();

    els.game.phase.textContent = gameState.status === 'NIGHT' ? 'Gece' : (gameState.status.includes('DAY') ? 'Gündüz' : (gameState.status === 'VOTING' ? 'Oylama' : 'Animasyon'));
    els.game.day.textContent = gameState.dayCount;
    
    const myPlayer = gameState.players[myId];
    let rDef = null;

    if (myPlayer && myPlayer.role) {
        rDef = ROLES[myPlayer.role];
        let roleText = rDef?.name || myPlayer.role;
        if (rDef && rDef.maxUses) {
            let used = myPlayer.usedAbility ? 0 : 1;
            roleText += ` (Mermi: ${used}/${rDef.maxUses})`;
        }
        els.game.myRole.textContent = roleText;
        
        if (rDef) {
            els.game.roleTooltip.textContent = rDef.desc || '';
            if (!roleModalShown && gameState.dayCount === 1 && gameState.status === 'NIGHT') {
                roleModalShown = true;
                showRoleModal(rDef.name, rDef.desc || '');
            }
        }
    } else {
        els.game.myRole.textContent = 'Seyirci';
    }
    
    if(myPlayer && myPlayer.will) {
        els.game.willNotes.value = myPlayer.will;
    }
    
    renderLogs();
    
    if (gameState.status.includes('ANIMATION')) {
        els.game.animOverlay.classList.remove('hidden');
        els.game.animStatusText.textContent = gameState.status === 'NIGHT_ANIMATION'
            ? 'Gece sonuçları hesaplanıyor...'
            : 'Oylama sonucu uygulanıyor...';
    } else {
        els.game.animOverlay.classList.add('hidden');
    }
    
    if (!myPlayer || !myPlayer.isAlive || gameState.status.includes('ANIMATION')) {
        els.game.actionPanel.classList.add('hidden');
        return;
    }
    
    els.game.actionPanel.classList.remove('hidden');
    els.game.btnSkip.classList.add('hidden');
    els.game.btnConfirm.classList.add('hidden');
    pendingActionTarget = null;
    els.game.actionPlayers.innerHTML = '';
    els.game.actionPlayers.style.display = 'none';

    if (gameState.status === 'NIGHT') {
        if (rDef && rDef.hasNightAction) {
            if (myPlayer.role === 'HIRSIZ' && gameState.dayCount > 1) {
                els.game.actionPanel.classList.add('hidden');
                return;
            }
            let fakeRole = myPlayer.fakeRole;
            let isDedektif = myPlayer.role === 'DEDEKTIF' || (myPlayer.role === 'DELI' && fakeRole === 'DEDEKTIF');
            els.game.actionTitle.textContent = isDedektif ? 'Gece Aksiyonu: 2 Hedef Seç' : 'Gece Aksiyonu: Hedef Seç';
            let excludeSelfForVamp = ROLES[myPlayer.role]?.team === 'VAMPIR';
            renderActionList(excludeSelfForVamp, isDedektif ? 2 : 1); 
            els.game.btnSkip.classList.remove('hidden'); 
        } else {
            els.game.actionPanel.classList.add('hidden');
        }
    } else if (gameState.status === 'DAY_DISCUSSION') {
        if (rDef && rDef.hasDayAction) {
            if (myPlayer.role === 'INTIKAMCI' && (gameState.dayCount > 1 || myPlayer.intikamciTarget)) {
                els.game.actionPanel.classList.add('hidden');
            } else {
                els.game.actionTitle.textContent = 'Gündüz Aksiyonu: Hedef Seç (Opsiyonel)';
                renderActionList(true);
                els.game.btnSkip.classList.remove('hidden');
            }
        } else {
            els.game.actionPanel.classList.add('hidden');
        }
    } else if (gameState.status === 'VOTING') {
        els.game.actionTitle.textContent = 'Kimi oylayacaksın?';
        els.game.btnSkip.classList.remove('hidden');
        renderActionList(true); 
    } else if (gameState.status === 'JUDGEMENT') {
        els.game.actionTitle.textContent = gameState.players[gameState.defensePlayerId].name + ' asılsın mı?';
        els.game.btnSkip.classList.remove('hidden');
        
        // Custom UI for Judgement
        _currentMaxSelect = 1;
        _currentSelectedIds = [];
        _validActionTargets = ['guilty', 'innocent'];
        
        els.game.actionPlayers.innerHTML = `
            <div style="display: flex; gap: 10px; width: 100%;">
                <button id="btn-judge-guilty" class="btn btn-primary" style="flex: 1; background: var(--danger); border-color: var(--danger);">Suçlu</button>
                <button id="btn-judge-innocent" class="btn btn-primary" style="flex: 1; background: var(--success); border-color: var(--success);">Masum</button>
            </div>
        `;
        els.game.actionPlayers.style.display = 'block';
        
        document.getElementById('btn-judge-guilty').onclick = () => { window.onPlayerSelected('guilty'); };
        document.getElementById('btn-judge-innocent').onclick = () => { window.onPlayerSelected('innocent'); };

        els.game.btnConfirm.classList.add('hidden');
        els.game.actionPanel.style.left = '50%';
        els.game.actionPanel.style.top = '50%';
        els.game.actionPanel.style.display = 'flex';
    }
}

let _currentMaxSelect = 1;
let _currentSelectedIds = [];
let _validActionTargets = [];

function renderActionList(excludeSelf, maxSelect = 1) {
    _currentMaxSelect = maxSelect;
    _currentSelectedIds = [];
    _validActionTargets = [];
    
    if(window.gameScene) {
        Object.values(window.gameScene.playerModels).forEach(p => p.setHighlight(false));
    }

    const pIds = Object.keys(gameState.players);
    pIds.forEach(id => {
        const p = gameState.players[id];
        if (excludeSelf && id === myId) return;
        if (p.isAlive) {
            _validActionTargets.push(id);
        }
    });

    els.game.btnConfirm.classList.add('hidden');
    els.game.actionPanel.style.left = '50%';
    els.game.actionPanel.style.top = '50%';
    els.game.actionPanel.style.display = 'flex';

    els.game.actionPlayers.innerHTML = '';
    _validActionTargets.forEach(id => {
        const btn = document.createElement('button');
        btn.className = 'btn btn-secondary';
        btn.style.width = '100%';
        btn.style.textAlign = 'left';
        btn.style.padding = '8px 12px';
        btn.textContent = window.escapeHtml(gameState.players[id].name);
        btn.onclick = () => window.onPlayerSelected(id);
        els.game.actionPlayers.appendChild(btn);
    });
    
    els.game.actionPlayers.style.display = 'flex';
    els.game.actionPlayers.style.flexDirection = 'column';
    els.game.actionPlayers.style.gap = '5px';
    els.game.actionPlayers.style.width = '100%';
    els.game.actionPlayers.style.maxHeight = '150px';
    els.game.actionPlayers.style.overflowY = 'auto';
    els.game.actionPlayers.style.marginTop = '10px';
}

window.onPlayerSelected = (id) => {
    // Only process if we have a valid action panel open and player is in valid list
    if (els.game.actionPanel.classList.contains('hidden') || els.game.actionPanel.style.display === 'none') return;
    if (!_validActionTargets.includes(id)) return;

    if (id === 'guilty' || id === 'innocent') {
        submitAction(id);
        return;
    }

    if(window.gameScene) {
        const coords = window.gameScene.getPlayerScreenCoords(id);
        if (coords) {
            els.game.actionPanel.style.left = coords.x + 'px';
            els.game.actionPanel.style.top = coords.y + 'px';
        }
    }

    if (_currentMaxSelect === 1) {
        pendingActionTarget = id;
        els.game.btnConfirm.classList.remove('hidden');
        els.game.actionTitle.textContent = "Seçilen: " + (gameState.players[id] ? gameState.players[id].name : id);
        
        if(window.gameScene) {
            Object.values(window.gameScene.playerModels).forEach(p => p.setHighlight(false));
            if(window.gameScene.playerModels[id]) window.gameScene.playerModels[id].setHighlight(true);
        }
    } else {
        if (_currentSelectedIds.includes(id)) {
            _currentSelectedIds = _currentSelectedIds.filter(i => i !== id);
        } else {
            if (_currentSelectedIds.length < _currentMaxSelect) {
                _currentSelectedIds.push(id);
            }
        }
        
        if (_currentSelectedIds.length > 0) {
            els.game.actionTitle.textContent = "Seçilenler: " + _currentSelectedIds.map(i => gameState.players[i].name).join(', ');
        } else {
            els.game.actionTitle.textContent = "Seçiminizi yapın";
            els.game.actionPanel.style.left = '50%';
            els.game.actionPanel.style.top = '50%';
        }
        
        if(window.gameScene) {
            Object.values(window.gameScene.playerModels).forEach(p => p.setHighlight(false));
            _currentSelectedIds.forEach(selId => {
                if(window.gameScene.playerModels[selId]) window.gameScene.playerModels[selId].setHighlight(true);
            });
        }

        if (_currentSelectedIds.length === _currentMaxSelect) {
            submitAction(_currentSelectedIds);
            _currentSelectedIds = [];
            els.game.actionPanel.style.display = 'none';
            if(window.gameScene) {
                Object.values(window.gameScene.playerModels).forEach(p => p.setHighlight(false));
            }
        }
    }
};

function renderLogs() {
    const isAtBottom = els.game.logs.scrollHeight - els.game.logs.scrollTop - els.game.logs.clientHeight < 50;
    
    els.game.logs.innerHTML = '';
    gameState.logs.forEach(l => {
        const d = document.createElement('div');
        if(l.startsWith('!')) {
            d.style.color = 'var(--neon-purple)';
            d.style.fontWeight = 'bold';
            d.textContent = '> ' + l.substring(1);
        } else {
            d.textContent = '> ' + l;
        }
        els.game.logs.appendChild(d);
    });
    
    if (isAtBottom || els.game.logs.innerHTML === '') {
        els.game.logs.scrollTop = els.game.logs.scrollHeight;
    }
}

function addPrivateLog(msg) {
    const isAtBottom = els.game.privateLogs.scrollHeight - els.game.privateLogs.scrollTop - els.game.privateLogs.clientHeight < 50;

    if(els.game.privateLogs.innerHTML.includes('Henüz özel bir bilgi almadınız')) {
        els.game.privateLogs.innerHTML = '';
    }
    const d = document.createElement('div');
    d.textContent = '• ' + msg;
    els.game.privateLogs.appendChild(d);
    
    if (isAtBottom) {
        els.game.privateLogs.scrollTop = els.game.privateLogs.scrollHeight;
    }
}

function renderEndGame() {
    els.score.title.textContent = 'Oyun Bitti';
    els.score.winner.textContent = gameState.winnerMsg;
    
    els.score.body.innerHTML = '';
    Object.values(gameState.players).forEach(p => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${window.escapeHtml(p.name)}</td>
            <td style="color: var(--neon-purple); font-weight: bold;">${ROLES[p.role]?.name || '?'}</td>
            <td>${p.isAlive ? 'Yaşıyor' : 'Öldü'}</td>
        `;
        els.score.body.appendChild(tr);
    });
}
