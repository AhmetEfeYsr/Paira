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
let hostTimerTimeout = null;
let currentTimer = 0;
let pendingActionTarget = null;
let roleModalShown = false;
let lastStateStatus = null;
let myPendingAction = null;

function clearHostTimer() {
    if (hostTimerTimeout) {
        clearTimeout(hostTimerTimeout);
        hostTimerTimeout = null;
    }
}

function initApp() {
    isHost = sessionStorage.getItem('isHost') === 'true';
    roomCode = (sessionStorage.getItem('roomCode') || '').replace(/^vk-host-/i, '');
    username = sessionStorage.getItem('username');

    if (!roomCode || !username) {
        window.location.href = 'index.html';
        return;
    }
    sessionStorage.setItem('roomCode', roomCode);

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
            const displayEl = document.getElementById('display-room-code');
            if (displayEl) {
                displayEl.dataset.code = roomCode;
            }
            sessionStorage.setItem('roomCode', roomCode);
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
        if (gameState.status === 'LOBBY') {
            update3DScene(network.players);
        }
    }
    if (isHost && gameState.status !== 'LOBBY' && player && gameState.players[player.id]) {
        broadcastState();
    }
}

function onPlayerLeave(player) {
    let wasAlive = false;
    if (isHost && gameState.players[player.id]) {
        if (gameState.status === 'LOBBY') {
            delete gameState.players[player.id];
        } else {
            wasAlive = Boolean(gameState.players[player.id].isAlive);
            gameState.players[player.id].isAlive = false;
            gameState.players[player.id].isPoisoned = false;

            // Ayrılan oyuncunun bekleyen aksiyonlarını temizle
            if (gameState.nightActions) delete gameState.nightActions[player.id];
            if (gameState.votes) delete gameState.votes[player.id];
            if (gameState.dayActions) delete gameState.dayActions[player.id];
        }
    }
    if (network && network.players) {
        updateLobbyPlayersList(network.players);
        if (gameState.status === 'LOBBY') {
            update3DScene(network.players);
        }
    }
    if (gameState.status !== 'LOBBY' && gameState.status !== 'END') {
        addLog(`${player.name} oyundan ayrıldı.`);
        if (isHost) {
            if (wasAlive) {
                processDeath(player.id);
            }
            const prevStatus = gameState.status;
            if (!checkWin()) {
                if (gameState.status === 'NIGHT') checkNightEnd();
                else if (gameState.status === 'VOTING') checkVotingEnd();
                else if (gameState.status === 'JUDGEMENT') checkJudgementEnd();
                if (gameState.status === 'NIGHT') {
                    checkNightEnd();
                } else if (gameState.status === 'VOTING') {
                    checkVotingEnd();
                } else if ((gameState.status === 'DEFENSE' || gameState.status === 'JUDGEMENT') && gameState.defensePlayerId === player.id) {
                    clearHostTimer();
                    gameState.status = 'NIGHT';
                    gameState.dayCount++;
                    gameState.nightActions = {};
                    gameState.votes = {};
                    addLog('Sanık oyundan ayrıldığı için yargılama iptal edildi. Gece çöküyor...');
                    startTimer(40, () => {
                        if (gameState.status === 'NIGHT') resolveNight();
                    });
                } else if (gameState.status === 'JUDGEMENT') {
                    checkJudgementEnd();
                }
                if (gameState.status === prevStatus) {
                    broadcastState();
                }
            }
        }
    }
}

function onError(err) {
    if (err === 'host_disconnected') {
        attemptHostMigration();
    } else if (err === 'room_not_found') {
        showToast("Oda bulunamadı veya kapandı.", "error");
        setTimeout(() => window.location.href = 'index.html', 2000);
    } else if (err === 'room_locked') {
        showToast("Bu odada oyun zaten başlamış!", "error");
        setTimeout(() => window.location.href = 'index.html', 2000);
    } else {
        showToast("Bağlantı hatası: " + err, "error");
        setTimeout(() => window.location.href = 'index.html', 2000);
    }
}

function resumeMigratedHostPhase() {
    if (!isHost) return;
    if (checkWin()) return;

    const now = window.PairaTime ? window.PairaTime.now() : Date.now();
    const remainingSec = gameState.timerEndTime
        ? Math.max(5, Math.ceil((gameState.timerEndTime - now) / 1000))
        : 20;

    if (gameState.status === 'NIGHT') {
        startTimer(remainingSec, () => {
            if (gameState.status === 'NIGHT') resolveNight();
        });
        checkNightEnd();
    } else if (gameState.status === 'NIGHT_ANIMATION') {
        startTimer(3, () => {
            if (gameState.status !== 'NIGHT_ANIMATION') return;
            gameState.status = 'DAY_DISCUSSION';
            gameState.dayActions = {};
            broadcastState();
            startTimer(gameState.settings?.discussionTime || 90, () => {
                resolveDayActions();
                if (checkWin()) return;
                gameState.status = 'VOTING';
                gameState.votes = {};
                addLog('Tartışma bitti. Oylama başladı.');
                broadcastState();
                startTimer(30, () => {
                    if (gameState.status === 'VOTING') resolveVoting();
                });
            });
        });
    } else if (gameState.status === 'DAY_DISCUSSION') {
        startTimer(remainingSec, () => {
            resolveDayActions();
            if (checkWin()) return;
            gameState.status = 'VOTING';
            gameState.votes = {};
            addLog('Tartışma bitti. Oylama başladı.');
            broadcastState();
            startTimer(30, () => {
                if (gameState.status === 'VOTING') resolveVoting();
            });
        });
    } else if (gameState.status === 'VOTING') {
        startTimer(remainingSec, () => {
            if (gameState.status === 'VOTING') resolveVoting();
        });
        checkVotingEnd();
    } else if (gameState.status === 'DEFENSE') {
        if (!gameState.players[gameState.defensePlayerId]?.isAlive) {
            gameState.status = 'NIGHT';
            gameState.dayCount++;
            gameState.nightActions = {};
            addLog('Gece çöküyor...');
            startTimer(40, () => {
                if (gameState.status === 'NIGHT') resolveNight();
            });
        } else {
            startTimer(remainingSec, () => {
                gameState.status = 'JUDGEMENT';
                gameState.votes = {};
                addLog('Savunma bitti. Oylama başlıyor: Suçlu mu, Masum mu?');
                broadcastState();
                startTimer(20, () => {
                    if (gameState.status === 'JUDGEMENT') resolveJudgement();
                });
            });
        }
    } else if (gameState.status === 'JUDGEMENT') {
        if (!gameState.players[gameState.defensePlayerId]?.isAlive) {
            gameState.status = 'NIGHT';
            gameState.dayCount++;
            gameState.nightActions = {};
            addLog('Gece çöküyor...');
            startTimer(40, () => {
                if (gameState.status === 'NIGHT') resolveNight();
            });
        } else {
            startTimer(remainingSec, () => {
                if (gameState.status === 'JUDGEMENT') resolveJudgement();
            });
            checkJudgementEnd();
        }
    } else if (gameState.status === 'DAY_ANIMATION') {
        startTimer(3, () => {
            if (gameState.status !== 'DAY_ANIMATION') return;
            if (checkWin()) return;
            gameState.status = 'NIGHT';
            gameState.dayCount++;
            gameState.nightActions = {};
            addLog('Gece çöküyor...');
            startTimer(40, () => {
                if (gameState.status === 'NIGHT') resolveNight();
            });
        });
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
        const wasHostAlive = Boolean(gameState.players[oldHostId].isAlive);
        gameState.players[oldHostId].isAlive = false;
        gameState.players[oldHostId].isHost = false;
        if (wasHostAlive) processDeath(oldHostId);
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
            gameState.nightActions = gameState.nightActions || {};
            gameState.dayActions = gameState.dayActions || {};
            gameState.votes = gameState.votes || {};

            network.init(true, roomCode, username);
            network.players = gameState.players;
            myId = network.myId;

            // Re-map myId in gameState if it changed (vk-host-ROOM vs vk-client-xyz)
            if (myId !== oldMyId) {
                gameState.players[myId] = gameState.players[oldMyId];
                gameState.players[myId].id = myId;
                delete gameState.players[oldMyId];

                if (gameState.nightActions && gameState.nightActions[oldMyId]) {
                    gameState.nightActions[myId] = gameState.nightActions[oldMyId];
                    delete gameState.nightActions[oldMyId];
                }
                if (gameState.votes && gameState.votes[oldMyId]) {
                    gameState.votes[myId] = gameState.votes[oldMyId];
                    delete gameState.votes[oldMyId];
                }
                if (gameState.dayActions && gameState.dayActions[oldMyId]) {
                    gameState.dayActions[myId] = gameState.dayActions[oldMyId];
                    delete gameState.dayActions[oldMyId];
                }
                if (gameState.defensePlayerId === oldMyId) gameState.defensePlayerId = myId;
                Object.values(gameState.players).forEach(p => {
                    if (p.hirsizTarget === oldMyId) p.hirsizTarget = myId;
                    if (p.intikamciTarget === oldMyId) p.intikamciTarget = myId;
                    if (p.lastHealed === oldMyId) p.lastHealed = myId;
                });

                const remapActionMap = (mapObj) => {
                    if (!mapObj) return;
                    if (mapObj[oldMyId] !== undefined) {
                        mapObj[myId] = mapObj[oldMyId];
                        delete mapObj[oldMyId];
                    }
                    Object.keys(mapObj).forEach(k => {
                        if (mapObj[k] === oldMyId) mapObj[k] = myId;
                        else if (Array.isArray(mapObj[k])) {
                            mapObj[k] = mapObj[k].map(v => v === oldMyId ? myId : v);
                        }
                    });
                };
                remapActionMap(gameState.nightActions);
                remapActionMap(gameState.votes);
                remapActionMap(gameState.dayActions);
            }
            if (window.gameScene) window.gameScene.setLocalPlayer(myId);
            if (typeof syncHostUI === 'function') syncHostUI();
            if (myPendingAction) {
                handlePlayerAction(myId, myPendingAction.action, myPendingAction.target);
            }

            setTimeout(() => {
                network.broadcast({ type: 'REQUEST_PENDING_ACTIONS' });
                broadcastState();
                broadcastState();
                resumeMigratedHostPhase();
            }, 3000);
        } else {
            addLog(`Yeni kurucu ${gameState.players[newHostId].name} oldu. Yeniden bağlanılıyor...`);
            network.init(false, roomCode, username, oldMyId);
            myId = network.myId;
            setTimeout(() => {
                network.init(false, roomCode, username, oldMyId);
                myId = network.myId;
            }, 800);
        }
    }, 1500);
}, 1200);
}

function onStateUpdate(senderId, data) {
    if (data.type === 'GAME_STATE') {
        gameState = data.state;
        if (gameState.timerEndTime) startClientTimer(gameState.timerEndTime);
        updateUIForState();
        update3DSceneFromState();
    } else if (data.type === 'PRIVATE_LOG_CLEAR') {
        els.game.privateLogs.innerHTML = '<div style="color: #666; font-style: italic;">Henüz özel bir bilgi almadınız...</div>';
        if (els.game.willNotes) els.game.willNotes.value = '';
    } else if (data.type === 'ACTION' && isHost) {
        handlePlayerAction(senderId, data.action, data.target);
    } else if (data.type === 'PRIVATE_LOG' && data.target === myId) {
        addPrivateLog(data.msg);
    } else if (data.type === 'PLAY_ANIMATIONS' && data.target === myId) {
        if (window.gameScene) {
            data.anims.forEach(anim => {
                window.gameScene.animatePlayerAction(anim.actorId, anim.targetId, anim.type);
                const animsByActor = {};
                (data.anims || []).forEach(anim => {
                    if (!animsByActor[anim.actorId]) animsByActor[anim.actorId] = [];
                    animsByActor[anim.actorId].push(anim);
                });
                Object.values(animsByActor).forEach(queue => {
                    const runNext = (idx) => {
                        if (idx >= queue.length) return;
                        const a = queue[idx];
                        window.gameScene.animatePlayerAction(a.actorId, a.targetId, a.type, () => runNext(idx + 1));
                    };
                    runNext(0);
                });
                if (data.watchHouseId) {
                    window.gameScene.watchHouse(data.watchHouseId);
                }
            }
    } else if (data.type === 'HANG_ANIMATION') {
            if (window.gameScene) {
                window.gameScene.animateHang(data.targetId);
            }
            if (window.PairaAudio) window.PairaAudio.play('taboo');
        } else if (data.type === 'REQUEST_PENDING_ACTIONS') {
            if (myPendingAction) {
                network.sendToHost({ type: 'ACTION', action: myPendingAction.action, target: myPendingAction.target });
            }
        } else if (data.type === 'CHAT_MESSAGE' && isHost) {
            handleChatMessage(senderId, data.msg);
        } else if (data.type === 'UPDATE_WILL' && isHost) {
            if (gameState.players[senderId] && gameState.players[senderId].isAlive) {
                gameState.players[senderId].will = data.will;
            }
        }
    }

    function handleChatMessage(senderId, msg) {
        const sender = gameState.players[senderId];
        if (!sender) return;

        // Fısıldaşma (Whisper) kontrolü
        if (msg.startsWith('/w ')) {
            if (!sender.isAlive) {
                sendPrivateLog(senderId, "Ölüler fısıldaşamaz.");
                return;
            }
            if (gameState.status !== 'DAY_DISCUSSION') {
                sendPrivateLog(senderId, "Sadece gündüz tartışmasında fısıldaşabilirsiniz.");
                return;
            }
            const parts = msg.split(' ');
            if (parts.length >= 3) {
                const targetName = parts[1];
                const whisperMsg = parts.slice(2).join(' ');
                const targetId = Object.keys(gameState.players).find(id => {
                    const normPlayerName = window.normalizeTurkishChars(gameState.players[id].name);
                    const normTargetName = window.normalizeTurkishChars(targetName);
                    return normPlayerName === normTargetName;
                });

                if (targetId) {
                    if (!gameState.players[targetId].isAlive) {
                        sendPrivateLog(senderId, "Ölü birine fısıldayamazsın.");
                        return;
                    }
                    const formattedMsg = `(Fısıltı) ${sender.name}: ${whisperMsg}`;
                    network.sendTo(targetId, { type: 'PRIVATE_LOG', msg: formattedMsg, target: targetId });
                    network.sendTo(senderId, { type: 'PRIVATE_LOG', msg: `(Fısıltı -> ${gameState.players[targetId].name}): ${whisperMsg}`, target: senderId });

                    // Kasabaya fısıldaşıldığı bilgisi (Gözüküyor ama içerik yok)
                    const publicLog = `[Gözlem] ${sender.name}, ${gameState.players[targetId].name} kişisine fısıldıyor...`;
                    gameState.logs.push(publicLog);
                    broadcastState();
                    const rawRest = msg.slice(3).trim();
                    const normRest = window.normalizeTurkishChars(rawRest);
                    let targetId = null;
                    let whisperMsg = '';

                    // Çok kelimeli oyuncu isimlerini de desteklemek için en uzun isimden başlayarak eşleştir
                    const sortedIds = Object.keys(gameState.players).sort((a, b) =>
                        (gameState.players[b].name?.length || 0) - (gameState.players[a].name?.length || 0)
                    );
                    for (const id of sortedIds) {
                        const pName = gameState.players[id].name || '';
                        const normPlayerName = window.normalizeTurkishChars(pName);
                        if (normPlayerName && normRest.startsWith(normPlayerName + ' ')) {
                            targetId = id;
                            whisperMsg = rawRest.slice(pName.length).trim();
                            break;
                        }
                    }

                    if (!targetId) {
                        const parts = msg.split(' ');
                        if (parts.length >= 3) {
                            const targetName = parts[1];
                            whisperMsg = parts.slice(2).join(' ').trim();
                            targetId = Object.keys(gameState.players).find(id => {
                                const normPlayerName = window.normalizeTurkishChars(gameState.players[id].name);
                                const normTargetName = window.normalizeTurkishChars(targetName);
                                return normPlayerName === normTargetName;
                            });
                        } else {
                            sendPrivateLog(senderId, "Oyuncu bulunamadı.");
                            sendPrivateLog(senderId, "Kullanım: /w oyuncu_adı mesaj");
                            return;
                        }
                    }

                    if (targetId) {
                        if (targetId === senderId) {
                            sendPrivateLog(senderId, "Kendine fısıldayamazsın.");
                            return;
                        }
                        if (!gameState.players[targetId].isAlive) {
                            sendPrivateLog(senderId, "Ölü birine fısıldayamazsın.");
                            return;
                        }
                        if (!whisperMsg) {
                            sendPrivateLog(senderId, "Kullanım: /w oyuncu_adı mesaj");
                            return;
                        }
                        const formattedMsg = `(Fısıltı) ${sender.name}: ${whisperMsg}`;
                        network.sendTo(targetId, { type: 'PRIVATE_LOG', msg: formattedMsg, target: targetId });
                        network.sendTo(senderId, { type: 'PRIVATE_LOG', msg: `(Fısıltı -> ${gameState.players[targetId].name}): ${whisperMsg}`, target: senderId });

                        // Kasabaya fısıldaşıldığı bilgisi (Gözüküyor ama içerik yok)
                        const publicLog = `[Gözlem] ${sender.name}, ${gameState.players[targetId].name} kişisine fısıldıyor...`;
                        gameState.logs.push(publicLog);
                        broadcastState();
                    } else {
                        sendPrivateLog(senderId, "Oyuncu bulunamadı.");
                    }
                    return;
                }

                // Gece Vampir Sohbeti
                if (gameState.status === 'NIGHT') {
                    if (sender.team === 'VAMPIR') {
                        const formattedMsg = `![Vampir] ${sender.name}: ${msg}`; // ! starts purple color in UI, but we can make it red
                        Object.values(gameState.players).forEach(p => {
                            if (p.team === 'VAMPIR') {
                                network.sendTo(p.id, { type: 'PRIVATE_LOG', msg: formattedMsg, target: p.id });
                            }
                        });
                    } else {
                        sendPrivateLog(senderId, "Gece sadece vampirler konuşabilir.");
                    }
                    return;
                }

                // Savunma fazı
                if (gameState.status === 'DEFENSE') {
                    if (senderId !== gameState.defensePlayerId) {
                        sendPrivateLog(senderId, "Şu an sadece savunma yapan kişi konuşabilir.");
                        return;
                    }
                    const formattedMsg = `[SAVUNMA] ${sender.name}: ${msg}`;
                    gameState.logs.push(formattedMsg);
                    broadcastState();
                    return;
                }

                // Ölülerin Sohbeti (Sadece ölüler görür)
                if (!sender.isAlive) {
                    const formattedMsg = `[Mezarlık] ${sender.name}: ${msg}`;
                    Object.values(gameState.players).forEach(p => {
                        if (!p.isAlive) {
                            network.sendTo(p.id, { type: 'PRIVATE_LOG', msg: formattedMsg, target: p.id });
                        }
                    });
                    return;
                }

                // Gündüz normal sohbet
                if (gameState.status === 'DAY_DISCUSSION') {
                    const formattedMsg = `${sender.name}: ${msg}`;
                    gameState.logs.push(formattedMsg);
                    broadcastState();
                } else {
                    sendPrivateLog(senderId, "Şu an konuşamazsınız.");
                }
            }

            function update3DScene(playersObj) {
                if (window.gameScene) {
                    const arr = Object.values(playersObj).map(p => ({
                        id: p.id,
                        name: p.name,
                        isAlive: p.isAlive !== false
                    }));
                    window.gameScene.updatePlayers(arr);
                }
            }

            function update3DSceneFromState() {
                if (window.gameScene) {
                    const arr = Object.values(gameState.players).map(p => ({
                        id: p.id,
                        name: p.name,
                        isAlive: p.isAlive
                    }));
                    window.gameScene.updatePlayers(arr);
                    window.gameScene.setNight(gameState.status === 'NIGHT' || gameState.status === 'NIGHT_ANIMATION');
                    const myPlayer = gameState.players[myId];
                    const showCampfire = (myPlayer && myPlayer.team === 'VAMPIR' && gameState.status !== 'END') ? true : gameState.campfireActive;
                    window.gameScene.setCampfireActive(showCampfire);
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
                let randomAnyCount = assignedRoles['RASTGELE_HERHANGI'] || 0;
                Object.keys(assignedRoles).forEach(r => {
                    if (ROLES[r] && (ROLES[r].team === 'VAMPIR' || r === 'RASTGELE_VAMPIR' || r === 'RASTGELE_KOTU')) vampCount += assignedRoles[r];
                });

                if (vampCount >= pCount) { showToast("Vampir sayısı toplam oyuncu sayısından az olmalı!", "error"); return; }
                if (vampCount === 0) { showToast("En az 1 Vampir takımından rol olmalı!", "error"); return; }
                if (vampCount === 0 && randomAnyCount === 0) { showToast("En az 1 Vampir takımından rol olmalı!", "error"); return; }

                gameState.settings = {
                    assignedRoles: assignedRoles,
                    discussionTime: parseInt(els.lobby.discussionTime.value) || 90
                };

                assignRoles();
                roleModalShown = false;

                gameState.status = 'NIGHT';
                gameState.dayCount = 1;
                gameState.logs = ['Oyun başladı! Roller dağıtıldı.'];
                gameState.nightActions = {};
                gameState.dayActions = {};
                gameState.votes = {};
                gameState.campfireActive = true;

                // Clear private logs
                // Clear private logs on clients and host
                network.broadcast({ type: 'PRIVATE_LOG_CLEAR' });
                onStateUpdate(myId, { type: 'PRIVATE_LOG_CLEAR' });

                startTimer(40, () => {
                    if (gameState.status === 'NIGHT') resolveNight();
                });

                // G9: Notify Oduncu
                // G9: Notify Oduncu & Vampire teammates
                setTimeout(() => {
                    const vamps = Object.values(gameState.players).filter(p => p.team === 'VAMPIR');
                    Object.values(gameState.players).forEach(p => {
                        if (p.isOduncu) {
                            sendPrivateLog(p.id, 'Sen köyün Oduncususun! Eğer ölürsen kamp ateşi sönecek.');
                        }
                        if (p.team === 'VAMPIR' && vamps.length > 1) {
                            const mates = vamps
                                .filter(m => m.id !== p.id)
                                .map(m => `${m.name} (${ROLES[m.role]?.name || m.role})`)
                                .join(', ');
                            sendPrivateLog(p.id, `![Vampir] Takım arkadaşların: ${mates}`);
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

                // Resolve random roles before assigning to players
                let resolvedRoles = [];

                // Yardımcı fonksiyon: Belirli bir takımdan (veya genel) rastgele rol seç
                const getRandomRole = (teamFilter, customPoolKey) => {
                    const getRandomRole = (teamFilter, customPoolKey, excludeTeamFilter = null) => {
                        let pool = Object.keys(ROLES).filter(k => {
                            let r = ROLES[k];
                            if (r.isRandom) return false;
                            if (k === 'KOYLU') return false; // Köylü rastgele havuzuna girmez
                            if (teamFilter && r.team !== teamFilter) return false;
                            if (excludeTeamFilter && r.team === excludeTeamFilter) return false;
                            if (customPoolKey && window.customRandomPools && window.customRandomPools[customPoolKey]) {
                                if (!window.customRandomPools[customPoolKey].includes(k)) return false;
                            }
                            return true;
                        });
                        if (pool.length === 0) {
                            // Eğer oyuncu tüm rolleri kapatmışsa varsayılan havuzdan seçmeye devam et
                            pool = Object.keys(ROLES).filter(k => !ROLES[k].isRandom && k !== 'KOYLU' && (!teamFilter || ROLES[k].team === teamFilter));
                            pool = Object.keys(ROLES).filter(k => !ROLES[k].isRandom && k !== 'KOYLU' && (!teamFilter || ROLES[k].team === teamFilter) && (!excludeTeamFilter || ROLES[k].team !== excludeTeamFilter));
                        }
                        if (pool.length === 0) return 'KOYLU'; // Mutlak fallback
                        return pool[Math.floor(Math.random() * pool.length)];
                    };

                    // Tüm atanan rolleri bir listeye (resolvedRoles) ekle
                    // Önce RASTGELE_HERHANGI dışındaki rolleri çöz
                    Object.keys(assignedRoles).forEach(roleKey => {
                        if (roleKey === 'RASTGELE_HERHANGI') return;
                        let count = assignedRoles[roleKey];
                        for (let i = 0; i < count; i++) {
                            let finalRole = roleKey;

                            // Eğer rol rastgele bir slot ise, onu gerçek bir role çevir
                            if (roleKey === 'RASTGELE_HERHANGI') finalRole = getRandomRole(null, null);
                            else if (roleKey === 'RASTGELE_KOY' || roleKey === 'RASTGELE_IYI') finalRole = getRandomRole('KOY', 'RASTGELE_IYI');
                            if (roleKey === 'RASTGELE_KOY' || roleKey === 'RASTGELE_IYI') finalRole = getRandomRole('KOY', 'RASTGELE_IYI');
                            else if (roleKey === 'RASTGELE_VAMPIR' || roleKey === 'RASTGELE_KOTU') finalRole = getRandomRole('VAMPIR', 'RASTGELE_KOTU');
                            else if (roleKey === 'RASTGELE_TARAFSIZ' || roleKey === 'RASTGELE_NOTR') finalRole = getRandomRole('TARAFSIZ', 'RASTGELE_NOTR');

                            resolvedRoles.push(finalRole);
                        }
                    });

                    // Sonra RASTGELE_HERHANGI slotlarını çöz (en az 1 Vampir ve en az 1 Vampir olmayan rol garantile)
                    const anyCount = assignedRoles['RASTGELE_HERHANGI'] || 0;
                    for (let i = 0; i < anyCount; i++) {
                        const currentVamps = resolvedRoles.filter(r => ROLES[r]?.team === 'VAMPIR').length;
                        let finalRole;
                        if (currentVamps === 0 && i === anyCount - 1) {
                            finalRole = getRandomRole('VAMPIR', null);
                        } else if (currentVamps >= pIds.length - 1) {
                            finalRole = getRandomRole(null, null, 'VAMPIR');
                        } else {
                            finalRole = getRandomRole(null, null);
                        }
                        resolvedRoles.push(finalRole);
                    }

                    // Oyunculara rolleri dağıt
                    resolvedRoles.forEach(r => {
                        if (index < pIds.length) {
                            gameState.players[pIds[index++]].role = r;
                        }
                    });

                    // Kalan oyuncular KOYLU olur
                    while (index < pIds.length) {
                        gameState.players[pIds[index++]].role = 'KOYLU';
                    }

                    // Assign Oduncu randomly to one Koylu
                    Object.values(gameState.players).forEach(p => { p.isOduncu = false; });
                    let koyluler = Object.values(gameState.players).filter(p => p.role === 'KOYLU');
                    if (koyluler.length > 0) {
                        koyluler[Math.floor(Math.random() * koyluler.length)].isOduncu = true;
                    }

                    const initialRoleCounts = {};
                    Object.values(gameState.players).forEach(p => {
                        p.isAlive = true;
                        p.team = ROLES[p.role]?.team || 'KOY';
                        p.selfHealCount = 0;
                        p.lastHealed = null;
                        p.usedAbility = false;
                        p.isPoisoned = false;
                        p.isDoused = false;
                        p.will = '';
                        p.hirsizStole = false;
                        p.intikamciCanPick = (p.role === 'INTIKAMCI');
                        if (p.role === 'DELI') {
                            p.fakeRole = ['GOZCU', 'IZCI', 'DEDEKTIF'][Math.floor(Math.random() * 3)];
                        } else {
                            p.fakeRole = null;
                        }
                        p.hirsizTarget = null;
                        p.intikamciTarget = null;

                        if (p.role) {
                            let rName = ROLES[p.role]?.name || 'Bilinmiyor';
                            initialRoleCounts[rName] = (initialRoleCounts[rName] || 0) + 1;
                        }
                    });
                    gameState.initialRoleCounts = initialRoleCounts;
                    gameState.roleCounts = initialRoleCounts;
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
                        // G5: Use initial role counts during the game so Hırsız role theft is not leaked in the public HUD
                        if (gameState.initialRoleCounts) {
                            gameState.roleCounts = gameState.initialRoleCounts;
                        } else {
                            const roleCounts = {};
                            Object.values(gameState.players).forEach(p => {
                                if (p.role) {
                                    let rName = ROLES[p.role]?.name || 'Bilinmiyor';
                                    roleCounts[rName] = (roleCounts[rName] || 0) + 1;
                                }
                            });
                            gameState.roleCounts = roleCounts;
                        }
                        const isEnd = gameState.status === 'END';

                        Object.keys(network.connections).forEach(clientId => {
                            const conn = network.connections[clientId];
                            if (conn && conn.open) {
                                const clientState = JSON.parse(JSON.stringify(gameState));
                                if (!isEnd) {
                                    const clientPlayer = gameState.players[clientId];
                                    const isClientVamp = Boolean(clientPlayer && clientPlayer.team === 'VAMPIR');
                                    Object.values(clientState.players).forEach(p => {
                                        if (p.id !== clientId) {
                                            delete p.role;
                                            delete p.team;
                                            if (!(isClientVamp && p.team === 'VAMPIR')) {
                                                delete p.team;
                                            }
                                        }
                                    });
                                    // Vampirler kamp ateşini göremez
                                    const clientPlayer = gameState.players[clientId];
                                    if (clientPlayer && clientPlayer.team === 'VAMPIR') {
                                        if (isClientVamp) {
                                            clientState.campfireActive = true; // hep yanıyor görünsün
                                        }
                                    }
                                    delete clientState.nightActions;
                                    delete clientState.dayActions;
                                    network.sendTo(clientId, { type: 'GAME_STATE', state: clientState });
                                }
                            });

                        updateUIForState();
                        update3DSceneFromState();
                    }
                }

                function sendPrivateLog(targetId, msg) {
                    if (isHost) {
                        network.sendTo(targetId, { type: 'PRIVATE_LOG', target: targetId, msg: msg });
                        if (targetId === myId) addPrivateLog(msg);
                    }
                }

                function submitAction(targetId) {
                    myPendingAction = { action: gameState.status, target: targetId };
                    network.sendToHost({ type: 'ACTION', action: gameState.status, target: targetId });
                    els.game.actionPanel.classList.add('hidden');
                }

                function addLog(msg) {
                    gameState.logs.push(msg);
                    if (!isHost) renderLogs();
                }

                function checkNightEnd() {
                    let requiredActions = 0;
                    Object.values(gameState.players).forEach(p => {
                        if (p.isAlive && ROLES[p.role]?.hasNightAction) {
                            // Hırsız sadece ilk gece aksiyon alabilir
                            if (p.role === 'HIRSIZ' && gameState.dayCount > 1) {
                                return;
                            }
                            requiredActions++;
                        }
                    });

                    if (Object.keys(gameState.nightActions).length >= requiredActions) {
                        resolveNight();
                    }
                }

                function resolveNight() {
                    if (gameState.status !== 'NIGHT') return;
                    clearHostTimer();
                    let actions = gameState.nightActions;
                    let blockedPlayers = new Set();
                    let traps = new Set();
                    let visits = {};
                    let protectedPlayers = new Set();
                    let poisonedPlayers = new Set();
                    let deaths = [];
                    let clientAnimations = {};
                    let notifiedBlockedOrTrapped = new Set();
                    Object.keys(gameState.players).forEach(id => clientAnimations[id] = []);

                    const visit = (actorId, targetId, isPoliceImmune = false, isTrapImmune = false) => {
                        if (!isPoliceImmune && blockedPlayers.has(actorId)) {
                            clientAnimations[actorId].push({ actorId: actorId, targetId: targetId, type: 'POLICE_BLOCK' });
                            if (!notifiedBlockedOrTrapped.has(actorId)) {
                                notifiedBlockedOrTrapped.add(actorId);
                                sendPrivateLog(actorId, "Bu gece Polis tarafından bloklandın, aksiyonun gerçekleşmedi!");
                            }
                            return false;
                        }
                        if (!isTrapImmune && traps.has(targetId)) {
                            clientAnimations[actorId].push({ actorId: actorId, targetId: targetId, type: 'TRAPPED' });
                            if (!notifiedBlockedOrTrapped.has(actorId)) {
                                notifiedBlockedOrTrapped.add(actorId);
                                sendPrivateLog(actorId, "Bu gece gittiğin evde tuzağa yakalandın, aksiyonun iptal oldu!");
                            }
                            return false;
                        }
                        if (!visits[targetId]) visits[targetId] = [];
                        visits[targetId].push(actorId);
                        return true;
                    };

                    // 1. Polis
                    Object.entries(actions).forEach(([aid, tid]) => {
                        let p = gameState.players[aid];
                        if (p && p.role === 'POLIS' && p.isAlive && gameState.players[tid]?.role !== 'SERI_KATIL' && tid !== 'skip') {
                            blockedPlayers.add(tid);
                            if (p && p.role === 'POLIS' && p.isAlive && tid !== 'skip' && gameState.players[tid]) {
                                const targetRole = gameState.players[tid].role;
                                if (targetRole !== 'SERI_KATIL' && targetRole !== 'VAMPIR_IZCISI') {
                                    blockedPlayers.add(tid);
                                }
                                if (!visits[tid]) visits[tid] = [];
                                visits[tid].push(aid);
                                clientAnimations[aid].push({ actorId: aid, targetId: tid, type: 'WALK' });
                            }
                        });

                    // 2. Tuzakçı
                    Object.entries(actions).forEach(([aid, tid]) => {
                        let p = gameState.players[aid];
                        if (p && p.role === 'TUZAKCI' && p.isAlive && !blockedPlayers.has(aid) && tid !== 'skip') {
                            traps.add(tid);
                            clientAnimations[aid].push({ actorId: aid, targetId: tid, type: 'WALK' });
                            if (p && p.role === 'TUZAKCI' && p.isAlive && tid !== 'skip' && gameState.players[tid]) {
                                if (blockedPlayers.has(aid)) {
                                    clientAnimations[aid].push({ actorId: aid, targetId: tid, type: 'POLICE_BLOCK' });
                                    if (!notifiedBlockedOrTrapped.has(aid)) {
                                        notifiedBlockedOrTrapped.add(aid);
                                        sendPrivateLog(aid, "Bu gece Polis tarafından bloklandın, tuzak kuramadın!");
                                    }
                                } else {
                                    traps.add(tid);
                                    if (!visits[tid]) visits[tid] = [];
                                    visits[tid].push(aid);
                                    clientAnimations[aid].push({ actorId: aid, targetId: tid, type: 'WALK' });
                                }
                            }
                        });

                    // 4. Doktor
                    Object.values(gameState.players).forEach(p => { if (p.role === 'DOKTOR') p.didHeal = false; });
                    Object.entries(actions).forEach(([aid, tid]) => {
                        let p = gameState.players[aid];
                        if (p && p.role === 'DOKTOR' && p.isAlive && tid !== 'skip') {
                            if (tid === aid && p.selfHealCount >= 1) return;
                            if (p.lastHealed === tid) return;

                            if (visit(aid, tid, false, false)) {
                                p.didHeal = true;
                                protectedPlayers.add(tid);
                                clientAnimations[aid].push({ actorId: aid, targetId: tid, type: 'WALK' });
                                if (tid === aid) p.selfHealCount = (p.selfHealCount || 0) + 1;
                                p.lastHealed = tid;
                            }
                        }
                    });
                    Object.values(gameState.players).forEach(p => { if (p.role === 'DOKTOR' && !p.didHeal) p.lastHealed = null; });

                    // 3. Seri Katil
                    let skTarget = null;
                    let skId = null;
                    let skActions = [];
                    Object.entries(actions).forEach(([aid, tid]) => {
                        if (gameState.players[aid]?.role === 'SERI_KATIL' && gameState.players[aid].isAlive && tid !== 'skip') {
                            if (visit(aid, tid, true, false)) {
                                skTarget = tid;
                                skId = aid;
                                skActions.push({ actorId: aid, targetId: tid });
                                clientAnimations[aid].push({ actorId: aid, targetId: tid, type: 'KILL' });
                            }
                        }
                    });

                    // 5. Vampirler
                    let vampVotes = {};
                    let profTarget = null, zehirTarget = null;
                    let profActorId = null, zehirActorId = null;
                    let profActions = [];
                    let zehirActions = [];
                    let mainVamp = null;
                    let vampTarget = null;
                    const livingVamps = Object.values(gameState.players).filter(p => p.isAlive && p.team === 'VAMPIR');
                    const isSoleLivingVamp = livingVamps.length === 1;
                    const isFirstNight = gameState.dayCount === 1;

                    Object.entries(actions).forEach(([aid, tid]) => {
                        let p = gameState.players[aid];
                        if (p && p.team === 'VAMPIR' && p.isAlive && tid !== 'skip') {
                            if (p.role === 'VAMPIR_IZCISI' && !isSoleLivingVamp) {
                                return;
                            }
                            if (p.role === 'PROFESYONEL' && !p.usedAbility && !isFirstNight) {
                                profTarget = tid;
                                profActorId = aid;
                                profActions.push({ actorId: aid, targetId: tid });
                            } else if (p.role === 'ZEHIRLI' && !p.usedAbility && !isFirstNight) {
                                zehirTarget = tid;
                                zehirActorId = aid;
                                zehirActions.push({ actorId: aid, targetId: tid });
                            } else {
                                vampVotes[tid] = (vampVotes[tid] || 0) + 1;
                            }
                        }
                    });
                    let maxV = 0;
                    Object.entries(vampVotes).forEach(([tid, c]) => {
                        if (c > maxV) { maxV = c; vampTarget = tid; }
                    });
                    if (vampTarget) {
                        mainVamp = Object.keys(actions).find(aid => {
                            const eligibleVampVoters = Object.keys(actions).filter(aid => {
                                const p = gameState.players[aid];
                                if (!p || p.team !== 'VAMPIR' || !p.isAlive || actions[aid] !== vampTarget) return false;
                                if (p.role === 'VAMPIR_IZCISI' && !isSoleLivingVamp) return false;
                                if (p.role === 'PROFESYONEL' && !p.usedAbility && !isFirstNight) return false;
                                if (p.role === 'ZEHIRLI' && !p.usedAbility && !isFirstNight) return false;
                                return true;
                            });
                            mainVamp = eligibleVampVoters.find(aid => !blockedPlayers.has(aid)) || eligibleVampVoters[0] || null;
                        }

    let profSucceededTarget = null;
                        if (profTarget && profActorId && visit(profActorId, profTarget, false, false)) {
                            gameState.players[profActorId].usedAbility = true;
                            profSucceededTarget = profTarget;
                            deaths.push({ id: profTarget, killer: 'VAMPIR_PROF' });
                            clientAnimations[profActorId].push({ actorId: profActorId, targetId: profTarget, type: 'KILL' });
                        }
                        let profSucceededTargets = new Set();
                        profActions.forEach(({ actorId: profActorId, targetId: profTarget }) => {
                            if (visit(profActorId, profTarget, false, false)) {
                                gameState.players[profActorId].usedAbility = true;
                                profSucceededTargets.add(profTarget);
                                deaths.push({ id: profTarget, killer: 'VAMPIR_PROF' });
                                clientAnimations[profActorId].push({ actorId: profActorId, targetId: profTarget, type: 'KILL' });
                            }
                        });

                        let vampSucceededTarget = null;
                        if (vampTarget && mainVamp && visit(mainVamp, vampTarget, false, false)) {
                            const isMainVampIzci = mainVamp && gameState.players[mainVamp]?.role === 'VAMPIR_IZCISI';
                            if (vampTarget && mainVamp && visit(mainVamp, vampTarget, isMainVampIzci, isMainVampIzci)) {
                                vampSucceededTarget = vampTarget;
                                if (!protectedPlayers.has(vampTarget) && gameState.players[vampTarget]?.role !== 'SERI_KATIL') {
                                    deaths.push({ id: vampTarget, killer: 'VAMPIR' });
                                }
                                clientAnimations[mainVamp].push({ actorId: mainVamp, targetId: vampTarget, type: 'KILL' });
                            }

                            Object.entries(actions).forEach(([aid, tid]) => {
                                const p = gameState.players[aid];
                                if (p && p.role === 'VAMPIR_IZCISI' && p.isAlive && tid !== 'skip' && aid !== mainVamp) {
                                    visit(aid, tid, true, true);
                                    clientAnimations[aid].push({ actorId: aid, targetId: tid, type: 'WALK' });
                                }
                            });

                            if (zehirTarget && zehirActorId && visit(zehirActorId, zehirTarget, false, false)) {
                                gameState.players[zehirActorId].usedAbility = true;
                                clientAnimations[zehirActorId].push({ actorId: zehirActorId, targetId: zehirTarget, type: 'WALK' });
                                if (protectedPlayers.has(zehirTarget)) {
                                    sendPrivateLog(zehirTarget, "Zehirlenmeye çalışıldın ama bu gece Doktor tarafından kurtarıldın!");
                                } else {
                                    poisonedPlayers.add(zehirTarget);
                                    sendPrivateLog(zehirTarget, "Zehirlendin! Yarın gece bir Doktor tarafından iyileştirilmezsen öleceksin!");
                                    zehirActions.forEach(({ actorId: zehirActorId, targetId: zehirTarget }) => {
                                        if (visit(zehirActorId, zehirTarget, false, false)) {
                                            gameState.players[zehirActorId].usedAbility = true;
                                            clientAnimations[zehirActorId].push({ actorId: zehirActorId, targetId: zehirTarget, type: 'WALK' });
                                            if (protectedPlayers.has(zehirTarget)) {
                                                sendPrivateLog(zehirTarget, "Zehirlenmeye çalışıldın ama bu gece Doktor tarafından kurtarıldın!");
                                            } else {
                                                poisonedPlayers.add(zehirTarget);
                                                sendPrivateLog(zehirTarget, "Zehirlendin! Yarın gece bir Doktor tarafından iyileştirilmezsen öleceksin!");
                                            }
                                        }
                                    }
    });

                                Object.values(gameState.players).forEach(p => {
                                    if (p.isAlive && p.isPoisoned) {
                                        if (protectedPlayers.has(p.id)) p.isPoisoned = false;
                                        else deaths.push({ id: p.id, killer: 'ZEHIR' });
                                        if (protectedPlayers.has(p.id)) {
                                            p.isPoisoned = false;
                                            sendPrivateLog(p.id, "Doktor tarafından tedavi edildin ve zehirden kurtuldun!");
                                        } else {
                                            deaths.push({ id: p.id, killer: 'ZEHIR' });
                                        }
                                    }
                                });
                                poisonedPlayers.forEach(id => {
                                    if (gameState.players[id] && !protectedPlayers.has(id)) {
                                        gameState.players[id].isPoisoned = true;
                                    }
                                });

                                let ugMap = {};
                                Object.entries(actions).forEach(([aid, tid]) => {
                                    let p = gameState.players[aid];
                                    if (p && p.role === 'UYURGEZER' && p.isAlive && tid !== 'skip') {
                                        if (visit(aid, tid, false, false)) {
                                            ugMap[aid] = tid;
                                            clientAnimations[aid].push({ actorId: aid, targetId: tid, type: 'WALK' });
                                        }
                                    }
                                });

                                if (skTarget && skId) {
                                    const skActorIdsWithTarget = new Set();
                                    skActions.forEach(({ actorId: skId, targetId: skTarget }) => {
                                        skActorIdsWithTarget.add(skId);
                                        const targetIsSleepwalkingOut = ugMap[skTarget] && ugMap[skTarget] !== skTarget;
                                        if (!targetIsSleepwalkingOut && !protectedPlayers.has(skTarget)) {
                                            deaths.push({ id: skTarget, killer: 'SERI_KATIL' });
                                        }
                                    }
    });

                                Object.entries(ugMap).forEach(([ugId, ugTarget]) => {
                                    let targetTeam = gameState.players[ugTarget]?.team;
                                    let targetPlayer = gameState.players[ugTarget];
                                    let targetTeam = targetPlayer?.team;
                                    if (targetTeam === 'VAMPIR') {
                                        if (!protectedPlayers.has(ugId)) deaths.push({ id: ugId, killer: 'VAMPIR' });
                                    } else if ((vampSucceededTarget === ugTarget && !protectedPlayers.has(ugTarget)) || profSucceededTarget === ugTarget) {
                                    } else if ((vampSucceededTarget === ugTarget && !protectedPlayers.has(ugTarget)) || profSucceededTargets.has(ugTarget)) {
                                        if (!protectedPlayers.has(ugId)) deaths.push({ id: ugId, killer: 'VAMPIR_COLLATERAL' });
                                    } else if (ugTarget === skId) {
                                        if (!skTarget && !protectedPlayers.has(ugId)) {
                                        } else if (targetPlayer?.role === 'SERI_KATIL') {
                                            if (!skActorIdsWithTarget.has(ugTarget) && !protectedPlayers.has(ugId)) {
                                                deaths.push({ id: ugId, killer: 'SERI_KATIL' });
                                            }
                                        }
                                    });

                                Object.entries(actions).forEach(([aid, tid]) => {
                                    let p = gameState.players[aid];
                                    if (p && p.role === 'KUNDAKCI' && p.isAlive && tid !== 'skip') {
                                        if (tid === aid) {
                                            if (!visit(aid, aid, false, false)) {
                                                return;
                                            }
                                            Object.values(gameState.players).forEach(target => {
                                                if (target.isAlive && target.isDoused) {
                                                    deaths.push({ id: target.id, killer: 'KUNDAKCI' });
                                                    clientAnimations[aid].push({ actorId: aid, targetId: target.id, type: 'KILL' });
                                                }
                                            });
                                        } else {
                                            if (visit(aid, tid, false, false)) {
                                                clientAnimations[aid].push({ actorId: aid, targetId: tid, type: 'WALK' });
                                                if (gameState.players[tid]) gameState.players[tid].isDoused = true;
                                            }
                                        }
                                    }
                                });

                                // Hırsız, İzci ve Dedektif ziyaretlerini Gözcü kontrolünden önce işle
                                Object.entries(actions).forEach(([aid, tid]) => {
                                    let p = gameState.players[aid];
                                    if (!p || !p.isAlive || tid === 'skip') return;

                                    let isDeli = p.role === 'DELI';
                                    let fakeRole = p.fakeRole || (p.fakeRole = ['GOZCU', 'IZCI', 'DEDEKTIF'][Math.floor(Math.random() * 3)]);

                                    if (p.role === 'HIRSIZ' && gameState.dayCount === 1) {
                                        if (visit(aid, tid, false, false)) {
                                            p.hirsizTarget = tid;
                                            clientAnimations[aid].push({ actorId: aid, targetId: tid, type: 'WALK' });
                                        }
                                    } else if (p.role === 'IZCI' || p.role === 'VAMPIR_IZCISI' || (isDeli && fakeRole === 'IZCI')) {
                                        let isVampIzci = p.role === 'VAMPIR_IZCISI';
                                        let success = isVampIzci ? true : visit(aid, tid, false, false);

                                        if (success && gameState.players[tid]) {
                                            if (!isVampIzci) {
                                                clientAnimations[aid].push({ actorId: aid, targetId: tid, type: 'WALK' });
                                            }
                                            let tr = gameState.players[tid].role;
                                            if (tr === 'DRACULA') tr = 'KOYLU';
                                            if (isDeli && Math.random() > 0.5) {
                                                let roleKeys = Object.keys(ROLES).filter(k => k !== tr && !ROLES[k].isRandom);
                                                tr = roleKeys[Math.floor(Math.random() * roleKeys.length)];
                                            }
                                            sendPrivateLog(aid, `${gameState.players[tid].name} rolü: ${ROLES[tr]?.name || tr}`);
                                        }
                                    } else if (p.role === 'DEDEKTIF' || (isDeli && fakeRole === 'DEDEKTIF')) {
                                        if (Array.isArray(tid) && tid.length === 2 && gameState.players[tid[0]] && gameState.players[tid[1]]) {
                                            if (blockedPlayers.has(aid)) {
                                                clientAnimations[aid].push({ actorId: aid, targetId: tid[0], type: 'POLICE_BLOCK' });
                                                if (!notifiedBlockedOrTrapped.has(aid)) {
                                                    notifiedBlockedOrTrapped.add(aid);
                                                    sendPrivateLog(aid, "Bu gece Polis tarafından bloklandın, aksiyonun gerçekleşmedi!");
                                                }
                                                return;
                                            }
                                            let v1 = visit(aid, tid[0], false, false);
                                            let v2 = v1 ? visit(aid, tid[1], false, false) : false;
                                            if (v1 && v2) {
                                                clientAnimations[aid].push({ actorId: aid, targetId: tid[0], type: 'WALK' });
                                                clientAnimations[aid].push({ actorId: aid, targetId: tid[1], type: 'WALK' });
                                                let team1 = gameState.players[tid[0]].team;
                                                let team2 = gameState.players[tid[1]].team;
                                                if (gameState.players[tid[0]].role === 'DRACULA') team1 = 'KOY';
                                                if (gameState.players[tid[1]].role === 'DRACULA') team2 = 'KOY';
                                                let sameTeam = team1 === team2;
                                                if (isDeli && Math.random() > 0.5) sameTeam = !sameTeam;
                                                sendPrivateLog(aid, `${gameState.players[tid[0]].name} ve ${gameState.players[tid[1]].name} ${sameTeam ? 'Aynı Takımda' : 'Farklı Takımda'}`);
                                            }
                                        }
                                    }
                                });

                                // Gözcü en son kontrol eder ki tüm ziyaretçileri görebilsin
                                Object.entries(actions).forEach(([aid, tid]) => {
                                    let p = gameState.players[aid];
                                    if (!p || !p.isAlive || tid === 'skip') return;

                                    let isDeli = p.role === 'DELI';
                                    let fakeRole = p.fakeRole || (p.fakeRole = ['GOZCU', 'IZCI', 'DEDEKTIF'][Math.floor(Math.random() * 3)]);

                                    if (p.role === 'GOZCU' || (isDeli && fakeRole === 'GOZCU')) {
                                        if (visit(aid, tid, false, false) && gameState.players[tid]) {
                                            let seen = (visits[tid] || []).filter(id => id !== aid && gameState.players[id]);
                                            if (tid !== aid) {
                                                clientAnimations[aid].push({ actorId: aid, targetId: tid, type: 'WALK' });
                                            }
                                            let seen = [...new Set((visits[tid] || []).filter(id => id !== aid && gameState.players[id]))];
                                            if (isDeli) {
                                                if (Math.random() > 0.6) {
                                                    let randId = Object.keys(gameState.players)[Math.floor(Math.random() * Object.keys(gameState.players).length)];
                                                    seen = [randId];
                                                    const candidates = Object.keys(gameState.players).filter(id => id !== aid && gameState.players[id]?.isAlive);
                                                    if (candidates.length > 0) {
                                                        seen = [candidates[Math.floor(Math.random() * candidates.length)]];
                                                    } else {
                                                        seen = [];
                                                    }
                                                } else if (Math.random() > 0.5) {
                                                    seen = [];
                                                }
                                            }
                                            sendPrivateLog(aid, `${gameState.players[tid].name} evine girenler: ${seen.map(id => gameState.players[id]?.name || 'Biri').join(', ') || 'Kimse'}`);

                                            network.sendTo(aid, { type: 'PLAY_ANIMATIONS', target: aid, anims: [], watchHouseId: tid });

                                            seen.forEach(visitorId => {
                                                if (!gameState.players[visitorId]) return;
                                                const vRole = gameState.players[visitorId].role;
                                                let aType = 'WALK';
                                                if (blockedPlayers.has(visitorId)) aType = 'POLICE_BLOCK';
                                                else if (traps.has(tid)) aType = 'TRAPPED';
                                                else if (gameState.players[visitorId].role === 'SERI_KATIL') aType = 'KILL';
                                                if (blockedPlayers.has(visitorId) && vRole !== 'SERI_KATIL' && vRole !== 'VAMPIR_IZCISI') aType = 'POLICE_BLOCK';
                                                else if (traps.has(tid) && vRole !== 'VAMPIR_IZCISI') aType = 'TRAPPED';
                                                else if (vRole === 'SERI_KATIL') aType = 'KILL';
                                                clientAnimations[aid].push({ actorId: visitorId, targetId: tid, type: aType });
                                            });
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
                                    const actualDeaths = [];
                                    if (deaths.length > 0) {
                                        deaths.forEach(d => {
                                            if (gameState.players[d.id] && gameState.players[d.id].isAlive) {
                                                const victim = gameState.players[d.id];
                                                if (victim && victim.isAlive) {
                                                    // Profesyonel SK bağışıklığını geçer
                                                    if (d.killer === 'VAMPIR' && gameState.players[d.id].role === 'SERI_KATIL') return;
                                                    gameState.players[d.id].isAlive = false;
                                                    addLog(`${gameState.players[d.id].name} gece öldürüldü!`);

                                                    processDeath(d.id);

                                                    if (gameState.players[d.id].will) {
                                                        addLog(`📜 ${gameState.players[d.id].name} kişisinin vasiyeti:`);
                                                        addLog(`"${gameState.players[d.id].will}"`);
                                                    }
                                                    if (d.killer === 'VAMPIR' && victim.role === 'SERI_KATIL') return;
                                                    victim.isAlive = false;
                                                    victim.isPoisoned = false;
                                                    actualDeaths.push(victim);
                                                }
                                            });
                                    }
                                    if (actualDeaths.length > 0) {
                                        actualDeaths.forEach(victim => {
                                            addLog(`${victim.name} gece öldürüldü!`);
                                            processDeath(victim.id);
                                            if (victim.will) {
                                                addLog(`📜 ${victim.name} kişisinin vasiyeti:`);
                                                addLog(`"${victim.will}"`);
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
                                        resolveDayActions(true);
                                        if (checkWin()) return;

                                        gameState.status = 'VOTING';
                                        gameState.votes = {};
                                        addLog('Tartışma bitti. Oylama başladı.');
                                        broadcastState();

                                        startTimer(30, () => {
                                            if (gameState.status === 'VOTING') resolveVoting();
                                        });
                                    });
                                }, 9000);
                            }
                            function resolveDayActions() {

                                function resolveDayActions(isEndOfDiscussion = false) {
                                    Object.entries(gameState.dayActions).forEach(([aid, tid]) => {
                                        let p = gameState.players[aid];
                                        if (!p) return;
                                        if (p.isAlive && p.role === 'SERIF' && tid !== 'skip') {
                                            if (!p.usedAbility) {
                                                p.usedAbility = true;
                                                let target = gameState.players[tid];
                                                if (target && target.isAlive) {
                                                    target.isAlive = false;
                                                    target.isPoisoned = false;
                                                    addLog(`Şerif ${p.name}, ${target.name} kişisini vurdu!`);
                                                    processDeath(target.id);
                                                    if (target.will) {
                                                        addLog(`📜 ${target.name} kişisinin vasiyeti:`);
                                                        addLog(`"${target.will}"`);
                                                    }
                                                    if (target.team === 'KOY') {
                                                        p.isAlive = false;
                                                        p.isPoisoned = false;
                                                        addLog(`Şerif ${p.name} masum birini vurduğu için vicdan azabından intihar etti.`);
                                                        processDeath(p.id);
                                                        if (p.will) {
                                                            addLog(`📜 ${p.name} kişisinin vasiyeti:`);
                                                            addLog(`"${p.will}"`);
                                                        }
                                                    }
                                                }
                                            }
                                        } else if (p.isAlive && p.role === 'INTIKAMCI' && tid !== 'skip') {
                                            if (!p.intikamciTarget && gameState.players[tid]) {
                                            } else if (p.isAlive && p.role === 'INTIKAMCI') {
                                                if (tid === 'skip') {
                                                    p.intikamciCanPick = false;
                                                } else if (!p.intikamciTarget && gameState.players[tid]) {
                                                    p.intikamciTarget = tid;
                                                    p.intikamciCanPick = false;
                                                    sendPrivateLog(aid, `İntikam hedefin: ${gameState.players[tid].name}`);
                                                }
                                            }
                                        });
                                    if (isEndOfDiscussion) {
                                        Object.values(gameState.players).forEach(p => {
                                            if (p.role === 'INTIKAMCI') {
                                                p.intikamciCanPick = false;
                                            }
                                        });
                                    }
                                    gameState.dayActions = {};
                                }

                                function checkVotingEnd() {
                                    let aliveCount = Object.values(gameState.players).filter(p => p.isAlive).length;
                                    if (Object.keys(gameState.votes).length >= aliveCount) {
                                        resolveVoting();
                                    }
                                }

                                function resolveVoting() {
                                    if (gameState.status !== 'VOTING') return;
                                    clearHostTimer();
                                    let tallies = {};
                                    Object.values(gameState.votes).forEach(t => {
                                        if (t !== 'skip') tallies[t] = (tallies[t] || 0) + 1;
                                        if (t !== 'skip' && gameState.players[t]?.isAlive) {
                                            tallies[t] = (tallies[t] || 0) + 1;
                                        }
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

                                    if (eliminatedId && !tie && gameState.players[eliminatedId]) {
                                        if (eliminatedId && !tie && gameState.players[eliminatedId]?.isAlive) {
                                            gameState.status = 'DEFENSE';
                                            gameState.defensePlayerId = eliminatedId;
                                            addLog(`Oylama sonucu: ${gameState.players[eliminatedId].name} savunma kürsüsüne çıkıyor! Savunma için 20 saniye.`);
                                            broadcastState();

                                            startTimer(20, () => {
                                                gameState.status = 'JUDGEMENT';
                                                gameState.votes = {}; // reset votes for judgement
                                                addLog(`Savunma bitti. Oylama başlıyor: Suçlu mu, Masum mu?`);
                                                broadcastState();

                                                startTimer(20, () => {
                                                    if (gameState.status === 'JUDGEMENT') resolveJudgement();
                                                });
                                            });
                                        } else {
                                            addLog('Oylama berabere bitti veya pas geçildi. Kimse asılmadı.');
                                            if (checkWin()) return;

                                            gameState.status = 'NIGHT';
                                            gameState.dayCount++;
                                            gameState.nightActions = {};
                                            addLog('Gece çöküyor...');
                                            startTimer(40, () => {
                                                if (gameState.status === 'NIGHT') resolveNight();
                                            });
                                        }
                                    }

                                    function handlePlayerAction(senderId, actionType, targetId) {
                                        const player = gameState.players[senderId];
                                        if (!player || !player.isAlive) return; // Ölü oyuncular aksiyon yapamaz

                                        if (actionType === 'NIGHT' && gameState.status === 'NIGHT') {
                                            const roleDef = ROLES[player.role];
                                            if (!roleDef || !roleDef.hasNightAction) return;
                                            if (player.role === 'HIRSIZ' && gameState.dayCount > 1) return;

                                            if (targetId !== 'skip') {
                                                const isDedektif = player.role === 'DEDEKTIF' || (player.role === 'DELI' && player.fakeRole === 'DEDEKTIF');
                                                if (isDedektif) {
                                                    if (!Array.isArray(targetId) || targetId.length !== 2 || targetId[0] === targetId[1]) return;
                                                    if (!gameState.players[targetId[0]]?.isAlive || !gameState.players[targetId[1]]?.isAlive) return;
                                                    if (targetId[0] === senderId || targetId[1] === senderId) return;
                                                } else {
                                                    const targetPlayer = gameState.players[targetId];
                                                    if (!targetPlayer || !targetPlayer.isAlive) return;
                                                    if (roleDef.team === 'VAMPIR' && targetId === senderId) return;
                                                    const canSelectSelfAtNight = player.role === 'DOKTOR' ||
                                                        player.role === 'TUZAKCI' ||
                                                        player.role === 'KUNDAKCI' ||
                                                        player.role === 'GOZCU' ||
                                                        (player.role === 'DELI' && player.fakeRole === 'GOZCU');
                                                    if (!canSelectSelfAtNight && targetId === senderId) return;
                                                    if (roleDef.team === 'VAMPIR') {
                                                        const livingVamps = Object.values(gameState.players).filter(p => p.isAlive && p.team === 'VAMPIR');
                                                        const isSoleLivingVamp = livingVamps.length === 1;
                                                        if (!(player.role === 'VAMPIR_IZCISI' && !isSoleLivingVamp) && targetPlayer.team === 'VAMPIR') {
                                                            return;
                                                        }
                                                    }
                                                    if (player.role === 'DOKTOR') {
                                                        if (player.lastHealed === targetId) return;
                                                        if (targetId === senderId && (player.selfHealCount || 0) >= 1) return;
                                                    }
                                                }
                                            }

                                            gameState.nightActions[senderId] = targetId;
                                            if (roleDef.team === 'VAMPIR') {
                                                const livingVamps = Object.values(gameState.players).filter(p => p.isAlive && p.team === 'VAMPIR');
                                                if (livingVamps.length > 1) {
                                                    const targetName = targetId === 'skip' ? 'Pas' : (gameState.players[targetId]?.name || targetId);
                                                    livingVamps.forEach(v => {
                                                        if (v.id !== senderId) {
                                                            sendPrivateLog(v.id, `![Vampir] ${player.name} hedef seçti: ${targetName}`);
                                                        }
                                                    });
                                                }
                                            }
                                            checkNightEnd();
                                        } else if (actionType === 'DAY_DISCUSSION' && gameState.status === 'DAY_DISCUSSION') {
                                            const roleDef = ROLES[player.role];
                                            if (!roleDef || !roleDef.hasDayAction) return;
                                            if (player.role === 'SERIF' && player.usedAbility) return;
                                            if (player.role === 'INTIKAMCI' && (player.intikamciTarget || (gameState.dayCount > 1 && !player.hirsizStole))) return;
                                            const intikamciBlocked = player.role === 'INTIKAMCI' && (
                                                Boolean(player.intikamciTarget) ||
                                                player.intikamciCanPick === false ||
                                                (player.intikamciCanPick === undefined && gameState.dayCount > 1 && !player.hirsizStole)
                                            );
                                            if (intikamciBlocked) return;
                                            if (targetId !== 'skip') {
                                                if (targetId === senderId || !gameState.players[targetId]?.isAlive) return;
                                            }

                                            gameState.dayActions[senderId] = targetId;
                                            resolveDayActions();
                                            resolveDayActions(false);
                                            if (!checkWin()) {
                                                broadcastState();
                                            }
                                        } else if (actionType === 'VOTING' && gameState.status === 'VOTING') {
                                            if (targetId !== 'skip' && (targetId === senderId || !gameState.players[targetId]?.isAlive)) return;
                                            gameState.votes[senderId] = targetId;
                                            checkVotingEnd();
                                        } else if (actionType === 'JUDGEMENT' && gameState.status === 'JUDGEMENT') {
                                            if (senderId === gameState.defensePlayerId) return;
                                            if (targetId !== 'guilty' && targetId !== 'innocent' && targetId !== 'skip') return;
                                            gameState.votes[senderId] = targetId;
                                            checkJudgementEnd();
                                        }
                                    }

                                    function checkJudgementEnd() {
                                        let aliveCount = Object.values(gameState.players).filter(p => p.isAlive).length;
                                        // exclude the person on defense
                                        if (Object.keys(gameState.votes).length >= aliveCount - 1) {
                                            const defAlive = Boolean(gameState.players[gameState.defensePlayerId]?.isAlive);
                                            const requiredVotes = defAlive ? Math.max(0, aliveCount - 1) : aliveCount;
                                            if (Object.keys(gameState.votes).length >= requiredVotes) {
                                                resolveJudgement();
                                            }
                                        }

                                        function resolveJudgement() {
                                            if (gameState.status !== 'JUDGEMENT') return;
                                            clearHostTimer();
                                            let guilty = 0, innocent = 0;
                                            Object.values(gameState.votes).forEach(t => {
                                                if (t === 'guilty') guilty++;
                                                else if (t === 'innocent') innocent++;
                                            });

                                            let eliminatedId = gameState.defensePlayerId;
                                            addLog(`Yargılama sonucu: ${guilty} Suçlu, ${innocent} Masum.`);

                                            if (guilty > innocent && gameState.players[eliminatedId]) {
                                                if (guilty > innocent && gameState.players[eliminatedId]?.isAlive) {
                                                    gameState.status = 'DAY_ANIMATION';
                                                    broadcastState();

                                                    network.broadcast({ type: 'HANG_ANIMATION', targetId: eliminatedId });
                                                    onStateUpdate(myId, { type: 'HANG_ANIMATION', targetId: eliminatedId });

                                                    setTimeout(() => {
                                                        if (!gameState.players[eliminatedId]) return;
                                                        gameState.players[eliminatedId].isAlive = false;
                                                        gameState.players[eliminatedId].isPoisoned = false;
                                                        let roleName = ROLES[gameState.players[eliminatedId].role]?.name || 'Bilinmiyor';
                                                        addLog(`${gameState.players[eliminatedId].name} asıldı. Rolü: ${roleName}`);
                                                        processDeath(eliminatedId);

                                                        if (gameState.players[eliminatedId].will) {
                                                            addLog(`📜 ${gameState.players[eliminatedId].name} kişisinin vasiyeti:`);
                                                            addLog(`"${gameState.players[eliminatedId].will}"`);
                                                        }

                                                        if (gameState.players[eliminatedId].role === 'SOYTARI') {
                                                            addLog(`Soytarı asıldı! Soytarı kazandı.`);
                                                            endGame('Soytarı Kazandı!');
                                                            return;
                                                        } else if (gameState.players[eliminatedId].role === 'INTIKAMCI') {
                                                            let iTarget = gameState.players[eliminatedId].intikamciTarget;
                                                            if (iTarget && gameState.players[iTarget] && gameState.players[iTarget].isAlive) {
                                                                gameState.players[iTarget].isAlive = false;
                                                                gameState.players[iTarget].isPoisoned = false;
                                                                addLog(`İntikamcı asılırken yanında ${gameState.players[iTarget].name}'i de götürdü!`);
                                                                processDeath(iTarget);
                                                                if (gameState.players[iTarget].will) {
                                                                    addLog(`📜 ${gameState.players[iTarget].name} kişisinin vasiyeti:`);
                                                                    addLog(`"${gameState.players[iTarget].will}"`);
                                                                }
                                                            }
                                                        }

                                                        if (checkWin()) return;

                                                        gameState.status = 'NIGHT';
                                                        gameState.dayCount++;
                                                        gameState.nightActions = {};
                                                        addLog('Gece çöküyor...');
                                                        startTimer(40, () => {
                                                            if (gameState.status === 'NIGHT') resolveNight();
                                                        });
                                                    }, 5500);

                                                } else {
                                                    if (gameState.players[eliminatedId]) {
                                                        addLog(`${gameState.players[eliminatedId].name} affedildi.`);
                                                    }
                                                    if (checkWin()) return;

                                                    gameState.status = 'NIGHT';
                                                    gameState.dayCount++;
                                                    gameState.nightActions = {};
                                                    addLog('Gece çöküyor...');
                                                    startTimer(40, () => {
                                                        if (gameState.status === 'NIGHT') resolveNight();
                                                    });
                                                }
                                            }

                                            function checkWin() {
                                                if (gameState.status === 'END') return true;

                                                let vamps = 0, koyluler = 0, sk = 0, kundakci = 0;
                                                let totalAlive = 0;
                                                Object.values(gameState.players).forEach(p => {
                                                    if (p.isAlive) {
                                                        totalAlive++;
                                                        if (p.team === 'VAMPIR') vamps++;
                                                        else if (p.role === 'SERI_KATIL') sk++;
                                                        else if (p.role === 'KUNDAKCI') kundakci++;
                                                        else if (p.team === 'KOY') koyluler++;
                                                    }
                                                });

                                                if (totalAlive === 0) { endGame('Berabere! Herkes öldü.'); return true; }
                                                if (sk > 0 && totalAlive === sk) { endGame('Seri Katil Kazandı!'); return true; }
                                                if (kundakci > 0 && totalAlive === kundakci) { endGame('Kundakçı Kazandı!'); return true; }
                                                if (sk === 1 && totalAlive === 2 && vamps === 0 && kundakci === 0) { endGame('Seri Katil Kazandı!'); return true; }
                                                if (vamps === 0 && sk === 0 && kundakci === 0) {
                                                    if (koyluler === 0) {
                                                        endGame('Berabere! Hayatta kalan köylü veya katil kalmadı.');
                                                    } else {
                                                        endGame('Köylüler Kazandı!');
                                                    }
                                                    return true;
                                                }
                                                if (vamps > 0 && vamps === totalAlive) { endGame('Vampirler Kazandı!'); return true; }
                                                if (vamps > 0 && vamps >= (totalAlive - vamps) && sk === 0 && kundakci === 0) { endGame('Vampirler Kazandı!'); return true; }

                                                return false;
                                            }

                                            function processDeath(deadId) {
                                                let pObj = gameState.players[deadId];
                                                if (pObj && pObj.isOduncu && gameState.campfireActive) {
                                                    gameState.campfireActive = false;
                                                    addLog('Kamp ateşi söndü...');
                                                }

                                                Object.values(gameState.players).forEach(p => {
                                                    if (p.role === 'HIRSIZ' && p.isAlive && p.hirsizTarget === deadId && !p.hirsizStole) {
                                                        p.role = gameState.players[deadId].role;
                                                        p.team = gameState.players[deadId].team;
                                                        p.hirsizStole = true;
                                                        p.usedAbility = false;
                                                        p.lastHealed = null;
                                                        p.selfHealCount = 0;
                                                        p.intikamciTarget = null;
                                                        p.intikamciCanPick = (p.role === 'INTIKAMCI');
                                                        if (p.role === 'DELI') {
                                                            p.fakeRole = ['GOZCU', 'IZCI', 'DEDEKTIF'][Math.floor(Math.random() * 3)];
                                                        } else {
                                                            p.fakeRole = null;
                                                        }
                                                        sendPrivateLog(p.id, `Hedefin öldü! Yeni rolün: ${ROLES[p.role]?.name || p.role}`);
                                                    }
                                                });
                                            }

                                            function endGame(winnerMsg) {
                                                clearHostTimer();
                                                if (timerInterval) clearInterval(timerInterval);
                                                gameState.status = 'END';
                                                gameState.logs.push(winnerMsg);
                                                gameState.winnerMsg = winnerMsg;
                                                broadcastState();
                                            }

                                            function handlePlayAgain() {
                                                if (!isHost) return;
                                                clearHostTimer();
                                                if (timerInterval) clearInterval(timerInterval);
                                                gameState.status = 'LOBBY';
                                                gameState.dayCount = 0;
                                                gameState.logs = [];
                                                gameState.campfireActive = true;
                                                gameState.initialRoleCounts = null;
                                                gameState.roleCounts = null;
                                                if (network && network.players) {
                                                    Object.keys(gameState.players).forEach(pid => {
                                                        if (!network.players[pid]) {
                                                            delete gameState.players[pid];
                                                        }
                                                    });
                                                }
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
                                                    p.hirsizStole = false;
                                                    p.intikamciTarget = null;
                                                    p.intikamciCanPick = false;
                                                    p.lastHealed = null;
                                                    p.selfHealCount = 0;
                                                    p.will = '';
                                                    if (network && network.players && network.players[p.id]) {
                                                        network.players[p.id].isAlive = true;
                                                        network.players[p.id].role = null;
                                                    }
                                                });
                                                roleModalShown = false;
                                                update3DScene(gameState.players);
                                                broadcastState();
                                            }

                                            function startTimer(seconds, callback) {
                                                if (timerInterval) clearInterval(timerInterval);
                                                clearHostTimer();
                                                const now = window.PairaTime ? window.PairaTime.now() : Date.now();
                                                gameState.timerEndTime = now + seconds * 1000;
                                                broadcastState();

                                                if (isHost && callback) {
                                                    hostTimerTimeout = setTimeout(() => {
                                                        hostTimerTimeout = null;
                                                        callback();
                                                    }, seconds * 1000);
                                                }
                                            }

                                            function startClientTimer(endTime) {
                                                if (timerInterval) clearInterval(timerInterval);
                                                timerInterval = setInterval(() => {
                                                    const now = window.PairaTime ? window.PairaTime.now() : Date.now();
                                                    let left = Math.floor((endTime - now) / 1000);
                                                    if (left < 0) left = 0;
                                                    if (els.game.timer) {
                                                        els.game.timer.textContent = `${Math.floor(left / 60).toString().padStart(2, '0')}:${(left % 60).toString().padStart(2, '0')}`;
                                                        if (left <= 10 && left > 0) {
                                                            els.game.timer.classList.add('timer-danger');
                                                        } else {
                                                            els.game.timer.classList.remove('timer-danger');
                                                        }
                                                    }
                                                    if (left <= 0) clearInterval(timerInterval);
                                                }, 1000);
                                            }
