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
        btnCloseRoleModal: document.getElementById('btn-close-role-modal')
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
    
    els.lobby.btnToggleCode.addEventListener('click', () => {
        const isHidden = els.lobby.codeDisplay.textContent === '••••••••';
        els.lobby.codeDisplay.textContent = isHidden ? roomCode : '••••••••';
        document.getElementById('icon-eye-open').classList.toggle('hidden', isHidden);
        document.getElementById('icon-eye-closed').classList.toggle('hidden', !isHidden);
    });

    els.lobby.btnCopy.addEventListener('click', () => {
        navigator.clipboard.writeText(roomCode);
        showToast("Oda kodu kopyalandı", "success");
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
    });

    els.game.btnConfirm.addEventListener('click', () => {
        if (pendingActionTarget) {
            submitAction(pendingActionTarget);
            pendingActionTarget = null;
            if(window.gameScene) {
                Object.values(window.gameScene.playerModels).forEach(p => p.setHighlight(false));
            }
        }
    });

    els.game.btnCloseRoleModal.addEventListener('click', () => {
        els.game.roleModal.classList.add('hidden');
    });

    // Hover for Role
    els.game.myRoleContainer.addEventListener('mouseenter', () => {
        if (els.game.roleTooltip.textContent) {
            els.game.roleTooltip.classList.remove('hidden');
        }
    });
    els.game.myRoleContainer.addEventListener('mouseleave', () => {
        els.game.roleTooltip.classList.add('hidden');
    });
}

function updateLobbyPlayersList(playersObj) {
    els.lobby.playersList.innerHTML = '';
    const players = Object.values(playersObj);
    els.lobby.playerCount.textContent = players.length;

    players.forEach(p => {
        const li = document.createElement('li');
        li.innerHTML = `<span>${p.name}</span>${p.isHost ? '<span style="font-size: 0.8rem; background: var(--lilac); color: var(--bg-deep); padding: 2px 8px; border-radius: 10px; font-weight: bold;">Kurucu</span>' : ''}`;
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
        'KOY': { name: 'Köylüler', color: 'var(--success)' },
        'VAMPIR': { name: 'Vampirler', color: 'var(--danger)' },
        'TARAFSIZ': { name: 'Tarafsızlar', color: 'var(--warning)' }
    };
    
    const rolesByTeam = { 'KOY': [], 'VAMPIR': [], 'TARAFSIZ': [] };
    
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
            nameSpan.textContent = role.name;
            nameSpan.title = role.desc;
            nameSpan.style.cursor = 'help';
            nameSpan.style.fontSize = '0.9rem';
            
            const ctrlDiv = document.createElement('div');
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
            let rName = ROLES[p.role]?.name || 'Bilinmiyor';
            roleCounts[rName] = (roleCounts[rName] || 0) + 1;
        });
    }
    
    Object.entries(roleCounts).forEach(([rName, count]) => {
        const li = document.createElement('li');
        li.textContent = `${rName}: ${count}`;
        els.game.rolesList.appendChild(li);
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
    els.game.myRole.textContent = myPlayer ? (ROLES[myPlayer.role]?.name || myPlayer.role) : 'Seyirci';
    
    if (myPlayer && myPlayer.role) {
        const rDef = ROLES[myPlayer.role];
        if (rDef) {
            els.game.roleTooltip.textContent = rDef.desc || '';
            if (!roleModalShown && gameState.dayCount === 1 && gameState.status === 'NIGHT') {
                roleModalShown = true;
                showRoleModal(rDef.name, rDef.desc || '');
            }
        }
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

    const rDef = ROLES[myPlayer.role];

    if (gameState.status === 'NIGHT') {
        if (rDef && rDef.hasNightAction) {
            if (myPlayer.role === 'HIRSIZ' && gameState.dayCount > 1) {
                els.game.actionPanel.classList.add('hidden');
                return;
            }
            let isDedektif = myPlayer.role === 'DEDEKTIF';
            if (myPlayer.role === 'DELI') isDedektif = false;
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
    els.game.actionPanel.style.display = 'flex';
}

window.onPlayerSelected = (id) => {
    // Only process if we have a valid action panel open and player is in valid list
    if (els.game.actionPanel.classList.contains('hidden') || els.game.actionPanel.style.display === 'none') return;
    if (!_validActionTargets.includes(id)) return;

    if (_currentMaxSelect === 1) {
        pendingActionTarget = id;
        els.game.btnConfirm.classList.remove('hidden');
        els.game.actionTitle.textContent = "Seçilen: " + gameState.players[id].name;
        
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
            els.game.actionTitle.textContent = "Sahnede birine veya evine tıklayarak seçiminizi yapın";
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
    els.game.logs.scrollTop = els.game.logs.scrollHeight;
}

function addPrivateLog(msg) {
    if(els.game.privateLogs.innerHTML.includes('Henüz özel bir bilgi almadınız')) {
        els.game.privateLogs.innerHTML = '';
    }
    const d = document.createElement('div');
    d.textContent = '• ' + msg;
    els.game.privateLogs.appendChild(d);
    els.game.privateLogs.scrollTop = els.game.privateLogs.scrollHeight;
}

function renderEndGame() {
    els.score.title.textContent = 'Oyun Bitti';
    els.score.winner.textContent = gameState.winnerMsg;
    
    els.score.body.innerHTML = '';
    Object.values(gameState.players).forEach(p => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${p.name}</td>
            <td style="color: var(--neon-purple); font-weight: bold;">${ROLES[p.role]?.name || '?'}</td>
            <td>${p.isAlive ? 'Yaşıyor' : 'Öldü'}</td>
        `;
        els.score.body.appendChild(tr);
    });
}
