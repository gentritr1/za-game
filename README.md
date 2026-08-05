# 🍕 Pizzuno

Pizzuno is a pizza parlour that pretends to be a card game. Two to eight chefs
sit around a wooden table and try to empty their hands of toppings. Match by
topping or by number, slam a **Burnt Slice** on the player who annoyed you, and
shout **PIZZUNO!** before you put down your second to last card — because if you
keep quiet, somebody will catch you and hand you two more cards. It runs in the
browser, it needs no account, and it hires chef bots when your friends are slow.

---

## Quick start

You need **Node.js 18 or later**. There is one runtime dependency (`ws`).

```bash
npm install
npm start
```

Then open **http://localhost:3000**.

To use a different port, set the `PORT` environment variable:

```bash
PORT=8080 npm start
```

The server also answers `GET /health` with `{"ok":true,"rooms":<count>}`.

### Get a game going

1. Type your name. It is kept in `localStorage`, so you type it only once.
2. Press **Create a table**. The server gives you a code like `BASIL-4821`.
3. Give the code to your friends. They type their name and the code, then press
   **Join**. You can also send a link with the code in the query string, for
   example `http://localhost:3000/?code=BASIL-4821` — the join field fills in
   by itself.
4. No friends? Press **Hire a chef bot**. Add as many as you need.
5. When two or more chefs are at the table, the host presses **Start**.

Only the host can add bots, remove bots, start the round, start the next round,
and send the table back to the lobby. The host is the first human who sat down.
If the host leaves, the job goes to another connected human.

---

## How to play

### The toppings

Pizzuno has four topping suits in place of colours:

| Topping | Colour | Emoji |
| --- | --- | --- |
| Pepperoni | red | 🍕 |
| Basil | green | 🌿 |
| Cheese | yellow | 🧀 |
| Anchovy | blue | 🐟 |

Colour is never the only signal. Every card also shows an emoji, a corner
symbol, and a text label.

### The deck — 108 cards

Each topping has 25 cards:

- one **0**
- two of each **1** to **9** (18 cards)
- two **Burnt Slice** (skip)
- two **Flip the Pie** (reverse)
- two **Extra Toppings +2**

That is 100 cards. Add four **Chef's Choice** (wild) and four
**The Whole Pie +4** (wild draw four), and the box holds 108.

### The deal

Every player gets **7 cards**. The server turns over one card to start the
discard pile. The first card is always a number card, so nobody loses a turn
before the game begins. Play starts to the left.

### Matching

On your turn, put down one card that agrees with the top of the pile in **one**
of these ways:

- **Same topping** as the topping in play.
- **Same number**, when both your card and the top card are number cards.
- **Same symbol**, when both are action cards — a Burnt Slice goes on any other
  Burnt Slice, whatever the topping.
- **Chef's Choice** or **The Whole Pie +4** — these go on anything.

Note the small print: the topping in play is not always the topping printed on
the top card. After a wild card, the topping in play is the one the chef chose.
While a wild card sits on top, symbol matching is off. Only the chosen topping,
or another wild card, will do.

### The action cards

| Card | Effect |
| --- | --- |
| 🔥 **Burnt Slice** | The next player gets the burnt bit and misses a turn. |
| 🔄 **Flip the Pie** | Play turns around. It now runs the other way. |
| 🫒 **Extra Toppings +2** | The next player takes 2 cards and misses a turn. |
| 👨‍🍳 **Chef's Choice** | You name the topping in play. |
| 🍕 **The Whole Pie +4** | The next player takes 4 cards and misses a turn, and you name the topping. |

With only **two players at the table**, Flip the Pie acts as a skip: you play
again.

### Drawing

Nothing fits? Take one card off the dough pile.

- If the new card fits, you may play **that card only**, or press **Pass** and
  keep it. No other card in your hand is legal at that moment.
- If the new card does not fit, your turn ends by itself.

When the dough pile runs out, the chef kneads the old slices back in: the
discard pile is shuffled and becomes the new draw pile, and only the top card
stays on the table. If there is truly nothing left to deal, the turn just moves
on.

### PIZZUNO!

Press the big **PIZZUNO!** button when you hold **two cards or fewer**. You may
press it at any time in the round, also when it is not your turn.

If you put down your second to last card without a shout, you are open to a
**call-out**. Your name lights up with `FORGOT!` and any other player can press
**Call out**. The penalty is **2 cards**.

The window is short. It closes as soon as:

- somebody calls you out (only once — no double penalty),
- you shout PIZZUNO after all, or
- the turn goes to another chef and then comes back to you.

That last point is exact. The window closes when the turn **really moves to
another seat**. If you put down a Burnt Slice, a Flip the Pie or an Extra
Toppings +2 at a table of two, the turn comes straight back to you — the table
never moved on, so you are still open to a call-out while you play your next
card. Shout, or take your chances.

Careful: if you take cards for any reason and end up with more than one, your
shout is cancelled. You must shout again.

### Winning

Put down your last card and you take the round. The win is checked **before**
the card effect, so a last card that forces a draw still wins — and the player
next to you keeps a clean hand.

If everybody else walks out, the last chef standing wins the round by default.

Wins are counted for the whole table and shown on the scoreboard after each
round. The host can then deal a new round or go back to the lobby.

### Away, and back again

The server is patient with a bad connection:

- The client reconnects by itself and takes the same seat. Your seat is held for
  **2 minutes**.
- **Your seat is yours alone.** When you join, the server gives your browser a
  secret seat token (kept per tab, so it survives a page reload). Getting a
  disconnected seat back requires that token — a stranger who only knows the
  table code and your name is told *"That chef is already seated. Pick another
  name."* See [PROTOCOL.md](PROTOCOL.md) for the handshake.
- If it is your turn while you are away, the table waits **12 seconds**, then
  gives you one card and moves on.
- **You keep your seat in the next round.** If the host deals again while you are
  inside your grace period, you are dealt in as normal. The away timer skips your
  turns until you are back, so the table is never stuck waiting for you.
- A player who drops out of the **lobby** loses the seat at once.
- A room is deleted when no human seats are left, or 60 seconds after the last
  human went away.

---

## Architecture

Pizzuno is deliberately small. One dependency, no build step, no framework.

**The server owns the game.** The client draws state and sends intent. It never
decides if a move is legal. Every action is checked against the authoritative
state, so a modified client cannot cheat. Each player receives a snapshot that
holds their own hand plus public table facts. Other hands are reduced to a card
count, so a hand cannot leak through the wire.

**The rules are a pure module.** `server/game.js` knows nothing about sockets,
rooms or players' connections. It builds the deck, validates every move, and
advances the turn. Each function takes the state first and returns
`{ ok: true, … }` or `{ ok: false, error: '…' }`. It also takes an optional seed,
so a round can be repeated in a test.

**Rooms hold the tables.** `server/rooms.js` keeps the lobbies, the game state,
and the timers. A room has a friendly join code — a pizza word and four digits,
such as `CRUST-1907`. A 250 ms tick drives the bot pauses, the away-player
timeout, the reconnect grace period, and the clean-up of empty rooms.

**The client has one transport module.** `public/js/net.js` is the only file
that touches a `WebSocket`. It holds the retry ladder
(500 ms → 1 s → 2 s → 3 s → 5 s), remembers your name and table code to take the
seat again, and queues messages that you send while the socket is down. Nothing
else in the client knows how the bytes travel. To move Pizzuno onto a hosted
backend, replace this one module with something that speaks the same message
types. See [PROTOCOL.md](PROTOCOL.md).

**Bots are ordinary players.** `server/bot.js` reads the same public state and
its own hand, exactly as a human client does. It has no special access. It
prefers +2, then skip, then reverse, then numbers, and keeps its wild cards for
last. For a wild card it names the topping it holds most of. It also watches its
neighbours for a missed PIZZUNO. Each bot makes up its mind **once per call-out
window**, with a 70 % chance of noticing — so roughly one time in three, a bot
looks the other way and you get away with it.

**There are limits, and they are dull on purpose.** A WebSocket frame is capped at
**16 KiB**; a socket that sends a larger one is closed. The server holds at most
**2000 rooms** at a time, and refuses to make another with
`"The pizzeria is full. Try again in a minute."` Neither limit is reachable by
playing the game.

### File layout

```
pizzuno/
├── package.json          one dependency: ws
├── README.md
├── PROTOCOL.md           the wire protocol
├── ASSET-PROMPTS.md      image prompts for the final card art
├── server/
│   ├── index.js          HTTP + WebSocket server, message routing
│   ├── rooms.js          rooms, join codes, timers, per-player snapshots
│   ├── game.js           pure rules engine (no network knowledge)
│   ├── bot.js            chef bots
│   └── static.js         tiny static file handler
├── public/
│   ├── index.html        all three screens: home, lobby, game
│   ├── css/styles.css    tokens, layout, motion
│   └── js/
│       ├── app.js        renders state, sends intent
│       ├── net.js        the only transport module
│       └── cards.js      the only card renderer
└── test/
    └── rules.test.js     plain assertions, no framework
```

---

## Replacing the card art

Every card on screen comes from `renderCard()` in `public/js/cards.js`. Nothing
else in the client builds card markup. Today the faces are CSS and emoji
placeholders. To use real artwork:

1. Put the PNG files in **`public/assets/cards/`**.
2. Open `public/js/cards.js` and set `USE_IMAGES = true`.

That is the whole job. No game logic changes.

> **Ready-made prompts:** [ASSET-PROMPTS.md](ASSET-PROMPTS.md) holds
> paste-and-go GPT Image 2 prompts for every card and for the ambience textures,
> already matched to the file names below. Start there instead of writing your
> own prompts.

### File naming convention

The path comes from `cardAssetPath()`. The pattern is
`assets/cards/<suit-slug>-<tail>.png`, where the tail is the number, or the slug
of the action.

| Card | File name |
| --- | --- |
| Pepperoni 0 – 9 | `pepperoni-0.png` … `pepperoni-9.png` |
| Basil 0 – 9 | `basil-0.png` … `basil-9.png` |
| Cheese 0 – 9 | `cheese-0.png` … `cheese-9.png` |
| Anchovy 0 – 9 | `anchovy-0.png` … `anchovy-9.png` |
| Burnt Slice | `pepperoni-burnt-slice.png`, `basil-burnt-slice.png`, `cheese-burnt-slice.png`, `anchovy-burnt-slice.png` |
| Flip the Pie | `pepperoni-flip-the-pie.png`, `basil-flip-the-pie.png`, `cheese-flip-the-pie.png`, `anchovy-flip-the-pie.png` |
| Extra Toppings +2 | `pepperoni-extra-toppings.png`, `basil-extra-toppings.png`, `cheese-extra-toppings.png`, `anchovy-extra-toppings.png` |
| Chef's Choice | `wild-chefs-choice.png` |
| The Whole Pie +4 | `wild-whole-pie.png` |
| Card back | `card-back.png` |

That is **55 files**: 40 numbers, 12 actions, 2 wilds and one back. Duplicate
cards share one file, so you need one image per *design*, not one per card in the
108-card deck.

Notes for whoever generates the art:

- The suit slugs are `pepperoni`, `basil`, `cheese`, `anchovy`. The action slugs
  are `burnt-slice`, `flip-the-pie`, `extra-toppings`, `chefs-choice`,
  `whole-pie`. Wild cards use the `wild-` prefix in place of a suit.
- The extension is always `.png`. Change `cardAssetPath()` if you want another
  format.
- One image fills the whole card face. Draw the corner symbols and the label
  into the art itself, because the placeholder markup is not drawn when
  `USE_IMAGES` is true. Screen readers still get the spoken card name from the
  `aria-label`.
- Cards are rendered at three sizes (`hand`, `pile`, `mini`), so keep the art
  legible when it is small.

---

## Design notes

Motion in Pizzuno is meant to be felt, not watched. The rules are written at the
top of `public/css/styles.css` and held in CSS custom properties:

- **Transforms and opacity only.** Nothing animates a layout property. The hand
  fan, the card flight, the seat arc — all `transform`.
- **Fast.** `--d-press: 150ms`, `--d-fast: 160ms`, `--d-mid: 220ms`,
  `--d-slow: 300ms`. Nothing a player triggers takes longer than 300 ms.
- **Strong ease-out, never ease-in.** `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)`
  for entrances and for feedback. `--ease-in-out: cubic-bezier(0.77, 0, 0.175, 1)`
  is used only for movement that goes two ways.
- **Exit is faster than entry.** `--d-exit: 140ms`. A thing that leaves must not
  make you wait.
- **Enter from near, not from nothing.** Entrances start at `scale(0.95)` to
  `scale(0.97)` with opacity 0. Never from `scale(0)`.
- **Press feedback on pointer-down.** Buttons, playable cards, code chips and
  the draw pile all answer the moment you press, not when you let go.
- **Transitions, not keyframes, for anything you cause.** Transitions can be
  interrupted; a player who changes their mind is never blocked. Keyframes are
  used only for ambient signals (the turn ping, the urgent PIZZUNO bob) and for
  the win celebration.
- **The play reads.** When you put down a card, a clone flies from your hand to
  the oven, so you can see where it went.
- **Nothing waits on an animation.** New cards enter with a stagger, capped at
  260 ms, and interaction is live the whole time.
- **`prefers-reduced-motion` is honoured.** Animations collapse to 1 ms,
  transitions to 140 ms, movement becomes a plain fade, and the flying card is
  not drawn at all. Fades stay, because they help you understand what changed.

---

## Testing

```bash
npm test
```

**43 tests**, and none of them need a browser. They cover:

- **The rules module** — deck composition, the deal, matching, every action card,
  the two-player reverse, draws and the recycled pile, the PIZZUNO call-out
  window (including the table-of-two case where it stays open), round end,
  players leaving, and the per-player view.
- **A bot-versus-bot soak** — full rounds played by chef bots alone. Every round
  must end with a winner, and all 108 cards must still be accounted for. This
  catches a rule that deadlocks or loses a card.
- **Room behaviour** — a player inside the reconnect grace period stays in the
  next round, a bot decides once per call-out window rather than once per tick,
  and cleaning up a stale room leaves a live room with the same code alone.
- **Seat tokens** — every human seat gets one, bots get none, the token never
  leaks into a state snapshot, a wrong or missing token cannot take a
  disconnected seat, and the right one restores the same seat and hand.
- **The static file server** — it serves the client, refuses anything above the
  public folder, and answers a NUL byte in the path with an error instead of
  throwing.

There is no test framework — just `node:assert` and a small `test()` helper, so
the dependency list stays at one.

---

Buon appetito. 🍕
