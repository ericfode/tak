//
// 🌟 A wise programmer once said: "The best code is no code." 🌟
// Since that's not an option, here's some code I tried to make joyful.
//
window.takGameApp = {
    // --- PROPERTIES ---
    // DOM Elements
    boardElement: null, currentPlayerElement: null, whiteFlatsElement: null,
    whiteCapstonesElement: null, blackFlatsElement: null, blackCapstonesElement: null,
    gameMessagesElement: null, moveControlsPanel: null, currentActionDisplayElement: null,
    btnPlaceFlat: null, btnPlaceWall: null, btnPlaceCapstone: null, btnMoveStack: null,
    btnResetGameInternal: null, piecesToLiftInput: null, confirmLiftButton: null,
    confirmMoveButton: null, cancelMoveButton: null, currentPathElement: null,

    // Lobby & Room Elements
    lobbyContainer: null, btnCreateGame: null, btnJoinGame: null, inputRoomCode: null,
    lobbyErrorMessage: null, gameContainer: null, roomInfo: null, roomCodeDisplay: null,
    copyCodeBtn: null,

    // State
    actionButtonMap: {},
    BOARD_SIZE: 5,
    gameState: { board: [], currentPlayer: 'White', pieces: { White: {}, Black: {} }, winner: null, board_size: 5 },
    currentAction: 'place_flat',
    moveData: { source: null, liftedCount: 0, path: [] },
    roomCode: null,
    socket: null,

    // --- INITIALIZATION & LOBBY FLOW ---

    init: function() {
        // This is the main entry point, called on DOMContentLoaded
        this.initDOMReferences();
        this.setupLobbyEventHandlers();
        this.setupGameEventHandlers(); // Setup game handlers once, they'll be hidden initially
    },

    initDOMReferences: function() {
        // Lobby
        this.lobbyContainer = document.getElementById('lobby-container');
        this.btnCreateGame = document.getElementById('btn-create-game');
        this.btnJoinGame = document.getElementById('btn-join-game');
        this.inputRoomCode = document.getElementById('input-room-code');
        this.lobbyErrorMessage = document.getElementById('lobby-error-message');
        this.gameContainer = document.getElementById('game-container');
        this.roomInfo = document.getElementById('room-info');
        this.roomCodeDisplay = document.getElementById('room-code-display');
        this.copyCodeBtn = document.getElementById('copy-code-btn');

        // Game
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
        // The reset button in index.html is part of the main controls now
        this.btnResetGameInternal = document.querySelector('#controls button[data-action="reset_game"]');

        this.actionButtonMap = {
            'place_flat': this.btnPlaceFlat, 'place_wall': this.btnPlaceWall,
            'place_capstone': this.btnPlaceCapstone, 'move_select_source': this.btnMoveStack
        };

        // Create dynamic elements used for move controls
        this.piecesToLiftInput = this.createEl('input', {type: 'number', id: 'pieces-to-lift', min: '1'});
        this.confirmLiftButton = this.createEl('button', {id: 'btn-confirm-lift', textContent: 'Lift Pieces'});
        this.confirmMoveButton = this.createEl('button', {id: 'btn-confirm-move', textContent: 'Confirm Move'});
        this.cancelMoveButton = this.createEl('button', {id: 'btn-cancel-move', textContent: 'Cancel Move'});
        this.currentPathElement = this.createEl('p', {id: 'current-path-display'});
    },

    setupLobbyEventHandlers: function() {
        this.btnCreateGame.addEventListener('click', this.handleCreateGame.bind(this));
        this.btnJoinGame.addEventListener('click', this.handleJoinGame.bind(this));
        this.copyCodeBtn.addEventListener('click', this.handleCopyCode.bind(this));
    },

    handleCreateGame: async function() {
        this.lobbyErrorMessage.textContent = '';
        try {
            const response = await fetch('/api/rooms', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ board_size: 5 })
            });
            if (!response.ok) throw new Error(`${response.status}: ${response.statusText}`);
            const data = await response.json();
            this.enterGameRoom(data.code);
        } catch (error) {
            this.lobbyErrorMessage.textContent = `Error creating game: ${error.message}`;
        }
    },

    handleJoinGame: function() {
        const code = this.inputRoomCode.value.trim().toUpperCase();
        if (code && /^[A-Z0-9]{6}$/.test(code)) {
            this.lobbyErrorMessage.textContent = '';
            this.enterGameRoom(code);
        } else {
            this.lobbyErrorMessage.textContent = 'Please enter a valid 6-character game code.';
        }
    },

    handleCopyCode: function() {
        if (!this.roomCode) return;
        navigator.clipboard.writeText(this.roomCode).then(() => {
            this.copyCodeBtn.textContent = 'Copied!';
            setTimeout(() => { this.copyCodeBtn.textContent = 'Copy'; }, 2000);
        }).catch(err => console.error('Failed to copy room code: ', err));
    },

    enterGameRoom: function(code) {
        this.roomCode = code;
        this.roomCodeDisplay.textContent = this.roomCode;

        this.lobbyContainer.classList.add('hidden');
        this.gameContainer.classList.remove('hidden');
        this.roomInfo.classList.remove('hidden');

        const socketURL = `ws://${window.location.host}/ws/${this.roomCode}`;
        this.connectWebSocket(socketURL);
    },

    // --- WEBSOCKET & SERVER COMMUNICATION ---

    connectWebSocket: function(socketURL) {
        this.socket = new WebSocket(socketURL);
        this.socket.onopen = () => this.gameMessagesElement.textContent = 'Connected. Waiting for players...';
        this.socket.onmessage = this.handleServerMessage.bind(this);
        this.socket.onerror = (err) => console.error('WS Error:', err);
        this.socket.onclose = (event) => {
            if (event.code === 1008) {
                this.returnToLobby(`Connection failed: ${event.reason}`);
            } else if (this.roomCode) {
                this.gameMessagesElement.textContent = 'Disconnected. Attempting to reconnect...';
                setTimeout(() => this.connectWebSocket(socketURL), 3000);
            }
        };
    },

    handleServerMessage: function(event) {
        const message = JSON.parse(event.data);
        if (message.type === 'init' || message.type === 'update') {
            this.gameState = message.data;
            this.renderAll();
            this.updateGameStatusMessage(message.message);
        } else if (message.type === 'error') {
            this.gameMessagesElement.textContent = `Error: ${message.message}`;
            if (message.data) { // Rollback if server provides corrected state
                this.gameState = message.data;
                this.renderAll();
            }
        } else if (message.type === 'info') {
            this.gameMessagesElement.textContent = `Server: ${message.message}`;
        }
    },

    sendSocketMessage: function(payload) {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify(payload));
        } else {
            this.gameMessagesElement.textContent = "Not connected to server.";
        }
    },

    // --- GAME EVENT HANDLERS ---

    setupGameEventHandlers: function() {
        this.boardElement.addEventListener('click', this.handleCellClick.bind(this));
        this.boardElement.addEventListener('contextmenu', this.handleRightClick.bind(this));

        this.btnPlaceFlat.addEventListener('click', () => this.setCurrentAction('place_flat'));
        this.btnPlaceWall.addEventListener('click', () => this.setCurrentAction('place_wall'));
        this.btnPlaceCapstone.addEventListener('click', () => this.setCurrentAction('place_capstone'));
        this.btnMoveStack.addEventListener('click', () => this.setCurrentAction('move_select_source'));
        if(this.btnResetGameInternal) this.btnResetGameInternal.addEventListener('click', () => this.sendSocketMessage({ action: 'reset_game' }));

        this.confirmLiftButton.addEventListener('click', this.handleConfirmLift.bind(this));
        this.confirmMoveButton.addEventListener('click', this.handleConfirmMove.bind(this));
        this.cancelMoveButton.addEventListener('click', this.handleCancelMove.bind(this));
    },

    handleCellClick: function(event) {
        if (this.gameState.winner) return;
        const cell = event.target.closest('.board-cell');
        if (!cell) return;
        const r = parseInt(cell.dataset.r, 10);
        const c = parseInt(cell.dataset.c, 10);

        if (this.currentAction.startsWith('place_')) {
            // Optimistic UI update for placement
            const pieceType = this.currentAction.split('_')[1];
            const player = this.gameState.currentPlayer;
            // A simple optimistic update: just place the piece.
            // Server will send back the full corrected state if this was wrong.
            if (this.gameState.board[r][c].length === 0) { // Only if empty for simplicity
                 this.gameState.board[r][c].push({ color: player, type: pieceType });
                 this.gameState.currentPlayer = player === 'White' ? 'Black' : 'White';
                 if (pieceType === 'capstone') {
                    this.gameState.pieces[player].capstones--;
                 } else {
                    this.gameState.pieces[player].flats--;
                 }
                 this.renderAll();
            }
            this.sendSocketMessage({ action: this.currentAction, r, c });
        } else if (this.currentAction === 'move_select_source') {
            const stack = this.gameState.board[r][c];
            if (stack && stack.length > 0 && stack[stack.length - 1].color === this.gameState.currentPlayer) {
                this.moveData.source = { r, c };
                this.setCurrentAction('move_lift_pieces');
            } else {
                this.gameMessagesElement.textContent = 'Select a stack you control.';
            }
        } else if (this.currentAction === 'move_select_path_drops') {
            // Logic for adding cells to the move path
            const lastPathR = this.moveData.path.length > 0 ? this.moveData.path[this.moveData.path.length - 1].r : this.moveData.source.r;
            const lastPathC = this.moveData.path.length > 0 ? this.moveData.path[this.moveData.path.length - 1].c : this.moveData.source.c;

            if (Math.abs(r - lastPathR) + Math.abs(c - lastPathC) === 1) {
                this.moveData.path.push({ r, c, drops: 1 });
            } else {
                 this.gameMessagesElement.textContent = "Select an orthogonally adjacent square for the path.";
            }
            this.renderAll();
        }
    },

    handleRightClick: function(event) {
        event.preventDefault();
        if (this.gameState.winner) return;
        const placementModes = ['place_flat', 'place_wall', 'place_capstone'];
        let currentModeIndex = placementModes.indexOf(this.currentAction);
        if (currentModeIndex === -1) {
            currentModeIndex = 0;
        } else {
            currentModeIndex = (currentModeIndex + 1) % placementModes.length;
        }
        this.setCurrentAction(placementModes[currentModeIndex]);
    },
    handleConfirmLift: function() {
        if (!this.moveData.source) return;
        const sourceStack = this.gameState.board[this.moveData.source.r][this.moveData.source.c];
        const numToLift = parseInt(this.piecesToLiftInput.value, 10);
        if (isNaN(numToLift) || numToLift <= 0 || numToLift > this.BOARD_SIZE || numToLift > sourceStack.length) {
            this.gameMessagesElement.textContent = `Invalid number of pieces to lift (1-${Math.min(this.BOARD_SIZE, sourceStack.length)}).`;
            return;
        }
        this.moveData.liftedCount = numToLift;
        this.moveData.path = [{ r: this.moveData.source.r, c: this.moveData.source.c, drops: 1 }];
        this.setCurrentAction('move_select_path_drops');
    },
    handleConfirmMove: function() {
        const payload = {
            action: 'move_stack',
            from_r: this.moveData.source.r,
            from_c: this.moveData.source.c,
            drops: this.moveData.path.map(p => ({ r: p.r, c: p.c, count: p.drops }))
        };
        // Can add optimistic update for moves here later
        this.sendSocketMessage(payload);
        this.resetMoveDataAndUI();
        this.setCurrentAction('place_flat');
    },
    handleCancelMove: function() { this.resetMoveDataAndUI(); this.setCurrentAction('place_flat'); },

    // --- UI & RENDER ---

    renderAll: function() {
        this.renderBoard();
        this.updatePlayerInfo();
        this.renderMoveControls();
        this.updateActiveButton();
    },

    renderBoard: function() {
        if (!this.boardElement) return;
        this.boardElement.innerHTML = '';
        this.boardElement.style.gridTemplateColumns = `repeat(${this.BOARD_SIZE}, 60px)`;
        this.boardElement.style.gridTemplateRows = `repeat(${this.BOARD_SIZE}, 60px)`;

        if (!this.gameState.board) return;
        for (let r = 0; r < this.BOARD_SIZE; r++) {
            for (let c = 0; c < this.BOARD_SIZE; c++) {
                const cell = this.createEl('div', { className: 'board-cell' });
                cell.dataset.r = r; cell.dataset.c = c;
                cell.addEventListener('click', this.handleCellClick.bind(this));
                
                if (this.moveData.source && this.moveData.source.r === r && this.moveData.source.c === c) {
                    cell.classList.add('source-selected');
                }
                if (this.moveData.path.some(p => p.r === r && p.c === c)) {
                    cell.classList.add('path-selected');
                }

                const pieceStack = this.gameState.board[r] ? this.gameState.board[r][c] : [];
                if (pieceStack.length > 0) {
                    const topPiece = pieceStack[pieceStack.length - 1];
                    const pieceDiv = this.createEl('div', {
                        className: `piece ${topPiece.type.toLowerCase()}-${topPiece.color.toLowerCase()}`
                    });

                    let symbol = '';
                    if (topPiece.type === 'flat') symbol = '■';
                    else if (topPiece.type === 'wall') symbol = '┃';
                    else if (topPiece.type === 'capstone') symbol = '▲';
                    pieceDiv.textContent = symbol;

                    if (pieceStack.length > 1) {
                        const stackCountSpan = this.createEl('span', { className: 'stack-count', textContent: pieceStack.length });
                        pieceDiv.appendChild(stackCountSpan);
                    }
                    cell.appendChild(pieceDiv);
                }
                this.boardElement.appendChild(cell);
            }
        }
    },
    updatePlayerInfo: function() {
        if (!this.gameState || !this.gameState.pieces || !this.gameState.pieces.White) return;
        this.currentPlayerElement.textContent = this.gameState.currentPlayer || "N/A";
        const whitePieces = this.gameState.pieces.White;
        const blackPieces = this.gameState.pieces.Black;
        this.whiteFlatsElement.textContent = whitePieces.flats;
        this.whiteCapstonesElement.textContent = whitePieces.capstones;
        this.blackFlatsElement.textContent = blackPieces.flats;
        this.blackCapstonesElement.textContent = blackPieces.capstones;
    },
    renderMoveControls: function() {
        if (!this.moveControlsPanel) return;
        this.moveControlsPanel.innerHTML = '';
        
        if (this.currentAction === 'move_lift_pieces' && this.moveData.source) {
            const sourceStack = this.gameState.board[this.moveData.source.r][this.moveData.source.c];
            if (!sourceStack) return;
            this.piecesToLiftInput.max = Math.min(this.BOARD_SIZE, sourceStack.length);
            this.moveControlsPanel.appendChild(this.createEl('label', { textContent: `Lift from (${this.moveData.source.r}, ${this.moveData.source.c}): `}));
            this.moveControlsPanel.appendChild(this.piecesToLiftInput);
            this.moveControlsPanel.appendChild(this.confirmLiftButton);
        } else if (this.currentAction === 'move_select_path_drops') {
            const totalDropped = this.moveData.path.reduce((sum, p) => sum + p.drops, 0);
            this.currentPathElement.textContent = `Path: ${this.moveData.path.map(p => `(${p.r},${p.c})`).join(' -> ')}. Drops: ${totalDropped}/${this.moveData.liftedCount}`;
            this.moveControlsPanel.appendChild(this.currentPathElement);
            if (totalDropped === this.moveData.liftedCount) {
                this.moveControlsPanel.appendChild(this.confirmMoveButton);
            }
        }

        if (this.currentAction.startsWith('move_')) {
            this.moveControlsPanel.appendChild(this.cancelMoveButton);
        }
    },

    updateGameStatusMessage: function(extraMessage = "") {
        if (this.gameState.winner) {
            this.gameMessagesElement.textContent = `Game Over! ${this.gameState.winner === "Draw" ? "It's a Draw" : `${this.gameState.winner} wins`} by ${this.gameState.win_reason}.`;
            this.disableGameControls();
        } else {
            this.gameMessagesElement.textContent = `${this.gameState.currentPlayer}'s turn. ${extraMessage}`;
            this.enableGameControls();
        }
    },

    setCurrentAction: function(action) {
        if (this.gameState.winner) return;
        this.currentAction = action;
        if (!action.startsWith('move_')) {
            this.resetMoveDataAndUI();
        }
        this.updateActiveButton();
        this.renderMoveControls();
    },

    updateActiveButton: function() {
        for (const key in this.actionButtonMap) {
            this.actionButtonMap[key].classList.remove('active-action');
        }
        let activeBtn = this.actionButtonMap[this.currentAction] || (this.currentAction.startsWith('move_') ? this.btnMoveStack : null);
        if (activeBtn) activeBtn.classList.add('active-action');
    },
    resetMoveDataAndUI: function() { this.moveData = { source: null, liftedCount: 0, path: [] }; this.renderAll(); },

    returnToLobby: function(message) {
        if (this.socket) this.socket.close();
        this.socket = null;
        this.roomCode = null;
        this.gameContainer.classList.add('hidden');
        this.roomInfo.classList.add('hidden');
        this.lobbyContainer.classList.remove('hidden');
        this.lobbyErrorMessage.textContent = message || 'You have been returned to the lobby.';
    },

    disableGameControls: function() {
        [this.btnPlaceFlat, this.btnPlaceWall, this.btnPlaceCapstone, this.btnMoveStack, this.btnResetGameInternal].forEach(btn => {
            if (btn) btn.disabled = true;
        });
    },
    enableGameControls: function() {
        if (!this.gameState.currentPlayer || !this.gameState.pieces[this.gameState.currentPlayer]) return;
        const playerPieces = this.gameState.pieces[this.gameState.currentPlayer];
        const noFlats = playerPieces.flats <= 0;
        const noCaps = playerPieces.capstones <= 0;

        this.btnPlaceFlat.disabled = noFlats;
        this.btnPlaceWall.disabled = noFlats;
        this.btnPlaceCapstone.disabled = noCaps;
        this.btnMoveStack.disabled = false;
        if (this.btnResetGameInternal) this.btnResetGameInternal.disabled = false;
    },

    // --- UTILITY ---
    createEl: function(tag, props) { const el = document.createElement(tag); Object.assign(el, props); return el; }
};

document.addEventListener('DOMContentLoaded', () => {
    window.takGameApp.init();
});
