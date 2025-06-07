# Tak Web Game Design Document

## 1. Overview

### Brief Description
A 2-player, web-based implementation of the board game Tak. The game will allow two players to play against each other in a web browser.

### Goals
*   **Easy to Host:** The game should be runnable with minimal setup, ideally using simple, commonly available technologies.
*   **Simple to Play:** The user interface should be intuitive, making it easy for players familiar with Tak to start playing.
*   **Clear Interface:** Game state, piece types, and available actions should be clearly presented.

## 2. Architecture

### Frontend
*   **Technology:**
    *   HTML: For structuring the game page.
    *   CSS: For styling the game board and elements.
    *   JavaScript (Vanilla): For game logic, DOM manipulation, and communication with the backend. No complex frameworks to maintain simplicity.
*   **Responsibilities:**
    *   Rendering the game board and pieces.
    *   Handling user input (clicking on squares, selecting piece types, initiating moves).
    *   Sending player actions to the backend via WebSockets.
    *   Receiving game state updates from the backend and updating the UI.

### Backend
*   **Technology:**
    *   Python: A simple HTTP server framework like Flask or even Python's built-in `http.server` for serving static files (HTML, CSS, JS).
    *   WebSockets: Python's `websockets` library for real-time, bidirectional communication between clients and the server.
*   **Responsibilities:**
    *   Managing individual game sessions.
    *   Maintaining the authoritative game state for each session (board configuration, piece counts, current turn).
    *   Validating moves received from players against the rules of Tak.
    *   Broadcasting game state updates to both players in a session.
    *   Detecting win conditions.

### Communication
*   **Protocol:** WebSockets will be used for the primary real-time communication channel.
*   **Message Format:** Simple JSON objects will be exchanged between client and server.
    *   Client sends actions (place piece, move stack).
    *   Server sends game state updates (board changes, turn changes, errors, win notifications).

## 3. Game Logic (Server-Side)

*   **Board Representation:**
    *   A 2D list (list of lists) representing the game board. Each cell can store information about the stack of pieces on it.
    *   Example: `board[y][x]` could be a list of piece objects.
*   **Piece Representation:**
    *   Objects or dictionaries containing:
        *   `color`: (e.g., 'white', 'black')
        *   `type`: (e.g., 'flat', 'wall', 'capstone')
*   **Game State Management:**
    *   For each active game session:
        *   Current board configuration.
        *   Whose turn it is (e.g., 'player1_white', 'player2_black').
        *   Number of pieces remaining for each player (by type).
        *   Game ID to manage multiple concurrent games.
        *   Player assignments (who is white, who is black).
*   **Move Validation:**
    *   Implement rules for placing pieces (empty square, piece availability).
    *   Implement rules for moving stacks (control of stack, carry limit, valid path, no moving through walls/capstones unless capstone flattening a wall).
    *   Capstone flattening logic.
*   **Win Condition Checking:**
    *   After each valid move:
        *   Check for a "Road Win": Traverse the board to find if either player has formed a road connecting opposite sides.
        *   Check for a "Flat Win": If the board is full or no legal moves remain, count flat stones for each player.

## 4. User Interface (Frontend)

*   **Game Board:**
    *   Rendered as an HTML grid (e.g., using `<div>` elements or an HTML `<table>`).
    *   Squares should be clickable.
    *   Visual distinction for:
        *   Player piece colors (e.g., light and dark colored pieces).
        *   Piece types:
            *   Flat stones: Default appearance.
            *   Standing stones (Walls): Visually distinct (e.g., taller, different border).
            *   Capstones: Unique shape or symbol.
    *   Clear indication of which player controls a stack (e.g., color of the top piece).
    *   Highlight valid moves when a piece/stack is selected.
*   **Player Info Area:**
    *   Display "Current Turn: [Player Name/Color]".
    *   Show pieces remaining for White (Flats: X, Capstone: Y) and Black (Flats: Z, Capstone: W).
*   **Controls:**
    *   **Piece Placement:**
        *   Radio buttons or simple buttons to select piece type to place: "Flat", "Wall", "Capstone".
        *   Clicking an empty square after selecting type places the piece.
    *   **Stack Movement:**
        *   Clicking a controlled stack selects it.
        *   The UI should then prompt for how many pieces to pick up (if stack > 1).
        *   Clicking an adjacent valid square initiates the first step of the move. Subsequent clicks along the path drop pieces.
        *   A "Confirm Move" button might be useful for multi-step stack drops, or it could auto-confirm if only one drop sequence is possible.
        *   A "Cancel Move" or "Deselect" option.
*   **Game Flow:**
    *   **Starting a Game:**
        *   One player initiates a "Create Game" action.
        *   Server generates a unique game ID/link.
        *   The first player shares this link with the second player.
        *   Second player joins by visiting the link.
        *   Pie rule for the first move can be implemented: Player 1 places an opponent's stone, Player 2 chooses sides.
    *   **Turn Handling:**
        *   Server dictates whose turn it is. UI elements for the non-active player are disabled.
        *   After a valid move, the turn switches, and the board updates for both players.
    *   **Game End:**
        *   A clear message announces the winner and the reason (e.g., "White wins by Road!", "Black wins by Flat Count!").
        *   Option to start a new game.

## 5. Hosting

*   **Ultra-Simple (Local Play / LAN):**
    *   Use Python's built-in `python -m http.server` to serve the HTML, CSS, and JS files.
    *   Run the Python WebSocket server script separately. Players connect to the host's local IP address.
*   **Simple Online Hosting (for friends):**
    *   **Replit / Glitch:** These platforms can host simple Python web applications (including WebSocket servers) and provide shareable URLs. Often have a free tier suitable for small games.
    *   **Basic PaaS (Platform as a Service):** Services like Heroku (free tier might be limited), PythonAnywhere, or similar could host the Python backend. Frontend assets might be served by the same service or a separate static site host.
*   The design prioritizes simplicity, so complex deployment pipelines or dedicated servers are out of scope. The backend should be a single Python script or a very minimal Flask/FastAPI application.

## 6. Message Format (Examples)

### Client to Server:

*   **Place Piece:**
    ```json
    {
      "action": "place",
      "game_id": "unique_game_id_123",
      "player_id": "player_session_id_abc",
      "x": 2,
      "y": 3,
      "piece_type": "flat" // "wall", "capstone"
    }
    ```
*   **Move Stack (multi-part for clarity, could be one message):**
    *   Initial pick-up:
        ```json
        {
          "action": "pickup_stack",
          "game_id": "unique_game_id_123",
          "player_id": "player_session_id_abc",
          "from_x": 1,
          "from_y": 1,
          "count": 3 // Number of pieces to lift
        }
        ```
    *   Drop sequence (sent for each square in the move path):
        ```json
        {
          "action": "drop_stack_part",
          "game_id": "unique_game_id_123",
          "player_id": "player_session_id_abc",
          "to_x": 1,
          "to_y": 2,
          "drop_count": 1 // Number of pieces to drop on this square
        }
        ```
    * Alternative single message for a move:
        ```json
        {
            "action": "move_stack",
            "game_id": "unique_game_id_123",
            "player_id": "player_session_id_abc",
            "from_x": 0,
            "from_y": 0,
            "drops": [ // sequence of drops: {x, y, count}
                {"x": 0, "y": 0, "count": 1}, // Must drop on original square
                {"x": 1, "y": 0, "count": 1},
                {"x": 2, "y": 0, "count": 1}  // Example: moved 3 pieces, 1-1-1
            ]
        }
        ```

### Server to Client:

*   **Game State Update (full or partial):**
    ```json
    {
      "type": "game_update",
      "game_id": "unique_game_id_123",
      "board": [ // Full board representation
        [ {"stack": [{"color": "white", "type": "flat"}]}, null, ... ],
        [ null, {"stack": [{"color": "black", "type": "wall"}, {"color": "black", "type": "flat"}]}, ... ],
        ...
      ],
      "current_player": "white_player_id", // or "black_player_id"
      "white_pieces": {"flat": 20, "capstone": 1},
      "black_pieces": {"flat": 19, "capstone": 1},
      "last_move": { ... details of the last move ... }, // Optional
      "valid_moves": { ... for current player ...} // Optional, for UI highlighting
    }
    ```
*   **Error Message:**
    ```json
    {
      "type": "error",
      "game_id": "unique_game_id_123",
      "message": "Invalid move: Cannot place stone on occupied square."
    }
    ```
*   **Game Over:**
    ```json
    {
      "type": "game_over",
      "game_id": "unique_game_id_123",
      "winner": "white_player_id", // or "black_player_id" or "draw"
      "reason": "Road Win" // or "Flat Win"
    }
    ```
*   **Player Assignment (on game start/join):**
    ```json
    {
        "type": "player_assignment",
        "game_id": "unique_game_id_123",
        "your_color": "white", // or "black"
        "your_player_id": "player_session_id_abc"
    }
    ```
