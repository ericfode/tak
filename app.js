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
    currentActionDisplayElement: null,
    btnPlaceFlat: null,
    btnPlaceWall: null,
    btnPlaceCapstone: null,
    btnMoveStack: null,
    btnResetGameInternal: null,
    piecesToLiftInput: null,
    confirmLiftButton: null,
    confirmMoveButton: null,
    cancelMoveButton: null,
    currentPathElement: null,

    actionButtonMap: {}, // To map action strings to button elements

    // State
    BOARD_SIZE: 5,
    gameState: { board: [], currentPlayer: 'White', pieces: { White: {}, Black: {} }, winner: null, board_size: 5 },
    currentAction: 'place_flat',
    moveData: {
        source: null,
        liftedCount: 0,
        path: [],
    },

    socket: null,

    initDOMReferences: function() {
        this.boardElement = document.getElementById('game-board');
        this.currentPlayerElement = document.getElementById('current-player');
        this.whiteFlatsElement = document.getElementById('white-flats');
        this.whiteCapstonesElement = document.getElementById('white-capstones');
        this.blackFlatsElement = document.getElementById('black-flats');
        this.blackCapstonesElement = document.getElementById('black-capstones');
        this.gameMessagesElement = document.getElementById('game-messages');
        this.moveControlsPanel = document.getElementById('move-controls-panel');
        this.currentActionDisplayElement = document.getElementById('current-action-display');

        this.btnPlaceFlat = document.getElementById('btn-place-flat');
        this.btnPlaceWall = document.getElementById('btn-place-wall');
        this.btnPlaceCapstone = document.getElementById('btn-place-capstone');
        this.btnMoveStack = document.getElementById('btn-move-stack');

        // Populate actionButtonMap
        this.actionButtonMap = {
            'place_flat': this.btnPlaceFlat,
            'place_wall': this.btnPlaceWall,
            'place_capstone': this.btnPlaceCapstone,
            'move_select_source': this.btnMoveStack, // Or other move states if they have dedicated buttons
            // Add other specific move states if they need to be activated by button directly
        };

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

    connectWebSocket: function(socketURLOverride) { // ... (no changes) ...
        const socketURL = socketURLOverride || `ws://${window.location.host}/ws`;
        this.socket = new WebSocket(socketURL);

        this.socket.onopen = () => {
            console.log('WebSocket connection established.');
            if (this.gameMessagesElement) this.gameMessagesElement.textContent = 'Connected.';
        };
        this.socket.onmessage = this.handleServerMessage.bind(this);
        this.socket.onerror = (err) => {
            console.error('WS Error:', err);
            if (this.gameMessagesElement) this.gameMessagesElement.textContent = 'Connection error.';
        };
        this.socket.onclose = () => {
            if (this.gameMessagesElement) this.gameMessagesElement.textContent = 'Disconnected. Reconnecting...';
            if (typeof window.isRunningTests === 'undefined' || !window.isRunningTests) {
                 setTimeout(() => this.connectWebSocket(socketURL), 3000);
            }
        };
    },

    handleServerMessage: function(event) { // ... (no changes) ...
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
                this.updateCurrentActionDisplay("Game Over");
            } else {
                this.gameMessagesElement.textContent = `${this.gameState.currentPlayer}'s turn. ${message.message || ""}`;
                if (this.gameState.currentPlayer === this.getMyPlayerColor()) {
                     this.enableGameControls();
                }
                this.updateCurrentActionDisplay();
            }
        } else if (message.type === 'error') {
            this.gameMessagesElement.textContent = `Error: ${message.message}`;
            if (this.currentAction.startsWith('move_')) this.resetMoveDataAndUI();
        } else if (message.type === 'ack' || message.type === 'info') {
            this.gameMessagesElement.textContent = `Server: ${message.message}`;
        }
    },

    getMyPlayerColor: function() { return this.gameState.currentPlayer; },

    renderAll: function() { // ... (no changes) ...
        this.renderBoard();
        this.updatePlayerInfo();
        this.renderMoveControls();
    },

    renderBoard: function() { // ... (no changes) ...
        if (!this.boardElement) return;
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
                cell.addEventListener('click', (e) => this.handleCellClick(e));

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

                const pieceStack = this.gameState.board[r] ? this.gameState.board[r][c] : null;
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

    incrementDropCount: function(pathIndex) { // ... (no changes) ...
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

    updatePlayerInfo: function() { // ... (no changes) ...
        if (!this.gameState || !this.gameState.pieces || !this.gameState.pieces.White || !this.currentPlayerElement) return;
        this.currentPlayerElement.textContent = this.gameState.currentPlayer || "N/A";

        const whitePieces = this.gameState.pieces.White;
        const blackPieces = this.gameState.pieces.Black;

        if (whitePieces) {
            this.whiteFlatsElement.textContent = whitePieces.flats;
            this.whiteCapstonesElement.textContent = whitePieces.capstones;
        }
        if (blackPieces) {
            this.blackFlatsElement.textContent = blackPieces.flats;
            this.blackCapstonesElement.textContent = blackPieces.capstones;
        }

        if (this.gameState.currentPlayer && this.gameState.pieces[this.gameState.currentPlayer]) {
            const currentPlayerPieces = this.gameState.pieces[this.gameState.currentPlayer];
            const noFlatsLeft = (currentPlayerPieces.flats <= 0);
            const noCapstonesLeft = (currentPlayerPieces.capstones <= 0);

            if (this.btnPlaceFlat) this.btnPlaceFlat.disabled = noFlatsLeft;
            if (this.btnPlaceWall) this.btnPlaceWall.disabled = noFlatsLeft;
            if (this.btnPlaceCapstone) this.btnPlaceCapstone.disabled = noCapstonesLeft;
        }
    },

    renderMoveControls: function() { // ... (no changes) ...
        if (!this.moveControlsPanel) return;
        this.moveControlsPanel.innerHTML = '';
        this.currentPathElement.textContent = '';

        if (this.currentAction === 'move_lift_pieces' && this.moveData.source) {
            const sourceStack = this.gameState.board[this.moveData.source.r][this.moveData.source.c];
            if (!sourceStack) return;
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

            if (totalDroppedOnPath === (this.moveData.liftedCount - piecesLeftOnSource) && totalDroppedOnPath >= 0 && (this.moveData.liftedCount - piecesLeftOnSource) >=0 ) {
                 if (this.moveData.path.length > 1 || (this.moveData.path.length === 1 && piecesLeftOnSource === this.moveData.liftedCount) ) {
                    this.moveControlsPanel.appendChild(this.confirmMoveButton);
                 }
            }
        }
        if (this.currentAction.startsWith('move_')) {
            this.moveControlsPanel.appendChild(this.cancelMoveButton);
        }
    },

    handleCellClick: function(event) { // ... (no changes) ...
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
                // this.gameMessagesElement.textContent = `Selected source (${r},${c}). Specify pieces to lift.`; // updateCurrentActionDisplay will handle this
                this.updateCurrentActionDisplay(); // Update display for new sub-mode
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
                 this.incrementDropCount(0);
            } else {
                this.gameMessagesElement.textContent = "Select an orthogonally adjacent square for the path, or click source to adjust pieces left there.";
            }
        }
        this.renderAll();
    },

    handleRightClick: function(event) {
        event.preventDefault();
        if (this.gameState.winner) return; // Don't switch modes if game is over

        // Cycle only through placement modes
        const placementModes = ['place_flat', 'place_wall', 'place_capstone'];
        let currentModeIndex = placementModes.indexOf(this.currentAction);

        // If current action is not a placement mode, or not found, start from flat
        if (currentModeIndex === -1) {
            currentModeIndex = 0; // Default to 'place_flat' before cycling
        } else {
            currentModeIndex = (currentModeIndex + 1) % placementModes.length; // Cycle to next
        }

        const newAction = placementModes[currentModeIndex];
        const correspondingButton = this.actionButtonMap[newAction];

        if (correspondingButton && !correspondingButton.disabled) {
            this.currentAction = newAction;
            // If current action was a move, reset move data
            if (this.moveData.source || this.moveData.liftedCount > 0 || this.moveData.path.length > 0) {
                this.resetMoveDataAndUI(); // This will also call renderAll and update display
            }
            this.setActiveButton(correspondingButton); // This updates button class and text display
            this.gameMessagesElement.textContent = `Mode: ${correspondingButton.textContent}. Click an empty square.`;

        } else if (correspondingButton && correspondingButton.disabled) {
            // If the next mode's button is disabled (e.g., no capstones left), try the *next* one
            currentModeIndex = (currentModeIndex + 1) % placementModes.length;
            const newerAction = placementModes[currentModeIndex];
            const newerButton = this.actionButtonMap[newerAction];
            if (newerButton && !newerButton.disabled) {
                 this.currentAction = newerAction;
                 this.resetMoveDataAndUI();
                 this.setActiveButton(newerButton);
                 this.gameMessagesElement.textContent = `Mode: ${newerButton.textContent}. Click an empty square.`;
            } else {
                // If all are disabled or only one other option which is also disabled, may default back
                // For simplicity, if the directly cycled one is disabled, we just show a message or do nothing more.
                this.gameMessagesElement.textContent = `Cannot switch to ${newAction.split('_')[1]} mode: no pieces left or action unavailable.`;
            }
        }
        // No need to call renderAll() here if setActiveButton calls updateCurrentActionDisplay which is sufficient
        // and resetMoveDataAndUI calls renderAll().
    },

    setupButtonEventHandlers: function() { // ... (no changes to confirm/cancel move logic itself) ...
        this.confirmLiftButton.onclick = () => {
            if (!this.moveData.source) { this.gameMessagesElement.textContent = "Error: Source not set for lift."; return; }
            const sourceStack = this.gameState.board[this.moveData.source.r][this.moveData.source.c];
             if (!sourceStack) { this.gameMessagesElement.textContent = "Error: Source stack disappeared."; this.resetMoveDataAndUI(); return; }

            const numToLift = parseInt(this.piecesToLiftInput.value);
            if (isNaN(numToLift) || numToLift <= 0 || numToLift > Math.min(this.BOARD_SIZE, sourceStack.length)) {
                this.gameMessagesElement.textContent = "Invalid number of pieces to lift."; return;
            }
            this.moveData.liftedCount = numToLift;
            this.moveData.path = [{ r: this.moveData.source.r, c: this.moveData.source.c, drops: 1 }];
            this.currentAction = 'move_select_path_drops';
            // this.gameMessagesElement.textContent = `Lifted ${numToLift}. Define path & drops. Min 1 on source. Click path squares or source.`;
            this.updateCurrentActionDisplay(); // Update display for new sub-mode
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
            this.currentAction = 'place_flat'; // Default to place flat after a move
            this.setActiveButton(this.actionButtonMap[this.currentAction]);
            this.gameMessagesElement.textContent = "Move sent. Waiting for server response."; // Clear previous specific move messages
        };

        this.cancelMoveButton.onclick = () => {
            const prevActionBeforeCancel = this.currentAction;
            this.resetMoveDataAndUI();

            // Determine what the action should revert to.
            // If move mode was active (i.e. btnMoveStack has active-action), revert to move_select_source.
            // Otherwise, default to place_flat.
            if (this.btnMoveStack && this.btnMoveStack.classList.contains('active-action')) {
                this.currentAction = 'move_select_source';
            } else {
                this.currentAction = 'place_flat';
            }
            // If the detailed state was a move step, but the main "Move Stack" button isn't the active one,
            // it means user right-clicked to a placement mode, so cancel should honor that.
            // The above logic handles this by checking active-action on btnMoveStack.

            this.setActiveButton(this.actionButtonMap[this.currentAction] || this.btnPlaceFlat);
            this.gameMessagesElement.textContent = "Move cancelled.";
             if (prevActionBeforeCancel.startsWith("move_") && this.currentAction.startsWith("place_")) {
                // If we cancelled a move operation and switched to a placement mode (e.g. by right click then cancel)
                this.gameMessagesElement.textContent = `Mode: ${this.actionButtonMap[this.currentAction].textContent}. Click an empty square.`;
            }
            this.updateCurrentActionDisplay(); // Ensure text display is correct
        };
    },

    updateCurrentActionDisplay: function(overrideText = null) {
        if (this.currentActionDisplayElement) {
            if (overrideText) {
                this.currentActionDisplayElement.textContent = overrideText;
            } else {
                let text = "None";
                if (this.currentAction === 'place_flat') text = "Place Flat";
                else if (this.currentAction === 'place_wall') text = "Place Wall";
                else if (this.currentAction === 'place_capstone') text = "Place Capstone";
                else if (this.currentAction === 'move_select_source') text = "Move: Select Source";
                else if (this.currentAction === 'move_lift_pieces') text = "Move: Lift Pieces";
                else if (this.currentAction === 'move_select_path_drops') text = "Move: Define Path & Drops";
                this.currentActionDisplayElement.textContent = text;
            }
        }
    },

    setActiveButtonBasedOnCurrentAction: function() { // ... (no changes) ...
        let buttonToActivate = this.btnPlaceFlat;
        if (this.currentAction === 'place_wall') buttonToActivate = this.btnPlaceWall;
        else if (this.currentAction === 'place_capstone') buttonToActivate = this.btnPlaceCapstone;
        else if (this.currentAction.startsWith('move_')) buttonToActivate = this.btnMoveStack;
        this.setActiveButton(buttonToActivate);
    },

    resetMoveDataAndUI: function() {
        this.moveData = { source: null, liftedCount: 0, path: [] };
        // This function just resets data. CurrentAction should be managed by the caller.
        // For example, after a move is sent, currentAction becomes 'place_flat'.
        // If a move is cancelled, currentAction might revert to 'move_select_source' or 'place_flat'.
        this.renderAll(); // Re-render to clear path highlights, etc.
        // Note: updateCurrentActionDisplay() should be called by the function that *changes* currentAction.
    },

    setupButtonActions: function() {
        const setAction = (actionName, btn) => {
            this.currentAction = actionName;
            this.resetMoveDataAndUI(); // Clear any in-progress move data when action changes
            this.setActiveButton(btn); // Sets active class and calls updateCurrentActionDisplay

            // Set a general message based on the new mode
            if (actionName === 'move_select_source') {
                this.gameMessagesElement.textContent = "Mode: Move Stack. Click a stack you control to begin.";
            } else if (actionName.startsWith('place_')) {
                 this.gameMessagesElement.textContent = `Mode: ${btn.textContent}. Click an empty square to place.`;
            } else {
                this.gameMessagesElement.textContent = ""; // Clear for other non-standard actions if any
            }
            this.renderMoveControls(); // Update visibility of move panel
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
                this.currentAction = 'place_flat'; // Default after reset
                this.setActiveButton(this.actionButtonMap[this.currentAction] || this.btnPlaceFlat);
                this.gameMessagesElement.textContent = "Game reset. White's turn."; // Specific message for reset
            }
        });
    },

    setActiveButton: function(button) { // ... (no changes) ...
        [this.btnPlaceFlat, this.btnPlaceWall, this.btnPlaceCapstone, this.btnMoveStack].forEach(btn => {
            if(btn) btn.classList.remove('active-action');
        });
        if (button) {
            button.classList.add('active-action');
        }
        this.updateCurrentActionDisplay();
    },

    disableGameControls: function() { // ... (no changes) ...
        [this.btnPlaceFlat, this.btnPlaceWall, this.btnPlaceCapstone, this.btnMoveStack, this.btnResetGameInternal].forEach(btn => {
            if(btn) btn.disabled = true;
        });
    },
    enableGameControls: function() { // ... (no changes) ...
        this.updatePlayerInfo();
        if(this.btnMoveStack) this.btnMoveStack.disabled = false;
        if(this.btnResetGameInternal) this.btnResetGameInternal.disabled = false;
    },

    init: function() {
        this.initDOMReferences();
        this.setupButtonActions();
        this.setupButtonEventHandlers();
        this.setActiveButton(this.btnPlaceFlat);

        // Add right-click listener to the board
        if (this.boardElement) {
            this.boardElement.addEventListener('contextmenu', (e) => this.handleRightClick(e));
        }

        if (typeof window.isRunningTests === 'undefined' || !window.isRunningTests) {
            this.connectWebSocket();
        } else {
            console.log("Test mode: WebSocket connection skipped. Mock if needed.");
        }
        this.renderAll();
        this.updateCurrentActionDisplay();
    }
};

document.addEventListener('DOMContentLoaded', () => {
    window.takGameApp.init();
});
