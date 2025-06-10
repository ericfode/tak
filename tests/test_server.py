import unittest
import json
import sys
import os
import threading
import time

# Add the project root to the Python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from flask_testing import TestCase
from main import app, rooms, TakGame, DEFAULT_BOARD_SIZE
import websocket

class TestTakServer(TestCase):
    def create_app(self):
        app.config['TESTING'] = True
        return app

    def setUp(self):
        # Ensure rooms are clean before each test
        rooms.clear()
        # It might be beneficial to have a known room code for testing
        self.room_code = "TEST12"
        rooms[self.room_code] = {
            "game": TakGame(board_size=DEFAULT_BOARD_SIZE),
            "clients": {} # Now a dictionary
        }

    def tearDown(self):
        # Clean up rooms after each test
        rooms.clear()

    def test_white_places_first_piece(self):
        """
        Tests if the first move is correctly processed as a White piece.
        """
        ws_url = f"ws://127.0.0.1:{self.get_server_port()}/ws/{self.room_code}"
        received_messages = []
        ws_app = None

        def on_message(ws, message):
            received_messages.append(json.loads(message))

        def on_error(ws, error):
            print(f"Test client error: {error}")

        def on_open(ws):
            place_action = { "action": "place_flat", "r": 0, "c": 0 }
            ws.send(json.dumps(place_action))

        ws_app = websocket.WebSocketApp(ws_url, on_open=on_open, on_message=on_message, on_error=on_error)
        
        ws_thread = threading.Thread(target=ws_app.run_forever)
        ws_thread.daemon = True
        ws_thread.start()
        time.sleep(2)
        ws_app.close()
        ws_thread.join(timeout=1)

        self.assertGreaterEqual(len(received_messages), 2)
        init_message = received_messages[0]
        self.assertEqual(init_message['type'], 'init')
        self.assertEqual(init_message['data']['currentPlayer'], 'White')

        update_message = received_messages[1]
        self.assertEqual(update_message['type'], 'update')
        
        updated_board = update_message['data']['board']
        first_piece = updated_board[0][0][0]
        self.assertIsNotNone(first_piece)
        self.assertEqual(first_piece['color'], 'White')
        self.assertEqual(update_message['data']['currentPlayer'], 'Black')

    def test_two_players_first_move(self):
        """
        Tests that with two players, the first move by White is processed correctly
        and the second player (Black) receives the correct state update.
        """
        ws_url = f"ws://127.0.0.1:{self.get_server_port()}/ws/{self.room_code}"
        
        p1_messages = []
        p2_messages = []
        
        # --- WebSocket Client 1 (White) Callbacks ---
        def p1_on_message(ws, message): p1_messages.append(json.loads(message))
        def p1_on_error(ws, error): print(f"P1 Error: {error}")
        def p1_on_open(ws):
            p2_connected.wait(timeout=2)
            ws.send(json.dumps({"action": "place_flat", "r": 0, "c": 0}))

        # --- WebSocket Client 2 (Black) Callbacks ---
        def p2_on_message(ws, message): p2_messages.append(json.loads(message))
        def p2_on_error(ws, error): print(f"P2 Error: {error}")
        def p2_on_open(ws):
            p2_connected.set()

        # --- Setup and Run Clients ---
        p2_connected = threading.Event()
        p1_ws_app = websocket.WebSocketApp(ws_url, on_open=p1_on_open, on_message=p1_on_message, on_error=p1_on_error)
        p2_ws_app = websocket.WebSocketApp(ws_url, on_open=p2_on_open, on_message=p2_on_message, on_error=p2_on_error)

        p1_thread = threading.Thread(target=p1_ws_app.run_forever)
        p2_thread = threading.Thread(target=p2_ws_app.run_forever)
        
        p1_thread.start()
        time.sleep(0.5)
        p2_thread.start()
        time.sleep(2)

        p1_ws_app.close()
        p2_ws_app.close()
        p1_thread.join()
        p2_thread.join()

        # --- Assertions for Player 2 (Black) ---
        self.assertGreaterEqual(len(p2_messages), 3, "Player 2 should receive init, info, and update messages")
        
        p2_init = p2_messages[0]
        self.assertEqual(p2_init['type'], 'init')
        self.assertEqual(p2_init['data']['currentPlayer'], 'White')

        p2_info = p2_messages[1]
        self.assertEqual(p2_info['type'], 'info')

        p2_update = p2_messages[2]
        self.assertEqual(p2_update['type'], 'update')
        board_state = p2_update['data']['board']
        first_piece = board_state[0][0][0]
        self.assertEqual(first_piece['color'], 'White', "P2 should see that the first piece is White")
        self.assertEqual(p2_update['data']['currentPlayer'], 'Black', "P2 should see that the next player is Black")

import socket
from contextlib import closing

def find_free_port():
    with closing(socket.socket(socket.AF_INET, socket.SOCK_STREAM)) as s:
        s.bind(('', 0))
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        return s.getsockname()[1]

if __name__ == '__main__':
    port = find_free_port()
    
    def run_app():
        app.run(port=port, debug=False)

    server_thread = threading.Thread(target=run_app)
    server_thread.daemon = True
    server_thread.start()
    time.sleep(1)

    TestTakServer.get_server_port = lambda self: port
    unittest.main() 