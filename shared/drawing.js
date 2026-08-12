/**
 * @typedef {Object} Point
 * @property {number} x - The X coordinate.
 * @property {number} y - The Y coordinate.
 */

/**
 * @typedef {Object} DrawEvent
 * @property {string} type - Event type: 'START_STROKE', 'MOVE_STROKE', 'END_STROKE', 'FILL', 'SHAPE', 'CLEAR', 'UNDO'.
 * @property {number} [x] - Normalized X coordinate.
 * @property {number} [y] - Normalized Y coordinate.
 * @property {number} [startX] - Normalized start X for shapes.
 * @property {number} [startY] - Normalized start Y for shapes.
 * @property {number} [endX] - Normalized end X for shapes.
 * @property {number} [endY] - Normalized end Y for shapes.
 * @property {string} [tool] - Tool used ('brush', 'eraser', 'rect', 'circle', 'line').
 * @property {string} [color] - Hex color string.
 * @property {number} [size] - Brush size.
 */

class AdvancedDrawingBoard {
    /**
     * @param {HTMLCanvasElement} canvasElement
     * @param {Object} [options]
     * @param {string} [options.defaultColor='#000000']
     * @param {number} [options.defaultSize=8]
     * @param {function(DrawEvent): void} [options.onDrawEvent]
     * @param {boolean} [options.readOnly=false]
     */
    constructor(canvasElement, options = {}) {
        this.canvas = canvasElement;
        this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });

        /** @type {boolean} */
        this.isDrawing = false;
        /** @type {string} */
        this.currentColor = options.defaultColor || '#000000';
        /** @type {number} */
        this.currentSize = options.defaultSize || 8;
        /** @type {string} */
        this.currentTool = 'brush'; // brush, eraser, fill, rect, circle, line

        /** @type {ImageData[]} */
        this.history = []; // Array of ImageData
        /** @type {number} */
        this.historyStep = -1;

        /** @type {Point[]} */
        this.points = [];

        /** @type {number} */
        this.startX = 0;
        /** @type {number} */
        this.startY = 0;
        /** @type {ImageData|null} */
        this.snapshot = null;

        /** @type {function(DrawEvent): void|null} */
        this.onDrawEvent = options.onDrawEvent || null; // Callback for network sync
        /** @type {boolean} */
        this.readOnly = options.readOnly || false;

        /** @type {boolean} FIX: Prevent touch+mouse double firing */
        this._lastInputWasTouch = false;
        this._touchEndTimer = null;

        this.initEvents();
        this.resize();
        this.saveState();
        this.updateCursor();

        window.addEventListener('resize', () => this.resize());

        // Keyboard Shortcuts for easy drawing (Ctrl+Z, B, E, F)
        document.addEventListener('keydown', (e) => {
            if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
            if (this.readOnly || !this.canvas || !this.canvas.isConnected) return;

            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
                e.preventDefault();
                this.undo(true);
            } else if (e.key.toLowerCase() === 'b') {
                this.setTool('brush');
            } else if (e.key.toLowerCase() === 'e') {
                this.setTool('eraser');
            } else if (e.key.toLowerCase() === 'f') {
                this.setTool('fill');
            }
        });
    }

    /** Resizes the canvas to match its parent container. */
    resize() {
        if (!this.canvas.parentElement) return;

        const rect = this.canvas.parentElement.getBoundingClientRect();

        let oldImg = null;
        let oldWidth = this.canvas.width;
        let oldHeight = this.canvas.height;
        if (oldWidth > 0 && oldHeight > 0) {
            oldImg = this.ctx.getImageData(0, 0, oldWidth, oldHeight);
        }

        const targetRatio = 16 / 9;
        // Default to taking full width
        let finalWidth = rect.width;
        let finalHeight = finalWidth / targetRatio;

        // If parent has a specific height (like in fullscreen) and it's less than our calculated height,
        // we scale based on height instead.
        if (rect.height > 0 && finalHeight > rect.height) {
            finalHeight = rect.height;
            finalWidth = finalHeight * targetRatio;
        }

        const oldHistory = [...this.history];
        const oldHistoryStep = this.historyStep;

        this.canvas.width = finalWidth;
        this.canvas.height = finalHeight;

        this.ctx.fillStyle = "#ffffff";
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        if (oldHistory.length > 0 && oldWidth > 0 && oldHeight > 0) {
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = oldWidth;
            tempCanvas.height = oldHeight;
            const tempCtx = tempCanvas.getContext('2d');

            this.history = oldHistory.map(imgData => {
                tempCtx.putImageData(imgData, 0, 0);
                
                // Clear canvas and draw scaled image
                this.ctx.fillStyle = "#ffffff";
                this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
                this.ctx.drawImage(tempCanvas, 0, 0, this.canvas.width, this.canvas.height);
                return this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
            });
            this.historyStep = oldHistoryStep;

            // Restore the current active history step on canvas
            if (this.historyStep >= 0 && this.history[this.historyStep]) {
                this.ctx.putImageData(this.history[this.historyStep], 0, 0);
            }
        } else {
            this.history = [];
            this.historyStep = -1;
            this.saveState();
        }
    }

    /** Updates canvas cursor to visual size/tool indicator for easier drawing */
    updateCursor() {
        if (!this.canvas || this.readOnly) {
            if (this.canvas) this.canvas.style.cursor = 'default';
            return;
        }
        if (this.currentTool === 'fill') {
            this.canvas.style.cursor = 'crosshair';
            return;
        }
        if (['rect', 'circle', 'line'].includes(this.currentTool)) {
            this.canvas.style.cursor = 'crosshair';
            return;
        }

        const rect = this.canvas.getBoundingClientRect();
        const displayScale = rect.width > 0 ? (rect.width / this.canvas.width) : 1;
        const displaySize = Math.max(4, Math.min(64, this.currentSize * displayScale));
        const color = this.currentTool === 'eraser' ? '#ffffff' : this.currentColor;
        const strokeColor = (this.currentTool === 'eraser' || color === '#ffffff') ? '#000000' : '#ffffff';

        const canvasSize = Math.ceil(displaySize + 6);
        const center = canvasSize / 2;
        const radius = displaySize / 2;

        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasSize}" height="${canvasSize}" viewBox="0 0 ${canvasSize} ${canvasSize}">`
            + `<circle cx="${center}" cy="${center}" r="${radius}" fill="${color}" stroke="${strokeColor}" stroke-width="1.5"/>`
            + `</svg>`;
        const url = 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
        this.canvas.style.cursor = `url("${url}") ${center} ${center}, crosshair`;
    }

    /** @param {string} color Hex color string. */
    setColor(color) {
        this.currentColor = color;
        this.updateCursor();
    }

    /** @param {number} size Brush size. */
    setSize(size) {
        this.currentSize = size;
        this.updateCursor();
    }

    /** @param {string} tool Tool name ('brush', 'eraser', 'fill', 'rect', 'circle', 'line'). */
    setTool(tool) {
        this.currentTool = tool;
        this.updateCursor();
    }

    /**
     * @param {MouseEvent|TouchEvent} e
     * @returns {Point}
     */
    getPos(e) {
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;

        let clientX = e.clientX;
        let clientY = e.clientY;

        if (e.changedTouches && e.changedTouches.length > 0) {
            clientX = e.changedTouches[0].clientX;
            clientY = e.changedTouches[0].clientY;
        } else if (e.touches && e.touches.length > 0) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        }

        return {
            x: (clientX - rect.left) * scaleX,
            y: (clientY - rect.top) * scaleY
        };
    }

    initEvents() {
        const start = (e) => {
            // FIX: Prevent touch+mouse double firing on hybrid devices
            if (e.type === 'touchstart') {
                e.preventDefault();
                this._lastInputWasTouch = true;
                clearTimeout(this._touchEndTimer);
            } else if (e.type === 'mousedown' && this._lastInputWasTouch) {
                return; // Skip mouse event that follows touch
            }
            if (this.readOnly) return;
            this.isDrawing = true;
            const pos = this.getPos(e);
            this.startX = pos.x;
            this.startY = pos.y;

            this.snapshot = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);

            if (this.currentTool === 'fill') {
                this.floodFill(pos.x, pos.y, this.currentColor);
                this.saveState();
                this.isDrawing = false;
                if (this.onDrawEvent) {
                    this.onDrawEvent({ type: 'FILL', x: pos.x / this.canvas.width, y: pos.y / this.canvas.height, color: this.currentColor });
                }
                return;
            } else if (['brush', 'eraser'].includes(this.currentTool)) {
                this.points = [{ x: pos.x, y: pos.y }];
                if (this.onDrawEvent) {
                    this.onDrawEvent({
                        type: 'START_STROKE',
                        tool: this.currentTool,
                        x: pos.x / this.canvas.width,
                        y: pos.y / this.canvas.height,
                        color: this.currentColor,
                        size: this.currentSize / this.canvas.width
                    });
                }
            }
        };

        const draw = (e) => {
            if (!this.isDrawing || this.readOnly) return;
            if (e.type === 'touchmove') e.preventDefault();
            if (e.type === 'mousemove' && this._lastInputWasTouch) return;

            const pos = this.getPos(e);

            this.ctx.lineCap = 'round';
            this.ctx.lineJoin = 'round';
            this.ctx.lineWidth = this.currentSize;

            if (['brush', 'eraser'].includes(this.currentTool)) {
                this.ctx.strokeStyle = this.currentTool === 'eraser' ? '#ffffff' : this.currentColor;
                this.drawSmoothLine(pos);
                if (this.onDrawEvent) {
                    this.onDrawEvent({ type: 'MOVE_STROKE', x: pos.x / this.canvas.width, y: pos.y / this.canvas.height });
                }
            } else if (['rect', 'circle', 'line'].includes(this.currentTool)) {
                this.ctx.putImageData(this.snapshot, 0, 0);
                this.ctx.strokeStyle = this.currentColor;
                this.ctx.beginPath();

                if (this.currentTool === 'rect') {
                    this.ctx.strokeRect(this.startX, this.startY, pos.x - this.startX, pos.y - this.startY);
                } else if (this.currentTool === 'circle') {
                    const radius = Math.sqrt(Math.pow(pos.x - this.startX, 2) + Math.pow(pos.y - this.startY, 2));
                    this.ctx.arc(this.startX, this.startY, radius, 0, 2 * Math.PI);
                    this.ctx.stroke();
                } else if (this.currentTool === 'line') {
                    this.ctx.moveTo(this.startX, this.startY);
                    this.ctx.lineTo(pos.x, pos.y);
                    this.ctx.stroke();
                }
            }
        };

        const end = (e) => {
            if (!this.isDrawing || this.readOnly) return;
            this.isDrawing = false;

            // FIX: Reset touch flag after a short delay to allow mouse events again
            if (e.type === 'touchend' || e.type === 'touchcancel') {
                clearTimeout(this._touchEndTimer);
                this._touchEndTimer = setTimeout(() => { this._lastInputWasTouch = false; }, 400);
            }

            const pos = this.getPos(e);

            if (['brush', 'eraser'].includes(this.currentTool)) {
                if (this.points.length === 1) {
                    // Draw single dot if user tapped without dragging
                    const p = this.points[0];
                    this.ctx.lineCap = 'round';
                    this.ctx.fillStyle = this.currentTool === 'eraser' ? '#ffffff' : this.currentColor;
                    this.ctx.beginPath();
                    this.ctx.arc(p.x, p.y, Math.max(1, this.currentSize / 2), 0, 2 * Math.PI);
                    this.ctx.fill();

                    if (this.onDrawEvent) {
                        this.onDrawEvent({
                            type: 'DOT',
                            tool: this.currentTool,
                            x: p.x / this.canvas.width,
                            y: p.y / this.canvas.height,
                            color: this.currentColor,
                            size: this.currentSize / this.canvas.width
                        });
                    }
                }
                this.points = [];
                if (this.onDrawEvent) this.onDrawEvent({ type: 'END_STROKE' });
            } else if (['rect', 'circle', 'line'].includes(this.currentTool)) {
                this.ctx.strokeStyle = this.currentColor;
                this.ctx.lineWidth = this.currentSize;
                this.ctx.beginPath();
                if (this.currentTool === 'rect') {
                    this.ctx.strokeRect(this.startX, this.startY, pos.x - this.startX, pos.y - this.startY);
                } else if (this.currentTool === 'circle') {
                    const radius = Math.sqrt(Math.pow(pos.x - this.startX, 2) + Math.pow(pos.y - this.startY, 2));
                    this.ctx.arc(this.startX, this.startY, radius, 0, 2 * Math.PI);
                    this.ctx.stroke();
                } else if (this.currentTool === 'line') {
                    this.ctx.moveTo(this.startX, this.startY);
                    this.ctx.lineTo(pos.x, pos.y);
                    this.ctx.stroke();
                }

                if (this.onDrawEvent) {
                    this.onDrawEvent({
                        type: 'SHAPE',
                        tool: this.currentTool,
                        startX: this.startX / this.canvas.width,
                        startY: this.startY / this.canvas.height,
                        endX: pos.x / this.canvas.width,
                        endY: pos.y / this.canvas.height,
                        color: this.currentColor,
                        size: this.currentSize / this.canvas.width
                    });
                }
            }

            this.saveState();
        };

        this.canvas.addEventListener('mousedown', start);
        this.canvas.addEventListener('mousemove', draw);
        this.canvas.addEventListener('mouseup', end);
        this.canvas.addEventListener('mouseout', end);

        this.canvas.addEventListener('touchstart', start, { passive: false });
        this.canvas.addEventListener('touchmove', draw, { passive: false });
        this.canvas.addEventListener('touchend', end);
        this.canvas.addEventListener('touchcancel', end);
    }

    /** @param {Point} pos */
    drawSmoothLine(pos) {
        this.points.push({ x: pos.x, y: pos.y });

        const len = this.points.length;
        if (len < 3) {
            const p1 = this.points[0];
            const p2 = this.points[1] || p1;
            this.ctx.beginPath();
            this.ctx.moveTo(p1.x, p1.y);
            this.ctx.lineTo(p2.x, p2.y);
            this.ctx.stroke();
            return;
        }

        const p1 = this.points[len - 3];
        const p2 = this.points[len - 2];
        const p3 = this.points[len - 1];

        this.ctx.beginPath();
        this.ctx.moveTo(p1.x + (p2.x - p1.x) / 2, p1.y + (p2.y - p1.y) / 2);
        this.ctx.quadraticCurveTo(p2.x, p2.y, p2.x + (p3.x - p2.x) / 2, p2.y + (p3.y - p2.y) / 2);
        this.ctx.stroke();
    }

    saveState() {
        this.historyStep++;
        if (this.historyStep < this.history.length) {
            this.history.length = this.historyStep;
        }
        this.history.push(this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height));

        if (this.history.length > 20) {
            this.history.shift();
            this.historyStep--;
        }
    }

    /** @param {boolean} [sync=true] */
    undo(sync = true) {
        if (this.historyStep > 0) {
            this.historyStep--;
            this.ctx.putImageData(this.history[this.historyStep], 0, 0);
            if (sync && this.onDrawEvent) {
                this.onDrawEvent({ type: 'UNDO' });
            }
        }
    }

    /** Resets canvas and clears history stack completely (e.g. for new round) */
    resetHistory() {
        this.history = [];
        this.historyStep = -1;
        this.ctx.fillStyle = "#ffffff";
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        this.saveState();
    }

    /** @param {boolean} [sync=true] */
    clear(sync = true) {
        this.ctx.fillStyle = "#ffffff";
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        this.saveState();
        if (sync && this.onDrawEvent) {
            this.onDrawEvent({ type: 'CLEAR' });
        }
    }

    /**
     * @param {string} hex
     * @returns {{r: number, g: number, b: number, a: number}|null}
     */
    hexToRgba(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16),
            a: 255
        } : null;
    }

    /**
     * @param {number} startX
     * @param {number} startY
     * @param {string} fillColorHex
     */
    floodFill(startX, startY, fillColorHex) {
        startX = Math.floor(startX);
        startY = Math.floor(startY);

        const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
        const data = imageData.data;
        const width = imageData.width;
        const height = imageData.height;

        const targetColor = this.getPixelRaw(data, width, startX, startY);
        const fillRgba = this.hexToRgba(fillColorHex);
        if (!fillRgba) return;

        if (this.colorsMatchRaw(targetColor, fillRgba)) return;

        const fillData = [fillRgba.r, fillRgba.g, fillRgba.b, fillRgba.a];
        const stack = [[startX, startY]];

        while (stack.length > 0) {
            const [x, y] = stack.pop();
            let currentX = x;

            while (currentX >= 0 && this.colorsMatchRaw(this.getPixelRaw(data, width, currentX, y), targetColor)) {
                currentX--;
            }
            currentX++;

            let spanAbove = false;
            let spanBelow = false;

            while (currentX < width && this.colorsMatchRaw(this.getPixelRaw(data, width, currentX, y), targetColor)) {
                this.setPixelRaw(data, width, currentX, y, fillData);

                if (y > 0) {
                    const matchAbove = this.colorsMatchRaw(this.getPixelRaw(data, width, currentX, y - 1), targetColor);
                    if (!spanAbove && matchAbove) { stack.push([currentX, y - 1]); spanAbove = true; }
                    else if (spanAbove && !matchAbove) { spanAbove = false; }
                }

                if (y < height - 1) {
                    const matchBelow = this.colorsMatchRaw(this.getPixelRaw(data, width, currentX, y + 1), targetColor);
                    if (!spanBelow && matchBelow) { stack.push([currentX, y + 1]); spanBelow = true; }
                    else if (spanBelow && !matchBelow) { spanBelow = false; }
                }

                currentX++;
            }
        }
        this.ctx.putImageData(imageData, 0, 0);
    }

    /**
     * @param {Uint8ClampedArray} data
     * @param {number} width
     * @param {number} x
     * @param {number} y
     * @returns {number[]}
     */
    getPixelRaw(data, width, x, y) {
        const offset = (y * width + x) * 4;
        return [data[offset], data[offset + 1], data[offset + 2], data[offset + 3]];
    }

    /**
     * @param {Uint8ClampedArray} data
     * @param {number} width
     * @param {number} x
     * @param {number} y
     * @param {number[]} colorData
     */
    setPixelRaw(data, width, x, y, colorData) {
        const offset = (y * width + x) * 4;
        data[offset] = colorData[0];
        data[offset + 1] = colorData[1];
        data[offset + 2] = colorData[2];
        data[offset + 3] = colorData[3];
    }

    /**
     * @param {number[]} c1
     * @param {{r: number, g: number, b: number, a: number}|number[]} cRgba
     * @param {number} [tolerance=30]
     * @returns {boolean}
     */
    colorsMatchRaw(c1, cRgba, tolerance = 30) {
        const r2 = cRgba.r !== undefined ? cRgba.r : cRgba[0];
        const g2 = cRgba.g !== undefined ? cRgba.g : cRgba[1];
        const b2 = cRgba.b !== undefined ? cRgba.b : cRgba[2];
        const a2 = cRgba.a !== undefined ? cRgba.a : cRgba[3];

        return Math.abs(c1[0] - r2) <= tolerance &&
               Math.abs(c1[1] - g2) <= tolerance &&
               Math.abs(c1[2] - b2) <= tolerance &&
               Math.abs(c1[3] - a2) <= tolerance;
    }

    /** @param {DrawEvent} data */
    replayEvent(data) {
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';

        const w = this.canvas.width;
        const h = this.canvas.height;

        if (data.type === 'START_STROKE') {
            this.snapshot = this.ctx.getImageData(0, 0, w, h);
            this.ctx.strokeStyle = data.tool === 'eraser' ? '#ffffff' : data.color;
            this.ctx.lineWidth = data.size * w;
            this.points = [{ x: data.x * w, y: data.y * h }];
        } else if (data.type === 'MOVE_STROKE') {
            this.drawSmoothLine({ x: data.x * w, y: data.y * h });
        } else if (data.type === 'DOT') {
            this.ctx.fillStyle = data.tool === 'eraser' ? '#ffffff' : data.color;
            this.ctx.beginPath();
            this.ctx.arc(data.x * w, data.y * h, Math.max(1, (data.size * w) / 2), 0, 2 * Math.PI);
            this.ctx.fill();
            this.saveState();
        } else if (data.type === 'END_STROKE') {
            if (this.points.length === 1) {
                const p = this.points[0];
                this.ctx.fillStyle = this.ctx.strokeStyle;
                this.ctx.beginPath();
                this.ctx.arc(p.x, p.y, Math.max(1, this.ctx.lineWidth / 2), 0, 2 * Math.PI);
                this.ctx.fill();
            }
            this.points = [];
            this.saveState();
        } else if (data.type === 'FILL') {
            this.floodFill(data.x * w, data.y * h, data.color);
            this.saveState();
        } else if (data.type === 'SHAPE') {
            this.ctx.strokeStyle = data.color;
            this.ctx.lineWidth = data.size * w;
            this.ctx.beginPath();

            const startX = data.startX * w;
            const startY = data.startY * h;
            const endX = data.endX * w;
            const endY = data.endY * h;

            if (data.tool === 'rect') {
                this.ctx.strokeRect(startX, startY, endX - startX, endY - startY);
            } else if (data.tool === 'circle') {
                const radius = Math.sqrt(Math.pow(endX - startX, 2) + Math.pow(endY - startY, 2));
                this.ctx.arc(startX, startY, radius, 0, 2 * Math.PI);
                this.ctx.stroke();
            } else if (data.tool === 'line') {
                this.ctx.moveTo(startX, startY);
                this.ctx.lineTo(endX, endY);
                this.ctx.stroke();
            }
            this.saveState();
        } else if (data.type === 'CLEAR') {
            this.clear(false);
        } else if (data.type === 'UNDO') {
            this.undo(false);
        }
    }

    /** @returns {string} */
    getDataURL() {
        return this.canvas.toDataURL('image/webp', 0.5);
    }
}
window.AdvancedDrawingBoard = AdvancedDrawingBoard;
