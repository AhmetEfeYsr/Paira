/**
 * InputManager.js
 * Handles simultaneous 4-player controls via Keyboard key maps and Gamepad API.
 */
class InputManager {
    constructor() {
        this.playerInputs = [
            { up: false, down: false, left: false, right: false, jump: false, action: false }, // Player 1 (Fire)
            { up: false, down: false, left: false, right: false, jump: false, action: false }, // Player 2 (Water)
            { up: false, down: false, left: false, right: false, jump: false, action: false }, // Player 3 (Air)
            { up: false, down: false, left: false, right: false, jump: false, action: false }  // Player 4 (Electricity)
        ];

        // Key bindings mapping key code -> { playerIndex (0-3), actionName }
        this.keyBindings = {
            // Player 1 (Fire): WASD + Space (Jump) + F (Action)
            'KeyW': { p: 0, action: 'up' },
            'KeyS': { p: 0, action: 'down' },
            'KeyA': { p: 0, action: 'left' },
            'KeyD': { p: 0, action: 'right' },
            'Space': { p: 0, action: 'jump' },
            'KeyF': { p: 0, action: 'action' },

            // Player 2 (Water): Arrow Keys + ArrowUp (Jump) + Shift (Action)
            'ArrowUp': { p: 1, action: 'jump' },
            'ArrowDown': { p: 1, action: 'down' },
            'ArrowLeft': { p: 1, action: 'left' },
            'ArrowRight': { p: 1, action: 'right' },
            'ShiftRight': { p: 1, action: 'action' },
            'ShiftLeft': { p: 1, action: 'action' },

            // Player 3 (Air): IJKL + U (Jump) + O (Action)
            'KeyI': { p: 2, action: 'up' },
            'KeyK': { p: 2, action: 'down' },
            'KeyJ': { p: 2, action: 'left' },
            'KeyL': { p: 2, action: 'right' },
            'KeyU': { p: 2, action: 'jump' },
            'KeyO': { p: 2, action: 'action' },

            // Player 4 (Electricity): Numpad 8456 + NumpadAdd (Jump) + Numpad0 (Action)
            'Numpad8': { p: 3, action: 'up' },
            'Numpad5': { p: 3, action: 'down' },
            'Numpad4': { p: 3, action: 'left' },
            'Numpad6': { p: 3, action: 'right' },
            'NumpadAdd': { p: 3, action: 'jump' },
            'Numpad0': { p: 3, action: 'action' },
            'NumpadEnter': { p: 3, action: 'action' }
        };

        this.init();
    }

    init() {
        window.addEventListener('keydown', (e) => this.handleKey(e, true));
        window.addEventListener('keyup', (e) => this.handleKey(e, false));

        this.activeLocalPlayer = 0;
        
        const bindTouch = (id, action) => {
            const btn = document.getElementById(id);
            if (!btn) return;
            const setAction = (val) => {
                const p = this.activeLocalPlayer;
                if (this.playerInputs[p]) this.playerInputs[p][action] = val;
                if (window.gameApp && window.gameApp.keys) {
                    window.gameApp.keys[action] = val;
                    if (window.gameApp.engine) {
                        window.gameApp.engine.setLocalInput(window.gameApp.keys);
                    }
                    if (typeof window.NetworkManager !== 'undefined' && typeof window.NetworkManager.sendPhysicsTick === 'function' && window.gameApp.engine) {
                        const localId = window.NetworkManager.getMyId();
                        const playerObj = window.gameApp.engine.players[localId];
                        if (playerObj) {
                            window.NetworkManager.sendPhysicsTick({
                                x: playerObj.x, y: playerObj.y, vx: playerObj.vx, vy: playerObj.vy, input: window.gameApp.keys
                            });
                        }
                    }
                }
            };
            btn.addEventListener('pointerdown', (e) => { e.preventDefault(); setAction(true); });
            btn.addEventListener('pointerup', (e) => { e.preventDefault(); setAction(false); });
            btn.addEventListener('pointercancel', (e) => { e.preventDefault(); setAction(false); });
            btn.addEventListener('contextmenu', (e) => e.preventDefault());
        };

        bindTouch('touch-btn-left', 'left');
        bindTouch('touch-btn-right', 'right');
        bindTouch('touch-btn-jump', 'jump');
        
        const btnSwitch = document.getElementById('touch-btn-switch');
        if (btnSwitch) {
            btnSwitch.addEventListener('pointerdown', (e) => {
                e.preventDefault();
                this.activeLocalPlayer = (this.activeLocalPlayer + 1) % 4;
                if (window.showToast) window.showToast(`Kontrol Edilen Karakter: ${this.activeLocalPlayer + 1}`, "info");
                if (window.PairaAudio) window.PairaAudio.play('pop');
            });
        }
    }

    handleKey(e, isPressed) {
        const binding = this.keyBindings[e.code];
        if (binding) {
            if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
                e.preventDefault();
            }
            this.playerInputs[binding.p][binding.action] = isPressed;
        }
    }

    updateGamepads() {
        const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
        for (let i = 0; i < gamepads.length && i < 4; i++) {
            const gp = gamepads[i];
            if (!gp) continue;

            const input = this.playerInputs[i];
            const deadzone = 0.25;

            // Axis left stick
            if (Math.abs(gp.axes[0]) > deadzone) {
                input.left = gp.axes[0] < -deadzone;
                input.right = gp.axes[0] > deadzone;
            }
            if (Math.abs(gp.axes[1]) > deadzone) {
                input.up = gp.axes[1] < -deadzone;
                input.down = gp.axes[1] > deadzone;
            }

            // D-Pad
            input.left = input.left || gp.buttons[14]?.pressed;
            input.right = input.right || gp.buttons[15]?.pressed;
            input.up = input.up || gp.buttons[12]?.pressed;
            input.down = input.down || gp.buttons[13]?.pressed;

            // Jump (Button 0 - A/Cross) & Action (Button 2 - X/Square or Button 1 - B/Circle)
            input.jump = input.jump || gp.buttons[0]?.pressed;
            input.action = input.action || gp.buttons[2]?.pressed || gp.buttons[1]?.pressed;
        }
    }

    getInput(playerIndex) {
        this.updateGamepads();
        return this.playerInputs[playerIndex] || { up: false, down: false, left: false, right: false, jump: false, action: false };
    }
}

window.InputManager = InputManager;
