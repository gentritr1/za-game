# Paste this into Claude Code

Run it from the root of the `pizzuno` repo.

This is the settled half of the HUD work: the marquee, the utilities, and the
shell arithmetic under them. The big-screen direction — 1A cabinet, 1B table,
1C spectator — is **not** decided yet, so nothing here draws side panels, felt
expansion or a house column. Build this first; the direction lands on top of it
without changing any of it.

Reference render (the marquee's three moments are the top of each column):
`design_handoff_za_cabinet/ZA-Cabinet-At-Every-Size-standalone.html`

---

The top bar is three unrelated things sharing one strip: room code, the
full-width turn marquee, direction, sound, leave. The marquee is the loudest
and the best of them; everything to its right is clutter competing with it. The
fix is to let the marquee carry the direction too — the way a real cabinet
header does — and move the utilities off the top edge entirely.

Implement in this order, committing after each step:

1. **The marquee absorbs the direction indicator.** In `index.html`, delete
   `.hud__dir` (`#dir-indicator`, `#dir-arrow`, `#dir-text`) and rebuild
   `#turn-banner` as a three-part strip: wordmark `ZA!` at left, turn text
   centred, direction at right as five `▸` spans. Keep the element's
   `role="status"` and `aria-live="polite"` exactly as they are; the direction
   gets its own visually-hidden text node so removing the words does not
   remove the announcement.

2. **The chase.** The five chevrons share one keyframe —
   `@keyframes za-chase { 0%, 40% { opacity: 1 } 41%, 100% { opacity: .18 } }`
   at `900ms steps(1, end) infinite` — each offset `180ms` further than the
   last. A reverse flips the delay order, not the glyph: the chase runs the
   other way and no word is needed. Opacity only, stepped; nothing moves and
   nothing fades smoothly.

3. **The three moments.** Waiting is `--cabinet` fill, `--bezel` border,
   `--ui-cyan` text, chevrons at `--ui-cyan`. Your turn floods:
   `linear-gradient(180deg, var(--cheese-hi), var(--cheese))`, `--void` text,
   `--cheese` border, chevrons at `rgba(13,15,26,.75)`. The call-out window is
   `--sauce` fill with a `--cheese` border and `--void` text — the only moment
   that borrows the alarm colour, so it must not also be the only moment that
   moves. All three are the same height; only fill, border and text colour
   change, so a swap never reflows the row.

4. **Type scale.** Turn text is 14px at notch 1, 16px at notch 2, 18px at notch
   3. The wordmark runs 4–6px larger. The strip's height comes from padding,
   never from the font, so the flavour-line rotation ("Your turn, chef" / "play
   it or pass") cannot change the layout. Keep the existing single-line
   ellipsis on the turn text — that is what protects the 375px wrapped row at
   14px.

5. **Utilities off the top edge.** Room code, sound and leave come out of the
   HUD and become three bezel screws on a rail below the hand: a 19px head
   (`#151b33`, 3px `--bezel` border) with an 11×3px `--ui-cyan` slot rotated
   per control — 0° code, 45° sound, 90° leave — and a VT323 label beside it at
   `--fs-label`. They keep their current handlers, their current `aria-label`s
   and the copy-confirmation behaviour on the code chip. Only position and skin
   change.

6. **The shell.** Wrap `.screen--game` in a shell that owns the width policy: a
   `--play-max` custom property (`none` for now — the direction sets it later)
   and `--panel-w: max(0, (100vw - var(--play-max)) / 2)`. Nothing below the
   shell reads `100vw` any more. The shell and everything under it must be
   `box-sizing: border-box`; under content-box the panel padding and the play
   column's borders add on top of the declared widths and overrun the viewport
   by 84px at 2400. Assert it before moving on: `panel-w * 2 + play-max` must
   equal the viewport exactly. Existing notch media queries are unchanged —
   this sits on top of them.

7. **375px and reduced motion.** The mobile HUD keeps wrapping the marquee onto
   its own row; that already works and does not change. The screws stack into
   the existing bottom row. Under `prefers-reduced-motion` the chase stops dead
   and direction falls back to the static arrow that ships today. Direction is
   never conveyed by animation alone.

Rules for the whole job:

- The server owns the game. None of this changes a rule, a state shape, or the
  wire protocol. If a change seems to require a server change, stop and ask.
- Tokens only, from `za-arcade-tokens.css`. Zero radii, hard offset shadows,
  stepped easing, scanlines on the one fixed overlay.
- 12px Press Start floor. Card corner indices at 11px are the one exception.
- Transform and opacity only. Nothing animates a layout property, nothing
  blurs, nothing rounds.
- The pit and its rib mode, shipped in the previous handoff, are untouched.
- Ask before adding any dependency. The project has exactly one (`ws`).

---

## As shipped — the shell's cap is gated behind a length

Step 6 as received parks `--play-max` at `none` and derives
`--panel-w: max(0, (100vw - var(--play-max)) / 2)`. That arithmetic cannot
ship literally, twice over: `max()` needs `0px`, not a bare `0`, when its
other branch is a length; and a `calc()` whose input is `none` is invalid —
worse, a custom property that is *present but unusable* never triggers
`var()` fallback, so every consumer would silently compute `auto` rather
than `0px`.

The shipped shell therefore splits the cap in two: `--play-max: none` stays
as the statement of intent the direction step flips, and the arithmetic is
gated behind `--play-cap`, the same cap expressed as a length — `100vw`
while uncapped, so `--panel-w: max(0px, (100vw - var(--play-cap)) / 2)`
computes a clean `0px` and the identity `panel-w * 2 + play-cap = 100vw`
holds exactly on both sides of the cabinet step. A direction that caps the
playfield sets both properties. The notch media queries are untouched, as
specified.
