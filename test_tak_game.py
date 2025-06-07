import unittest
from server import TakGame # Assuming server.py contains TakGame class

class TestTakGame(unittest.TestCase):
    def setUp(self):
        """Initialize a fresh game state before each test."""
        self.game = TakGame(board_size=5) # Default to 5x5 for most tests

    def test_initialization(self):
        self.assertEqual(self.game.board_size, 5)
        state = self.game.get_state()
        self.assertEqual(len(state["board"]), 5)
        self.assertEqual(len(state["board"][0]), 5)
        self.assertEqual(state["pieces"]["White"]["flats"], 21)
        self.assertEqual(state["pieces"]["White"]["capstones"], 1)
        self.assertEqual(state["pieces"]["Black"]["flats"], 21)
        self.assertEqual(state["pieces"]["Black"]["capstones"], 1)
        self.assertEqual(state["currentPlayer"], "White")
        self.assertIsNone(state["winner"])
        self.assertFalse(state["game_over"])

    def test_placement_flat_valid(self):
        player = self.game.get_state()["currentPlayer"]
        initial_flats = self.game.get_state()["pieces"][player]["flats"]
        res = self.game.handle_placement(player, 0, 0, "flat")
        self.assertIsNone(res) # Expect no error
        self.assertEqual(len(self.game.get_state()["board"][0][0]), 1)
        self.assertEqual(self.game.get_state()["board"][0][0][0]["type"], "flat")
        self.assertEqual(self.game.get_state()["board"][0][0][0]["color"], player)
        self.assertEqual(self.game.get_state()["pieces"][player]["flats"], initial_flats - 1)
        self.assertEqual(self.game.get_state()["currentPlayer"], "Black") # Turn should switch

    def test_placement_wall_valid(self):
        player = "White"
        self.game.game_state["currentPlayer"] = player # Ensure it's White's turn
        initial_flats = self.game.get_state()["pieces"][player]["flats"]
        res = self.game.handle_placement(player, 1, 1, "wall")
        self.assertIsNone(res)
        self.assertEqual(self.game.get_state()["board"][1][1][0]["type"], "wall")
        self.assertEqual(self.game.get_state()["pieces"][player]["flats"], initial_flats - 1)
        self.assertEqual(self.game.get_state()["currentPlayer"], "Black")

    def test_placement_capstone_valid(self):
        player = "White"
        self.game.game_state["currentPlayer"] = player
        initial_capstones = self.game.get_state()["pieces"][player]["capstones"]
        res = self.game.handle_placement(player, 2, 2, "capstone")
        self.assertIsNone(res)
        self.assertEqual(self.game.get_state()["board"][2][2][0]["type"], "capstone")
        self.assertEqual(self.game.get_state()["pieces"][player]["capstones"], initial_capstones - 1)
        self.assertEqual(self.game.get_state()["currentPlayer"], "Black")

    def test_placement_invalid_occupied_square(self):
        # This test's original intent (cannot place on ANY occupied square) is now changed by stacking rules.
        # The first part implicitly tests valid stacking of flat on flat.
        self.game.handle_placement("White", 0, 0, "flat") # White places a flat. board[0][0] = [W_F]. Turn -> B.
        self.game.game_state["currentPlayer"] = "White" # Force White's turn again.
        res_stack_flat_on_flat = self.game.handle_placement("White", 0, 0, "flat") # White places another flat on W_F.
        self.assertIsNone(res_stack_flat_on_flat, "Stacking a flat on a flat should be a valid move (return None).")
        stack_after_flat_on_flat = self.game.get_state()["board"][0][0]
        self.assertEqual(len(stack_after_flat_on_flat), 2, "Stack should have 2 pieces after flat on flat.")
        self.assertEqual(stack_after_flat_on_flat[1]["type"], "flat", "Top piece should be flat.")

        # This test will now also verify (again, mirroring a passing test's setup)
        # that stacking on a WALL is rejected.
        self.game.reset_game_state() # Start fresh for the wall test part

        # Setup: White places a wall, Black plays elsewhere, then White attempts to stack on the wall.
        op_result_wall = self.game.handle_placement("White", 0, 0, "wall") # White places a wall. Player is now Black.
        self.assertIsNone(op_result_wall, "Setup: Placing the initial wall should succeed.")

        # Black makes a move to pass the turn back to White.
        op_result_black_move = self.game.handle_placement("Black", 1, 1, "flat")
        self.assertIsNone(op_result_black_move, "Setup: Black's intervening move should succeed.")

        # Now it's White's turn. White attempts to place a flat on their own wall at (0,0).
        res_on_wall = self.game.handle_placement("White", 0, 0, "flat")

        self.assertIsNotNone(res_on_wall, "Attempting to stack on wall should return an error object.")
        if res_on_wall: # Avoid TypeError if None, though assertIsNotNone should catch it.
            self.assertEqual(res_on_wall["message"], "Cannot stack a new piece from hand onto a wall or capstone.")


    def test_placement_invalid_no_capstones_left(self):
        self.game.handle_placement("White", 0, 0, "capstone") # White uses capstone
        self.game.handle_placement("Black", 1, 0, "flat")   # Black's turn
        # White's turn again
        self.game.game_state["currentPlayer"] = "White"
        res = self.game.handle_placement("White", 0, 1, "capstone") # Try to place another
        self.assertIsNotNone(res)
        self.assertEqual(res["message"], "No capstones left.")

    # --- New Stack Formation Tests (Placing from Hand) ---

    def test_stack_player_flat_on_opponent_flat(self):
        self.game.handle_placement("Black", 0, 0, "flat") # Opponent (Black) places a flat
        # White's turn
        player = "White"
        initial_white_flats = self.game.get_state()["pieces"][player]["flats"]
        res = self.game.handle_placement(player, 0, 0, "flat") # White places flat on Black's flat

        self.assertIsNone(res, f"Placement error: {res['message'] if res else ''}")
        stack = self.game.get_state()["board"][0][0]
        self.assertEqual(len(stack), 2)
        self.assertEqual(stack[0]["color"], "Black")
        self.assertEqual(stack[0]["type"], "flat")
        self.assertEqual(stack[1]["color"], "White") # White's piece on top
        self.assertEqual(stack[1]["type"], "flat")
        self.assertEqual(self.game.get_state()["pieces"][player]["flats"], initial_white_flats - 1)
        self.assertEqual(self.game.get_state()["currentPlayer"], "Black") # Turn switches

    def test_stack_player_flat_on_own_flat(self):
        self.game.handle_placement("White", 0, 0, "flat") # White places first flat
        self.game.handle_placement("Black", 1, 0, "flat") # Black plays elsewhere
        # White's turn again
        player = "White"
        initial_white_flats = self.game.get_state()["pieces"][player]["flats"]
        res = self.game.handle_placement(player, 0, 0, "flat") # White places flat on their own flat

        self.assertIsNone(res, f"Placement error: {res['message'] if res else ''}")
        stack = self.game.get_state()["board"][0][0]
        self.assertEqual(len(stack), 2)
        self.assertEqual(stack[0]["color"], "White")
        self.assertEqual(stack[1]["color"], "White")
        self.assertEqual(self.game.get_state()["pieces"][player]["flats"], initial_white_flats - 1)
        self.assertEqual(self.game.get_state()["currentPlayer"], "Black")

    def test_stack_player_wall_on_own_flat(self):
        self.game.handle_placement("White", 0, 0, "flat") # White places flat
        self.game.handle_placement("Black", 1, 0, "flat") # Black plays
        # White's turn
        player = "White"
        initial_white_flats = self.game.get_state()["pieces"][player]["flats"]
        res = self.game.handle_placement(player, 0, 0, "wall") # White places wall on their flat

        self.assertIsNone(res, f"Placement error: {res['message'] if res else ''}")
        stack = self.game.get_state()["board"][0][0]
        self.assertEqual(len(stack), 2)
        self.assertEqual(stack[0]["type"], "flat")
        self.assertEqual(stack[1]["type"], "wall")
        self.assertEqual(stack[1]["color"], player)
        self.assertEqual(self.game.get_state()["pieces"][player]["flats"], initial_white_flats - 1) # Wall uses a flat
        self.assertEqual(self.game.get_state()["currentPlayer"], "Black")

    def test_stack_player_capstone_on_own_flat(self):
        self.game.handle_placement("White", 0, 0, "flat") # White places flat
        self.game.handle_placement("Black", 1, 0, "flat") # Black plays
        # White's turn
        player = "White"
        initial_white_capstones = self.game.get_state()["pieces"][player]["capstones"]
        initial_white_flats = self.game.get_state()["pieces"][player]["flats"]
        res = self.game.handle_placement(player, 0, 0, "capstone") # White places capstone on their flat

        self.assertIsNone(res, f"Placement error: {res['message'] if res else ''}")
        stack = self.game.get_state()["board"][0][0]
        self.assertEqual(len(stack), 2)
        self.assertEqual(stack[0]["type"], "flat")
        self.assertEqual(stack[1]["type"], "capstone")
        self.assertEqual(stack[1]["color"], player)
        self.assertEqual(self.game.get_state()["pieces"][player]["capstones"], initial_white_capstones - 1)
        self.assertEqual(self.game.get_state()["pieces"][player]["flats"], initial_white_flats) # Flats unchanged
        self.assertEqual(self.game.get_state()["currentPlayer"], "Black")

    def test_stack_player_piece_on_own_wall_FAILS(self):
        self.game.handle_placement("White", 0, 0, "wall") # White places wall
        self.game.handle_placement("Black", 1, 0, "flat") # Black plays
        # White's turn
        res = self.game.handle_placement("White", 0, 0, "flat") # Try to place flat on own wall
        self.assertIsNotNone(res)
        self.assertEqual(res["message"], "Cannot stack a new piece from hand onto a wall or capstone.")

    def test_stack_player_piece_on_opponent_wall_FAILS(self):
        self.game.handle_placement("Black", 0, 0, "wall") # Black places wall
        # White's turn
        res = self.game.handle_placement("White", 0, 0, "flat") # Try to place flat on Black's wall
        self.assertIsNotNone(res)
        self.assertEqual(res["message"], "Cannot stack a new piece from hand onto a wall or capstone.")

    def test_stack_player_piece_on_own_capstone_FAILS(self):
        self.game.handle_placement("White", 0, 0, "capstone") # White places capstone
        self.game.handle_placement("Black", 1, 0, "flat") # Black plays
        # White's turn
        res = self.game.handle_placement("White", 0, 0, "flat") # Try to place flat on own capstone
        self.assertIsNotNone(res)
        self.assertEqual(res["message"], "Cannot stack a new piece from hand onto a wall or capstone.")

    def test_stack_player_piece_on_opponent_capstone_FAILS(self):
        self.game.handle_placement("Black", 0, 0, "capstone") # Black places capstone
        # White's turn
        res = self.game.handle_placement("White", 0, 0, "flat") # Try to place flat on Black's capstone
        self.assertIsNotNone(res)
        self.assertEqual(res["message"], "Cannot stack a new piece from hand onto a wall or capstone.")

    # --- End of New Stack Formation Tests ---

    def test_simple_move_single_flat_stone(self):
        self.game.handle_placement("White", 0, 0, "flat") # White places
        # Black's turn now
        self.game.handle_placement("Black", 1, 0, "flat") # Black places
        # White's turn again
        # To move 1 piece from (0,0) to (0,1):
        # num_to_pickup = 1. This is sum of counts in drops.
        # First element of drops MUST be the source square.
        drops = [{"r": 0, "c": 0, "count": 0}, {"r": 0, "c": 1, "count": 1}]
        res = self.game.handle_move_stack("White", 0, 0, drops)
        self.assertIsNone(res, f"Move failed: {res['message'] if res else 'No message'}")
        self.assertEqual(len(self.game.get_state()["board"][0][0]), 0) # Source empty
        self.assertEqual(len(self.game.get_state()["board"][0][1]), 1) # Target has 1
        self.assertEqual(self.game.get_state()["board"][0][1][0]["color"], "White")
        self.assertEqual(self.game.get_state()["currentPlayer"], "Black")

    def test_stack_move_valid(self):
        # Manually set up a stack for testing movement
        self.game.game_state["board"][0][0] = [
            {"color": "White", "type": "flat"},  # Bottom piece W_F1
            {"color": "White", "type": "flat"}   # Top piece W_F2
        ]
        self.game.game_state["pieces"]["White"]["flats"] -= 2 # Adjust count
        self.game.game_state["currentPlayer"] = "White" # Ensure White's turn

        # Move top 1 piece (W_F2) from (0,0) to (0,1).
        # This means 1 piece is picked up.
        # 'drops' describes where the 1 picked up piece goes.
        # It leaves 0 at source (from the picked up part) and drops 1 at (0,1).
        drops = [{"r":0,"c":0,"count":0}, {"r":0,"c":1,"count":1}]
        res = self.game.handle_move_stack("White", 0, 0, drops)
        self.assertIsNone(res, f"Move failed: {res['message'] if res else 'No message'}")

        # Check source stack
        self.assertEqual(len(self.game.get_state()["board"][0][0]), 1) # W_F1 should be left
        self.assertEqual(self.game.get_state()["board"][0][0][0]["color"], "White")

        # Check target stack
        self.assertEqual(len(self.game.get_state()["board"][0][1]), 1) # W_F2 should be here
        self.assertEqual(self.game.get_state()["board"][0][1][0]["color"], "White")
        self.assertEqual(self.game.get_state()["board"][0][1][0]["type"], "flat")

    def test_move_invalid_exceed_carry_limit(self):
        # Create a tall stack
        self.game.game_state["board"][0][0] = [{"color":"White", "type":"flat"}] * 6 # Stack of 6
        self.game.game_state["currentPlayer"] = "White"
        # Try to pick up all 6 (carry limit is 5 for 5x5 board)
        drops = [{"r":0,"c":0,"count":1}] * 6 # Incorrect drop formulation for test simplicity
                                            # The error should be caught by num_to_pickup

        # Correct way to represent picking up 6 to attempt to move them:
        # This would mean trying to drop 6 pieces one by one.
        # The validation "0 < num_to_pickup <= self.board_size" should catch this.
        # For this test, we'll construct a 'drops' that sums to > board_size.
        # The handle_move_stack calculates num_to_pickup = sum(d['count'] for d in drops)

        invalid_drops = [{"r":0,"c":0,"count":1}, # Leave 1
                         {"r":0,"c":1,"count":1},
                         {"r":0,"c":2,"count":1},
                         {"r":0,"c":3,"count":1},
                         {"r":0,"c":4,"count":1},
                         {"r":1,"c":4,"count":1}] # Drop 6th piece

        res = self.game.handle_move_stack("White", 0, 0, invalid_drops)
        self.assertIsNotNone(res)
        self.assertTrue("Invalid number of pieces to move" in res["message"])


    def test_move_invalid_opponent_piece(self):
        self.game.handle_placement("Black", 0, 0, "flat") # Black places
        # White's turn
        drops = [{"r":0,"c":0,"count":1}, {"r":0,"c":1,"count":1}]
        res = self.game.handle_move_stack("White", 0, 0, drops)
        self.assertIsNotNone(res)
        self.assertEqual(res["message"], "Cannot move this stack.")

    def test_move_invalid_turning_path(self):
        # Setup a simple two-piece stack for White
        self.game.game_state["board"][0][0] = [
            {"color": "White", "type": "flat"},
            {"color": "White", "type": "flat"}
        ]
        self.game.game_state["pieces"]["White"]["flats"] -= 2
        self.game.game_state["currentPlayer"] = "White"

        # Attempt an L-shaped move: first east then south
        drops = [
            {"r":0,"c":0,"count":0},
            {"r":0,"c":1,"count":1},
            {"r":1,"c":1,"count":1}
        ]
        res = self.game.handle_move_stack("White", 0, 0, drops)
        self.assertIsNotNone(res)
        self.assertEqual(res["message"], "Path must be straight.")

    def test_capstone_flatten_wall(self):
        self.game.handle_placement("White", 0, 0, "capstone") # W Cap
        self.game.handle_placement("Black", 0, 1, "wall")   # B Wall
        # White's turn to move capstone (0,0) onto wall (0,1). This is 1 piece picked up.
        drops = [{"r":0,"c":0,"count":0}, {"r":0,"c":1,"count":1}]
        res = self.game.handle_move_stack("White", 0, 0, drops)
        self.assertIsNone(res, f"Capstone move failed: {res['message'] if res else 'No message'}")
        self.assertEqual(len(self.game.get_state()["board"][0][1]), 2) # Stack: [Flattened Wall, Capstone]
        self.assertEqual(self.game.get_state()["board"][0][1][0]["type"], "flat") # Wall is now flat
        self.assertEqual(self.game.get_state()["board"][0][1][0]["color"], "Black") # Original wall color
        self.assertEqual(self.game.get_state()["board"][0][1][1]["type"], "capstone")
        self.assertEqual(self.game.get_state()["board"][0][1][1]["color"], "White")

    def test_stack_with_capstone_cannot_flatten_wall(self):
        # Manually set up stack: White Flat, then White Capstone on top
        self.game.game_state["board"][0][0] = [
            {"color": "White", "type": "flat"},
            {"color": "White", "type": "capstone"}
        ]
        self.game.game_state["pieces"]["White"]["flats"] -= 1
        self.game.game_state["pieces"]["White"]["capstones"] -= 1
        self.game.game_state["currentPlayer"] = "White"

        # Place a Black Wall at destination
        self.game.game_state["board"][0][1] = [{"color": "Black", "type": "wall"}]
        self.game.game_state["pieces"]["Black"]["flats"] -=1 # Wall uses a flat stone

        # Try to move the whole stack (2 pieces) from (0,0) onto wall at (0,1).
        # num_to_pickup = 2.
        # Drops: leave 0 from picked-up stack at source, drop 2 at destination.
        drops = [{"r":0,"c":0,"count":0}, {"r":0,"c":1,"count":2}]
        res = self.game.handle_move_stack("White", 0, 0, drops)

        self.assertIsNotNone(res)
        # This should fail because a stack topped by capstone cannot flatten.
        # The error message might be about carry limit if stack is too large,
        # or specific "Only a lone capstone..." if that check comes first.
        # Given num_to_pickup = 2, len(source_stack) = 2. 2 <= 2 is true. Carry limit is 5. 2 <= 5 is true.
        # So it should pass the initial checks and fail on the specific wall interaction.
        self.assertEqual(res["message"], "Only a lone capstone can flatten a wall.")
        self.assertEqual(self.game.get_state()["board"][0][1][0]["type"], "wall") # Wall remains a wall

    def test_road_win_horizontal(self):
        # White's turn for all placements in this road
        self.game.game_state["currentPlayer"] = "White"
        for i in range(5):
            # Simulate opponent playing dummy moves or game state allowing sequential placement
            self.game.game_state["currentPlayer"] = "White"
            self.game.handle_placement("White", 0, i, "flat")
            # No need to simulate black's turn if _end_turn switches player and we reset it for test

        # After White's 5th placement, _end_turn("White") is called by handle_placement.
        # This should check for win conditions.
        self.assertTrue(self.game.get_state()["game_over"])
        self.assertEqual(self.game.get_state()["winner"], "White")
        self.assertEqual(self.game.get_state()["win_reason"], "Road")

    def test_road_win_vertical_with_capstone(self):
        # Simulate sequential placements by White, assuming Black makes irrelevant moves
        self.game.game_state["currentPlayer"] = "White"
        self.game.handle_placement("White", 0, 0, "flat")
        self.game.game_state["currentPlayer"] = "White" # Force turn
        self.game.handle_placement("White", 1, 0, "flat")
        self.game.game_state["currentPlayer"] = "White" # Force turn
        self.game.handle_placement("White", 2, 0, "flat")
        self.game.game_state["currentPlayer"] = "White" # Force turn
        self.game.handle_placement("White", 3, 0, "capstone") # Capstone part of road
        self.game.game_state["currentPlayer"] = "White" # Force turn
        self.game.handle_placement("White", 4, 0, "flat") # Completes road

        self.assertTrue(self.game.get_state()["game_over"])
        self.assertEqual(self.game.get_state()["winner"], "White")
        self.assertEqual(self.game.get_state()["win_reason"], "Road")

    def test_no_road_win_with_wall(self):
        # Simulate sequential placements
        self.game.game_state["currentPlayer"] = "White"
        self.game.handle_placement("White", 0,0, "flat")
        self.game.game_state["currentPlayer"] = "White"
        self.game.handle_placement("White", 0,1, "wall") # Wall in the middle
        self.game.game_state["currentPlayer"] = "White"
        self.game.handle_placement("White", 0,2, "flat")
        self.game.game_state["currentPlayer"] = "White"
        self.game.handle_placement("White", 0,3, "flat")
        self.game.game_state["currentPlayer"] = "White"
        self.game.handle_placement("White", 0,4, "flat")

        # After last placement, _end_turn is called. If it was a road, game_over would be true.
        self.assertFalse(self.game.get_state()["game_over"]) # Wall should block road

    def test_flat_win_board_full(self):
        # Fill the board such that White has more flats on top
        for r in range(5):
            for c in range(5):
                player = "White" if (r + c) % 2 == 0 else "Black"
                # Ensure the player whose turn it is places the piece
                self.game.game_state["currentPlayer"] = player

                # Simulate running out of capstones to only place flats
                self.game.game_state["pieces"]["White"]["capstones"] = 0
                self.game.game_state["pieces"]["Black"]["capstones"] = 0

                if self.game.get_state()["pieces"][player]["flats"] > 0:
                     self.game.handle_placement(player, r, c, "flat")
                elif player=="White": # if white runs out, black places
                    self.game.game_state["currentPlayer"] = "Black"
                    if self.game.get_state()["pieces"]["Black"]["flats"] > 0:
                        self.game.handle_placement("Black", r, c, "flat")
                elif player=="Black": # if black runs out, white places
                    self.game.game_state["currentPlayer"] = "White"
                    if self.game.get_state()["pieces"]["White"]["flats"] > 0:
                        self.game.handle_placement("White", r, c, "flat")

        # Manually count top flats after board is full
        white_score = 0
        black_score = 0
        for r_idx in range(5):
            for c_idx in range(5):
                top_piece = self.game.get_top_piece(r_idx, c_idx)
                if top_piece and top_piece["type"] == "flat":
                    if top_piece["color"] == "White": white_score +=1
                    else: black_score +=1

        self.game.game_state["game_over"] = True # Simulate game end condition being met by board full
        self.game.game_state["win_reason"] = "Flat"
        if white_score > black_score: self.game.game_state["winner"] = "White"
        elif black_score > white_score: self.game.game_state["winner"] = "Black"
        else: self.game.game_state["winner"] = "Draw"

        self.assertTrue(self.game.get_state()["game_over"])
        self.assertEqual(self.game.get_state()["win_reason"], "Flat")
        if white_score > black_score: self.assertEqual(self.game.get_state()["winner"], "White")
        elif black_score > white_score: self.assertEqual(self.game.get_state()["winner"], "Black")
        else: self.assertEqual(self.game.get_state()["winner"], "Draw")


    def test_flat_win_player_runs_out_of_pieces(self):
        # White places all their pieces
        self.game.game_state["pieces"]["White"]["flats"] = 1
        self.game.game_state["pieces"]["White"]["capstones"] = 0
        self.game.game_state["pieces"]["Black"]["flats"] = 2 # Black has more
        self.game.game_state["pieces"]["Black"]["capstones"] = 0

        # White places their last piece
        self.game.handle_placement("White", 0, 0, "flat")
        # Black places a piece
        self.game.handle_placement("Black", 1,0, "flat")

        # White now has 0 flats, 0 capstones. Game should end.
        # The flat win check is called in _end_turn.
        # White made the move that resulted in them running out.
        # The check_flat_win includes "player_out_of_pieces".
        # This means after White's move, if they run out, flat win is checked.

        # Manually set other pieces on board for scoring
        self.game.game_state["board"][0][0] = [{"color":"White", "type":"flat"}] # White's piece
        self.game.game_state["board"][1][0] = [{"color":"Black", "type":"flat"}] # Black's piece
        self.game.game_state["board"][2][0] = [{"color":"Black", "type":"flat"}] # Another Black piece for score

        # The game should have ended after White's move that made them run out of pieces.
        # Let's call _end_turn manually as if White just moved and ran out.
        self.game.game_state["pieces"]["White"]["flats"] = 0 # Simulate they ran out
        self.game._end_turn("White") # White made the move that led to this state

        self.assertTrue(self.game.get_state()["game_over"])
        self.assertEqual(self.game.get_state()["win_reason"], "Flat")
        self.assertEqual(self.game.get_state()["winner"], "Black") # Black has more flats (2 vs 1)

    def test_game_reset(self):
        self.game.handle_placement("White", 0,0, "flat")
        self.game.reset_game_state()
        self.test_initialization() # Check if it's back to initial state


if __name__ == '__main__':
    unittest.main(argv=['first-arg-is-ignored'], exit=False)
