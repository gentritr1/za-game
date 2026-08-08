# Paste this into Claude Code

Run it from the root of the `pizzuno` repo.

**Read the first section before implementing anything: one direction has to be
chosen first, and steps 5 and 6 depend on which.**

---

Two problems, one cause. At 2000px the table is a small island of 84px cards in
a field of `--void`, and the top bar is three unrelated things — room code,
marquee, direction, sound, leave — sharing one strip. The notch steps we
shipped (1600px and 2200px, cards 84/100/116, base 18/20/22) make everything
bigger. They do not make the screen designed.

The rendered work — three directions, each at 1280, 1700 and 2400, each with
its own marquee in all three moments, plus the chain / shout / win reactions —
is here:

`design_handoff_za_cabinet/ZA-Cabinet-At-Every-Size-standalone.html`

Open it in a browser. Every board in it is drawn at true pixel width and scaled
down to fit, so the densities are honest.

## Choose the direction first

- **1A — The literal cabinet.** Past 1900px the playfield stops growing and the
  remaining width becomes cabinet: side panels carrying the vertical ZA!
  marquee, the wall of fame, the chalkboard special, and two art windows. The
  game stays dense; the monitor fills with pizzeria.
- **1B — The table grows, not the UI.** Chrome pinned at notch sizes, felt takes
  the room: oven presence 320 → 700px, spent cards drifting around its mouth,
  chef panels going from 16px of air to 64px.
- **1C — Spectator furniture.** The log is promoted to a house column
  (268 → 356 → 560px) carrying the regulars' catchphrases as speech bubbles and
  a receipt that prints during play. The playfield keeps its notch size.

Steps 1–4 and 7 are the same whichever you pick. Step 5 is the direction. Step 6
is what that direction does when something happens.

Implement in this order, committing after each step:

1. **The marquee absorbs the direction indicator.** In `index.html`, the
   `.hud__dir` element comes out entirely and `#turn-banner` becomes
   `.marquee` — a three-part strip: wordmark at left, turn text centred,
   direction at right as five `▸` glyphs. The chase is five spans sharing one
   `@keyframes za-chase` (`0%,40% {opacity:1} 41%,100% {opacity:.18}`) at
   `900ms steps(1,end) infinite`, each offset `180ms` further than the last.
   Reverse flips the delay order, not the glyph — the chase runs the other way
   and no word is needed. Opacity only; nothing moves.

2. **Type scale for the marquee.** Turn text is 14px at notch 1, 16px at notch
   2, 18px at notch 3; the wordmark runs 4–6px larger than the turn text
   depending on direction. The strip's height is set by padding, not by the
   font, so a flavour-line swap never reflows the row. The turn text keeps its
   existing single-line ellipsis — `play it or pass` and `your turn, chef` must
   both fit at 14px in the 375px wrapped row, which is what the ellipsis is
   protecting.

3. **Utilities off the top edge.** Room code, sound and leave leave the HUD and
   become three bezel screws on a rail at the bottom of the shell: a 19px head
   (`#151b33` on a 3px `--bezel` border) with an 11×3px `--ui-cyan` slot
   rotated per control, and a VT323 label beside it at `--fs-label`. They keep
   their current handlers and their current `aria-label`s; only the position
   and the skin change. On 1C this is not cosmetic — nothing identifying the
   room should sit in the strip a stream is cropping.

4. **The shell.** Wrap `.screen--game` in a shell that owns the width policy:
   a `--play-max` custom property, `1900px` on 1A and `none` on 1B and 1C, and
   `--panel-w` computed as `max(0, (100vw - var(--play-max)) / 2)`. Nothing
   below the shell reads `100vw` any more. Notch media queries stay exactly as
   they are — this sits on top of them.

   The shell and everything under it must be `box-sizing: border-box`. The
   panels carry 26px of padding and the play column carries 5px borders; under
   content-box the arithmetic overruns the viewport by 84px at 2400 and the
   right panel is the part that goes off-screen. Verify the sum before moving
   on: `panel-w * 2 + play-max` must equal the viewport exactly.

5. **The direction's chrome.** *(1A)* Side panels render only when `--panel-w`
   exceeds 200px, and hold, top to bottom: the vertical wordmark, the wall of
   fame from the existing scores, the chalkboard special, and one art window
   per side sized `panel-w × panel-w * 1.33`. Art is a dashed placeholder until
   the assets exist; the prompts are in `ART.md` next to this file.
   *(1B)* The oven's field grows with the notch and the discard's last six
   cards render as drifted siblings at 62% scale, 45% opacity, rotations under
   22°, positioned once per play and never re-randomised on re-render.
   *(1C)* The house column replaces `.log`, keeping the same feed; each entry
   with a speaker renders as an avatar plus a bubble, and the receipt is the
   round's play list on a paper card, printing a line per play.

6. **What the chrome does when something happens.** A chain raises the oven
   glow from `.20` to `.38` alpha and plants a chain total beside the oven; a
   shout puts `ZA!` across the playfield at 64/84/120px by notch; a win takes
   the direction's own furniture — 1A prints the winner on the right panel, 1B
   clears the felt to the oven, 1C makes the receipt the scoreboard. All three
   are transform and opacity, and all three are additive: the board underneath
   does not move.

7. **375px and reduced motion.** The mobile HUD keeps wrapping the marquee onto
   its own row — that already works and does not change. The screws stack into
   the existing bottom row. Under `prefers-reduced-motion` the chase stops dead
   and direction falls back to the static arrow that ships today, the glow
   deltas apply instantly, and the shout appears without travel. Everything
   stays readable, because the layout carries the meaning.

Rules for the whole job:

- The server owns the game. None of this changes a rule, a state shape, or the
  wire protocol. Every state in the rendered board is derived from the snapshot
  the client already receives. If a change seems to require a server change,
  stop and ask.
- `renderCard()` stays the single source of card markup. The pit and its rib
  mode, shipped in the previous handoff, are untouched by all of this.
- Tokens only, from `za-arcade-tokens.css`. Zero radii, hard offset shadows,
  stepped easing, scanlines on the one fixed overlay.
- 12px Press Start floor. Card corner indices at 11px are the one exception.
- Transform and opacity only. Nothing animates a layout property, nothing
  blurs, nothing rounds.
- Ask before adding any dependency. The project has exactly one (`ws`) and
  should keep it.

---

## As shipped — the shell's cap is gated behind a length

Step 4's arithmetic — `--play-max` parked at `none`,
`--panel-w: max(0, (100vw - var(--play-max)) / 2)` — cannot ship literally:
`max()` needs `0px` rather than a bare `0` beside a length, and a `calc()`
over `none` is invalid, while a custom property that is present but unusable
never triggers `var()` fallback, so consumers would silently compute `auto`.
The shipped shell keeps `--play-max` as the statement of intent and gates the
arithmetic behind `--play-cap`, the cap expressed as a length (`100vw` while
uncapped): `--panel-w: max(0px, (100vw - var(--play-cap)) / 2)`. The identity
`panel-w * 2 + play-cap = 100vw` holds exactly on both sides of the cabinet
step; a direction that caps the playfield sets both properties. Full
reasoning in `PROMPT-marquee.md`'s matching section.
