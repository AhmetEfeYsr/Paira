/**
 * Vampir Köylü (Feign style) Game Logic
 */

let isHost = false;
let roomCode = '';
let username = '';
let myId = '';
let network = null;

let gameState = {
    status: 'LOBBY', // LOBBY, NIGHT, DAY_DISCUSSION, VOTING, END, NIGHT_ANIMATION, DAY_ANIMATION
    dayCount: 0,
    players: {}, // id -> { id, name, isAlive, role, team, ... }
    settings: {
        vampireCount: 1,
        discussionTime: 90
    },
    nightActions: {}, 
    dayActions: {}, 
    votes: {},
    logs: [],
    winnerMsg: '',
    campfireActive: true
};

let timerInterval = null;
let currentTimer = 0;
let pendingActionTarget = null;
let roleModalShown = false;

function initApp() {
    isHost = sessionStorage.getItem('isHost') === 'true';
    roomCode = sessionStorage.getItem('roomCode');
    username = sessionStorage.getItem('username');

    if (!roomCode || !username) {
        window.location.href = 'index.html';
        return;
    }

    if (window.PairaAudio) window.PairaAudio.init();
    
    if (window.initGameScene) {
        window.initGameScene('game-container');
    } else {
        setTimeout(() => {
            if (window.initGameScene) window.initGameScene('game-container');
        }, 500);
    }

    setupUI();
    initNetwork();

}

document.addEventListener('DOMContentLoaded', initApp);

function initNetwork() {
    network = new NetworkManager(onStateUpdate, onPlayerJoin, onPlayerLeave, onError);
    network.init(isHost, roomCode, username);
    myId = network.myId;
    
    // gameScene ve myId sync için peer bağlantısının kurulmasını bekle
    const checkReady = setInterval(() => {
        if (network.peer && network.peer.id) {
            myId = network.myId;
            if (window.gameScene) window.gameScene.setLocalPlayer(myId);
            clearInterval(checkReady);
        }
    }, 200);
}

function onPlayerJoin(player) {
    if (isHost && gameState.status === 'LOBBY') {
        gameState.players[player.id] = player;
    }
    if (network && network.players) {
        updateLobbyPlayersList(network.players);
        update3DScene(network.players);
    }
}

function onPlayerLeave(player) {
    if (isHost && gameState.players[player.id]) {
        gameState.players[player.id].isAlive = false;
        
        // Ayrılan oyuncunun bekleyen aksiyonlarını temizle
        if (gameState.nightActions) delete gameState.nightActions[player.id];
        if (gameState.votes) delete gameState.votes[player.id];
        if (gameState.dayActions) delete gameState.dayActions[player.id];
        
        if (gameState.status !== 'LOBBY' && gameState.status !== 'END') {
            // Aksiyonları yeniden kontrol et
            if (gameState.status === 'NIGHT') checkNightEnd();
            else if (gameState.status === 'VOTING') checkVotingEnd();
            checkWin();
        }
    }
    if (network && network.players) {
        updateLobbyPlayersList(network.players);
    }
    if(gameState.status !== 'LOBBY' && gameState.status !== 'END') {
        addLog(`${player.name} oyundan ayrıldı.`);
    }
}

function onError(err) {
    if (err === 'host_disconnected') {
        attemptHostMigration();
    } else {
        showToast("Bağlantı hatası: " + err, "error");
        setTimeout(() => window.location.href = 'index.html', 2000);
    }
}

function attemptHostMigration() {
    if (gameState.status === 'LOBBY' || gameState.status === 'END') {
        showToast("Kurucu koptu, lobiye dönülüyor...", "error");
        setTimeout(() => window.location.href = 'index.html', 2000);
        return;
    }
    
    addLog("Kurucu bağlantısı koptu! Yeni kurucu seçiliyor...");
    showToast("Kurucu düştü, host migration başlatılıyor...", "warning");
    
    let pIds = Object.keys(gameState.players).sort();
    let oldHostId = pIds.find(id => gameState.players[id].isHost);
    
    if (oldHostId) {
        gameState.players[oldHostId].isAlive = false;
        pIds = pIds.filter(id => id !== oldHostId);
    }
    
    if (pIds.length === 0) {
        setTimeout(() => window.location.href = 'index.html', 2000);
        return;
    }
    
    let newHostId = pIds[0];
    let oldMyId = myId;
    
    network.disconnect();
    
    setTimeout(() => {
        network = new NetworkManager(onStateUpdate, onPlayerJoin, onPlayerLeave, onError);
        if (oldMyId === newHostId) {
            addLog("Yeni kurucu sensin! Oyun devam ediyor.");
            showToast("Yeni kurucu siz oldunuz!", "success");
            
            sessionStorage.setItem('isHost', 'true');
            isHost = true;
            gameState.players[oldMyId].isHost = true;
            
            network.init(true, roomCode, username);
            network.players = gameState.players;
            myId = network.myId; 
            
            // Re-map myId in gameState if it changed (vk-host-ROOM vs vk-client-xyz)
            if (myId !== oldMyId) {
                gameState.players[myId] = gameState.players[oldMyId];
                gameState.players[myId].id = myId;
                delete gameState.players[oldMyId];
            }
            
            setTimeout(() => { broadcastState(); }, 3000);
            
        } else {
            addLog(`Yeni kurucu ${gameState.players[newHostId].name} oldu. Yeniden bağlanılıyor...`);
            network.init(false, roomCode, username, oldMyId);
            myId = network.myId;
        }
    }, 1500);
}

function onStateUpdate(senderId, data) {
    if (data.type === 'GAME_STATE') {
        gameState = data.state;
        if (gameState.timerEndTime) startClientTimer(gameState.timerEndTime);
        updateUIForState();
        update3DSceneFromState();
    } else if (data.type === 'PRIVATE_LOG_CLEAR') {
        els.game.privateLogs.innerHTML = '<div style="color: #666; font-style: italic;">Henüz özel bir bilgi almadınız...</div>';
    } else if (data.type === 'ACTION' && isHost) {
        handlePlayerAction(senderId, data.action, data.target);
    } else if (data.type === 'PRIVATE_LOG' && data.target === myId) {
        addPrivateLog(data.msg);
    } else if (data.type === 'PLAY_ANIMATIONS' && data.target === myId) {
        if (window.gameScene) {
            data.anims.forEach(anim => {
                window.gameScene.animatePlayerAction(anim.actorId, anim.targetId, anim.type);
            });
            if(data.watchHouseId) {
                window.gameScene.watchHouse(data.watchHouseId);
            }
        }
    } else if (data.type === 'HANG_ANIMATION') {
        if (window.gameScene) {
            window.gameScene.animateHang(data.targetId);
        }
    }
}

function update3DScene(playersObj) {
    if(window.gameScene) {
        const arr = Object.values(playersObj).map(p => ({
            id: p.id,
            name: p.name,
            isAlive: p.isAlive !== false
        }));
        window.gameScene.updatePlayers(arr);
    }
}

function update3DSceneFromState() {
    if(window.gameScene) {
        const arr = Object.values(gameState.players).map(p => ({
            id: p.id,
            name: p.name,
            isAlive: p.isAlive
        }));
        window.gameScene.updatePlayers(arr);
        window.gameScene.setNight(gameState.status === 'NIGHT' || gameState.status === 'NIGHT_ANIMATION');
        window.gameScene.setCampfireActive(gameState.campfireActive);
    }
}

function handleStartGame() {
    if (!isHost) return;
    const pCount = Object.keys(gameState.players).length;
    
    let assignedRoles = {};
    let totalAssigned = 0;
    
    document.querySelectorAll('.role-count-val').forEach(el => {
        let count = parseInt(el.textContent) || 0;
        if (count > 0) {
            assignedRoles[el.dataset.roleKey] = count;
            totalAssigned += count;
        }
    });

    if (pCount < 3) { showToast("En az 3 oyuncu gerekli!", "error"); return; }
    if (totalAssigned > pCount) { showToast("Atanan rol sayısı oyuncu sayısından fazla olamaz!", "error"); return; }
    
    let vampCount = 0;
    Object.keys(assignedRoles).forEach(r => {
        if (ROLES[r] && ROLES[r].team === 'VAMPIR') vampCount += assignedRoles[r];
    });
    
    if (vampCount >= pCount) { showToast("Vampir sayısı toplam oyuncu sayısından az olmalı!", "error"); return; }
    if (vampCount === 0) { showToast("En az 1 Vampir takımından rol olmalı!", "error"); return; }

    gameState.settings = { 
        assignedRoles: assignedRoles,
        discussionTime: parseInt(els.lobby.discussionTime.value) || 90
    };
    
    assignRoles();
    
    gameState.status = 'NIGHT';
    gameState.dayCount = 1;
    gameState.logs = ['Oyun başladı! Roller dağıtıldı.'];
    gameState.nightActions = {};
    gameState.votes = {};
    gameState.campfireActive = true;
    
    // Clear private logs
    network.broadcast({ type: 'PRIVATE_LOG_CLEAR' });

    broadcastState();

    // G9: Notify Oduncu
    setTimeout(() => {
        Object.values(gameState.players).forEach(p => {
            if (p.isOduncu) {
                sendPrivateLog(p.id, 'Sen köyün Oduncususun! Eğer ölürsen kamp ateşi sönecek.');
            }
        });
    }, 1000);
}

function assignRoles() {
    const pIds = Object.keys(gameState.players);
    for (let i = pIds.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pIds[i], pIds[j]] = [pIds[j], pIds[i]];
    }
    
    let index = 0;
    const assignedRoles = gameState.settings.assignedRoles || {};
    
    // Assign explicit roles
    Object.keys(assignedRoles).forEach(roleKey => {
        let count = assignedRoles[roleKey];
        for (let i = 0; i < count; i++) {
            if (index < pIds.length) {
                gameState.players[pIds[index++]].role = roleKey;
            }
        }
    });
    
    // Remaining players become KOYLU
    while (index < pIds.length) {
        gameState.players[pIds[index++]].role = 'KOYLU';
    }
    
    // Assign Oduncu randomly to one Koylu
    let koyluler = Object.values(gameState.players).filter(p => p.role === 'KOYLU');
    if(koyluler.length > 0) {
        koyluler[Math.floor(Math.random()*koyluler.length)].isOduncu = true;
    }

    Object.values(gameState.players).forEach(p => {
        p.team = ROLES[p.role]?.team || 'KOY';
        p.selfHealCount = 0;
        p.lastHealed = null;
        p.usedAbility = false;
        p.isPoisoned = false;
        p.isDoused = false;
        p.fakeRole = null;
        p.hirsizTarget = null;
        p.intikamciTarget = null;
    });
}

function broadcastState() {
    if (isHost) {
        // G5: Compute role counts and send sanitized state per-client
        const roleCounts = {};
        Object.values(gameState.players).forEach(p => {
            if (p.role) {
                let rName = ROLES[p.role]?.name || 'Bilinmiyor';
                roleCounts[rName] = (roleCounts[rName] || 0) + 1;
            }
        });
        gameState.roleCounts = roleCounts;
        const isEnd = gameState.status === 'END';

        Object.keys(network.connections).forEach(clientId => {
            const conn = network.connections[clientId];
            if (conn && conn.open) {
                const clientState = JSON.parse(JSON.stringify(gameState));
                if (!isEnd) {
                    Object.values(clientState.players).forEach(p => {
                        if (p.id !== clientId) {
                            delete p.role;
                            delete p.team;
                        }
                    });
                    // Vampirler kamp ateşini göremez
                    const clientPlayer = gameState.players[clientId];
                    if (clientPlayer && clientPlayer.team === 'VAMPIR') {
                        clientState.campfireActive = true; // hep yanıyor görünsün
                    }
                }
                delete clientState.nightActions;
                delete clientState.dayActions;
                conn.send({ type: 'GAME_STATE', state: clientState });
            }
        });

        updateUIForState();
        update3DSceneFromState();
    }
}

function sendPrivateLog(targetId, msg) {
    if(isHost) {
        network.sendTo(targetId, { type: 'PRIVATE_LOG', target: targetId, msg: msg });
        if(targetId === myId) addPrivateLog(msg);
    }
}

function submitAction(targetId) {
    network.sendToHost({ type: 'ACTION', action: gameState.status, target: targetId });
    els.game.actionPanel.classList.add('hidden');
}

function addLog(msg) {
    gameState.logs.push(msg);
    if(!isHost) renderLogs();
}

function handlePlayerAction(senderId, actionType, targetId) {
    if (actionType === 'NIGHT') {
        gameState.nightActions[senderId] = targetId;
        checkNightEnd();
    } else if (actionType === 'DAY_DISCUSSION') {
        gameState.dayActions[senderId] = targetId;
    } else if (actionType === 'VOTING') {
        gameState.votes[senderId] = targetId;
        checkVotingEnd();
    }
}

function checkNightEnd() {
    let requiredActions = 0;
    Object.values(gameState.players).forEach(p => {
        if (p.isAlive && ROLES[p.role]?.hasNightAction) requiredActions++;
    });
    
    if (Object.keys(gameState.nightActions).length >= requiredActions) {
        resolveNight();
    }
}

function resolveNight() {
    let actions = gameState.nightActions;
    let blockedPlayers = new Set();
    let traps = new Set();
    let visits = {};
    let protectedPlayers = new Set();
    let poisonedPlayers = new Set();
    let deaths = [];
    let clientAnimations = {};
    Object.keys(gameState.players).forEach(id => clientAnimations[id] = []);
    
    const visit = (actorId, targetId, isImmune = false) => {
        if (!isImmune && blockedPlayers.has(actorId)) {
            clientAnimations[actorId].push({ actorId: actorId, targetId: targetId, type: 'POLICE_BLOCK' });
            return false;
        }
        if (!isImmune && traps.has(targetId)) {
            clientAnimations[actorId].push({ actorId: actorId, targetId: targetId, type: 'TRAPPED' });
            return false;
        }
        if (!visits[targetId]) visits[targetId] = [];
        visits[targetId].push(actorId);
        return true;
    };

    // 1. Polis
    Object.entries(actions).forEach(([aid, tid]) => {
        let p = gameState.players[aid];
        if (p.role === 'POLIS' && p.isAlive && gameState.players[tid]?.role !== 'SERI_KATIL' && tid !== 'skip') {
            blockedPlayers.add(tid);
            clientAnimations[aid].push({ actorId: aid, targetId: tid, type: 'WALK' });
        }
    });

    // 2. Tuzakçı
    Object.entries(actions).forEach(([aid, tid]) => {
        let p = gameState.players[aid];
        if (p.role === 'TUZAKCI' && p.isAlive && !blockedPlayers.has(aid) && tid !== 'skip') {
            traps.add(tid);
            clientAnimations[aid].push({ actorId: aid, targetId: tid, type: 'WALK' });
        }
    });

    // 4. Doktor
    Object.values(gameState.players).forEach(p => { if(p.role === 'DOKTOR') p.triedHeal = false; });
    Object.entries(actions).forEach(([aid, tid]) => {
        let p = gameState.players[aid];
        if (p.role === 'DOKTOR' && p.isAlive && tid !== 'skip') {
            if (tid === aid && p.selfHealCount >= 1) return; // Cannot self heal more than once
            if (p.lastHealed === tid) return; // Cannot heal same person twice in a row
            
            p.triedHeal = true;
            if (visit(aid, tid)) {
                protectedPlayers.add(tid);
                clientAnimations[aid].push({ actorId: aid, targetId: tid, type: 'WALK' });
                if (tid === aid) p.selfHealCount = (p.selfHealCount || 0) + 1;
                p.lastHealed = tid;
            }
        }
    });
    Object.values(gameState.players).forEach(p => { if(p.role === 'DOKTOR' && !p.triedHeal) p.lastHealed = null; });

    // 3. Seri Katil
    let skTarget = null;
    let skId = null;
    Object.entries(actions).forEach(([aid, tid]) => {
        if (gameState.players[aid].role === 'SERI_KATIL' && gameState.players[aid].isAlive && tid !== 'skip') {
            skTarget = tid;
            skId = aid;
            if (visit(aid, tid, true)) {
                clientAnimations[aid].push({ actorId: aid, targetId: tid, type: 'KILL' });
            }
        }
    });

    // 5. Vampirler
    let vampVotes = {};
    let profTarget = null, zehirTarget = null;
    let mainVamp = null;
    let vampTarget = null;
    Object.entries(actions).forEach(([aid, tid]) => {
        let p = gameState.players[aid];
        if (p.team === 'VAMPIR' && p.isAlive && tid !== 'skip') {
            vampVotes[tid] = (vampVotes[tid] || 0) + 1;
            mainVamp = aid;
            if (p.role === 'PROFESYONEL' && !p.usedAbility) {
                profTarget = tid;
                p.usedAbility = true;
            } else if (p.role === 'ZEHIRLI' && !p.usedAbility) {
                zehirTarget = tid;
                p.usedAbility = true;
            }
        }
    });
    let maxV = 0;
    Object.entries(vampVotes).forEach(([tid, c]) => {
        if (c > maxV) { maxV = c; vampTarget = tid; }
    });

    // G3: Use actual vampire player IDs so they can be blocked/trapped
    let profActorId = Object.keys(actions).find(aid => gameState.players[aid].role === 'PROFESYONEL');
    let zehirActorId = Object.keys(actions).find(aid => gameState.players[aid].role === 'ZEHIRLI');

    if (profTarget && profActorId && visit(profActorId, profTarget)) {
        deaths.push({ id: profTarget, killer: 'VAMPIR_PROF' }); // bypasses doctor protection AND SK immunity
        clientAnimations[profActorId].push({ actorId: profActorId, targetId: profTarget, type: 'KILL' });
    } else if (vampTarget && mainVamp && visit(mainVamp, vampTarget)) {
        if (!protectedPlayers.has(vampTarget) && gameState.players[vampTarget].role !== 'SERI_KATIL') {
            deaths.push({ id: vampTarget, killer: 'VAMPIR' });
        }
        clientAnimations[mainVamp].push({ actorId: mainVamp, targetId: vampTarget, type: 'KILL' });
    }
    
    // Vampir İzcisi: ek olarak vampir saldırısına katılır, tuzak/police bağışık
    let vampIzcisiId = Object.keys(actions).find(aid => gameState.players[aid]?.role === 'VAMPIR_IZCISI' && gameState.players[aid]?.isAlive);
    if (vampIzcisiId && actions[vampIzcisiId] !== 'skip' && vampIzcisiId !== mainVamp) {
        // Vampir İzcisi tuzak ve police'e bağışık olarak ziyaret eder
        visit(vampIzcisiId, actions[vampIzcisiId], true);
        clientAnimations[vampIzcisiId].push({ actorId: vampIzcisiId, targetId: actions[vampIzcisiId], type: 'WALK' });
    }
    
    // 6. Zehirli (Applies poison)
    if (zehirTarget && zehirActorId && visit(zehirActorId, zehirTarget)) {
        poisonedPlayers.add(zehirTarget);
        clientAnimations[zehirActorId].push({ actorId: zehirActorId, targetId: zehirTarget, type: 'WALK' });
    }
    
    // Process previous poisons
    Object.values(gameState.players).forEach(p => {
        if (p.isAlive && p.isPoisoned) {
            if (protectedPlayers.has(p.id)) p.isPoisoned = false; // Cured
            else deaths.push({ id: p.id, killer: 'ZEHIR' });
        }
    });
    poisonedPlayers.forEach(id => { if(gameState.players[id]) gameState.players[id].isPoisoned = true; });

    // 7. Uyurgezer
    let ugTarget = null, ugId = null;
    Object.entries(actions).forEach(([aid, tid]) => {
        let p = gameState.players[aid];
        if (p.role === 'UYURGEZER' && p.isAlive && tid !== 'skip') {
            ugId = aid;
            if (visit(aid, tid)) {
                ugTarget = tid;
                clientAnimations[aid].push({ actorId: aid, targetId: tid, type: 'WALK' });
            }
        }
    });

    // Evaluate SK & UG & Vamp collateral
    if (skTarget && skId) {
        if (skTarget === ugId) {
            if (!protectedPlayers.has(ugId)) deaths.push({ id: ugId, killer: 'SERI_KATIL' });
        } else {
            if (!protectedPlayers.has(skTarget)) deaths.push({ id: skTarget, killer: 'SERI_KATIL' });
        }
    }
    
    if (ugId && ugTarget) {
        let targetTeam = gameState.players[ugTarget]?.team;
        if (targetTeam === 'VAMPIR') {
            deaths.push({ id: ugId, killer: 'VAMPIR' }); 
        } else if (vampTarget === ugTarget && !protectedPlayers.has(ugTarget)) {
            deaths.push({ id: ugId, killer: 'VAMPIR_COLLATERAL' }); 
        } else if (skTarget === ugTarget) {
            // "SK eve saldırdıysa, Uyurgezer sonra vardığında ölmemeli" -> ölmez
        } else if (ugTarget === skId) {
            // "Uyurgezer SK'nin evine giderse -> ölmez (ev boş)"
            if (actions[skId] === 'skip' && !protectedPlayers.has(ugId)) {
                deaths.push({ id: ugId, killer: 'SERI_KATIL' }); // SK is home!
            }
        }
    }
    
    // 9. Kundakçı
    Object.entries(actions).forEach(([aid, tid]) => {
        let p = gameState.players[aid];
        if (p.role === 'KUNDAKCI' && p.isAlive && tid !== 'skip') {
            if (tid === aid) {
                // Ignite!
                Object.values(gameState.players).forEach(target => {
                    if (target.isAlive && target.isDoused) {
                        deaths.push({ id: target.id, killer: 'KUNDAKCI' });
                        clientAnimations[aid].push({ actorId: aid, targetId: target.id, type: 'KILL' });
                    }
                });
            } else {
                if (visit(aid, tid)) {
                    clientAnimations[aid].push({ actorId: aid, targetId: tid, type: 'WALK' });
                    if(gameState.players[tid]) gameState.players[tid].isDoused = true;
                }
            }
        }
    });

    // 8. Info Roles & Hırsız
    Object.entries(actions).forEach(([aid, tid]) => {
        let p = gameState.players[aid];
        if (!p.isAlive || tid === 'skip') return;
        
        let isDeli = p.role === 'DELI';
        let fakeRole = p.fakeRole || (p.fakeRole = ['GOZCU', 'IZCI', 'DEDEKTIF'][Math.floor(Math.random()*3)]);

        if (p.role === 'HIRSIZ' && gameState.dayCount === 1) {
            p.hirsizTarget = tid;
        }

        if (p.role === 'GOZCU' || (isDeli && fakeRole === 'GOZCU')) {
            if (visit(aid, tid)) {
                let seen = (visits[tid] || []).filter(id => id !== aid && gameState.players[id]);
                if (isDeli) seen = [Object.keys(gameState.players)[Math.floor(Math.random()*Object.keys(gameState.players).length)]];
                sendPrivateLog(aid, `${gameState.players[tid].name} evine girenler: ${seen.map(id => gameState.players[id]?.name || 'Biri').join(', ') || 'Kimse'}`);
                
                network.sendTo(aid, { type: 'PLAY_ANIMATIONS', target: aid, anims: [], watchHouseId: tid });
                
                seen.forEach(visitorId => {
                    let aType = 'WALK';
                    if (blockedPlayers.has(visitorId)) aType = 'POLICE_BLOCK';
                    else if (traps.has(tid)) aType = 'TRAPPED';
                    else if (gameState.players[visitorId].role === 'SERI_KATIL') aType = 'KILL';
                    clientAnimations[aid].push({ actorId: visitorId, targetId: tid, type: aType });
                });
            }
        } else if (p.role === 'IZCI' || (isDeli && fakeRole === 'IZCI')) {
            if (visit(aid, tid)) {
                clientAnimations[aid].push({ actorId: aid, targetId: tid, type: 'WALK' });
                let tr = gameState.players[tid].role;
                if(tr === 'DRACULA') tr = 'KOYLU';
                if(isDeli) tr = Object.keys(ROLES)[Math.floor(Math.random()*Object.keys(ROLES).length)];
                sendPrivateLog(aid, `${gameState.players[tid].name} rolü: ${ROLES[tr]?.name || tr}`);
            }
        } else if (p.role === 'DEDEKTIF') {
            if (Array.isArray(tid) && tid.length === 2) {
                if (visit(aid, tid[0]) && visit(aid, tid[1])) {
                    clientAnimations[aid].push({ actorId: aid, targetId: tid[0], type: 'WALK' });
                    clientAnimations[aid].push({ actorId: aid, targetId: tid[1], type: 'WALK' });
                    let team1 = gameState.players[tid[0]].team;
                    let team2 = gameState.players[tid[1]].team;
                    if (gameState.players[tid[0]].role === 'DRACULA') team1 = 'KOY'; 
                    if (gameState.players[tid[1]].role === 'DRACULA') team2 = 'KOY'; 
                    let sameTeam = team1 === team2;
                    sendPrivateLog(aid, `${gameState.players[tid[0]].name} ve ${gameState.players[tid[1]].name} ${sameTeam ? 'Aynı Takımda' : 'Farklı Takımda'}`);
                }
            }
        } else if (isDeli && fakeRole === 'DEDEKTIF') {
            if (visit(aid, tid)) {
                clientAnimations[aid].push({ actorId: aid, targetId: tid, type: 'WALK' });
                let sameTeam = Math.random() > 0.5;
                let other = Object.keys(gameState.players).find(id => id !== tid && gameState.players[id].isAlive);
                let otherName = other ? gameState.players[other].name : 'Biri';
                sendPrivateLog(aid, `${gameState.players[tid].name} ve ${otherName} ${sameTeam ? 'Aynı Takımda' : 'Farklı Takımda'}`);
            }
        }
    });

    // Broadcast personal animations
    Object.keys(clientAnimations).forEach(clientId => {
        if (clientAnimations[clientId].length > 0) {
            network.sendTo(clientId, { type: 'PLAY_ANIMATIONS', target: clientId, anims: clientAnimations[clientId] });
        }
    });

    gameState.status = 'NIGHT_ANIMATION';
    els.game.actionPanel.classList.add('hidden');
    broadcastState();

    // Wait for animations to play
    setTimeout(() => {
        addLog(`--- GÜN ${gameState.dayCount} ---`);
        if (deaths.length > 0) {
            deaths.forEach(d => {
                if(gameState.players[d.id] && gameState.players[d.id].isAlive) {
                    // Profesyonel SK bağışıklığını geçer
                    if (d.killer === 'VAMPIR' && gameState.players[d.id].role === 'SERI_KATIL') return;
                    gameState.players[d.id].isAlive = false;
                    addLog(`${gameState.players[d.id].name} gece öldürüldü!`);
                    
                    // Hırsız logic
                    Object.values(gameState.players).forEach(p => {
                        if(p.role === 'HIRSIZ' && p.isAlive && p.hirsizTarget === d.id && !p.usedAbility) {
                            p.role = gameState.players[d.id].role;
                            p.team = gameState.players[d.id].team;
                            p.usedAbility = true;
                            sendPrivateLog(p.id, `Hedefin öldü! Yeni rolün: ${ROLES[p.role].name}`);
                        }
                    });

                    if(gameState.players[d.id].isOduncu) {
                        gameState.campfireActive = false;
                        addLog('Kamp ateşi söndü...');
                    }
                }
            });
        } else {
            addLog('Gece kimse ölmedi.');
        }
        
        if (checkWin()) return;
        
        gameState.status = 'DAY_DISCUSSION';
        gameState.dayActions = {};
        broadcastState();
        
        startTimer(gameState.settings.discussionTime, () => {
            resolveDayActions();
            if(checkWin()) return;
            
            gameState.status = 'VOTING';
            gameState.votes = {};
            addLog('Tartışma bitti. Oylama başladı.');
            broadcastState();
        });
    }, 9000); 
}
function resolveDayActions() {
    Object.entries(gameState.dayActions).forEach(([aid, tid]) => {
        let p = gameState.players[aid];
        if(p.isAlive && p.role === 'SERIF' && tid !== 'skip') {
            if (!p.usedAbility) {
                p.usedAbility = true;
                let target = gameState.players[tid];
                if(target && target.isAlive) {
                    target.isAlive = false;
                    addLog(`Şerif ${p.name}, ${target.name} kişisini vurdu!`);
                    if(target.team === 'KOY') {
                        p.isAlive = false;
                        addLog(`Şerif ${p.name} masum birini vurduğu için vicdan azabından intihar etti.`);
                    }
                }
            }
        } else if (p.isAlive && p.role === 'INTIKAMCI' && tid !== 'skip') {
            if (!p.intikamciTarget) {
                p.intikamciTarget = tid;
                sendPrivateLog(aid, `İntikam hedefin: ${gameState.players[tid].name}`);
            }
        }
    });
}

function checkVotingEnd() {
    let aliveCount = Object.values(gameState.players).filter(p => p.isAlive).length;
    if (Object.keys(gameState.votes).length >= aliveCount) {
        resolveVoting();
    }
}

function resolveVoting() {
    let tallies = {};
    Object.values(gameState.votes).forEach(t => {
        if (t !== 'skip') tallies[t] = (tallies[t] || 0) + 1;
    });
    
    let max = 0;
    let eliminatedId = null;
    let tie = false;
    
    Object.entries(tallies).forEach(([id, count]) => {
        if (count > max) { max = count; eliminatedId = id; tie = false; }
        else if (count === max && max > 0) tie = true;
    });
    
    // Gerçek tie kontrolü: aynı max'a sahip birden fazla kişi var mı?
    if (max > 0) {
        const topVoted = Object.entries(tallies).filter(([id, count]) => count === max);
        tie = topVoted.length > 1;
        if (!tie) eliminatedId = topVoted[0][0];
    }
    
    if (eliminatedId && !tie) {
        gameState.status = 'DAY_ANIMATION';
        els.game.actionPanel.classList.add('hidden');
        broadcastState();
        
        network.broadcast({ type: 'HANG_ANIMATION', targetId: eliminatedId });
        
        setTimeout(() => {
            gameState.players[eliminatedId].isAlive = false;
            let roleName = ROLES[gameState.players[eliminatedId].role]?.name || 'Bilinmiyor';
            addLog(`${gameState.players[eliminatedId].name} asıldı. Rolü: ${roleName}`);
            
            if(gameState.players[eliminatedId].role === 'SOYTARI') {
                addLog(`Soytarı asıldı! Soytarı kazandı.`);
                endGame('Soytarı Kazandı!');
                return;
            } else if (gameState.players[eliminatedId].role === 'INTIKAMCI') {
                let iTarget = gameState.players[eliminatedId].intikamciTarget;
                if (iTarget && gameState.players[iTarget] && gameState.players[iTarget].isAlive) {
                    gameState.players[iTarget].isAlive = false;
                    addLog(`İntikamcı asılırken yanında ${gameState.players[iTarget].name}'i de götürdü!`);
                }
            }
            
            if (checkWin()) return;
            
            gameState.status = 'NIGHT';
            gameState.dayCount++;
            gameState.nightActions = {};
            addLog('Gece çöküyor...');
            broadcastState();
        }, 5500);

    } else {
        addLog('Oylama berabere bitti veya pas geçildi. Kimse asılmadı.');
        if (checkWin()) return;
        
        gameState.status = 'NIGHT';
        gameState.dayCount++;
        gameState.nightActions = {};
        addLog('Gece çöküyor...');
        broadcastState();
    }
}

function checkWin() {
    if(gameState.status === 'END') return true;
    
    let vamps = 0, koyluler = 0, sk = 0;
    Object.values(gameState.players).forEach(p => {
        if (p.isAlive) {
            if (p.team === 'VAMPIR') vamps++;
            else if (p.role === 'SERI_KATIL') sk++;
            else koyluler++;
        }
    });
    
    let totalAlive = vamps + koyluler + sk;
    
    if (totalAlive === 0) { endGame('Berabere! Herkes öldü.'); return true; }
    if (sk === 1 && totalAlive === 1) { endGame('Seri Katil Kazandı!'); return true; }
    if (sk === 1 && totalAlive === 2 && vamps === 0) { endGame('Seri Katil Kazandı!'); return true; }
    if (vamps === 0 && sk === 0) { endGame('Köylüler Kazandı!'); return true; }
    if (vamps >= koyluler + sk) { endGame('Vampirler Kazandı!'); return true; }
    
    return false;
}

function endGame(winnerMsg) {
    gameState.status = 'END';
    gameState.logs.push(winnerMsg);
    gameState.winnerMsg = winnerMsg;
    broadcastState();
}

function handlePlayAgain() {
    gameState.status = 'LOBBY';
    gameState.dayCount = 0;
    gameState.logs = [];
    gameState.campfireActive = true;
    Object.values(gameState.players).forEach(p => {
        p.isAlive = true;
        p.role = null;
        p.team = null;
        p.isPoisoned = false;
        p.isOduncu = false;
        p.isDoused = false;
        p.fakeRole = null;
        p.usedAbility = false;
        p.hirsizTarget = null;
        p.intikamciTarget = null;
        p.lastHealed = null;
        p.selfHealCount = 0;
    });
    roleModalShown = false;
    broadcastState();
}

function startTimer(seconds, callback) {
    if (timerInterval) clearInterval(timerInterval);
    const now = window.PairaTime ? window.PairaTime.now() : Date.now();
    gameState.timerEndTime = now + seconds * 1000;
    broadcastState();
    
    if (isHost && callback) {
        setTimeout(() => { callback(); }, seconds * 1000);
    }
}

function startClientTimer(endTime) {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        const now = window.PairaTime ? window.PairaTime.now() : Date.now();
        let left = Math.floor((endTime - now)/1000);
        if (left < 0) left = 0;
        if(els.game.timer) els.game.timer.textContent = `${Math.floor(left/60).toString().padStart(2,'0')}:${(left%60).toString().padStart(2,'0')}`;
        if (left <= 0) clearInterval(timerInterval);
    }, 1000);
}