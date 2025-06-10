# Project Tak: Agent Learnings

This document summarizes the key learnings and actions taken by the AI agent while working on the Tak game project.

## 1. Project Overview

The project is a web-based implementation of the board game "Tak".

*   **Frontend**: The frontend is built with vanilla JavaScript (`app.js`), HTML (`index.html`), and styled with Tailwind CSS (`tailwind-src.css` compiled to `style.css`). It communicates with the backend via WebSockets. The client-side logic includes optimistic UI updates for actions like placing a piece.
*   **Backend**: The backend is a Python application using the Flask web framework. It uses `Flask-Sock` to handle WebSocket connections for real-time, multiplayer gameplay. The server is run with Gunicorn and uses `gevent` for asynchronous networking. Python environment is managed with uv. 
*   **Game Logic**: The core game state and rules are managed server-side in the `TakGame` class within `main.py`. The server creates distinct game "rooms" and broadcasts state updates to all clients connected to a specific room.
*   **Tooling**: The project uses `npm` to manage frontend dependencies and run a build script for Tailwind CSS. For Python, it uses `pyenv` for version management and `pip` (the user prefers `uv`) for package installation from `requirements.txt`.

## 2. Issues Addressed

Two primary issues were identified and resolved:

### Issue A: UI Sizing Mismatch

*   **Problem**: The game board cells had a fixed size in pixels, while the game pieces (rendered as text characters) were sized relative to the font size. This caused a visual mismatch where the pieces did not fit correctly within the cells, especially at different screen sizes.
*   **Solution**:
    1.  Removed the hardcoded inline `style` attributes from the `game-board` element in `index.html`.
    2.  Removed the corresponding JavaScript code in `app.js` that was setting these fixed styles.
    3.  Introduced a CSS custom property `--board-size` which is set dynamically via JavaScript based on the game state.
    4.  Added new, responsive CSS rules to `tailwind-src.css` using a `@layer components`.
    5.  These new styles use the `clamp()` CSS function and viewport units (`vw`) to ensure both the board grid and the piece font sizes scale proportionally and have sensible minimum/maximum sizes.
    6.  Rebuilt the final `style.css` by running `npm run build:css`.

### Issue B: "Always Black" Piece Bug

*   **Problem**: Despite the UI correctly indicating whose turn it was (e.g., "White's turn"), any piece placed on the board would appear as a black piece. This indicated a server-side issue where the game state was being updated incorrectly.
*   **Troubleshooting & Resolution**:
    1.  **Hypothesis 1 (Incorrect)**: A logic error in the turn-switching code in `main.py`. A review showed the logic (`currentPlayer = "Black" if player_who_moved == "White" else "White"`) was sound.
    2.  **Hypothesis 2 (Plausible, but ineffective)**: A `gevent` concurrency issue. `gevent` sometimes requires `monkey.patch_all()` to be called at the start of the application to prevent conflicts with standard library modules. This patch was applied to `main.py` but did not solve the issue.
    3.  **Hypothesis 3 (Correct)**: A dependency conflict. The `Flask-Sock` library has its own native support for `gevent`. However, the project's `requirements.txt` also included the `gevent-websocket` library. This created a conflict, leading to unpredictable behavior in the WebSocket handler.
    4.  **Solution**: The `gevent-websocket` line was removed from `requirements.txt`, and the dependencies were re-installed. This resolved the conflict and fixed the turn-taking logic.

## 3. Tooling & Environment Notes

*   The user prefers `uv pip install` over `pip install` for installing Python packages.
*   The environment uses `pyenv` to manage Python versions. It was necessary to set a local version (`pyenv local 3.10.6`) before packages could be installed correctly.

This summary should provide a good overview for any future work on the project. 