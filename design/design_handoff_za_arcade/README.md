# Handoff: ZA! Arcade

## Overview

Pizzuno is being rebranded to **ZA!** and given a single, committed art
direction: a 1980s New York slice joint seen through a CRT arcade cabinet.
Chunky pixel type, hard offset shadows, no rounded corners, scanlines over
everything, and a scoreboard that remembers what you did.

This bundle covers the whole surface: design tokens, the 55-face deck, four
screens on desktop and mobile, nine effects with frame timings and sound cues,
five CSS-only ambience layers, and three gameplay expansions (named bot
regulars, an itemised round-over receipt, and a running gag about anchovies).

None of it changes a game rule, a state shape, or the wire protocol.

## About the design files

The HTML files in this bundle are **design references**, not production code.
They are static boards that show the intended look, layout, spacing and timing.
Do not copy their markup into the app.

The target codebase is the existing `pizzuno` repo: vanilla HTML, CSS and ES
modules, no build step, one runtime dependency (`ws`). Implement the designs in
that environment, using its established patterns — `renderCard()` stays the only
place card markup is built, `net.js` stays the only file that touches a
WebSocket, and `game.js` stays free of any knowledge of the client.

Open the `.dc.html` files in a browser to view them; they render standalone.

## Fidelity

**High fidelity.** Colours, type sizes, border widths, shadow offsets and
animation timings in this document are final and should be matched exactly.
Where a value is not stated, follow the token file rather than inventing one.

---

## 1. Design tokens

Drop-in file: `za-arcade-tokens.css`. Replace the `:root` block in
`public/css/styles.css` with it. Legacy variable names (`--tomato`, `--basil`,
`--mozzarella`, `--ink`, `--wood-lo`, …) are aliased to the new palette, so no
existing selector needs editing.

### Colour

| Token | Hex | Use |
| --- | --- | --- |
| `--sauce` | `#FF2E6B` | Pepperoni suit, active turn, danger |
| `--sauce-hi` | `#FF4D9D` | Hover / emphasis on sauce |
| `--cheese` | `#FFE14D` | Cheese suit, primary buttons, wild keyline |
| `--basil` | `#3DDC7F` | Basil suit, positive states |
| `--anchovy` | `#4D7DFF` | Anchovy suit |
| `--ui-cyan` | `#7DE2FF` | Labels, hints, system text |
| `--void` | `#0D0F1A` | Page background, screen black |
| `--console` | `#080A12` | Log panel, recessed areas |
| `--cabinet` | `#101426` | Panel fill |
| `--cabinet-hi` | `#151B33` | Sprite window, light checker square |
| `--bezel` | `#2A3355` | Every inactive border |
| `--text` | `#E8ECFF` | Body text |
| `--text-dim` | `#96A3C9` | Secondary text |
| `--text-mute` | `#8F9BC4` | Captions, disabled |

Two background colours total: `--void` for the room, `--cabinet` for panels.

### Type

- **Press Start 2P** — display, headings, buttons, card indices and numerals.
  Never below 12px on screen; card corner indices are the one exception at 11px.
- **VT323** — all body copy, labels, the log. Runs small, so the client base
  size goes from 15px to 18px.
- **Kaushan Script** — one flourish per screen, no more. The pizzeria is still
  Italian.

Sizes in use: `--fs-base 18px`, `--fs-label 16px` (uppercase, `.12em` tracking),
`--fs-ui 19px`, `--fs-h2 14px` (Press Start 2P), `--fs-h1 24px`.

### Geometry

- All radii are `0`. Every radius token is zeroed so a stray `var()` cannot
  reintroduce a curve.
- Borders: `--bd-thin 3px` inactive, `--bd-thick 4px` panels and buttons,
  `--bd-card 5px` card keyline.
- Shadows are hard offsets, never blurred: `--sh-card 4px 4px 0 rgba(0,0,0,.50)`,
  `--sh-lift 6px 6px 0 rgba(0,0,0,.55)`, `--sh-panel 8px 8px 0 rgba(0,0,0,.60)`.

### Motion

Durations are unchanged from the current build: `--d-press 150ms`,
`--d-fast 160ms`, `--d-mid 220ms`, `--d-slow 280ms`, `--d-exit 130ms`. New:
`--d-frame 50ms` (one frame at 20fps).

What changes is easing. Pixel movement **steps**, it does not glide:
`--ease-step steps(3, end)` for sprite slams, `--ease-step-5 steps(5, end)` for
countdown bars and chain totals. `--ease-out` and `--ease-in-out` stay for
anything that still needs to be smooth. Under `prefers-reduced-motion` both step
easings fall back to `linear`.

---

## 2. Cards

### Anatomy

Every face is the same box. Only the 5px keyline and the banner change colour.

- **Frame** — `104 × 146` on the reference sheet, rendered at three sizes in the
  app: hand `84px`, pile `96px`, mini `60px` wide, all at ratio 1.4.
  Background `--cabinet`, border `5px solid currentColor`, shadow `--sh-card`.
- **Suit colour** is carried by `currentColor` on the card root, so one class sets
  the keyline, the index and the banner fill together:
  `.card--pepperoni { color: var(--sauce) }` and so on. Wilds use `--cheese`.
- **Corner index** — Press Start 2P 11px, top-left and bottom-right, the second
  rotated 180°.
- **Sprite window** — inset `26px 12px 28px`, background `--cabinet-hi`, `2px`
  dashed border at 20% white. The generated PNG art drops in here. It is the only
  part of the frame that changes between cards, so new art needs no relayout.
- **Banner** — flush to the bottom edge, background `currentColor`, VT323 13px,
  text `--void`.

Nothing scales when the card shrinks: keyline stays 5px, banner stays 13px,
index stays 11px. At `mini` the banner drops out and only the index remains.

### Required code change

In `public/js/cards.js`, the `KINDS` index values must become ASCII:

| Kind | Was | Now |
| --- | --- | --- |
| skip | `⊘` | `X` |
| reverse | `⇄` | `<>` |
| draw2 | `+2` | `+2` |
| wild | `★` | `*` |
| wild4 | `+4` | `+4` |

Press Start 2P has no glyph for `⊘ ⇄ ★`; they render as tofu boxes.

### Art

55 files, unchanged names and locations (`public/assets/cards/`, 5:7 PNG). The
existing `cardAssetPath()` convention stands. Regenerating the art in the arcade
style is a separate task and is **not** part of this implementation.

---

## 3. Screens

Structure and element IDs in `public/index.html` stay as they are. This is a
styling pass. Reference: `ZA Arcade Kit.dc.html`, section 03.

### Home

Centred column. Kaushan Script eyebrow ("Sal's Original"), then the wordmark in
Press Start 2P at 64px with a two-step shadow (`7px 7px 0 --sauce`,
`14px 14px 0 rgba(0,0,0,.65)`), then a cyan tagline in VT323 19px with `.2em`
tracking. Form below at 460px wide: name field (`--cabinet` fill, 4px `--bezel`
border, blinking cyan caret), a full-width `--cheese` primary button with 4px
`--void` border and `6px 6px 0` shadow, a rule-and-label divider, then the join
row. Bottom of the frame carries a blinking "INSERT 25¢ — HI-SCORE" line.

Mobile: same order, single column, 18px side padding, buttons full width.

### Lobby

Player-select screen. Table code in a `--cheese`-bordered plate with the code in
Press Start 2P 22px. Seats in a 4-column grid: filled seats are `--cabinet`
panels with a 44px avatar and a status word (`HOST`, `READY`, `CPU`); empty seats
are dashed `--bezel` with a blinking "PRESS START". Console log below, then the
action row — "HIRE A CHEF BOT" as a cyan outline button, "BAKE IT!" as the
`--cheese` primary. Frame is 580px tall; the content stack does not fit in 520.

### Game table

Left column (186px, fixed): CHEFS list, one panel per player, the active player
inverted (`--sauce` fill, `--cheese` border). A player in a call-out window gets
a dashed `--sauce` border, a buzzing name at 700ms, and a chunky countdown bar.
Below that, SCORE and RND side by side in one row — they do not fit stacked.

Centre: draw pile (checkered back), discard pile with two offset cards behind it,
and the IN PLAY badge. Under them, the console log.

Bottom: the action bar, 211px tall — ZA! in Press Start 2P on `--cheese`, CALL
OUT on `--sauce`, KEEP & PASS as an outline, and the hand centred below at 84px
per card, 8px gaps. Playable cards lift 12px with a 3px `--cheese` ring; dead
cards drop to 40% opacity.

The log and the left column must both clear the action bar — pin them to
`bottom: 222px`.

Mobile: HUD bar, opponent chips in a row, piles centred, a one-line log, then
ZA!/CALL as a 48px-tall pair, then the hand. Hit targets never below 44px.

### Round over

Full-frame checker background at 40px tiles, 70% opacity. Centred dialog,
`--cabinet` fill, 5px `--cheese` border, `10px 10px 0` shadow. Title in Press
Start 2P 24px with a `--sauce` offset shadow, a Kaushan Script flourish, then the
scoreboard rows — first place gets a `--cheese` border, a caught player gets a
dashed `--sauce` one. See section 6B: this screen becomes the receipt.

---

## 4. Effects

All nine are in `ZA Arcade Kit.dc.html`, section 04, with frames drawn out.
Transform and opacity only. Under `prefers-reduced-motion`, movement becomes a
plain fade, as the current stylesheet already does.

**A · The chain** (`+2` on `+2`, `+4` on `+4` — the most important moment in the
game). Frame 1 at 0ms: card lands at `scale(1.35)`, no rotation, screen shakes
4px for two frames. Frame 2 at 100ms: the running total replaces the card value,
combo stamp (`x2`) appears top-right of the pile. Frame 3 at 200ms: at `x4` the
cabinet border flashes. Frame 4 at 380ms: a "PENALTY n" banner slides across the
victim's panel, then n cards fly in, one per frame. Sound: 8-bit coin stack
pitched an octave up per link, then a four-note descending run on resolve. The
oven bloom brightens one step per link.

**B · The shout.** Three frames, 150ms total, `steps(3, end)`: small, huge,
settled — no tween between them. Pixel starburst behind frame 2 only. It fires
from the ZA! button, not the centre of the screen. Under 800ms from playing the
card earns `PERFECT! +500`; slower but valid earns `OK +100`; a missed window
shows a grey `TOO SLOW`. Sound: power-up chime then a deliberately clipped crowd
"ZA!" sample.

**C · The catch.** 3.0s window drained in five visible steps (`--ease-step-5`) —
countable out loud, not a smooth drain. The guilty name buzzes at 600ms. Every
other seat's CALL OUT button goes live at the same instant, so it is a race
between players. Winner gets `GOTCHA +250` naming the catcher; everyone else gets
a grey `TOO LATE`. Sound: one rising timer beep per step, buzzer on the catch,
and a small relieved chime only the guilty player hears if the window closes
clean.

**D · Card flight.** A clone crosses from hand to oven in five visible jumps over
220ms — no smooth arc. The hand closes the gap afterwards, not during. Sound:
short pitched blip per step.

**E · Burnt slice.** The skipped seat's panel goes greyscale for 400ms with
`SKIPPED` stamped over it. Smoke is three pixel puffs, one per frame. Sound:
sizzle into a flat buzz.

**F · Flip the pie.** The chef panel order reverses with a hard swap, no
animation between. The HUD direction arrow flips and flashes cyan twice. Sound:
tape-rewind scrub, 200ms.

**G · Draw from dough.** Press feedback on pointer-down: the pile drops 3px and
its shadow collapses. The new card arrives face-up at the right end of the hand,
then dead cards dim. Sound: dry card snap.

**H · Chef's choice picker.** Four chunky buttons, one per suit, in the suit
colours, entering as a 2×2 grid at `scale(0.97)`. The pick recolours the IN PLAY
badge instantly. Sound: menu blip, confirm ding.

**I · Win celebration.** The only effect allowed over 300ms. Checker background
scrolls one tile per frame for 1.2s while the scoreboard types in, one row per
120ms. Sound: four-bar victory jingle, deliberately too long.

---

## 5. Ambience

All CSS, no image assets. Stack order, bottom to top:

1. `--void` flat fill — the room is off.
2. `--oven` — radial orange at 26% opacity, centred on the discard pile.
   Brightens one step per chain link. The only ambience that ever animates.
3. `--checker` — 22px conic checker. Card backs and the win screen only.
4. `--bloom` — static cyan haze at the tube centre. Never animated.
5. `--scanline` on one fixed `.crt-overlay` div: `position: fixed; inset: 0;
   z-index: 40; pointer-events: none;` and `aria-hidden`. It sits above the table
   and below dialogs, so a modal stays crisp.

Adding that one div is the entire ambience implementation.

---

## 6. Expansions

### 6A · The Regulars

Six named bots replace "Chef Bot 1". Same AI — each gets a portrait, one
catchphrase, and a visible **tell**.

Add to `server/bot.js`:

```js
const REGULARS = [
  { id: 'vito',    name: 'Vito',       line: "I'm saving it.",
    notice: 0.70, pause: [800, 1000],  bias: { hoardWildsUntil: 3 } },
  { id: 'carmela', name: 'Carmela',    line: 'I saw that.',
    notice: 0.95, pause: [500, 700],   bias: {} },
  { id: 'paulie',  name: 'Big Paulie', line: '...eh.',
    notice: 0.60, pause: [1900, 2500], bias: { preferDraw2: true } },
  { id: 'pina',    name: 'Nonna Pina', line: 'Eat, eat.',
    notice: 0.40, pause: [1200, 1600], bias: { avoidAttacks: true } },
  { id: 'dominic', name: 'Dominic',    line: 'Bada-bing.',
    notice: 0.55, pause: [600, 800],   bias: { playHighest: true } },
  { id: 'ray',     name: 'Ray',        line: 'later',
    notice: 0.50, pause: [250, 400],   bias: {} },
];
```

The bot already has a fixed 70% notice chance and a pause range; both become
per-regular fields. `bias` only reorders the move preference list the bot already
builds — no new AI, and the bot-versus-bot soak test must still pass.

**Hire flow.** The "Hire a chef bot" button opens a roster: five portrait tiles
plus an ANYBODY tile for a random pick. Already-seated regulars grey out at 45%
with a `SEATED` label. A description line under the roster changes on hover —
that is the only tutorial the bots need.

**In the chef panel.** One status word per bot, driven by state already
published: `THINKING` while their pause runs, `WATCHING YOU` in `--sauce-hi`
buzzing at 700ms while your call-out window is open. It is a warning, and it is
fair.

**In the log.** The catchphrase prints on their signature move only — Vito on a
wild, Carmela on a catch, Pina on a low number. Silent everywhere else, so the
line never wears out.

Assets needed: six 96×96 portraits, same generator and style as the card art.
Until they exist, use the sprite-window placeholder treatment.

### 6B · The Receipt

The round-over screen prints each player an itemised receipt of their own
suffering. Cream paper (`--text` fill, `--void` ink), dashed rules, VT323 17px,
Press Start 2P 10px for the header and the total. `7px 7px 0` shadow. Receipts
print left to right, 120ms apart.

Line-item catalogue — every line maps to an event the round already emits:

| Event | Line | Cost |
| --- | --- | --- |
| card played | `n CARD NAME` | 0 |
| drew penalty | `1 EXTRA TOPPINGS` | 2 |
| wild4 eaten | `1 WHOLE PIE EATEN` | 4 |
| called out | `FORGOT TO SHOUT ×n` | 2n |
| drew, no play | `DREW ON A DEAD TURN` | 1 each |
| anchovy played | `ANCHOVY PLAYED ×n` | 0 |
| winner | *no costs* | — |

`OWED` is not a new score. It is the number of cards that player was forced to
take this round — a count you already have — printed as a bill.

Footer copy by outcome:

- won — `ON THE HOUSE`
- owed 1–5 — `GRAZIE · COME AGAIN`
- owed 6–11 — `NO REFUNDS`
- owed 12+ — `PLEASE SETTLE UP FRONT`
- caught twice — `WE HEARD NOTHING`
- CPU — the bot's own catchphrase

On mobile receipts stack vertically, one per swipe, and yours is always first
regardless of placing.

### 6C · The Anchovy Problem

Zero rules change, client-side only. The server never needs to know the crowd has
opinions.

Frame 1 (0ms): the anchovy card lands normally, nothing signals what is coming.
Frame 2 (120ms): crowd boo sample, 400ms, `BOOOOO` stamped over the pile in Press
Start 2P `--sauce-hi`, the whole frame shoves 4px left. Frame 3 (520ms): one log
line — `> RAY PLAYS ANCHOVY 6. THE ROOM DISAGREES.` — and it is over. No delay to
play.

Escalation within a round: first anchovy gets one voice, almost polite; second
gets the whole room and a longer sample; third adds a single slow clap; fourth
and after get **silence**. Nobody boos any more, which is worse. Resets each
round.

End-of-round badge: `ANCHOVY LOVER`, awarded to whoever played the most, printed
on their receipt at cost 0.

Sound and accessibility: three samples at 400 / 700 / 900ms plus one slow clap,
ducked under any effect sound already playing so the boo never masks the chain.
Muted, the stamp and the shove carry it alone — nothing about the round is
communicated by sound only. Under `prefers-reduced-motion` there is no shove; the
stamp cross-fades in place.

---

## 7. Constraints

- **The server owns the game.** None of this changes a rule, a state shape, or
  the wire protocol. If something seems to require one, stop and ask.
- **One dependency.** The project has `ws` and should keep it. Ask before adding
  anything.
- **No build step.** Vanilla HTML, CSS and ES modules.
- **`renderCard()` stays the only place card markup is built.**
- **`npm test` must pass**, including the bot-versus-bot soak and the room tests.
- Motion is transform and opacity only. Nothing animates a layout property.

## 8. Files in this bundle

| File | What it is |
| --- | --- |
| `PROMPT.md` | The instruction to paste into Claude Code |
| `README.md` | This document |
| `za-arcade-tokens.css` | Drop-in replacement for the `:root` block |
| `ZA Arcade Kit.dc.html` | Design reference — tokens, 55 faces, screens, effects, ambience, expansions |
| `ZA Arcade Experiments.dc.html` | Twelve concept tiles; three of them (01, 03, 09) became section 06 of the kit |
| `ZA Directions.dc.html` | The three original directions, for context on what was rejected |
| `support.js` | Runtime needed to open the `.dc.html` files in a browser |

## 9. Not in scope

- Regenerating the 55 card sprites and the 6 bot portraits in the arcade style.
- Mobile layouts for lobby and round-over.
- Sound asset production. Cues are specified; the files do not exist yet.
