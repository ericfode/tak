# AI-Powered P2P Game Implementation Plan

## High-Level Objective

Construct a real-time, two-player multiplayer browser game. The game will use a peer-to-peer (P2P) architecture via WebRTC for game state synchronization. A minimal, stateless WebSocket server will be used solely for the initial "signaling" handshake to connect the two peers.

## Core Principles for the AI

- **Stateless Backend:** The signaling server must not store any state that needs to persist. All state (active rooms) is held in-memory and is wiped on restart. This makes it cheap and trivial to deploy.
- **Client-Side Authority:** All game logic and state reside on the clients. There is no server-side validation.
- **Modularity:** The frontend code will be broken into distinct modules (`SignalingChannel`, `WebRTCManager`, `Game`) to isolate concerns and make the logic clear.
- **Explicit Steps:** Each step must be completed before proceeding to the next.

---

## Phase 1: Project Scaffolding

**Goal:** Create the directory structure and necessary configuration files.

1.  **Create Root Directory:**
    - Execute `mkdir p2p-game`
    - Execute `cd p2p-game`

2.  **Create Server Directory:**
    - Execute `mkdir server`
    - Execute `cd server`
    - Execute `npm init -y`
    - Execute `npm install ws`
    - Create a file `index.js`.
    - Create a file `README.md` with the content: `# Signaling Server\n\nTo run: \`npm install && node index.js\`.`
    - Execute `cd ..`

3.  **Create Client Directory:**
    - Execute `mkdir client`
    - Execute `cd client`
    - Create the following empty files:
        - `index.html`
        - `main.js`
        - `Game.js`
        - `WebRTCManager.js`
        - `SignalingChannel.js`
        - `style.css`
    - Create a file `README.md` with the content: `# Game Client\n\nServe this directory with a static file server. For example: \`npx serve\`. Open two browser tabs to the address to test.`
    - Execute `cd ..`

---

## Phase 2: Build the Stateless Signaling Server

**Goal:** Implement the WebSocket server that will relay connection messages between peers.

1.  **File:** `server/index.js`
2.  **Logic:**
    - Import the `ws` library.
    - Create a `WebSocket.Server` on a port (e.g., `8080`).
    - Create an in-memory `Map` to track rooms: `const rooms = new Map();`. The key will be the room code, the value will be a `Set` of WebSocket clients.
    - In the `server.on('connection', ws => { ... })` handler:
        - Implement a `message` event listener: `ws.on('message', message => { ... })`.
        - Parse the incoming JSON message. Use a `switch` on `message.type`.
        - **Case `'createRoom'':**
            - Generate a unique 5-character alphanumeric room code until one is found that is not in the `rooms` map.
            - Create a new `Set` for the room: `rooms.set(roomCode, new Set());`.
            - Add the client to the room: `rooms.get(roomCode).add(ws);`.
            - Store the `roomCode` on the `ws` object itself for later reference: `ws.roomCode = roomCode;`.
            - Send a confirmation to the creator: `ws.send(JSON.stringify({ type: 'roomCreated', roomCode }));`.
        - **Case `'joinRoom'':**
            - Get the `roomCode` from the message payload.
            - Check if the room exists and is not full (`rooms.has(roomCode) && rooms.get(roomCode).size < 2`).
            - If valid, add the client to the room, store the `roomCode` on their `ws` object.
            - Broadcast to *both* clients in the room that it's time to start the P2P handshake. Iterate through `rooms.get(roomCode)` and send `JSON.stringify({ type: 'ready', initiator: (client === ws) ? false : true })` to each client. The first person in the room is the initiator.
            - If invalid, send an error: `ws.send(JSON.stringify({ type: 'error', message: 'Room not found or full.' }));`.
        - **Case `'relay'':**
            - This is for SDP offers/answers and ICE candidates.
            - Find the peer client in the same room. Iterate through the `Set` and find the `ws` that is not the sender.
            - Forward the entire message payload to the peer *without inspecting it*. `peer.send(JSON.stringify({ type: 'relay', payload: message.payload }));`.
        - Implement a `close` event listener: `ws.on('close', () => { ... })`.
            - If the client was in a room (`ws.roomCode`), remove them from the `rooms` map. If the room becomes empty, delete the room code from the map.

---

## Phase 3: Frontend Implementation

### Step 3.1: HTML Structure and CSS

1.  **File:** `client/index.html`
2.  **Content:**
    - Basic HTML5 boilerplate.
    - Link to `style.css`.
    - Body contains two main sections:
        - `<div id="ui-container">`:
            - `<h1>P2P Game</h1>`
            - `<button id="create-btn">Create Game</button>`
            - `<input type="text" id="room-code-input" placeholder="Enter Room Code">`
            - `<button id="join-btn">Join Game</button>`
            - `<p>Your Room Code: <code id="room-code-display"></code></p>`
        - `<div id="game-container" style="display: none;">`:
            - `<canvas id="game-canvas" width="800" height="600"></canvas>`
    - Include script tags at the bottom of `<body>` in this **exact order**:
        1.  `SignalingChannel.js`
        2.  `WebRTCManager.js`
        3.  `Game.js`
        4.  `main.js`

3.  **File:** `client/style.css`
4.  **Content:**
    - Basic styling for the UI elements, canvas, etc. Center the UI, style the buttons, and give the canvas a border.

### Step 3.2: Signaling Channel Module

1.  **File:** `client/SignalingChannel.js`
2.  **Logic:** Create a class `SignalingChannel`.
    - `constructor(serverUrl, onMessageCallback)`:
        - Stores `onMessageCallback`.
        - Initializes the WebSocket: `this.ws = new WebSocket(serverUrl);`.
        - Sets up `this.ws.onmessage = event => { ... }` which parses the `event.data` and calls `onMessageCallback` with the resulting object.
    - `send(message)`:
        - `this.ws.send(JSON.stringify(message));`.
    - Public methods that wrap `send`:
        - `createRoom()`
        - `joinRoom(roomCode)`
        - `relay(payload)`

### Step 3.3: WebRTC Manager Module

1.  **File:** `client/WebRTCManager.js`
2.  **Logic:** Create a class `WebRTCManager`. This is the most complex module.
    - `constructor(signalingChannel, onDataMessageCallback)`:
        - Stores the `signalingChannel` and `onDataMessageCallback`.
        - Defines STUN server configuration: `this.iceServers = [{ urls: 'stun:stun.l.google.com:19302' }];`.
    - `initiateConnection()`:
        - Creates the peer connection: `this.peerConnection = new RTCPeerConnection({ iceServers: this.iceServers });`.
        - Wires up event handlers for `this.peerConnection`:
            - `onicecandidate`: If `event.candidate`, call `this.signalingChannel.relay({ candidate: event.candidate });`.
            - `ondatachannel`: Fired on the receiving peer. Stores the incoming channel `event.channel` and wires up *its* `onmessage` handler to call `this.onDataMessageCallback`.
    - `startHandshake(isInitiator)`:
        - Calls `initiateConnection()`.
        - If `isInitiator`:
            - Creates the data channel: `this.dataChannel = this.peerConnection.createDataChannel('gameData');`. Wires up its `onopen`, `onclose`, and `onmessage` handlers. The `onmessage` handler calls `this.onDataMessageCallback`.
            - Creates an SDP offer, calls `setLocalDescription`, then relays the offer via the signaling channel.
    - `handleSignalingMessage(message)`:
        - Handles relayed messages from the other peer.
        - If `message.payload.sdp` (an offer or answer):
            - Calls `this.peerConnection.setRemoteDescription(new RTCSessionDescription(message.payload.sdp));`.
            - If it was an offer, create an answer, `setLocalDescription`, and relay the answer back.
        - If `message.payload.candidate` (an ICE candidate):
            - Calls `this.peerConnection.addIceCandidate(new RTCIceCandidate(message.payload.candidate));`.
    - `send(data)`:
        - If `this.dataChannel` is open, `this.dataChannel.send(JSON.stringify(data));`.

### Step 3.4: Game Logic Module

1.  **File:** `client/Game.js`
2.  **Logic:** Create a class `Game`.
    - `constructor(canvasId)`:
        - Gets canvas and 2D context.
        - Initializes game state: `this.state = { players: [{ x: 100, y: 100 }, { x: 700, y: 100 }] };`.
        - Initializes input state: `this.keys = {};`.
    - `start(webRTCManager)`:
        - Stores the `webRTCManager`.
        - Sets up keyboard listeners (`keydown`, `keyup`) to modify `this.keys`.
        - Starts the game loop: `this._loop();`.
    - `_update()`:
        - Updates the local player's position (`this.state.players[0]`) based on the `this.keys` object.
        - Sends the updated position to the peer: `this.webRTCManager.send({ x: this.state.players[0].x, y: this.state.players[0].y });`.
    - `_render()`:
        - Clears the canvas.
        - Draws both players (squares) based on `this.state`.
    - `_loop()`:
        - Calls `_update()`.
        - Calls `_render()`.
        - Calls `requestAnimationFrame(this._loop.bind(this));`.
    - `handlePeerData(data)`:
        - Updates the peer's position: `this.state.players[1] = data;`.

### Step 3.5: Main Application Wiring

1.  **File:** `client/main.js`
2.  **Logic:** This script ties all the modules together.
    - Get references to all DOM elements.
    - Instantiate the `Game`: `const game = new Game('game-canvas');`.
    - Define the `handleSignalMessage` function that will be the callback for the `SignalingChannel`. It will use a `switch` on `message.type`.
    - Instantiate `SignalingChannel`: `const signaling = new SignalingChannel('ws://localhost:8080', handleSignalMessage);`.
    - Instantiate `WebRTCManager`: `const rtc = new WebRTCManager(signaling, (data) => game.handlePeerData(data));`.
    - Wire up UI button clicks:
        - `create-btn`: Calls `signaling.createRoom()`.
        - `join-btn`: Calls `signaling.joinRoom(roomCodeInput.value)`.
    - Implement the logic inside `handleSignalMessage`:
        - On `'roomCreated'`: Display the `roomCode`.
        - On `'ready'`: Hide `#ui-container`, show `#game-container`, call `rtc.startHandshake(message.initiator)`, and start the game `game.start(rtc)`.
        - On `'relay'`: Call `rtc.handleSignalingMessage(message)`.
        - On `'error'`: `alert(message.message)`.

---
This concludes the detailed plan. The AI should now have a complete, step-by-step guide to create the entire application from scratch. 