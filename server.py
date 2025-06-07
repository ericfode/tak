import logging
from collections import deque

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

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
        if piece_type_to_place in ["flat", "wall"]:
            if player_pieces["flats"] > 0:
                can_place_piece = True
            else:
                return {"type": "error", "message": "No flats left."}
        elif piece_type_to_place == "capstone":
            if player_pieces["capstones"] > 0:
                can_place_piece = True
            else:
                return {"type": "error", "message": "No capstones left."}

        if not can_place_piece:
            return {"type": "error", "message": "Internal error: Piece availability check failed unexpectedly."}

        if not target_cell_stack:
            if piece_type_to_place in ["flat", "wall"]:
                player_pieces["flats"] -= 1
            elif piece_type_to_place == "capstone":
                player_pieces["capstones"] -= 1
            target_cell_stack.append({"color": player, "type": piece_type_to_place})
        else:
            top_piece_on_square = target_cell_stack[-1]
            if top_piece_on_square['type'] == 'flat':
                if piece_type_to_place in ["flat", "wall"]:
                    player_pieces["flats"] -= 1
                elif piece_type_to_place == "capstone":
                    player_pieces["capstones"] -= 1
                target_cell_stack.append({"color": player, "type": piece_type_to_place})
            else:
                return {"type": "error", "message": "Cannot stack a new piece from hand onto a wall or capstone."}

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

        current_path_r_val, current_path_c_val = -1, -1
        movement_dir = None

        for i, drop_info in enumerate(drop_instructions):
            to_r, to_c = drop_info["r"], drop_info["c"]
            if i == 0:
                if to_r != from_r or to_c != from_c:
                    return {"type":"error", "message": "First drop must be on source square."}
            else:
                step_dr = to_r - current_path_r_val
                step_dc = to_c - current_path_c_val
                if abs(step_dr) + abs(step_dc) != 1:
                    return {"type": "error", "message": "Path must be orthogonal and contiguous."}
                if movement_dir is None:
                    movement_dir = (step_dr, step_dc)
                elif (step_dr, step_dc) != movement_dir:
                    return {"type": "error", "message": "Path must be straight."}

            target_top = self.get_top_piece(to_r, to_c)
            is_source_square_itself = (to_r == from_r and to_c == from_c)
            if not is_source_square_itself and target_top:
                if target_top["type"] == "capstone":
                    return {"type": "error", "message": "Cannot move onto a capstone."}
                if target_top["type"] == "wall":
                    is_lone_capstone_move = (num_to_pickup == 1 and source_stack[-1]["type"] == "capstone")
                    if not is_lone_capstone_move:
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
            if top_piece_on_target and top_piece_on_target["type"] == "wall" and len(pieces_this_drop) == 1 and pieces_this_drop[0]["type"] == "capstone":
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

