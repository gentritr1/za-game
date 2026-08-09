# Paste this into Claude Code

Run it from the root of the `pizzuno` repo.

**The direction is decided: 3A, the stage.** The hire roster becomes a lobby
screen state built around one 192 px portrait. Read the whole prompt before
implementing; the sizes below are the design, not suggestions.

---

## What is wrong today

Every regular owns a two-frame idle — Vito slips a card into his jacket,
Carmela's eyebrow goes up, Paulie shrugs, Pina offers the plate with her eyes
closed, Dominic winks, Ray nods. The art is drawn at 192 px. The roster tile
shows it in a 48 px window.

At 48 px a gesture that is 24 source pixels wide is six pixels of screen. The
flip has nothing to say at that size, so it reads as the tile blinking — motion
without content, which is the one thing the cabinet's two-frame grammar is not
supposed to produce. Nothing is wrong with the timing (1000 ms, `steps(1, end)`,
opacity only) or with the art. The window is too small for what is in it.

The comparison is drawn at three sizes in the design file: 48 reads as flicker,
96 reads as "something moved", 192 reads as the gag. The art has exactly one
true size, and the fix is to show it there.

The rendered work — three arrangements, each at 320 and 1280, with hover, focus,
two-tap touch, the seated state and the Anybody tile all live — is here:

`design_handoff_za_roster/ZA-Player-Select-standalone.html`

Open it and resize the window across 720 px. It is the 3A implementation in
plain HTML/CSS/JS against the existing tokens; lift from it directly.

## What was compared

- **3A — The stage. Build this.** The popover becomes a screen state: one
  192 px stage centred, the tell under it, and the six regulars demoted to a
  filmstrip of index thumbnails that no longer animate at all.
- **3B — The pop-out. Do not build.** Tiles grow to 96 px and the considered
  regular pops out to 192 on a card over the grid. Good at 1280, dead at 320 —
  the pop-out card is wider than the popover it comes from, so previewing hides
  the other five regulars.
- **3C — The booth. Do not build.** A name list left, a stage right. Best of
  the three for comparing six names, but two panes inside a 288 px popover
  leave 120 px for the stage, which is back under the size the flip needs.
  Step 5 takes the one thing worth keeping from it.

3A wins on the only hard constraint in the brief: the action frame must read at
320 px. It is also the only arrangement where previewing never hides the roster,
and it deletes machinery rather than adding it — the `max-height: calc(100dvh -
var(--s6))` cap, the panel's own scrollbar, the `-webkit-scrollbar` rules and
the sticky Cancel with cabinet fill behind it all exist because a 646 px panel
does not fit a landscape phone. A screen state has none of those problems.

Implement in this order, committing after each step:

1. **The roster becomes a screen state.** `buildRoster()` in
   `public/js/app.js` keeps its data and its handlers and loses the popover:
   the panel is `position: fixed; inset: 0; z-index: 22`, filled
   `var(--void)`, a flex column centred both ways, `gap: 12px` and
   `padding: 16px` under 720 px, `gap: 22px` and `padding: 40px` at 720 and
   over. It is still `role="dialog"`, still `aria-label="Hire a chef bot"`,
   and now `aria-modal="true"` — it covers the lobby rather than floating over
   it. The CRT overlay stays above it at z-index 40, unchanged.

   Delete from `public/css/styles.css`: `.popover--roster`'s width,
   `max-height`, `overflow-y`, `overscroll-behavior`, `transform`/scale
   entrance and the three `::-webkit-scrollbar` rules; the
   `.popover--roster > .btn--quiet` sticky block; and the
   `@media (max-width: …)` override that re-centres it. Cancel becomes
   `&#9664; BACK` at top-left: Press Start 2P 12 px, `--text-mute`, hover
   `--cheese`, 44 px minimum hit box, `top: 12px; left: 12px` (24/40 at 720+).

2. **The stage.** A 192 px content window with a 4 px `--cheese` border —
   200 px on the outside — and `box-shadow: 6px 6px 0 rgba(0,0,0,.55)` (8px at
   720+). Both frames are `position: absolute; inset: 0; width/height: 100%;
   object-fit: cover; image-rendering: pixelated`. 192 is the art's native
   size: never scale it up, and never scale it down anywhere except the
   filmstrip.

   The one exception is a short window. At `max-height: 560px` and
   `min-width: 520px` (landscape phone) the screen goes to a wrapping row and
   the stage drops to 152 px — the smallest size at which the six gestures were
   still legible in review. Portrait phones keep 192: 192 + 4 + 4 = 200 fits
   320 px with 60 px to spare.

3. **The flip, unchanged.** `animation: za-idle 1000ms steps(1, end) infinite`
   on frame B only, keyframes `0% { opacity: 0 } 50% { opacity: 1 }
   100% { opacity: 1 }` — the same rule that is on `.roster-tile__portrait--b`
   today, moved to the stage. This stays the only motion idiom on the screen:
   no crossfade, no scale, no slide, nothing on the filmstrip.

   Two additions. On changing regular, restart the animation
   (`style.animation = 'none'`, force reflow, restore) so every chef starts on
   frame A — without it a chef inherits the outgoing chef's phase and opens
   mid-gesture. And preload both frames for all six when the lobby mounts
   (`new Image().src = …`); the first flip of an uncached frame B is currently
   a blank window for one beat.

   Under `prefers-reduced-motion: reduce` the animation does not run and frame
   B is held at `opacity: 1` for a pointer that is on the stage — a swap is a
   state, not a journey. Keep the wording of that comment; it is already in the
   file.

4. **Name, tell, hire.** Under the stage, in order:
   - Name: Press Start 2P, 14 px under 720, 18 px at 720+, `--text`,
     `line-height: 1.4`.
   - Tell: the existing `role="status"` paragraph. VT323 19 px (21 px at
     720+), `--text-dim`, on `--console` with a 3 px `--bezel` border,
     `min-height: 3.1em` reserved so switching regulars never moves the button
     under the cursor. `max-width: 560px`.
   - Hire: `--cheese` fill, `--void` text, Press Start 2P 12 px (14 px at
     720+), `box-shadow: 4px 4px 0 rgba(0,0,0,.5)`, on `:active`
     `translate(2px, 2px)` and a 2 px shadow. Full width under 720,
     `min-width: 260px` at 720+. Label is `HIRE VITO` / `SEND ANYBODY`;
     for a seated regular it is `DOMINIC IS SEATED` and the button is
     `disabled`.

5. **The filmstrip.** Seven index thumbnails, six regulars in `REGULARS` order
   plus Anybody last. They show frame A only and never animate.
   - Under 720: a 4-column grid, `gap: 6px`, cells 44 px tall (touch minimum)
     holding a 40 &times; 36 window. Seven cells wrap to two rows; the grid caps
     at 288 px, which is 320 minus the screen's own padding.
   - 720 and over: a centred row of 72 &times; 72 tiles, `gap: 10px`, with the
     regular's name in VT323 19 px beside the window. That name column is the
     one thing worth taking from 3C, and there is width for it here.
   - Tile chrome: `--cabinet-hi` fill, 3 px `--bezel` border, hover
     `--text-dim`, `:focus-visible` a 3 px `--ui-cyan` outline at 2 px offset.
   - Considered tile: border `--cheese` plus `box-shadow: inset 0 0 0 3px
     var(--cheese)`, and at 720+ a 5 px `--cheese` bar 11 px below the tile.
     Carry it as `aria-current="true"` so the state is not colour-only.
   - Seated: window at `opacity: .4` with `IN` (Press Start 2P 12 px,
     `--text-mute`) across the bottom under 720, `SEATED` at 720+. Still
     focusable, still previews — the tell is the tutorial.
   - Anybody: no portrait, a dashed `--bezel` box with `?` in Press Start 2P.
     Its stage is the same dashed box at 32 px.

6. **Selection: preview and commit are two different acts.** One `select(n)`
   drives the stage, the name, the tell, the button label and
   `aria-current`; `hire()` is the only thing that sends.
   - Mouse: `pointerenter` guarded on `e.pointerType === 'mouse'` previews;
     click hires. Unchanged from today except that hover now feeds the stage.
   - Touch: first tap on a tile previews, a second tap on the same tile hires.
     The guard on `pointerenter` is what makes this work — without it the
     synthesised enter fires with the tap and the first tap hires. The hint line
     under the strip reads `TAP TO PREVIEW &middot; TAP AGAIN TO HIRE` on
     coarse pointers and `&#9664; &#9654; OR HOVER &middot; ENTER TO HIRE`
     otherwise.
   - Keyboard: `focus` on a tile previews, so tabbing gets exactly what
     hovering gets. Left/Right move the selection and move focus with it, Enter
     on a focused tile hires, Escape backs out. At 720+ the two chevrons flanking
     the stage do the same thing for the mouse; they are `aria-label`led
     Previous/Next regular and hidden under 720.
   - Focus on open goes to the first tile, as it does today. The stage shows
     that regular, so the screen is never in a state with nobody considered.

7. **The lobby button.** `Hire a chef bot` now opens a screen rather than a
   panel, so it gets `aria-haspopup="dialog"` and, on close, focus returns to
   it. `openRoster()` keeps its snapshot argument and its seated set; only the
   host element changes — append to `document.body`, not to the button's panel.

8. **What must not change.** `REGULARS` and every `tell` string stay exactly
   as written; the server still owns hiring. `addBot` messages are unchanged.
   No new art: the twelve files in `assets/regulars/` are all this needs, and
   `idleFrame` keeps doing its job — a regular without a `-b.png` simply gets
   a stage that does not flip.

## Checks before you call it done

- 320 &times; 640: stage is 192, nothing scrolls, the filmstrip is two rows of
  44 px targets, and the hire button is reachable without scrolling.
- 1280 &times; 720: one centred column, chevrons live, names beside thumbnails.
- Landscape 720 &times; 400: stage 152, screen still fits without scrolling.
- Tab from the back button through all seven tiles: the stage changes on every
  stop and the tell is announced (`role="status"`).
- Touch: first tap never hires.
- `prefers-reduced-motion`: no flip; frame B holds while the pointer is on the
  stage.
