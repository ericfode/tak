# Tak Game Rules

## Setup

Tak is played on a square board, which can be of various sizes:
- 3x3 (10 pieces per player)
- 4x4 (15 pieces per player)
- 5x5 (21 pieces per player)
- 6x6 (30 pieces per player)
- 8x8 (50 pieces per player, though typically played with 6x6 pieces)

Each player has a set of pieces in their color (usually black and white). Most pieces are "flat stones". For each board size, one piece per player is a "capstone" or "cap". For sizes 5x5 and larger, players may optionally designate one of their flat stones as a second capstone.

## Opening Turn (Pie Rule)

Tak employs the pie rule for the first turn to ensure fairness.
1. The first player places one of their opponent's flat stones on any empty square on the board.
2. The second player then chooses one of three options:
    - Start the game as the first player with the board as is.
    - Start the game as the second player with the board as is.
    - Swap the positions of the stone already on the board with one of their own flat stones from their reserve, and then choose to be either the first or second player. (This option is less common and sometimes omitted in simpler rulesets).

A more common way to handle the opening turn:
1. The first player places one of their opponent's flat stones on any empty square on the board.
2. The second player then chooses which color they will play. The player whose stone is on the board plays second.

## Standard Turn

On their turn, a player must perform one of the following actions:

1.  **Place a piece:**
    *   Take a piece from their reserve and place it on an empty square on the board.
    *   **Flat Stone:** Placed flat on the square.
    *   **Standing Stone (Wall):** Placed standing on its edge. Walls block the line of sight for roads but do not stop movement. They cannot be part of a road themselves.
    *   **Capstone:** Placed on an empty square. Capstones are special pieces.

2.  **Move a stack of pieces:**
    *   A player can move a stack of pieces they control (i.e., the top piece is their color).
    *   **Carry Limit:** The number of pieces a player can pick up from a stack is limited by the board dimension (e.g., on a 5x5 board, a player can pick up a maximum of 5 pieces). This is often referred to as the "hand size".
    *   **Movement:**
        *   Stacks move in a straight orthogonal line (not diagonally).
        *   The player picks up 1 to N pieces from the top of a stack they control (where N is the carry limit).
        *   They must drop at least one piece from the bottom of the stack they are carrying onto the square they started on.
        *   They then move in a straight line, dropping at least one piece on each subsequent square they enter. They can drop multiple pieces on a single square.
        *   Stacks cannot move through or onto squares occupied by a standing stone or a capstone of either color.
    *   **Capstone Movement:**
        *   A capstone can move like a normal stack.
        *   Additionally, a capstone can move onto a square occupied by a standing stone (of either color) and flatten it into a flat stone. This is the only way a standing stone can be flattened. The capstone then sits on top of the newly flattened stone. This action uses the entire turn.

## Endgame Conditions

There are two primary ways to win Tak:

1.  **Road Win (Tinuë):**
    *   A player builds a "road" of their flat stones or capstone connecting any two opposite edges of the board.
    *   The road can be made of pieces of only their color. Standing stones (walls) cannot be part of a road.
    *   The road does not have to be a straight line; it can twist and turn.
    *   If a player completes a road for *either* player by their move, the player whose road is completed wins. If a move simultaneously creates roads for both players, the player who made the move wins.
    *   This is the primary win condition. If a road is built, the game ends immediately.

2.  **Flat Win:**
    *   If the board becomes completely full of pieces, or if no more moves can be made (e.g., all pieces played and no legal moves left), the game ends.
    *   The player who has more flat stones face up on the board wins.
    *   Standing stones and capstones do not count towards a flat win. Only flat stones under player control count.
    *   If the count of flat stones is equal, the game is a draw.

## Terminology

*   **Road:** A connected series of a player's flat stones (or capstone) linking two opposite sides of the board.
*   **Flat Stone:** The most common type of piece. Placed flat, these form roads.
*   **Standing Stone (Wall):** A piece placed on its side. It blocks road connections for both players on that square but does not block movement over the square (stacks can move over squares adjacent to walls). A capstone can flatten a standing stone.
*   **Capstone:** A special piece. It counts as a flat stone for road purposes. It can flatten standing stones. Opponent capstones cannot be stacked upon.
*   **Stack:** One or more pieces piled on a single square. The player whose piece is on top controls the stack.
*   **Tak:** Similar to "check" in chess. Announced when a player makes a move that could lead to a road win on their next turn if the opponent does not intervene. This is a courtesy and not a formal rule in most tournament settings, but good sportsmanship.
*   **Tinuë:** The announcement of a road win, akin to "checkmate."
*   **Flat Win:** A win condition achieved by having the most flat stones on the board when the board is full or no more moves can be made.
