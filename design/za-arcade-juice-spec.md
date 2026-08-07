# ZA! Arcade — Juice & Retention (distilled from ZA Arcade Juice.dc.html)

Source board: claude.ai/design project, file "ZA Arcade Juice.dc.html".
Nothing here is a rules change; nothing is pay-to-win. Designer's priority:
**09 first** ("worth more than the other thirteen put together"), then 05 + 01,
then 13. **10 (punch card) is explicitly held back** until the loop is fun.

## A · IDLE LIFE
- **01 THE HAND BREATHES (S).** Idle hand cards rise/fall 4px, 3.2s ease-in-out
  infinite, staggered 260ms across the hand. Stops dead the instant it is your
  turn — the stop itself is the signal.
- **02 THE BOTS BLINK (S).** Each bot portrait blinks one frame (scaleY .1,
  steps(1)) on its own prime-ish interval (5s / 7s / 9s + offsets) so they never
  sync. Carmela blinks least — she is watching.
- **03 THE PILOT LIGHT (S).** The oven bloom gradient flickers: keyframes
  `flame` — scaleY 1 → 1.25 @25% → .9 @60%, opacity .8/1/.7 — 2.6s ease-in-out
  infinite. Only ambience layer that animates; still steps brighter per chain link.
- **04 THE NUDGE (S).** After 5s of inaction on YOUR turn, legal cards wobble
  once (rotate -4/4/-2deg over ~360ms of a 4s cycle), repeating every 5s. Never
  suggests a specific card, never shrinks a timer.

## B · THE PLAY
- **05 THE CHEESE PULL (M).** A single 4px cheese strand (--cheese) stretches
  from the hand origin toward the oven as YOUR played card flies, transform-
  origin left, scaleX 0→1, then snaps (opacity→0) at 78% of the flight. One div.
- **06 THE BOX LID (M).** The per-player card counter reads as a pizza box with
  a hinged lid (rotateX, transform-origin top, perspective): closes further as
  the count drops, swings wide open on a +4. Everyone sees closeness without
  reading the number.
- **07 TOPPING CONFETTI (S).** On a win: twelve pieces — pepperoni discs (16px
  circles --sauce), cheese shreds (10×5 --cheese), basil flecks (12px squares
  --basil) — fall 1.2s (translateY -18px→130px, rotate 220deg, linear,
  staggered) over the round-over. Not generic confetti: the pizza coming apart.
- **08 YOUR TURN, LOUDLY (S).** While it is your turn: a ring pings outward from
  your own panel every 1.6s (inset -3px border scale 1→1.5, opacity .9→0), and
  the cabinet bezel warms from --bezel to --cheese.

## C · COMING BACK
- **09 THE WARM LOBBY (M) — TOP PRIORITY.** The round-over screen never dumps
  players to a lobby: "ANOTHER PIE?" hops gently, a 5s bar drains in 5 steps
  (steps(5)), text "STARTS BY ITSELF IN 5", and the next round auto-starts
  unless someone opts out. Nobody has to be the person who suggests one more
  game.
- **10 THE PUNCH CARD (M) — DO NOT BUILD YET** (designer's own note).
- **11 SPECIAL OF THE DAY (S).** A chalkboard (5px #7d5426 border, cabinet-hi
  fill, Kaushan "Today's Special", PS2P gag line) on the home screen with a
  7-entry weekday rotation; `chalk` flicker 5s steps(1). Cosmetic gags only.
- **12 THE WALL OF FAME (S).** Winners get polaroids (cream card, dark photo,
  name) taped to the lobby, swaying ±3deg on 5.6–7.4s offsets, oldest off after
  eight. Social proof, not a leaderboard.
- **13 EARNED NICKNAMES (S).** After each round every player carries a computed
  title into the next: CLEAN PLATE, SLOW HANDS, THE ANCHOVY GUY, BUTTERFINGERS,
  THE SNITCH… shown as a colored chip next to the name.
- **14 THE SHUTTER WIPE (S).** Screen changes: a corrugated shutter
  (repeating-linear-gradient --bezel/--cabinet-hi 7px stripes) rolls down and up
  in six visible steps (steps(6)) covering the existing 170ms cross-fade, with
  "PROOFING THE DOUGH…" while covered.

## Keyframes from the board (values are final)
breathe: 0/100% translateY(0); 50% translateY(-4px)
blinkeye: 0,94,100% scaleY(1); 96% scaleY(.1)
flame: 0/100% scaleY(1) op .8; 25% scaleY(1.25) op 1; 60% scaleY(.9) op .7
pull: 0,25% scaleX(0) op 0; 35% op 1; 70% scaleX(1) op 1; 78→100% scaleX(1) op 0
fall: 0% translateY(-18px) rot 0 op 0; 12% op 1; 100% translateY(130px) rot 220deg op 0
stamp: 0,60% scale(2.4) op 0; 68% scale(1) op 1; 100% scale(1) op 1
shutter: 0,10% translateY(-100%); 40,55% translateY(0); 90,100% translateY(-100%)
wobble: 0,88,100% rot 0; 91% -4deg; 94% 4deg; 97% -2deg
ping: 0% scale(1) op .9; 100% scale(1.5) op 0
lid: 0,55% rotateX(0); 80,100% rotateX(-62deg)
sway: 0/100% rot -3deg; 50% rot 3deg
eat: 0% width 100%; 100% width 0%   (NOTE: width animation — reimplement as scaleX)
chalk: 0,90,100% op 1; 93% op .55
hop: 0,70,100% translateY(0); 78% translateY(-7px); 86% translateY(0)
