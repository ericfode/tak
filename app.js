// Wrap entire app logic in an object attached to window for testability
window.takGameApp = {
    // DOM Elements (initialized in init)
    boardElement: null,
    currentPlayerElement: null,
    whiteFlatsElement: null,
    whiteCapstonesElement: null,
    blackFlatsElement: null,
    blackCapstonesElement: null,
    gameMessagesElement: null,
    moveControlsPanel: null,
    btnPlaceFlat: null,
    btnPlaceWall: null,
    btnPlaceCapstone: null,
    btnMoveStack: null,
    btnResetGameInternal: null, // Internal reference for the reset button added by app.js
    piecesToLiftInput: null,
    confirmLiftButton: null,
    confirmMoveButton: null,
    cancelMoveButton: null,
    currentPathElement: null,

    // State
    BOARD_SIZE: 5,
    gameState: { board: [], currentPlayer: 'White', pieces: { White: {}, Black: {} }, winner: null, board_size: 5 },
    currentAction: 'place_flat',
    moveData: {
        source: null, // {r, c}
        liftedCount: 0,
        path: [], // Array of {r, c, drops: 1 (default)}
    },

    socket: null, // WebSocket object

    initDOMReferences: function() {
        this.boardElement = document.getElementById('game-board');
        this.currentPlayerElement = document.getElementById('current-player');
        this.whiteFlatsElement = document.getElementById('white-flats');
        this.whiteCapstonesElement = document.getElementById('white-capstones');
        this.blackFlatsElement = document.getElementById('black-flats');
        this.blackCapstonesElement = document.getElementById('black-capstones');
        this.gameMessagesElement = document.getElementById('game-messages');
        this.moveControlsPanel = document.getElementById('move-controls-panel');

        this.btnPlaceFlat = document.getElementById('btn-place-flat');
        this.btnPlaceWall = document.getElementById('btn-place-wall');
        this.btnPlaceCapstone = document.getElementById('btn-place-capstone');
        this.btnMoveStack = document.getElementById('btn-move-stack');

        this.piecesToLiftInput = document.createElement('input');
        this.piecesToLiftInput.type = 'number';
        this.piecesToLiftInput.id = 'pieces-to-lift';
        this.piecesToLiftInput.min = '1';
        this.confirmLiftButton = document.createElement('button');
        this.confirmLiftButton.id = 'btn-confirm-lift';
        this.confirmLiftButton.textContent = 'Lift Pieces';
        this.confirmMoveButton = document.createElement('button');
        this.confirmMoveButton.id = 'btn-confirm-move';
        this.confirmMoveButton.textContent = 'Confirm Move';
        this.cancelMoveButton = document.createElement('button');
        this.cancelMoveButton.id = 'btn-cancel-move';
        this.cancelMoveButton.textContent = 'Cancel Move';
        this.currentPathElement = document.createElement('p');
        this.currentPathElement.id = 'current-path-display';
    },

    connectWebSocket: function(socketURLOverride) {
        const socketURL = socketURLOverride || `ws://${window.location.host}/ws`;
        this.socket = new WebSocket(socketURL); // Assign to app's socket property

        this.socket.onopen = () => {
            console.log('WebSocket connection established.');
            if (this.gameMessagesElement) this.gameMessagesElement.textContent = 'Connected.';
        };
        this.socket.onmessage = this.handleServerMessage.bind(this); // Ensure 'this' context
        this.socket.onerror = (err) => {
            console.error('WS Error:', err);
            if (this.gameMessagesElement) this.gameMessagesElement.textContent = 'Connection error.';
        };
        this.socket.onclose = () => {
            if (this.gameMessagesElement) this.gameMessagesElement.textContent = 'Disconnected. Reconnecting...';
            // Avoid reconnect loop in tests or if window is closing
            if (typeof window.isRunningTests === 'undefined' || !window.isRunningTests) {
                 setTimeout(() => this.connectWebSocket(socketURL), 3000);
            }
        };
    },

    handleServerMessage: function(event) {
        const message = JSON.parse(event.data);
        console.log('Server:', message);
        if (message.type === 'init' || message.type === 'update') {
            this.gameState = message.data;
            this.BOARD_SIZE = this.gameState.board_size || 5;
            this.renderAll();
            if (this.gameState.winner) {
                this.gameMessagesElement.textContent = `Game Over! ${this.gameState.winner === "Draw" ? "Draw" : this.gameState.winner + " wins"} by ${this.gameState.win_reason}.`;
                this.disableGameControls();
                this.resetMoveDataAndUI();
            } else {
                this.gameMessagesElement.textContent = `${this.gameState.currentPlayer}'s turn. ${message.message || ""}`;
                if (this.gameState.currentPlayer === this.getMyPlayerColor()) {
                     this.enableGameControls();
                }
            }
        } else if (message.type === 'error') {
            this.gameMessagesElement.textContent = `Error: ${message.message}`;
            if (this.currentAction.startsWith('move_')) this.resetMoveDataAndUI();
        } else if (message.type === 'ack' || message.type === 'info') {
            this.gameMessagesElement.textContent = `Server: ${message.message}`;
        }
    },

    getMyPlayerColor: function() { return this.gameState.currentPlayer; },

    renderAll: function() {
        this.renderBoard();
        this.updatePlayerInfo();
        this.renderMoveControls();
    },

    renderBoard: function() {
        if (!this.boardElement) return; // Guard if called before init
        this.boardElement.innerHTML = '';
        this.boardElement.style.gridTemplateColumns = `repeat(${this.BOARD_SIZE}, 60px)`;
        this.boardElement.style.gridTemplateRows = `repeat(${this.BOARD_SIZE}, 60px)`;
        this.boardElement.style.width = `${this.BOARD_SIZE * 60}px`;
        this.boardElement.style.height = `${this.BOARD_SIZE * 60}px`;


        if (!this.gameState.board) return;
        for (let r = 0; r < this.BOARD_SIZE; r++) {
            for (let c = 0; c < this.BOARD_SIZE; c++) {
                const cell = document.createElement('div');
                cell.classList.add('board-cell');
                cell.dataset.r = r; cell.dataset.c = c;
                cell.addEventListener('click', (e) => this.handleCellClick(e)); // Bind 'this'

                if (this.moveData.source && this.moveData.source.r === r && this.moveData.source.c === c) {
                    cell.classList.add('source-selected');
                }
                const pathIndex = this.moveData.path.findIndex(p => p.r === r && p.c === c);
                if (pathIndex > -1) {
                    cell.classList.add('path-selected');
                    const dropCountDisplay = document.createElement('span');
                    dropCountDisplay.classList.add('drop-indicator');
                    dropCountDisplay.textContent = this.moveData.path[pathIndex].drops;
                    dropCountDisplay.addEventListener('click', (e) => {
                        e.stopPropagation();
                        if (this.currentAction === 'move_select_path_drops') {
                            this.incrementDropCount(pathIndex);
                        }
                    });
                    cell.appendChild(dropCountDisplay);
                }

                const pieceStack = this.gameState.board[r] ? this.gameState.board[r][c] : null; // Add guard for board[r]
                if (pieceStack && pieceStack.length > 0) {
                    const topPiece = pieceStack[pieceStack.length - 1];
                    const pieceDiv = document.createElement('div');
                    pieceDiv.classList.add('piece', `${topPiece.type.toLowerCase()}-${topPiece.color.toLowerCase()}`);

                    let symbol = '';
                    if (topPiece.type === 'flat') symbol = '■';
                    else if (topPiece.type === 'wall') symbol = '┃';
                    else if (topPiece.type === 'capstone') symbol = '▲';
                    pieceDiv.textContent = symbol;

                    if (pieceStack.length > 1) {
                        const stackCountSpan = document.createElement('span');
                        stackCountSpan.classList.add('stack-count');
                        stackCountSpan.textContent = pieceStack.length;
                        pieceDiv.appendChild(stackCountSpan);
                    }
                    cell.appendChild(pieceDiv);
                }
                this.boardElement.appendChild(cell);
            }
        }
    },

    incrementDropCount: function(pathIndex) {
        if (pathIndex < 0 || pathIndex >= this.moveData.path.length) return;
        const currentTotalDropsOnPath = this.moveData.path.reduce((sum, p, index) => index === 0 ? sum : sum + p.drops, 0);
        const sourceDropCount = this.moveData.path[0] ? this.moveData.path[0].drops : 0;

        if (currentTotalDropsOnPath < this.moveData.liftedCount - sourceDropCount) {
            this.moveData.path[pathIndex].drops++;
            this.renderAll();
        } else {
            this.gameMessagesElement.textContent = "Cannot drop more pieces than lifted (minus those left on source).";
        }
    },

    updatePlayerInfo: function() {
        if (!this.gameState || !this.gameState.pieces || !this.gameState.pieces.White || !this.currentPlayerElement) return;
        this.currentPlayerElement.textContent = this.gameState.currentPlayer || "N/A";
        this.whiteFlatsElement.textContent = this.gameState.pieces.White.flats;
        this.whiteCapstonesElement.textContent = this.gameState.pieces.White.capstones;
        this.blackFlatsElement.textContent = this.gameState.pieces.Black.flats;
        this.blackCapstonesElement.textContent = this.gameState.pieces.Black.capstones;
    },

    renderMoveControls: function() {
        if (!this.moveControlsPanel) return;
        this.moveControlsPanel.innerHTML = '';
        this.currentPathElement.textContent = '';

        if (this.currentAction === 'move_lift_pieces' && this.moveData.source) {
            const sourceStack = this.gameState.board[this.moveData.source.r][this.moveData.source.c];
            if (!sourceStack) return; // Should not happen if source is valid
            const maxLift = Math.min(this.BOARD_SIZE, sourceStack.length);
            this.piecesToLiftInput.max = maxLift.toString();
            this.piecesToLiftInput.value = "1";
            this.moveControlsPanel.appendChild(new Text(`Lift from (${this.moveData.source.r},${this.moveData.source.c}): `));
            this.moveControlsPanel.appendChild(this.piecesToLiftInput);
            this.moveControlsPanel.appendChild(this.confirmLiftButton);
        } else if (this.currentAction === 'move_select_path_drops') {
            this.moveControlsPanel.appendChild(new Text(`Lifted: ${this.moveData.liftedCount}. Path: `));
            this.currentPathElement.textContent = `Source (${this.moveData.source.r},${this.moveData.source.c}) -> ${this.moveData.path.slice(1).map(p => `(${p.r},${p.c})[${p.drops}]`).join('->')}`;
            this.moveControlsPanel.appendChild(this.currentPathElement);

            const totalDroppedOnPath = this.moveData.path.slice(1).reduce((sum, p) => sum + p.drops, 0);
            const piecesLeftOnSource = this.moveData.path.length > 0 ? this.moveData.path[0].drops : 0;

            this.moveControlsPanel.appendChild(new Text(` Dropped on path: ${totalDroppedOnPath}/${this.moveData.liftedCount - piecesLeftOnSource}. Left on source: ${piecesLeftOnSource}.`));

            if (totalDroppedOnPath === (this.moveData.liftedCount - piecesLeftOnSource) && totalDroppedOnPath >= 0 && (this.moveData.liftedCount - piecesLeftOnSource) >=0 ) { // Ensure non-negative counts
                 if (this.moveData.path.length > 1 || (this.moveData.path.length === 1 && piecesLeftOnSource === this.moveData.liftedCount) ) { // Valid path exists or all pieces left on source
                    this.moveControlsPanel.appendChild(this.confirmMoveButton);
                 }
            }
        }
        if (this.currentAction.startsWith('move_')) {
            this.moveControlsPanel.appendChild(this.cancelMoveButton);
        }
    },

    handleCellClick: function(event) {
        if (this.gameState.winner) return;
        const r = parseInt(event.currentTarget.dataset.r);
        const c = parseInt(event.currentTarget.dataset.c);

        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
            this.gameMessagesElement.textContent = 'Not connected.'; return;
        }

        if (this.currentAction.startsWith('place_')) {
            this.socket.send(JSON.stringify({ action: this.currentAction, r, c }));
        } else if (this.currentAction === 'move_select_source') {
            const stack = this.gameState.board[r][c];
            if (stack && stack.length > 0 && stack[stack.length - 1].color === this.gameState.currentPlayer) {
                this.moveData.source = { r, c };
                this.currentAction = 'move_lift_pieces';
                this.gameMessagesElement.textContent = `Selected source (${r},${c}). Specify pieces to lift.`;
            } else {
                this.gameMessagesElement.textContent = 'Select a stack you control.';
            }
        } else if (this.currentAction === 'move_select_path_drops') {
            if (!this.moveData.source || this.moveData.liftedCount === 0) return;

            const lastPathR = this.moveData.path.length > 0 ? this.moveData.path[this.moveData.path.length - 1].r : this.moveData.source.r;
            const lastPathC = this.moveData.path.length > 0 ? this.moveData.path[this.moveData.path.length - 1].c : this.moveData.source.c;

            if (Math.abs(r - lastPathR) + Math.abs(c - lastPathC) === 1) {
                const existingPathSquare = this.moveData.path.find(p => p.r === r && p.c === c);
                if (existingPathSquare) {
                    this.incrementDropCount(this.moveData.path.indexOf(existingPathSquare));
                } else {
                    const totalDroppedOnPath = this.moveData.path.slice(1).reduce((sum, p) => sum + p.drops, 0);
                    const piecesLeftOnSource = this.moveData.path[0] ? this.moveData.path[0].drops : 0;
                    if (totalDroppedOnPath < this.moveData.liftedCount - piecesLeftOnSource) {
                        this.moveData.path.push({ r, c, drops: 1 });
                    } else {
                        this.gameMessagesElement.textContent = "No more pieces in hand to drop on new squares.";
                    }
                }
            } else if (r === this.moveData.source.r && c === this.moveData.source.c && this.moveData.path.length > 0 && this.moveData.path[0].r === r && this.moveData.path[0].c === c) {
                 // Allow clicking source again to adjust pieces left on source
                 this.incrementDropCount(0); // Increment drops for the source square
            } else {
                this.gameMessagesElement.textContent = "Select an orthogonally adjacent square for the path, or click source to adjust pieces left there.";
            }
        }
        this.renderAll();
    },

    setupButtonEventHandlers: function() { // Renamed from confirmLiftButton.onclick etc.
        this.confirmLiftButton.onclick = () => {
            if (!this.moveData.source) { this.gameMessagesElement.textContent = "Error: Source not set for lift."; return; }
            const sourceStack = this.gameState.board[this.moveData.source.r][this.moveData.source.c];
             if (!sourceStack) { this.gameMessagesElement.textContent = "Error: Source stack disappeared."; this.resetMoveDataAndUI(); return; }

            const numToLift = parseInt(this.piecesToLiftInput.value);
            if (isNaN(numToLift) || numToLift <= 0 || numToLift > Math.min(this.BOARD_SIZE, sourceStack.length)) {
                this.gameMessagesElement.textContent = "Invalid number of pieces to lift."; return;
            }
            this.moveData.liftedCount = numToLift;
            this.moveData.path = [{ r: this.moveData.source.r, c: this.moveData.source.c, drops: 1 }]; // Default 1 for source
            this.currentAction = 'move_select_path_drops';
            this.gameMessagesElement.textContent = `Lifted ${numToLift}. Define path & drops. Min 1 on source. Click path squares or source.`;
            this.renderAll();
        };

        this.confirmMoveButton.onclick = () => {
            if (!this.moveData.source || this.moveData.path.length === 0) return;
            if (this.moveData.path[0].r !== this.moveData.source.r || this.moveData.path[0].c !== this.moveData.source.c) {
                alert("Client Error: Path must start with source square."); this.resetMoveDataAndUI(); return;
            }
            const totalActuallyDropped = this.moveData.path.reduce((sum, p) => sum + p.drops, 0);
            if (totalActuallyDropped !== this.moveData.liftedCount) {
                 this.gameMessagesElement.textContent = `Error: Total drops (${totalActuallyDropped}) must equal lifted pieces (${this.moveData.liftedCount}). Adjust drops.`;
                 return;
            }
            const serverDropsPayload = this.moveData.path.map(p => ({ r: p.r, c: p.c, count: p.drops }));
            this.socket.send(JSON.stringify({
                action: 'move_stack',
                from_r: this.moveData.source.r,
                from_c: this.moveData.source.c,
                drops: serverDropsPayload
            }));
            this.resetMoveDataAndUI();
        };

        this.cancelMoveButton.onclick = () => {
            this.resetMoveDataAndUI();
            this.setActiveButtonBasedOnCurrentAction();
            this.gameMessagesElement.textContent = "Move cancelled.";
        };
    },

    setActiveButtonBasedOnCurrentAction: function() {
        if (this.currentAction === 'place_flat') this.setActiveButton(this.btnPlaceFlat);
        else if (this.currentAction === 'place_wall') this.setActiveButton(this.btnPlaceWall);
        else if (this.currentAction === 'place_capstone') this.setActiveButton(this.btnPlaceCapstone);
        else if (this.currentAction.startsWith('move_')) this.setActiveButton(this.btnMoveStack);
        else this.setActiveButton(this.btnPlaceFlat);
    },

    resetMoveDataAndUI: function() {
        this.moveData = { source: null, liftedCount: 0, path: [] };
        // Determine current action based on which button has .active-action or default
        const activeButton = document.querySelector('#controls .active-action');
        this.currentAction = activeButton ? activeButton.dataset.action : 'place_flat';

        if (this.currentAction && this.currentAction.startsWith('move')) { // If move was active, reset to start of move selection
            this.currentAction = 'move_select_source';
        } else if (!this.currentAction || !this.currentAction.startsWith('place')) { // Default to place_flat if state is unclear
            this.currentAction = 'place_flat';
             this.setActiveButton(this.btnPlaceFlat); // Make sure a button is visually active
        }
        this.renderAll();
    },

    setupButtonActions: function() {
        const setAction = (actionName, btn) => {
            this.currentAction = actionName;
            this.resetMoveDataAndUI();
            this.setActiveButton(btn);
            this.gameMessagesElement.textContent = `Selected: ${btn.textContent}.`;
            if (actionName === 'move_select_source') this.gameMessagesElement.textContent += " Click a stack you control.";
            else this.gameMessagesElement.textContent += " Click an empty square.";
            this.renderMoveControls(); // Ensure move panel is cleared/updated
        };

        this.btnPlaceFlat.dataset.action = 'place_flat';
        this.btnPlaceWall.dataset.action = 'place_wall';
        this.btnPlaceCapstone.dataset.action = 'place_capstone';
        this.btnMoveStack.dataset.action = 'move_select_source';

        this.btnPlaceFlat.addEventListener('click', () => setAction('place_flat', this.btnPlaceFlat));
        this.btnPlaceWall.addEventListener('click', () => setAction('place_wall', this.btnPlaceWall));
        this.btnPlaceCapstone.addEventListener('click', () => setAction('place_capstone', this.btnPlaceCapstone));
        this.btnMoveStack.addEventListener('click', () => setAction('move_select_source', this.btnMoveStack));

        const controlsFieldset = document.querySelector('#controls fieldset');
        // Check if reset button already added by HTML, else create
        this.btnResetGameInternal = document.getElementById('btn-reset-game');
        if (!this.btnResetGameInternal) {
            this.btnResetGameInternal = document.createElement('button');
            this.btnResetGameInternal.id = 'btn-reset-game';
            this.btnResetGameInternal.textContent = 'Reset Game';
            controlsFieldset.appendChild(this.btnResetGameInternal);
        }
        this.btnResetGameInternal.addEventListener('click', () => {
            if (this.socket && this.socket.readyState === WebSocket.OPEN) {
                this.socket.send(JSON.stringify({ action: 'reset_game' }));
            }
        });
    },

    setActiveButton: function(button) {
        [this.btnPlaceFlat, this.btnPlaceWall, this.btnPlaceCapstone, this.btnMoveStack].forEach(btn => {
            if(btn) btn.classList.remove('active-action');
        });
        if (button) button.classList.add('active-action');
    },

    disableGameControls: function() {
        [this.btnPlaceFlat, this.btnPlaceWall, this.btnPlaceCapstone, this.btnMoveStack, this.btnResetGameInternal].forEach(btn => {
            if(btn) btn.disabled = true;
        });
    },
    enableGameControls: function() {
        [this.btnPlaceFlat, this.btnPlaceWall, this.btnPlaceCapstone, this.btnMoveStack, this.btnResetGameInternal].forEach(btn => {
            if(btn) btn.disabled = false;
        });
    },

    // Main initialization function for the app
    init: function() {
        this.initDOMReferences();
        this.setupButtonActions();
        this.setupButtonEventHandlers(); // For confirm/cancel move buttons
        this.setActiveButton(this.btnPlaceFlat);

        // Only connect WebSocket if not in test mode (test runner will mock it)
        if (typeof window.isRunningTests === 'undefined' || !window.isRunningTests) {
            this.connectWebSocket();
        } else {
            // In test mode, provide a mock socket if needed immediately
            console.log("Test mode: WebSocket connection skipped. Mock if needed.");
            // this.socket = new MockSocket(); // Example
        }
        this.renderAll(); // Initial render based on default state
    }
};

// Initialize the app when the DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.takGameApp.init();
});
