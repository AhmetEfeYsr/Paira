class AdvancedDrawingBoard {
    constructor(canvasElement, options = {}) {
        this.canvas = canvasElement;
        this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });

        this.isDrawing = false;
        this.currentColor = options.defaultColor || '#000000';
        this.currentSize = options.defaultSize || 8;
        this.currentTool = 'brush'; // brush, eraser, fill, rect, circle, line

        this.history = []; // Array of ImageData
        this.historyStep = -1;

        // Smoothing lines variables
        this.points = [];

        // Shape variables
        this.startX = 0;
        this.startY = 0;
        this.snapshot = null;

        this.onDrawEvent = options.onDrawEvent || null; // Callback for network sync
        this.readOnly = options.readOnly || false; // Used for clients who just watch

        this.initEvents();
        this.resize();
        this.saveState();

        window.addEventListener('resize', () => this.resize());
    }

    setReadOnly(val) {
        this.readOnly = val;
    }

    resize() {
        if (!this.canvas.parentElement) return;

        const rect = this.canvas.parentElement.getBoundingClientRect();

        // Save old content
        let oldImg = null;
        if (this.canvas.width > 0 && this.canvas.height > 0) {
            oldImg = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
        }

        this.canvas.width = rect.width;
        // Gartic/CizBil uses 16:9 aspect ratio scaling
        this.canvas.height = rect.width * (9/16);

        // Restore white background
        this.ctx.fillStyle = "#ffffff";
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Restore content if any
        if (oldImg) {
            this.ctx.putImageData(oldImg, 0, 0);
        }
    }

    setColor(color) {
        this.currentColor = color;
    }

    setSize(size) {
        this.currentSize = size;
    }

    setTool(tool) {
        this.currentTool = tool;
    }

    getPos(e) {
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;

        let clientX = e.clientX;
        let clientY = e.clientY;

        if (e.touches && e.touches.length > 0) {
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
            if (e.type === 'touchstart') e.preventDefault();
            if (this.readOnly) return;
            this.isDrawing = true;
            const pos = this.getPos(e);
            this.startX = pos.x;
            this.startY = pos.y;

            // Take snapshot for both shapes and brush (to enable smooth line redraws without aliasing artifacts)
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
                // Restore snapshot for live preview
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

            const pos = this.getPos(e);

            if (['brush', 'eraser'].includes(this.currentTool)) {
                this.points = [];
                if (this.onDrawEvent) this.onDrawEvent({ type: 'END_STROKE' });
            } else if (['rect', 'circle', 'line'].includes(this.currentTool)) {
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
    }

    drawSmoothLine(pos) {
        this.points.push({ x: pos.x, y: pos.y });

        // Restore to snapshot to avoid stack-drawing aliased paths
        this.ctx.putImageData(this.snapshot, 0, 0);

        this.ctx.beginPath();
        let p1 = this.points[0];
        let p2 = this.points[this.points.length > 1 ? 1 : 0];

        this.ctx.moveTo(p1.x, p1.y);

        for (let i = 1, len = this.points.length; i < len; i++) {
            const midPoint = {
                x: p1.x + (p2.x - p1.x) / 2,
                y: p1.y + (p2.y - p1.y) / 2
            };
            this.ctx.quadraticCurveTo(p1.x, p1.y, midPoint.x, midPoint.y);
            p1 = this.points[i];
            p2 = this.points[i+1] ? this.points[i+1] : p1;
        }

        this.ctx.lineTo(p1.x, p1.y);
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

    undo(sync = true) {
        if (this.historyStep > 0) {
            this.historyStep--;
            this.ctx.putImageData(this.history[this.historyStep], 0, 0);
            if (sync && this.onDrawEvent) {
                this.onDrawEvent({ type: 'UNDO' });
            }
        }
    }

    clear(sync = true) {
        this.ctx.fillStyle = "#ffffff";
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        this.saveState();
        if (sync && this.onDrawEvent) {
            this.onDrawEvent({ type: 'CLEAR' });
        }
    }

    hexToRgba(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16),
            a: 255
        } : null;
    }

    // Optimized Scanline Flood Fill algorithm
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

    getPixelRaw(data, width, x, y) {
        const offset = (y * width + x) * 4;
        return [data[offset], data[offset + 1], data[offset + 2], data[offset + 3]];
    }

    setPixelRaw(data, width, x, y, colorData) {
        const offset = (y * width + x) * 4;
        data[offset] = colorData[0];
        data[offset + 1] = colorData[1];
        data[offset + 2] = colorData[2];
        data[offset + 3] = colorData[3];
    }

    colorsMatchRaw(c1, cRgba, tolerance = 30) {
        // Handle array format for targetColor and object format for fillRgba
        const r2 = cRgba.r !== undefined ? cRgba.r : cRgba[0];
        const g2 = cRgba.g !== undefined ? cRgba.g : cRgba[1];
        const b2 = cRgba.b !== undefined ? cRgba.b : cRgba[2];
        const a2 = cRgba.a !== undefined ? cRgba.a : cRgba[3];

        return Math.abs(c1[0] - r2) <= tolerance &&
               Math.abs(c1[1] - g2) <= tolerance &&
               Math.abs(c1[2] - b2) <= tolerance &&
               Math.abs(c1[3] - a2) <= tolerance;
    }

    // Network Event Replay
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
        } else if (data.type === 'END_STROKE') {
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

    getDataURL() {
        return this.canvas.toDataURL('image/webp', 0.5);
    }

    loadFromDataURL(dataURL) {
        if (!dataURL) return;
        const img = new Image();
        img.onload = () => {
            this.ctx.fillStyle = "#ffffff";
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            this.ctx.drawImage(img, 0, 0, this.canvas.width, this.canvas.height);
            this.saveState();
        };
        img.src = dataURL;
    }
}
window.AdvancedDrawingBoard = AdvancedDrawingBoard;