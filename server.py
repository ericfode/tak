import os
import json
import logging
from flask import Flask, send_from_directory
from flask_sock import Sock
from collections import deque

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
sock = Sock(app)

clients = set()
DEFAULT_BOARD_SIZE = 5

class TakGame:
    def __init__(self, board_size=DEFAULT_BOARD_SIZE):
        self.board_size = board_size
        self.game_state = {}
        self.reset_game_state()

    def get_initial_piece_counts(self):
        if self.board_size == 3: return {"flats": 10, "capstones": 0}
        if self.board_size == 4: return {"flats": 15, "capstones": 0}
        if self.board_size == 5: return {"flats": 21, "capstones": 1}
        if self.board_size == 6: return {"flats": 30, "capstones": 1}
        if self.board_size == 8: return {"flats": 50, "capstones": 2}
        return {"flats": 21, "capstones": 1}

    def reset_game_state(self):
        piece_counts = self.get_initial_piece_counts()
        self.game_state = {
            "board": [[[] for _ in range(self.board_size)] for _ in range(self.board_size)],
            "currentPlayer": "White",
            "pieces": {
                "White": piece_counts.copy(),
                "Black": piece_counts.copy()
            },
            "winner": None,
            "win_reason": None,
            "board_size": self.board_size,
            "game_over": False
        }
        logger.info(f"Game state reset for board size {self.board_size}")

    def get_state(self):
        return self.game_state

    def get_top_piece(self, r, c):
        if self.validate_coordinates(r, c) and self.game_state["board"][r][c]:
            return self.game_state["board"][r][c][-1]
        return None

    def validate_coordinates(self, r, c):
        return 0 <= r < self.board_size and 0 <= c < self.board_size

    def _is_road_piece(self, piece):
        return piece and piece["type"] in ["flat", "capstone"]

    def check_road_win(self, player_color):
        board = self.game_state["board"]
        # Check horizontal
        for r_idx in range(self.board_size):
            if self._is_road_piece(self.get_top_piece(r_idx,0)) and self.get_top_piece(r_idx,0)["color"] == player_color:
                q = deque([(r_idx, 0)])
                visited = set([(r_idx,0)])
                while q:
                    r, c = q.popleft()
                    if c == self.board_size - 1: return True
                    for dr, dc in [(0, 1), (0, -1), (1, 0), (-1, 0)]:
                        nr, nc = r + dr, c + dc
                        if self.validate_coordinates(nr, nc) and (nr, nc) not in visited and \
                           self._is_road_piece(self.get_top_piece(nr,nc)) and self.get_top_piece(nr,nc)["color"] == player_color:
                            visited.add((nr, nc))
                            q.append((nr, nc))
        # Check vertical
        for c_idx in range(self.board_size):
            if self._is_road_piece(self.get_top_piece(0,c_idx)) and self.get_top_piece(0,c_idx)["color"] == player_color:
                q = deque([(0, c_idx)])
                visited = set([(0,c_idx)])
                while q:
                    r, c = q.popleft()
                    if r == self.board_size - 1: return True
                    for dr, dc in [(0, 1), (0, -1), (1, 0), (-1, 0)]:
                        nr, nc = r + dr, c + dc
                        if self.validate_coordinates(nr, nc) and (nr, nc) not in visited and \
                           self._is_road_piece(self.get_top_piece(nr,nc)) and self.get_top_piece(nr,nc)["color"] == player_color:
                            visited.add((nr, nc))
                            q.append((nr, nc))
        return False

    def check_flat_win(self):
        board_full = all(self.game_state["board"][r][c] for r in range(self.board_size) for c in range(self.board_size))

        current_player_pieces = self.game_state["pieces"][self.game_state["currentPlayer"]]
        player_out_of_pieces = current_player_pieces["flats"] == 0 and current_player_pieces["capstones"] == 0

        # Check if any player is out of pieces (more accurate for game end by running out of pieces)
        white_out = self.game_state["pieces"]["White"]["flats"] == 0 and self.game_state["pieces"]["White"]["capstones"] == 0
        black_out = self.game_state["pieces"]["Black"]["flats"] == 0 and self.game_state["pieces"]["Black"]["capstones"] == 0


        if not board_full and not white_out and not black_out : # Game ends if board is full OR ANY player is out of pieces
            return None

        white_flats, black_flats = 0, 0
        for r in range(self.board_size):
            for c in range(self.board_size):
                top = self.get_top_piece(r, c)
                if top and top["type"] == "flat":
                    if top["color"] == "White": white_flats += 1
                    else: black_flats += 1

        if white_flats > black_flats: return "White"
        if black_flats > white_flats: return "Black"
        return "Draw"

    def handle_placement(self, player, r, c, piece_type):
        if self.game_state["game_over"]: return {"type": "error", "message": "Game is over."}
        if not self.validate_coordinates(r,c): return {"type": "error", "message": "Invalid coordinates."}
        if self.game_state["board"][r][c]: return {"type": "error", "message": "Cell is not empty."}

        player_pieces = self.game_state["pieces"][player]
        actual_piece_type = piece_type # 'flat', 'wall', 'capstone'

        if piece_type == "flat" or piece_type == "wall":
            if player_pieces["flats"] <= 0: return {"type": "error", "message": "No flats left."}
            player_pieces["flats"] -= 1
        elif piece_type == "capstone":
            if player_pieces["capstones"] <= 0: return {"type": "error", "message": "No capstones left."}
            player_pieces["capstones"] -= 1
        else:
            return {"type": "error", "message": "Invalid piece type."}

        self.game_state["board"][r][c].append({"color": player, "type": actual_piece_type})
        self._end_turn(player)
        return None

    def handle_move_stack(self, player, from_r, from_c, drop_instructions):
        if self.game_state["game_over"]: return {"type": "error", "message": "Game is over."}
        if not (self.validate_coordinates(from_r, from_c) and drop_instructions):
            return {"type": "error", "message": "Invalid source or drop instructions."}

        source_stack = self.game_state["board"][from_r][from_c]
        if not source_stack or source_stack[-1]["color"] != player:
            return {"type": "error", "message": "Cannot move this stack."}

        num_to_pickup = sum(d["count"] for d in drop_instructions)
        if not (0 < num_to_pickup <= self.board_size and num_to_pickup <= len(source_stack)):
            return {"type": "error", "message": f"Invalid number of pieces to move (1-{self.board_size}, max {len(source_stack)})."}

        # Validate path continuity and target cells
        current_path_r, current_path_c = from_r, from_c
        for i, drop_info in enumerate(drop_instructions):
            to_r, to_c = drop_info["r"], drop_info["c"]
            if i == 0: # First drop must be on source square
                if to_r != from_r or to_c != from_c:
                    return {"type":"error", "message": "First drop must be on source square."}
            else: # Subsequent drops must be adjacent
                 if abs(to_r - current_path_r) + abs(to_c - current_path_c) != 1:
                    return {"type": "error", "message": "Path must be orthogonal and contiguous."}

            target_top = self.get_top_piece(to_r, to_c)
            # If it's not the source square itself being modified by leaving pieces behind
            if not (to_r == from_r and to_c == from_c) :
                if target_top:
                    if target_top["type"] == "capstone":
                        return {"type": "error", "message": "Cannot move onto a capstone."}
                    if target_top["type"] == "wall":
                        # Only a single capstone being moved can flatten a wall
                        is_capstone_alone_being_moved = (num_to_pickup == 1 and source_stack[-1]["type"] == "capstone")
                        # And it must be the piece actually being dropped here
                        is_this_drop_the_capstone = (drop_info["count"] == 1 and source_stack[-num_to_pickup]["type"] == "capstone")

                        if not (is_capstone_alone_being_moved and is_this_drop_the_capstone):
                             return {"type": "error", "message": "Only a lone capstone can flatten a wall."}
            current_path_r, current_path_c = to_r, to_c


        # Passed validation, now execute move
        picked_up_stack = source_stack[-num_to_pickup:]
        self.game_state["board"][from_r][from_c] = source_stack[:-num_to_pickup]

        temp_picked_up_for_distribution = list(picked_up_stack) # Make a copy to pop from

        for drop_info in drop_instructions:
            to_r, to_c = drop_info["r"], drop_info["c"]
            drop_count = drop_info["count"]

            pieces_this_drop = temp_picked_up_for_distribution[:drop_count]
            temp_picked_up_for_distribution = temp_picked_up_for_distribution[drop_count:]

            # Capstone flattening logic
            target_cell_stack = self.game_state["board"][to_r][to_c]
            top_piece_on_target = target_cell_stack[-1] if target_cell_stack else None

            if top_piece_on_target and top_piece_on_target["type"] == "wall" and \
               len(pieces_this_drop) == 1 and pieces_this_drop[0]["type"] == "capstone":
                target_cell_stack[-1]["type"] = "flat" # Flatten wall

            self.game_state["board"][to_r][to_c].extend(pieces_this_drop)

        self._end_turn(player)
        return None

    def _end_turn(self, player_who_moved):
        if self.check_road_win(player_who_moved):
            self.game_state["winner"] = player_who_moved
            self.game_state["win_reason"] = "Road"
            self.game_state["game_over"] = True
        else:
            flat_winner = self.check_flat_win()
            if flat_winner is not None: # Game ended by flats
                self.game_state["winner"] = flat_winner
                self.game_state["win_reason"] = "Flat"
                self.game_state["game_over"] = True

        if not self.game_state["game_over"]:
            self.game_state["currentPlayer"] = "Black" if player_who_moved == "White" else "White"


# Global game instance
tak_game = TakGame(board_size=DEFAULT_BOARD_SIZE)

def broadcast_state_update():
    message = {"type": "update", "data": tak_game.get_state()}
    json_message = json.dumps(message)
    for client_ws in list(clients):
        try: client_ws.send(json_message)
        except Exception as e:
            logger.error(f"Broadcast error: {e}"); clients.remove(client_ws)

@app.route('/')
def index(): return send_from_directory('.', 'index.html')

@app.route('/<path:path>')
def static_files(path):
    if path in ['app.js', 'style.css']: return send_from_directory('.', path)
    return send_from_directory('static', path)

@sock.route('/ws')
def ws_tak_game(ws):
    clients.add(ws)
    logger.info(f"Client connected. Total: {len(clients)}")
    ws.send(json.dumps({"type": "init", "data": tak_game.get_state(), "message": "Welcome!"}))

    try:
        while True:
            message_str = ws.receive(timeout=None)
            if message_str is None: break
            logger.info(f"Rx: {message_str}")
            data = json.loads(message_str)
            action = data.get("action")
            player = tak_game.game_state["currentPlayer"] # Current player for this turn

            if tak_game.game_state["game_over"] and action != "reset_game":
                ws.send(json.dumps({"type": "info", "message": "Game is over."})); continue

            error_response = None
            if action == "reset_game":
                tak_game.reset_game_state()
                broadcast_state_update()
                continue
            elif action in ["place_flat", "place_wall", "place_capstone"]:
                error_response = tak_game.handle_placement(player, data.get("r"), data.get("c"), action.split('_')[1])
            elif action == "move_stack":
                error_response = tak_game.handle_move_stack(player, data.get("from_r"), data.get("from_c"), data.get("drops"))
            else:
                error_response = {"type": "error", "message": "Unknown action."}

            if error_response:
                ws.send(json.dumps(error_response))
            else:
                broadcast_state_update() # Success, broadcast new state

    except Exception as e:
        logger.error(f"WS error: {e}", exc_info=True)
    finally:
        clients.remove(ws)
        logger.info(f"Client disconnected. Total: {len(clients)}")

if __name__ == '__main__':
    logger.info("Starting Tak server with TakGame class...")
    # Fallback for running if gevent not installed, not ideal for websockets
    app.run(host='0.0.0.0', port=8080, debug=True, use_reloader=False) # Reloader can cause issues with global game obj
    # For production with gevent:
    # try:
    #     from gevent import pywsgi
    #     from geventwebsocket.handler import WebSocketHandler
    #     server = pywsgi.WSGIServer(('', 8080), app, handler_class=WebSocketHandler)
    #     logger.info("Server running on port 8080 with gevent-pywsgi.")
    #     server.serve_forever()
    # except ImportError:
    #     logger.info("gevent-pywsgi not found. Running with Flask development server (Werkzeug).")
    #     app.run(host='0.0.0.0', port=8080, debug=True)
