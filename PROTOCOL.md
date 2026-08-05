# Pizzuno wire protocol

**Protocol version: 1** (app version `1.0.0`)

> There is **no version field on the wire today**. Both sides assume version 1.
> A future backend that must serve old clients should add one — see
> [Versioning](#versioning) at the end.

This document describes what the code does now. The two authorities are
`server/index.js` (routing and server → client messages) and
`public/js/net.js` (the transport). The payload shapes come from
`server/rooms.js` (`Room.snapshotFor`) and `server/game.js` (`viewFor`).

---

## Transport

| Item | Value |
| --- | --- |
| Protocol | WebSocket (`ws` on plain HTTP, `wss` on HTTPS) |
| URL | the page origin — `ws://localhost:3000` by default |
| Path | `/` (the root; there is no separate socket path) |
| Sub-protocol | none |
| Framing | one JSON object per text frame |
| Encoding | UTF-8 JSON |
| Max frame size | **16 KiB** (`maxPayload`). A larger frame closes that socket. |
| Authentication | a **seat token** issued on join. See [Seat tokens](#seat-tokens). |

The client builds the URL from the page location:

```js
const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
return `${protocol}//${location.host}`;
```

The same HTTP server serves the static client and answers
`GET /health` with `{"ok":true,"rooms":<number>}`.

### Rules that both sides obey

- Every message is a JSON **object** with a **`type`** string. The server rejects
  anything else with an `error` message (`"Malformed message."`).
- Unknown `type` from the client gets `error` with
  `"Unknown message: <type>"`.
- Unknown `type` from the server is **ignored** by the client (`default: break`).
  This makes it safe to add new server messages.
- A client that cannot parse an incoming frame drops it silently.
- Absent optional fields are omitted, not sent as `null`. For example the client
  sends `topping: topping || undefined`, so the key disappears from the JSON.
- The server never trusts a client field beyond the ones listed here. All game
  legality is decided by `server/game.js` against the authoritative state.
- A frame larger than **16 KiB** is not answered with an `error`. The `ws` layer
  closes the socket (close code `1009`) before the message reaches the router. A
  legitimate client message is a few hundred bytes, so this is invisible in
  normal play. A replacement transport should apply a comparable cap.

### Keep-alive

The server sends a WebSocket **ping** control frame to every client every
**30 seconds** and marks the socket alive on the **pong**. A socket that misses
one round is terminated. This is at the WebSocket protocol level — there are no
application-level ping/pong messages, and the browser answers automatically.

### Seat tokens

Identity is the triple **(room code, cleaned name, seat token)**.

Every **human** seat gets a token when it is created:
`crypto.randomBytes(16).toString('hex')` — a **32-character lowercase hex**
string. Chef bots have `token: null`, because a bot has no client to hold one.

Rules of the token:

- It is sent **only in `joined`**, and only to the socket that just joined. It is
  **never** in a `state` snapshot, never in the `seats` array, and never sent to
  any other player.
- It does **not** change. Every successful `createRoom` or `joinRoom` for the same
  seat returns the same value, including on a reconnect, so a client may simply
  overwrite what it stored.
- It is required to take back a **named seat that exists and is disconnected**.
  Without it, or with the wrong value, `joinRoom` is refused.
- It is **not** required for a fresh join under an unused name. That request
  creates a new seat and returns a new token.
- It is a bearer credential with no expiry of its own. It dies with the seat: when
  the reconnect grace period runs out, or when the room is deleted, the token is
  worthless.

The reference client keeps it per browser tab:

```
sessionStorage["pizzuno.seat.<ROOM-CODE>"] = {"name":"Gentrit","token":"9f2c…"}
```

`sessionStorage` is deliberate. The seat survives a page reload, and it dies when
the tab closes. It is never shared with another tab, and it never reaches
`localStorage` (which only holds the player's display name). Every access is
wrapped in `try`/`catch`, because private windows can refuse storage — a client
with no storage still works, it just cannot rejoin after a reload.

---

## Client → server

### Joining

#### `createRoom`

Makes a new room and seats you in it as the host. Sent when the player submits
the "create a table" form.

```json
{ "type": "createRoom", "name": "Gentrit" }
```

| Field | Type | Notes |
| --- | --- | --- |
| `name` | string | Trimmed, whitespace collapsed, cut to **16 characters**. An empty result is refused with `"Enter your name first."` |

Answer: `joined`, then a `state` broadcast.

The server holds at most **2000 rooms**. Beyond that, `createRoom` is refused
with `"The pizzeria is full. Try again in a minute."` `joinRoom` has no such
limit — joining an existing table never makes a new room.

#### `joinRoom`

Takes a seat in an existing room, **or takes back a seat you lost**. Sent when
the player submits the join form, and sent again automatically by `net.js` on
every reconnect.

A fresh join under an unused name:

```json
{ "type": "joinRoom", "name": "Gentrit", "code": "BASIL-4821" }
```

Taking back a seat you already hold:

```json
{
  "type": "joinRoom",
  "name": "Gentrit",
  "code": "BASIL-4821",
  "token": "9f2c41ab7de05836c1904f7ea28bd3e7"
}
```

| Field | Type | Notes |
| --- | --- | --- |
| `name` | string | Same cleaning as `createRoom`. Matched case-insensitively. |
| `code` | string | Trimmed and upper-cased by the server. |
| `token` | string, optional | The seat token from an earlier `joined`. **Required** when the named seat already exists and is disconnected. Omit it for a fresh join. |

Behaviour:

1. If a seat in that room already has the same name (case-insensitive):
   - it belongs to a bot → error `"A chef bot already uses that name."`
   - it is still connected → error `"That name is already at the table."`
     (a token does **not** override this — you cannot evict your own live socket
     by rejoining)
   - it is disconnected and your `token` matches → **you get that seat back**,
     with the hand, the win count and the host role intact. The answer carries
     `reconnected: true` and the same `token` again.
   - it is disconnected and your `token` is missing or wrong → error
     `"That chef is already seated. Pick another name."`
2. Otherwise, if the room is not in the `lobby` phase → error
   `"That round already started. Wait for the next one."`
3. Otherwise, if the room is full (8 seats) → error `"That table is full."`
4. Otherwise a new seat is added, with a new token. Any `token` you sent is
   ignored.

The token is compared as a string, and a missing token is compared as `""`, so a
`null`, an absent key and an empty string all fail the same way. A seat with
`token: null` — that is, a bot seat — is caught earlier by the bot check, so the
comparison never lets a tokenless seat through.

Unknown code → error `"No table has that code."`

If you send `createRoom` or `joinRoom` while you already hold a seat, the server
first treats your old seat as disconnected, then processes the new request.

### Lobby (host only)

All four are refused with an error when the sender is not the host.

#### `addBot`

```json
{ "type": "addBot" }
```

No fields. The server picks a free chef name. Only allowed in the `lobby` phase,
and only while the table has fewer than 8 seats.

#### `removeSeat`

```json
{ "type": "removeSeat", "seatId": "p7-a3k9x" }
```

| Field | Type | Notes |
| --- | --- | --- |
| `seatId` | string | Must be a **bot** seat. Humans cannot be kicked (`"You can only remove chef bots."`). Lobby phase only. |

#### `startGame` / `newRound`

```json
{ "type": "startGame" }
```

```json
{ "type": "newRound" }
```

These two are handled **identically**. Both deal a fresh round. Refused while a
round is running (`"The round is already running."`), and refused when the table
holds fewer than 2 or more than 8 seats.

**Every seat takes part**, including a human who is disconnected but still inside
their 2-minute reconnect grace period. They are dealt a hand, and the away timer
skips their turns until they come back. A seat is only left out of a round once
the grace period runs out and the seat itself is gone.

By convention the client sends `startGame` from the lobby and `newRound` from the
round-over dialog.

#### `backToLobby`

```json
{ "type": "backToLobby" }
```

Throws the game state away and puts the room back into the `lobby` phase. Win
counts on the seats survive.

### Leaving

#### `leaveRoom`

```json
{ "type": "leaveRoom" }
```

Removes your seat for good. Your cards go back into the draw pile and the pile is
shuffled. Answer: `left` to you, then a `state` broadcast to everybody else. The
room is deleted if no human seats remain.

### Game moves

All five are refused with `"The round is not running."` unless the room phase is
`playing`. Each is validated by the rules module; a refusal sends an `error`
**and** a fresh `state` snapshot, so a wrong client display corrects itself.

#### `play`

```json
{ "type": "play", "cardId": "k37" }
```

```json
{ "type": "play", "cardId": "k104", "topping": "cheese" }
```

| Field | Type | Notes |
| --- | --- | --- |
| `cardId` | string | Must be in your hand. |
| `topping` | string, optional | Required for `wild` and `wild4`. One of `pepperoni`, `basil`, `cheese`, `anchovy`. Ignored for other cards. |

Typical errors: `"It is not your turn."`, `"That card is not in your hand."`,
`"<card> does not match."`, `"Choose a topping for that wild card."`,
`"You may only play the card you just drew, or pass."`

#### `draw`

```json
{ "type": "draw" }
```

Takes one card. If the new card is playable, the turn stays open and the next
`state` has `mustPlayDrawnCard: true`. If not, the turn moves on by itself.
Refused with `"Play the drawn card or pass."` when a drawn card is still pending.

#### `pass`

```json
{ "type": "pass" }
```

Gives up the turn after a draw. Refused with
`"You must draw a card before you pass."` when you did not draw first.

#### `pizzuno`

```json
{ "type": "pizzuno" }
```

The shout. Legal with **2 cards or fewer**, at any time in the round, also when
it is not your turn. Errors: `"You have too many cards to call PIZZUNO."`,
`"You already called PIZZUNO."`

#### `callout`

```json
{ "type": "callout", "targetId": "p4-c7m2q" }
```

| Field | Type | Notes |
| --- | --- | --- |
| `targetId` | string | A player id from `game.calloutTargets`. |

The target takes 2 cards. Errors: `"You cannot call out yourself."`,
`"<name> cannot be called out right now."`

A target is callable while `players[].vulnerable` is true and `cardCount` is 1.
The server clears `vulnerable` when the turn **moves to a different seat**. A turn
that comes straight back to the same seat — a skip, a reverse or a +2 at a table
of two — leaves the flag set, so the window stays open. Do not assume in a client
that a change of `turnPlayerId` ends a call-out window; read `calloutTargets`.

### Maintenance

#### `sync`

```json
{ "type": "sync" }
```

Asks for a fresh `state` snapshot, sent only to you. Nothing is broadcast. The
server supports it; the current client never sends it. It is there for a client
that suspects its view has drifted.

---

## Server → client

Only four message types leave the server.

### `joined`

Sent once, to the joining socket, after a successful `createRoom` or `joinRoom`.
A `state` broadcast follows immediately.

```json
{
  "type": "joined",
  "roomCode": "BASIL-4821",
  "youId": "p3-k8fd2",
  "youName": "Gentrit",
  "token": "9f2c41ab7de05836c1904f7ea28bd3e7",
  "reconnected": false
}
```

| Field | Type | Notes |
| --- | --- | --- |
| `roomCode` | string | `WORD-NNNN`, upper case. |
| `youId` | string | Your seat id. Also your player id in the game state. |
| `youName` | string | The **cleaned** name. May differ from what you sent. |
| `token` | string | The **seat token**: 32 lowercase hex characters. See [Seat tokens](#seat-tokens). |
| `reconnected` | boolean | `true` when you took an existing seat back. |

This is the **only** message that carries the token, and it goes to the joining
socket alone. The client stores `youName`, `roomCode` and `token` in `net.js` as
the reconnect credentials, writes the name and token to `sessionStorage`, and
shows a "welcome back" toast when `reconnected` is true.

A client should treat the token as a secret: do not log it, do not put it in a
URL, and do not copy it into anything the player can share. The table code is
shareable; the token is not.

### `state`

The whole world, as one player is allowed to see it. Sent to every seat with an
open socket after any change, and to a single socket after `sync` or after a
refused move.

```json
{
  "type": "state",
  "phase": "playing",
  "roomCode": "BASIL-4821",
  "youId": "p3-k8fd2",
  "youName": "Gentrit",
  "hostId": "p3-k8fd2",
  "isHost": true,
  "minPlayers": 2,
  "maxPlayers": 8,
  "seats": [
    { "id": "p3-k8fd2", "name": "Gentrit", "isBot": false, "connected": true, "wins": 1 },
    { "id": "p4-m2p7x", "name": "Chef Mario", "isBot": true, "connected": true, "wins": 0 }
  ],
  "game": { "…": "see below" }
}
```

| Field | Type | Notes |
| --- | --- | --- |
| `phase` | `"lobby"` \| `"playing"` \| `"roundOver"` | The **room** phase. |
| `roomCode` | string | |
| `youId` | string | The seat this snapshot was built for. |
| `youName` | string \| null | `null` when the seat is gone. |
| `hostId` | string \| null | |
| `isHost` | boolean | Convenience for `hostId === youId`. |
| `minPlayers` | number | 2 |
| `maxPlayers` | number | 8 |
| `seats` | array | Lobby-level seats, in seating order. Holds `wins` across rounds. Exactly five fields per seat — **no `token`**, for any seat, including your own. |
| `game` | object \| null | `null` in the lobby, and after `backToLobby`. |

#### The `game` view

Built by `viewFor(state, playerId)` in `server/game.js`. It holds **your hand
only**. Other hands are a count. No other player's cards are ever sent.

```json
{
  "gameId": "a7f3k2m9",
  "status": "playing",
  "direction": 1,
  "currentTopping": "cheese",
  "topCard": { "id": "k104", "suit": null, "kind": "wild4", "value": null },
  "drawPileCount": 71,
  "discardCount": 8,
  "turnPlayerId": "p4-m2p7x",
  "turnSerial": 14,
  "winnerId": null,
  "players": [
    {
      "id": "p3-k8fd2",
      "name": "Gentrit",
      "isBot": false,
      "connected": true,
      "left": false,
      "cardCount": 2,
      "declaredPizzuno": false,
      "vulnerable": false
    }
  ],
  "hand": [
    { "id": "k12", "suit": "pepperoni", "kind": "number", "value": 7 },
    { "id": "k88", "suit": "basil", "kind": "skip", "value": null }
  ],
  "playableCardIds": ["k12"],
  "mustPlayDrawnCard": false,
  "canPass": false,
  "canDeclarePizzuno": true,
  "calloutTargets": [],
  "log": [
    { "id": 21, "text": "🔥 Gentrit slammed down a Burnt Slice!", "ts": 1754400000000 }
  ]
}
```

| Field | Type | Notes |
| --- | --- | --- |
| `gameId` | string | New for every round. The client resets its log when this changes. |
| `status` | `"playing"` \| `"roundOver"` | The **game** status. Can be `roundOver` while the room phase is still catching up in the same tick. |
| `direction` | `1` \| `-1` | `1` = to the left. |
| `currentTopping` | topping key | The topping that must be matched. **Not** always the top card's suit. |
| `topCard` | card \| null | |
| `drawPileCount` | number | |
| `discardCount` | number | |
| `turnPlayerId` | string \| null | `null` when the round is over. |
| `turnSerial` | number | Grows on every turn change. Useful for turn timers and for ignoring stale views. |
| `winnerId` | string \| null | |
| `players` | array | Game seats in turn order, **including** players who left (`left: true`). |
| `hand` | array of card | Your cards. Empty when you are not in this round. |
| `playableCardIds` | array of string | Already filtered for the turn and for a pending drawn card. The client only needs to obey it. |
| `mustPlayDrawnCard` | boolean | You drew a playable card. Only that card is legal. |
| `canPass` | boolean | Same condition as above, in the current code. |
| `canDeclarePizzuno` | boolean | Round is live, you hold ≤ 2 cards, and you have not shouted. |
| `calloutTargets` | array of string | Player ids you may call out right now. |
| `log` | array | The last **30** entries. `id` counts up for the whole round, so a client can append only what is new. `ts` is server `Date.now()`. |

#### The card object

```json
{ "id": "k37", "suit": "basil", "kind": "draw2", "value": null }
```

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | Unique inside one round (`k0` … `k107`). |
| `suit` | `"pepperoni"` \| `"basil"` \| `"cheese"` \| `"anchovy"` \| `null` | `null` for wild cards. |
| `kind` | `"number"` \| `"skip"` \| `"reverse"` \| `"draw2"` \| `"wild"` \| `"wild4"` | |
| `value` | number 0–9 \| null | `null` for every non-number card. |

### `left`

Sent to the leaving socket only, as the answer to `leaveRoom`.

```json
{ "type": "left" }
```

The client forgets its reconnect credentials, clears the view and goes back to
the home screen.

### `error`

A human-readable refusal. Never fatal at the transport level — the socket stays
open.

```json
{ "type": "error", "message": "It is not your turn." }
```

| Field | Type | Notes |
| --- | --- | --- |
| `message` | string | Shown to the player as a toast, word for word. |

After a refused **game move**, the server sends `error` and then a full `state`
snapshot to the same socket, so the client display returns to the truth.

If the client receives an `error` while it holds **no** snapshot, it reads that as
a failed reconnect: it forgets its credentials and shows the home screen.

---

## Connection and reconnect flow

### First join

```
client                                   server
  │  open ws://host/                       │
  │─────────────────────────────────────►  │
  │  {type:"createRoom", name:"Gentrit"}   │
  │─────────────────────────────────────►  │
  │  {type:"joined", roomCode:"BASIL-4821",│
  │   youId:"p3-…", youName:"Gentrit",     │
  │   token:"9f2c…", reconnected:false}    │
  │  ◄─────────────────────────────────────│
  │  {type:"state", phase:"lobby", …}      │
  │  ◄─────────────────────────────────────│
```

The client calls `net.remember(youName, roomCode, token)` when `joined` arrives.
That writes the credentials into the `Connection` and mirrors the name and token
into `sessionStorage` under `pizzuno.seat.<ROOM-CODE>`.

A player who reloads the page has lost the in-memory `Connection`, so the client
reads the token back out of `sessionStorage` when the join form is submitted:

```js
send({ type: 'joinRoom', name, code, token: net.storedToken(code) });
```

`storedToken()` returns `undefined` when this tab has no seat at that table, and
the key then disappears from the JSON — which is exactly what a fresh join
should look like.

### While the socket is down

`net.js` queues anything you `send()` and flushes the queue in order when the
socket opens again.

### Reconnect

On `close`, and only when the player did not leave on purpose, `net.js` waits and
reconnects. The retry ladder is **500 ms, 1 s, 2 s, 3 s, 5 s**, then 5 s for
ever. A successful open resets the ladder to the start.

```
  │  (socket closed)                       │  seat kept, connected:false
  │                                        │  broadcast to the others
  │  … wait 500 ms …                       │
  │  open ws://host/                       │
  │─────────────────────────────────────►  │
  │  {type:"joinRoom", name:"Gentrit",     │  ← sent automatically, before
  │   code:"BASIL-4821"}                   │    the queued messages
  │─────────────────────────────────────►  │
  │  {type:"joined", …, reconnected:true}  │
  │  ◄─────────────────────────────────────│
  │  {type:"state", …}                     │
  │  ◄─────────────────────────────────────│
  │  (queued messages flush)               │
```

Note that the reconnect always sends **`joinRoom`**, never `createRoom` — even
for the host. The host's seat is found by name and returned to them.

Status is reported to the UI through the `onStatus` callback, with one of
`connecting`, `reconnecting`, `open`, `closed`. The client shows a banner for
everything except `open`.

### Server-side timings

| Timer | Value | Effect |
| --- | --- | --- |
| Tick | 250 ms | Drives every timer below. |
| Bot think | 800 ms | Pause before a bot moves. |
| Bot follow-up | 300 ms | Pause after a shout or a call-out, which do not end the turn. |
| Away turn timeout | 12 s | A disconnected player whose turn it is draws 1 card and the turn moves on. |
| Reconnect grace | 120 s | After this the seat is freed and the player is removed from the round. |
| Empty room TTL | 60 s | A room with no connected humans is deleted. |
| Socket heartbeat | 30 s | Ping; a socket that misses a pong is terminated. |

A disconnect in the **lobby** phase removes the seat at once — there is nothing
to come back to. A room with zero human seats is deleted immediately. A
disconnect **during a round** keeps the seat, and the seat is dealt into the next
round as well if the host starts one before the grace period runs out.

### Server-side limits

| Limit | Value | On breach |
| --- | --- | --- |
| Frame size | 16 KiB | The socket is closed (code `1009`). No `error` message. |
| Rooms | 2000 | `createRoom` → `error` `"The pizzeria is full. Try again in a minute."` |
| Seats per room | 8 | `joinRoom` → `"That table is full."`; `addBot` → `"The table is full."` |
| Name length | 16 characters | Silently cut. `joined.youName` carries the result. |

### What a reconnect does **not** restore

Identity is the triple **(room code, cleaned name, seat token)** — see
[Seat tokens](#seat-tokens). Two consequences:

- If the room was deleted while you were away, `joinRoom` fails with
  `"No table has that code."` and the client returns you to the home screen.
- A reconnect into an existing disconnected seat must present that seat's token.
  Without it, the server answers
  `"That chef is already seated. Pick another name."` and the seat, and its hand,
  stay private. The token lives in `sessionStorage`, so it survives a reload but
  dies with the tab; from a different browser, the seat cannot be reclaimed.
  Room codes are still guessable, so treat Pizzuno rooms as unlisted, not as
  secret.

---

## Implementing this protocol behind `net.js`

`public/js/net.js` is the only file in the client that touches a `WebSocket`.
Everything above it — `app.js` and `cards.js` — talks to one small surface:

```js
new Connection({ onMessage, onStatus })   // callbacks
connection.connect()                      // open the link
connection.send(payload)                  // fire-and-forget, queued when down
connection.remember(name, code, token)    // reconnect credentials
connection.storedToken(code)              // token from an earlier visit, or null
connection.forget()                       // drop them
```

`onMessage(message)` receives a parsed object. `onStatus(status)` receives one of
`connecting`, `reconnecting`, `open`, `closed`.

To move Pizzuno onto a hosted backend, write a new module with the **same
members** and keep the message types. Nothing in `app.js` has to change.

### What a replacement must do

1. **Accept the same client messages** and answer with the same four server
   types. `app.js` only ever reads `joined`, `state`, `left` and `error`, and it
   ignores anything else. That is your room to grow.
2. **Send a full `state` after every change.** The client is a pure renderer. It
   holds no game logic and never patches state. Deltas are not supported.
3. **Keep the snapshot per player.** `hand` and `playableCardIds` are private.
   Never put another player's cards in a payload; the client would happily draw
   them.
4. **Keep `gameId` and `log[].id` monotonic.** The client resets its log when
   `gameId` changes, and appends only entries with an id above the last it saw.
5. **Keep `turnSerial` growing on every turn change.** It is the cheapest way to
   drop a stale view.
6. **Send `joined` before the first `state`.** The client stores its reconnect
   credentials from `joined`.
7. **Re-issue the state after a refused move.** Send `error`, then `state`, to
   the offending socket only.
8. **Honour the same phases and field names.** `phase`, `status`,
   `currentTopping`, `direction`, `cardCount`, `vulnerable` — the renderer reads
   all of them by name.
9. **Clear `vulnerable` on a real change of seat, not on a change of turn.** A
   turn that returns to the same player (a skip or a +2 at a table of two) must
   leave the call-out window open. This is easy to get wrong and it changes how
   the game plays.

### What a replacement may improve

- **Real transport.** A hosted service can use its own SDK, long polling, WebRTC
  data channels, or Server-Sent Events plus HTTP posts. Only `net.js` cares.
- **Real sessions.** The seat-token handshake described in
  [Seat tokens](#seat-tokens) is implemented, and a replacement must reproduce
  it: issue an opaque token in `joined`, require it on a reconnect `joinRoom`
  into a disconnected seat, and never leak it to other clients. A hosted backend
  may go further — real accounts, signed sessions, tokens that survive the tab —
  as long as the `remember(name, code, token)` / `forget()` surface in `net.js`
  keeps working and `app.js` stays unchanged.
- **Delivery guarantees.** The queue in `net.js` is best-effort and in-order, but
  it does not de-duplicate. A backend with at-least-once delivery should give the
  client messages an idempotency key.
- **Persistence.** Rooms live only in server memory today. A hosted backend can
  put them in a store and survive a restart. Nothing in the protocol prevents it.

### Versioning

Version 1 sends no version field. A backend that has to serve mixed clients has
two clean options, and neither breaks the current client:

- Put the version in the URL — `wss://host/v2` — and let old clients keep `/`.
- Add a `protocol` field to `joined`. Old clients ignore unknown fields; a new
  client can read it and adapt.

Adding **new server message types** is always safe, because `app.js` ignores what
it does not know. Adding **new client message types** is safe as long as the
server answers unknown types with `error` and not with a disconnect, which is
what it does today. Renaming or removing an existing field is a breaking change
and needs a new version.
