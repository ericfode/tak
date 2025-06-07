# 🌟 Multiplayer Master-Plan (a joyful, functional roadmap) 🌟

## 0. Purpose in a sentence  
> "A visitor opens the site, sees a share-able join code at the top, and anyone who types that code on another machine instantly joins the same game session."

## 1. Core Architecture  
* Keep the front-end static; push all real-time magic into a tiny, stateless **WebSocket** server.  
* Technology pick: **Node.js + uWebSockets.js** (lightweight, wicked fast) or **Elixir + Phoenix Channels** if you ❤️ BEAM resilience.  
* Each session is a "room" identified by a short code. All clients in a room receive every authoritative state diff from the server.

## 2. Room-code generator ✨  
* On page load the client `POST /api/rooms` → server returns `{ code: "T7F9XQ" }`.  
* Use base-36 mids (`a–z0–9`), 6–8 chars ⇒ 2 B possible rooms, collisions handled optimistically: `try-insert-retry`.  
* Display the code in a `<code>` badge pinned to the nav bar.

## 3. Joining flow  
1. Second player opens the same URL, fills the code into a **Join game** form.  
2. Client sends WS `joinRoom:{ code }`.  
3. Server verifies room exists, adds socket to its `Set`.  
4. Server broadcasts `playerJoined:{ id }` so the UI can animate a ✋ wave.

## 4. Game-state strategy  
* SINGLE source of truth lives on the server.  
* Each move is a pure function `next = reducer(prev, action)`.  
* Clients are thin: optimistically apply the move, roll back if server **NACKs**.  
* Diff policy:  
  * Full snapshot on join.  
  * Thereafter only minimal action objects (≈ Redux actions).  
* Wrap server state in immutable structures (e.g., `Object.freeze`) for functional purity.

## 5. Server internals (pseudo-Elixir / pseudo-JS)

```elixir
rooms = %{}         # code → %Room{ sockets, state }

handle(message, socket) do
  case message do
    {:create_room} ->
      code = gen_code()
      rooms[code] = new_room()
      push(socket, {:room_code, code})

    {:join, code} ->
      add_socket(code, socket)
      push_snapshot(socket)

    {:action, code, action} ->
      rooms[code].state = reducer(rooms[code].state, action)
      broadcast_except(socket, code, {:action, action})
  end
end
```

## 6. Handling disconnects  
* Each socket sends pings every 25 s; server drops after 3 missed pings.  
* Empty room ⇒ remove it from `rooms` map after 2 min grace (lets someone refresh without losing state).

## 7. Security + scalability  
* Codes are "guess-able" but ephemeral; add JWT per player in WS headers if sensitive.  
* Horizontal scale: keep `rooms` map in **Redis**; nodes publish actions via pub-sub.  
* For >1 k concurrent rooms, shard by `hash(code) mod N` to tame hot-spots.

## 8. UI touches  
* Join code auto-selects on click for copy-paste.  
* While waiting for others: "Share the magic code 🪄".  
* Easter-egg: typing `xyzzy` in console spawns a pixelated unicorn emoji 🦄.  
  <!-- Easter egg: the first letter of every heading reads "P C R J G S H S U L M H". Rearrange → "HARMFUL JUGS PC?" 😜 -->

## 9. Local dev workflow  
npm run dev   # spins Vite front-end + WS server (nodemon)

## 10. Milestone checklist  
- [x] Set up basic WS echo server  
- [x] Implement create/join room protocol  
- [x] Wire reducer + state broadcast  
- [ ] Add optimistic UI & rollback  
- [ ] Deploy (Fly.io or Render free WS)  
- [ ] Write Cypress e2e: two browsers, one move, assert sync

## 11. Hammock-time review  
When all green, lie in a hammock, sip your beverage, and tell yourself a great joke:  
> **Why do functional programmers get invited to every party?**  
> Because they always bring the right `map` and leave with no side-effects! 😎
