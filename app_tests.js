// Flag to indicate tests are running (app.js can check this)
window.isRunningTests = true;

const appTestRunner = {
    resultsDiv: null,
    testCount: 0,
    passCount: 0,
    mockSocket: null,
    originalSocketSend: null,
    sentMessages: [],

    setup: function() {
        this.resultsDiv = document.getElementById('test-results');
        if (!this.resultsDiv) {
            console.error("Test results div not found!");
            return;
        }
        this.resultsDiv.innerHTML = '<h2>Frontend Test Results</h2>';

        // Ensure app is initialized (it should be via its own DOMContentLoaded)
        if (!window.takGameApp || !window.takGameApp.boardElement) {
             this.resultsDiv.innerHTML += '<p class="test-fail">Tak Game App not initialized. Ensure app.js is loaded and takGameApp.init() has run.</p>';
             // Try to initialize it manually for tests if DOM is ready
             if (document.readyState === "complete" || document.readyState === "interactive") {
                 if(window.takGameApp && typeof window.takGameApp.init === 'function') {
                    //  window.takGameApp.init(); // app.js now auto-inits
                     this.resultsDiv.innerHTML += '<p>Attempted late initialization of takGameApp.</p>';
                 } else {
                     this.resultsDiv.innerHTML += '<p class="test-fail">takGameApp.init not found.</p>';
                     return; // Cannot proceed
                 }
             } else {
                 this.resultsDiv.innerHTML += '<p class="test-fail">DOM not ready for late init.</p>';
                 return; // Cannot proceed
             }
        }

        // Mock WebSocket
        this.mockSocket = {
            readyState: WebSocket.OPEN, // Simulate an open connection
            send: (message) => {
                console.log("MockSocket send:", message);
                this.sentMessages.push(JSON.parse(message));
            },
            close: () => { console.log("MockSocket close called."); }
        };
        // Replace the app's socket with the mock
        window.takGameApp.socket = this.mockSocket;
    },

    teardown: function() {
        // Restore original socket if it was changed, or simply nullify
        window.takGameApp.socket = null; // Or restore original if stored
        this.sentMessages = [];
        window.isRunningTests = false;
    },

    displayTestResult: function(testName, success, errorMessage = '') {
        this.testCount++;
        if (success) this.passCount++;
        const passFailText = success ? 'PASS' : 'FAIL';
        const cssClass = success ? 'test-pass' : 'test-fail';
        this.resultsDiv.innerHTML += `<p class="${cssClass}">[${passFailText}] ${testName}${errorMessage ? ': ' + errorMessage : ''}</p>`;
    },

    assertEquals: function(expected, actual, message) {
        if (expected !== actual) {
            throw new Error(`${message}: Expected "${expected}", but got "${actual}".`);
        }
    },

    assertDeepEquals: function(expected, actual, message) {
        if (JSON.stringify(expected) !== JSON.stringify(actual)) {
            throw new Error(`${message}: Expected ${JSON.stringify(expected)}, but got ${JSON.stringify(actual)}.`);
        }
    },

    assertIsTrue: function(value, message) {
        if (!value) {
            throw new Error(`${message}: Expected true, but got false.`);
        }
    },

    assertIsFalse: function(value, message) {
        if (value) {
            throw new Error(`${message}: Expected false, but got true.`);
        }
    },

    assertNotNull: function(value, message) {
        if (value === null || typeof value === "undefined") {
            throw new Error(`${message}: Expected not null, but got null/undefined.`);
        }
    },

    simulateClick: function(elementIdOrElem) {
        const elem = typeof elementIdOrElem === 'string' ? document.getElementById(elementIdOrElem) : elementIdOrElem;
        if (!elem) {
            console.error(`Cannot simulate click: Element ${elementIdOrElem} not found.`);
            return;
        }
        const event = new MouseEvent('click', { bubbles: true, cancelable: true });
        elem.dispatchEvent(event);
    },

    simulateCellClick: function(r, c) {
        const cell = document.querySelector(`#game-board .board-cell[data-r="${r}"][data-c="${c}"]`);
        if (!cell) {
            console.error(`Cell (${r},${c}) not found for click simulation.`);
            return;
        }
        this.simulateClick(cell);
    },

    // --- Test Suites ---
    runBoardRenderingTests: function() {
        const testSuiteName = "Board Rendering";
        let currentTestName = "";
        try {
            // Test 1: Initial Board Render
            currentTestName = "testRenderInitialBoard";
            window.takGameApp.BOARD_SIZE = 5; // Ensure specific size for test
            window.takGameApp.gameState.board = Array(5).fill(null).map(() => Array(5).fill(null)); // Empty board
            window.takGameApp.renderBoard();
            const cells = document.querySelectorAll('#game-board .board-cell');
            this.assertEquals(25, cells.length, `${testSuiteName} - ${currentTestName} (Cell Count)`);
            this.displayTestResult(`${testSuiteName} - ${currentTestName}`, true);

            // Test 2: Render Pieces
            currentTestName = "testRenderPieces";
            window.takGameApp.gameState.board = [
                [[{color: "White", type: "flat"}], null, [{color: "Black", type: "wall"}], null, null],
                [null, [{color: "White", type: "capstone"}], null, null, null],
                [[{color: "Black", type: "flat"}, {color:"White", type:"flat"}], null, null, null, null], // Stack
                [null, null, null, null, null],
                [null, null, null, null, null]
            ];
            window.takGameApp.renderBoard();
            const cell00 = document.querySelector('#game-board .board-cell[data-r="0"][data-c="0"]');
            this.assertIsTrue(cell00.querySelector('.piece.flat-white') !== null, `${testSuiteName} - ${currentTestName} (White Flat)`);
            const cell02 = document.querySelector('#game-board .board-cell[data-r="0"][data-c="2"]');
            this.assertIsTrue(cell02.querySelector('.piece.wall-black') !== null, `${testSuiteName} - ${currentTestName} (Black Wall)`);
            const cell11 = document.querySelector('#game-board .board-cell[data-r="1"][data-c="1"]');
            this.assertIsTrue(cell11.querySelector('.piece.capstone-white') !== null, `${testSuiteName} - ${currentTestName} (White Capstone)`);
            const cell20 = document.querySelector('#game-board .board-cell[data-r="2"][data-c="0"]');
            this.assertIsTrue(cell20.querySelector('.piece.flat-white') !== null, `${testSuiteName} - ${currentTestName} (Stack Top White Flat)`);
            this.assertEquals("2", cell20.querySelector('.stack-count').textContent, `${testSuiteName} - ${currentTestName} (Stack Count)`);
            this.displayTestResult(`${testSuiteName} - ${currentTestName}`, true);

        } catch (e) {
            this.displayTestResult(`${testSuiteName} - ${currentTestName}`, false, e.message);
        }
    },

    runUIStateChangeTests: function() {
        const testSuiteName = "UI State Changes";
        let currentTestName = "";
        try {
            currentTestName = "testActionButtonClicks";
            this.simulateClick(window.takGameApp.btnPlaceFlat);
            this.assertEquals("place_flat", window.takGameApp.currentAction, `${testSuiteName} - ${currentTestName} (Place Flat)`);

            this.simulateClick(window.takGameApp.btnPlaceWall);
            this.assertEquals("place_wall", window.takGameApp.currentAction, `${testSuiteName} - ${currentTestName} (Place Wall)`);

            this.simulateClick(window.takGameApp.btnPlaceCapstone);
            this.assertEquals("place_capstone", window.takGameApp.currentAction, `${testSuiteName} - ${currentTestName} (Place Capstone)`);

            this.simulateClick(window.takGameApp.btnMoveStack);
            this.assertEquals("move_select_source", window.takGameApp.currentAction, `${testSuiteName} - ${currentTestName} (Move Stack)`);
            this.displayTestResult(`${testSuiteName} - ${currentTestName}`, true);

        } catch (e) {
            this.displayTestResult(`${testSuiteName} - ${currentTestName}`, false, e.message);
        }
    },

    runMoveLogicClientSideTests: function() {
        const testSuiteName = "Client-Side Move Logic";
        let currentTestName = "";
        try {
            // Setup initial state for move
            window.takGameApp.gameState.board = [
                [[{color: "White", type: "flat"}, {color: "White", type: "flat"}]], // Stack of 2 at (0,0)
                [null],
                [null]
            ];
            window.takGameApp.gameState.currentPlayer = "White";
            window.takGameApp.BOARD_SIZE = 3; // Smaller board for simplicity
            window.takGameApp.renderBoard(); // Render with this state

            // Test 1: Select source
            currentTestName = "testMoveSelectSource";
            this.simulateClick(window.takGameApp.btnMoveStack); // Activate move mode
            this.simulateCellClick(0,0);
            this.assertNotNull(window.takGameApp.moveData.source, `${testSuiteName} - ${currentTestName} (Source Set)`);
            this.assertEquals(0, window.takGameApp.moveData.source.r, `${testSuiteName} - ${currentTestName} (Source Row)`);
            this.assertEquals(0, window.takGameApp.moveData.source.c, `${testSuiteName} - ${currentTestName} (Source Col)`);
            this.assertEquals("move_lift_pieces", window.takGameApp.currentAction, `${testSuiteName} - ${currentTestName} (Action Update)`);
            this.displayTestResult(`${testSuiteName} - ${currentTestName}`, true);

            // Test 2: Lift pieces
            currentTestName = "testMoveLiftPieces";
            window.takGameApp.piecesToLiftInput.value = "2"; // Lift 2 pieces
            this.simulateClick(window.takGameApp.confirmLiftButton);
            this.assertEquals(2, window.takGameApp.moveData.liftedCount, `${testSuiteName} - ${currentTestName} (Lifted Count)`);
            this.assertEquals("move_select_path_drops", window.takGameApp.currentAction, `${testSuiteName} - ${currentTestName} (Action Update for Path/Drops)`);
            this.assertIsTrue(window.takGameApp.moveData.path.length === 1, `${testSuiteName} - ${currentTestName} (Initial path for source drop)`);
            this.assertEquals(1, window.takGameApp.moveData.path[0].drops, `${testSuiteName} - ${currentTestName} (Default 1 drop for source)`);
            this.displayTestResult(`${testSuiteName} - ${currentTestName}`, true);

            // Test 3: Define Path & Drops (simple: move all to next square)
            currentTestName = "testMoveDefinePathAndDrops";
            this.simulateCellClick(0,1); // Click adjacent cell to extend path
            this.assertEquals(2, window.takGameApp.moveData.path.length, `${testSuiteName} - ${currentTestName} (Path extended)`);
            this.assertEquals(0, window.takGameApp.moveData.path[1].r, `${testSuiteName} - ${currentTestName} (Path R correct)`);
            this.assertEquals(1, window.takGameApp.moveData.path[1].c, `${testSuiteName} - ${currentTestName} (Path C correct)`);
            this.assertEquals(1, window.takGameApp.moveData.path[1].drops, `${testSuiteName} - ${currentTestName} (Default 1 drop for new path square)`);

            // Adjust drops: leave 0 on source (0,0), drop all 2 on (0,1)
            // To adjust source drop: click source cell again in 'move_select_path_drops' mode
            // Current path: [{r:0,c:0,drops:1}, {r:0,c:1,drops:1}]
            // Lifted: 2. Need total drops to be 2.
            // If we want to leave 0 on source: path[0].drops should be 0.
            // This isn't directly testable by clicking drop indicator on source.
            // Let's assume the default of 1 on source is what we test for now, and adjust if needed.
            // To make total drops = liftedCount (2): path[0].drops=1, path[1].drops=1. This is the default.

            // Check if confirm button is available (it should be if drops match lifted)
            this.assertNotNull(window.takGameApp.moveControlsPanel.querySelector('#btn-confirm-move'), `${testSuiteName} - ${currentTestName} (Confirm button appears)`);
            this.displayTestResult(`${testSuiteName} - ${currentTestName}`, true);

            // Test 4: Send Move
            currentTestName = "testSendMoveData";
            this.sentMessages = []; // Clear previous messages
            this.simulateClick(window.takGameApp.confirmMoveButton);
            this.assertEquals(1, this.sentMessages.length, `${testSuiteName} - ${currentTestName} (Message Sent)`);
            const sentMsg = this.sentMessages[0];
            this.assertEquals("move_stack", sentMsg.action, `${testSuiteName} - ${currentTestName} (Action correct)`);
            this.assertEquals(0, sentMsg.from_r, `${testSuiteName} - ${currentTestName} (From R correct)`);
            this.assertDeepEquals([{r:0,c:0,count:1},{r:0,c:1,count:1}], sentMsg.drops, `${testSuiteName} - ${currentTestName} (Drops correct)`);
            this.displayTestResult(`${testSuiteName} - ${currentTestName}`, true);


        } catch (e) {
            this.displayTestResult(`${testSuiteName} - ${currentTestName}`, false, e.message);
        }
    },

    runServerMessageHandlingTests: function() {
        const testSuiteName = "Server Message Handling";
        let currentTestName = "";
        try {
            // Test 1: Handle Game Update
            currentTestName = "testHandleServerUpdateMessage";
            const serverUpdate = {
                type: "update",
                data: {
                    board: Array(5).fill(null).map(() => Array(5).fill(null)), // Empty 5x5
                    currentPlayer: "Black",
                    pieces: { White: {flats: 20, capstones: 1}, Black: {flats: 21, capstones: 0}},
                    board_size: 5,
                    winner: null
                },
                message: "Update from server"
            };
            window.takGameApp.handleServerMessage({data: JSON.stringify(serverUpdate)});
            this.assertEquals("Black", window.takGameApp.gameState.currentPlayer, `${testSuiteName} - ${currentTestName} (Current Player Updated)`);
            this.assertEquals(20, window.takGameApp.gameState.pieces.White.flats, `${testSuiteName} - ${currentTestName} (Piece Count Updated)`);
            this.assertIsTrue(document.getElementById('current-player').textContent.includes("Black"), `${testSuiteName} - ${currentTestName} (UI Player Display)`);
            this.displayTestResult(`${testSuiteName} - ${currentTestName}`, true);

            // Test 2: Handle Error Message
            currentTestName = "testHandleServerErrorMessage";
            const serverError = { type: "error", message: "Test error message" };
            window.takGameApp.handleServerMessage({data: JSON.stringify(serverError)});
            this.assertIsTrue(document.getElementById('game-messages').textContent.includes("Error: Test error message"), `${testSuiteName} - ${currentTestName} (Error Message Displayed)`);
            this.displayTestResult(`${testSuiteName} - ${currentTestName}`, true);

        } catch (e) {
            this.displayTestResult(`${testSuiteName} - ${currentTestName}`, false, e.message);
        }
    },


    // --- Main Test Runner ---
    runAll: function() {
        this.setup();
        if (!this.resultsDiv) return; // Stop if setup failed critically

        this.runBoardRenderingTests();
        this.runUIStateChangeTests();
        this.runMoveLogicClientSideTests();
        this.runServerMessageHandlingTests();
        // Add more test suites here

        this.resultsDiv.innerHTML += `<hr><p><strong>Total Tests: ${this.testCount}, Passed: ${this.passCount}, Failed: ${this.testCount - this.passCount}</strong></p>`;
        this.teardown();
    }
};

// Expose the main runner function to be called from test_runner.html
window.runAllAppTests = function() {
    appTestRunner.runAll();
};
