import os
import json
import logging
import random
import string
from flask import Flask, send_from_directory, jsonify, request
from flask_sock import Sock
from collections import deque

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
sock = Sock(app)

# A dictionary to hold all active rooms.
# The key is the room code, and the value is another dictionary
# containing the game state and the set of connected clients.
# rooms = { "room_code": {"game": TakGame(), "clients": {ws1, ws2}} }
rooms = {}
DEFAULT_BOARD_SIZE = 5

def generate_room_code(length=6):
    """Generates a random, uppercase, alphanumeric room code."""
    # Easter egg: Why did the programmer quit his job? He didn't get arrays.
    while True:
        code = ''.join(random.choices(string.ascii_uppercase + string.digits, k=length))
        if code not in rooms:
            return code

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

        white_out = self.game_state["pieces"]["White"]["flats"] == 0 and self.game_state["pieces"]["White"]["capstones"] == 0
        black_out = self.game_state["pieces"]["Black"]["flats"] == 0 and self.game_state["pieces"]["Black"]["capstones"] == 0

        if not board_full and not white_out and not black_out :
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

    def handle_placement(self, player, r, c, piece_type_to_place):
        if self.game_state["game_over"]: return {"type": "error", "message": "Game is over."}
        if not self.validate_coordinates(r,c): return {"type": "error", "message": "Invalid coordinates."}

        player_pieces = self.game_state["pieces"][player]
        target_cell_stack = self.game_state["board"][r][c]

        # Verify piece type to place is valid *before* checking counts
        if piece_type_to_place not in ["flat", "wall", "capstone"]:
            return {"type": "error", "message": f"Invalid piece type for placement: {piece_type_to_place}"}

        # Check piece availability
        can_place_piece = False
        if piece_type_to_place == "flat" or piece_type_to_place == "wall":
            if player_pieces["flats"] > 0:
                can_place_piece = True
            else:
                return {"type": "error", "message": "No flats left."}
        elif piece_type_to_place == "capstone": # This must be 'capstone'
            if player_pieces["capstones"] > 0:
                can_place_piece = True
            else:
                return {"type": "error", "message": "No capstones left."}

        # If can_place_piece is false here, it means an invalid piece_type_to_place somehow passed initial check
        # This should be redundant due to the initial check, but for safety:
        if not can_place_piece:
             return {"type": "error", "message": "Internal error: Piece availability check failed unexpectedly."}


        if not target_cell_stack:  # Cell is empty
            # Standard placement logic for empty cells
            if piece_type_to_place == "flat" or piece_type_to_place == "wall":
                player_pieces["flats"] -= 1
            elif piece_type_to_place == "capstone":
                player_pieces["capstones"] -= 1
            # No else needed here, already validated piece_type_to_place and can_place_piece

            target_cell_stack.append({"color": player, "type": piece_type_to_place})
        else:  # Cell is occupied, attempt to stack
            top_piece_on_square = target_cell_stack[-1]
            if top_piece_on_square['type'] == 'flat':
                # Valid to stack the new 'piece_type_to_place' on this flat stone
                if piece_type_to_place == "flat" or piece_type_to_place == "wall":
                    player_pieces["flats"] -= 1
                elif piece_type_to_place == "capstone":
                    player_pieces["capstones"] -= 1
                # No else needed here

                target_cell_stack.append({"color": player, "type": piece_type_to_place})
            else: # Top piece is 'wall' or 'capstone'
                return {"type": "error", "message": "Cannot stack a new piece from hand onto a wall or capstone."}

        self._end_turn(player)
        return None # Indicates success

    def handle_move_stack(self, player, from_r, from_c, drop_instructions):
        # ... (rest of the TakGame class and server code remains unchanged from the last correct version) ...
        if self.game_state["game_over"]: return {"type": "error", "message": "Game is over."}
        if not (self.validate_coordinates(from_r, from_c) and drop_instructions):
            return {"type": "error", "message": "Invalid source or drop instructions."}

        source_stack = self.game_state["board"][from_r][from_c]
        if not source_stack or source_stack[-1]["color"] != player:
            return {"type": "error", "message": "Cannot move this stack."}

        num_to_pickup = sum(d["count"] for d in drop_instructions)
        if not (0 < num_to_pickup <= self.board_size and num_to_pickup <= len(source_stack)):
            return {"type": "error", "message": f"Invalid number of pieces to move (1-{self.board_size}, max {len(source_stack)})."}

        current_path_r_val, current_path_c_val = -1, -1

        for i, drop_info in enumerate(drop_instructions):
            to_r, to_c = drop_info["r"], drop_info["c"]
            if i == 0:
                if to_r != from_r or to_c != from_c:
                    return {"type":"error", "message": "First drop must be on source square."}
            else:
                 if abs(to_r - current_path_r_val) + abs(to_c - current_path_c_val) != 1:
                    return {"type": "error", "message": "Path must be orthogonal and contiguous."}

            target_top = self.get_top_piece(to_r, to_c)

            is_source_square_itself = (to_r == from_r and to_c == from_c)

            if not is_source_square_itself and target_top:
                if target_top["type"] == "capstone":
                    return {"type": "error", "message": "Cannot move onto a capstone."}
                if target_top["type"] == "wall":
                    is_lone_capstone_move = (num_to_pickup == 1 and source_stack[-1]["type"] == "capstone")
                    if not is_lone_capstone_move :
                         return {"type": "error", "message": "Only a lone capstone can flatten a wall."}
            current_path_r_val, current_path_c_val = to_r, to_c


        picked_up_stack = source_stack[-num_to_pickup:]
        self.game_state["board"][from_r][from_c] = source_stack[:-num_to_pickup]

        temp_picked_up_for_distribution = list(picked_up_stack)

        for drop_info in drop_instructions:
            to_r, to_c = drop_info["r"], drop_info["c"]
            drop_count = drop_info["count"]

            pieces_this_drop = temp_picked_up_for_distribution[:drop_count]
            temp_picked_up_for_distribution = temp_picked_up_for_distribution[drop_count:]

            target_cell_stack = self.game_state["board"][to_r][to_c]
            top_piece_on_target = target_cell_stack[-1] if target_cell_stack else None

            if top_piece_on_target and top_piece_on_target["type"] == "wall" and \
               len(pieces_this_drop) == 1 and pieces_this_drop[0]["type"] == "capstone":
                target_cell_stack[-1]["type"] = "flat"

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
            if flat_winner is not None:
                self.game_state["winner"] = flat_winner
                self.game_state["win_reason"] = "Flat"
                self.game_state["game_over"] = True

        if not self.game_state["game_over"]:
            self.game_state["currentPlayer"] = "Black" if player_who_moved == "White" else "White"


# Global game instance (REMOVED)
# tak_game = TakGame(board_size=DEFAULT_BOARD_SIZE)

def broadcast_state_update(room_code):
    """Broadcasts the current game state to all clients in a room."""
    room = rooms.get(room_code)
    if not room:
        return

    message = {"type": "update", "data": room["game"].get_state()}
    json_message = json.dumps(message)
    # Iterate over a copy of the set for safe removal
    for client_ws in list(room["clients"]):
        try:
            client_ws.send(json_message)
        except Exception as e:
            logger.error(f"Broadcast error in room {room_code}: {e}")
            room["clients"].remove(client_ws)

@app.route('/api/rooms', methods=['POST'])
def create_room():
    """Creates a new game room and returns its code."""
    board_size = request.json.get('board_size', DEFAULT_BOARD_SIZE)
    room_code = generate_room_code()
    rooms[room_code] = {
        "game": TakGame(board_size=board_size),
        "clients": set()
    }
    logger.info(f"Room {room_code} created with board size {board_size}.")
    return jsonify({"code": room_code})

@app.route('/')
def index(): return send_from_directory('.', 'index.html')

@app.route('/<path:path>')
def static_files(path):
    if path in ['app.js', 'style.css']: return send_from_directory('.', path)
    return send_from_directory('static', path)

@sock.route('/ws/<room_code>')
def ws_tak_game(ws, room_code):
    """Handles WebSocket connections for a specific game room."""
    room = rooms.get(room_code)
    if not room:
        logger.warning(f"Connection attempt to non-existent room {room_code}.")
        ws.close(reason=1008, message="Room not found")
        return

    game_instance = room["game"]
    clients = room["clients"]

    clients.add(ws)
    logger.info(f"Client connected to room {room_code}. Total clients in room: {len(clients)}")
    ws.send(json.dumps({"type": "init", "data": game_instance.get_state(), "message": f"Welcome to room {room_code}!"}))

    try:
        while True:
            message_str = ws.receive(timeout=None)
            if message_str is None: break
            logger.info(f"Rx in room {room_code}: {message_str}")
            data = json.loads(message_str)
            action = data.get("action")
            # The player is determined by the game state within the room
            player = game_instance.game_state["currentPlayer"]

            if game_instance.game_state["game_over"] and action != "reset_game":
                ws.send(json.dumps({"type": "info", "message": "Game is over."}))
                continue

            error_response = None
            if action == "reset_game":
                game_instance.reset_game_state()
                broadcast_state_update(room_code)
                continue
            elif action in ["place_flat", "place_wall", "place_capstone"]:
                error_response = game_instance.handle_placement(player, data.get("r"), data.get("c"), action.split('_')[1])
            elif action == "move_stack":
                error_response = game_instance.handle_move_stack(player, data.get("from_r"), data.get("from_c"), data.get("drops"))
            else:
                error_response = {"type": "error", "message": "Unknown action."}

            if error_response:
                # If there's an error, send it back to the client, but also include the last valid game state for rollback.
                error_response["data"] = game_instance.get_state()
                ws.send(json.dumps(error_response))
            else:
                broadcast_state_update(room_code)

    except Exception as e:
        logger.error(f"WS error in room {room_code}: {e}", exc_info=True)
    finally:
        clients.remove(ws)
        logger.info(f"Client disconnected from room {room_code}. Total clients in room: {len(clients)}")
        # Optional: Clean up empty rooms
        if not clients:
            del rooms[room_code]
            logger.info(f"Room {room_code} is empty and has been removed.")

if __name__ == '__main__':
    logger.info("Starting Tak server with TakGame class...")
    # Note: `use_reloader=False` is important for not losing the `rooms` dict on reload
    app.run(host='0.0.0.0', port=8080, debug=True, use_reloader=False)
