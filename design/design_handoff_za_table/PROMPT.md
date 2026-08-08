# Paste this into Claude Code

Run it from the root of the `pizzuno` repo.

**The direction is decided: 2A the counter, with 2B the queue as its mobile
mode.** Read the whole prompt before implementing anything — steps 6 and 7 have
a branch per arrangement and you are building two of the three.

---

The row of chef panels is already in turn order. `orderedOpponents()` sorts from
the player immediately after you and reverses the whole row on a Flip the Pie.
Left to right is the order of play and it already flips correctly.

Nobody reads it that way, because a row of equal panels reads as a roster. To
answer "whose turn, and who is after them" a player reads the name out of the
marquee and then hunts for the matching panel. The information is on screen and
correct; the visual language throws it away.

The second loss is physical. Every card game played in person has people sitting
around a table with cards in front of them, and that one convention carries turn
order, direction and how close each opponent is to winning without a word of UI.
Our card counts are numerals in a panel, so "Nonna Pina is down to two" is
something you read rather than something you see.

The rendered work — three arrangements, each at 375, 1280 and 2400, each at 2, 4
and 8 players, plus the four seat states, the card-count ladder, the call-out
window, and the handoff and reverse running live — is here:

`design_handoff_za_table/ZA-Opponent-Seating-standalone.html`

Open it in a browser. Every board is drawn at true pixel width, and the three
1280 boards are running on a shared clock: the turn advances every 2.4 s and the
direction reverses every seventh turn, so you can watch the same event in all
three arrangements at once.

## What was drawn, and what is being built

Three arrangements were rendered and compared. **2A is the direction and 2B is
its mobile mode; 2C is not being built.**

- **2A — The counter. Build this.** Chefs sit around a square counter drawn in
  three dashed sides, open at the near edge where your hand already is. Turn
  order is where people are sitting. Direction is a chevron token that walks the
  counter from the chef playing to the chef next. Nothing ever re-sorts.
- **2B — The queue. Build this, as the mobile mode.** Seating is abandoned and
  the order becomes the layout: NOW at the head, NEXT beside it, then 03, 04.
  The strip advances one slot per turn and a conveyor belt underneath scrolls in
  the direction of play.
- **2C — The lazy susan. Do not build.** The seats ride a turntable and the live
  seat is always the station at twelve o'clock. Drawn for comparison; step 7
  names the one thing worth taking from it.

**2A is the direction, and 2B is its mobile mode.** 2A is the only one of the
three where turn order costs nothing to read, because it is furniture rather
than a label; it is the only one where a fan of cards has anywhere to be; and it
deletes code rather than adding it — the row stops re-sorting, the hard swap
goes, and the marquee hands its five chevrons back as width for the turn text.
It does not survive a phone, so under 520 px it hands over to 2B at a single
breakpoint.

Steps 1–5 and 8 are shared: they are the seat, the card object, the three
weights, the call-out target and the breakpoint, and they are identical in the
counter and in the queue. Step 6 is the arrangement and step 7 is what it does
when the turn moves — build the 2A branch and the 2B branch of each, and skip
the 2C branch.

Implement in this order, committing after each step:

1. **The seat stops being a panel and becomes a chef.** `buildSeat()` in
   `public/js/app.js` keeps its parts but drops the bordered card: a seat is a
   portrait, a name plate, and a card object beneath them, with no box around
   the group. The portrait is the existing regular art at 54 px (46 px at seven
   or eight seats, 62 px and 70 px at notches 2 and 3), `image-rendering:
   pixelated`, `object-fit: cover`, and three states of presence — 100 %
   opacity and full saturation when live, 62 % and `saturate(.55)` when idle,
   30 % when `connected` is false. The name plate is Press Start 2P at 11 px
   minimum, filled when the seat is live and outlined when it is not.

2. **The card object.** This is the piece that makes a count physical, and it is
   shared by all three arrangements.
   - **One to seven cards: a literal fan.** One sliver per card, 25 × 35 px at
     notch 1, `transform-origin: 50% 128%`, total spread
     `min(count * 11, 64)` degrees, symmetric about centre. You count the
     slivers without meaning to.
   - **Eight or more: a deck.** A fan of fourteen at opponent scale is mush.
     One card back with two hard offset shadows behind it, plus the numeral.
     The shape says "a lot"; the numeral says how many.
   - **The pizza box is the tray they stand in.** The lid keeps the shipped
     `lidAngle()` map exactly — wide open at −62° on seven or more, all but shut
     at −6° on one — and the two-digit count is printed on the box front, so the
     object and the numeral are one element instead of two competing ones. The
     box is dropped below 40 px of portrait; the numeral then becomes its own
     chip.
   - **One card is the state that matters.** The sliver stands alone, filled
     with a sauce hatch instead of the blue one, sauce keyline, and a 640 ms
     `steps(2, end)` pulse. The box beneath it is filled sauce. This is the most
     dangerous moment in the game and it should be visible from across a room.

3. **Three weights that cannot be confused.** Not one treatment at three
   brightnesses — three different shapes.
   - **NOW** is *enclosed*: a 3 px cheese ring on all four sides, a pool of
     cheese light under the seat, the name plate filled, breathing on the
     existing 2.4 s `seat-breathe`.
   - **NEXT** is *one edge*: a 6 px cheese bar at 62 % opacity on the side play
     is arriving from — the top edge for a chef along the counter's top, the
     outer edge for one down a wall. No ring, no lift, no breathing.
   - **IDLE** is bezel everywhere and a 62 % portrait.
   Because the shapes differ, a player never has to compare two brightnesses to
   work out which is which, and a colourblind player gets the distinction from
   geometry alone.

4. **The seat is the call-out button.** Any chef in `game.calloutTargets` gets
   the sauce ring, the standing card and the pulse, `role="button"`,
   `cursor: pointer`, a `:hover` lift, and a click that sends
   `{type:'callout', targetId}`. The existing CALL OUT button in the hand zone
   stays exactly as it is — same handler, reached two ways, so keyboard and
   screen-reader users lose nothing. On a phone the seat must be a 44 px target
   before the fan is counted.

5. **One number drives everything above.** Compute
   `rank = ((seatIndex - activeIndex) * direction + n * 4) % n` once per render:
   0 is NOW, 1 is NEXT, the rest are idle, and in 2B the same number prints as
   the ordinal chip. Do not derive the states separately in three places.

6. **The arrangement.** *(2A)* Seats are placed from a hand-authored map, one
   short array per opponent count from one to seven, as percentages inside the
   felt with an anchor of top, left or right. A formula stacks chefs on top of
   one another at the ends of the arc; the map does not. The counter is three
   dashed 2 px sides with the near edge open, and it only reaches as far down
   the walls as somebody is actually sitting. One opponent sits at top centre,
   opposite you across the oven — deliberate, not broken.
   *(2B)* Slots sort by `rank` every render. The head of the queue is a fixed
   place on the screen. The strip is content-sized rather than a fixed height —
   the fan is the tallest thing in it and it grows with the notch — and it
   scrolls horizontally past six seats.
   *(2C)* Stations are placed on a circle of radius
   `min(playW * 0.30, arenaH / 2 - portrait * 1.45)`; the second term is what
   stops the chef at six o'clock hanging into the pit. The ring rotates by
   `360 / n * activeIndex`; every seat counter-rotates by the same amount so no
   face ever tilts. You are on the ring: a ring that leaves you off is not the
   turn order.

7. **The handoff and the reverse.** The handoff happens hundreds of times a
   round, so the rule is that almost nothing moves.
   *(2A)* 240 ms. The ring fades off the old seat and onto the new one, 130 ms
   each way on `steps(2, end)`. The token walks one gap on `steps(4, end)`. One
   sliver leaves the played hand and the lid steps one notch shut. The counter,
   the oven, the pit and every other seat hold perfectly still. **The reverse is
   the token turning around and walking the other way** — and that is the whole
   event, because a real table does not re-seat itself when play turns around.
   This deletes the reversal in `orderedOpponents()` and the whole `is-hard-swap`
   path in `renderOpponents()`.
   *(2B)* 240 ms. The strip advances exactly one slot on `steps(3, end)` and the
   chef who played wraps to the tail. The chips renumber on the frame the slide
   lands, with no tween. The reverse re-forms the tail behind the head as a hard
   swap, `steps(2, end)`, 200 ms.
   *(2C)* 300 ms. The ring turns `360 / n` on `steps(4, end)` — four visible
   frames, no glide — and the portraits counter-turn on the same easing. The
   reverse stops the plate and turns it back. It is the strongest reverse of the
   three, and if 2C is dropped this is the thing worth stealing.

8. **375 px and reduced motion.** Below 520 px the counter hands over to the
   queue — one breakpoint, and do not let 2A wrap instead. The phone keeps the
   ordinal chips, the fan, the belt, the enclosed / one-edge distinction and the
   seat-as-button; it drops the pizza box and the counter itself.
   Two things make the handover feel like one game rather than two. **The head
   of the queue is worth three times the room of a seat five places away**: 58 px
   of portrait and a full fan at rank 0, 46 px at rank 1, 34 px and count-only
   after that. And **the strip keeps a 2 px dashed lip along its top** — the
   counter's own edge, seen from closer up. Do not restyle the queue for mobile
   beyond these two things; it is the same component.
   Under `prefers-reduced-motion` the belt stops, the ring does not turn, the
   token jumps rather than walks, and the one-card pulse becomes a static sauce
   ring. Every state stays readable, because the arrangement is carrying the
   meaning and the motion is only confirming it.

## What this needs from the server

Nothing. Every state above comes off the snapshot the client already receives:
`game.players[]` with `name`, `isBot`, `connected`, `cardCount`, `declaredZa`
and `vulnerable`, plus `turnPlayerId`, `direction` and `calloutTargets`. There
is one client-side behaviour change and it is a deletion — `orderedOpponents()`
stops reversing the row on a Flip the Pie. Seats are dealt once per round and
hold their positions for the whole round.

No new art is required either. The six regular portraits, the card back and the
four topping suits cover all three arrangements.

## Rules for the whole job

- The server owns the game. None of this changes a rule, a state shape or the
  wire protocol. If a change seems to require a server change, stop and ask.
- `renderCard()` stays the single source of card markup. The pit and its rib
  mode are untouched, and so is the marquee — the strip itself is settled. If
  you build 2A, the marquee's five chevrons come out and the turn text takes the
  width, because the counter is carrying direction; on 2B and 2C the chase
  stays.
- The cabinet is settled and must not regress. Opponent seating lives inside the
  capped playfield and never spills into the side panels past 1900 px.
- Tokens only, from `za-arcade-tokens.css`. Zero radii, hard offset shadows,
  stepped easing, scanlines on the one fixed overlay.
- 12 px Press Start floor. Card corner indices at 11 px are the one exception.
- Transform and opacity only. Nothing animates a layout property, nothing blurs,
  nothing rounds.
- Ask before adding any dependency. The project has exactly one (`ws`) and
  should keep it.
