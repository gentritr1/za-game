# Paste this into Claude Code — after PROMPT-marquee.md is merged

Run it from the root of the `pizzuno` repo.

This is direction **1A, the literal cabinet**: past 1900px the game stops
stretching and the remaining width becomes pizzeria. Requires the shell,
marquee and screws from `PROMPT-marquee.md` to be in place.

Reference render, left column:
`design_handoff_za_cabinet/ZA-Cabinet-At-Every-Size-standalone.html`

---

At 2000px the table is a small island of cards in a field of `--void`. Making
the cards bigger does not fix that — a 116px card in a 2400px window is still
an island. The answer is to stop stretching: the playfield locks at 1900px and
everything past it becomes cabinet. The game stays exactly as dense as it is at
1700, and the monitor fills with the room the game is set in.

Implement in this order, committing after each step:

1. **Set the cap.** `--play-max: 1900px` on the shell. `--panel-w` already
   derives from it. Below 1900px nothing changes at all — 1280 and 1700 render
   exactly as they do today, which is the point: this direction is invisible
   until there is genuinely spare width.

2. **Cap the content too, not just the frame.** Inside the 1900px play column,
   the opponents row and the centre row hold at `max-width: 1280px; margin: 0
   auto`. Without this the felt reads as an empty stretched field instead of a
   dense game — locking the frame and letting the content spread reintroduces
   the exact problem this direction exists to solve. The hand zone, the pit
   rail and the screw rail still run the full 1900.

3. **The panels.** Render side panels only when `--panel-w` computes above
   200px; below that they must not exist in the DOM, not merely be hidden.
   Fill is `--cabinet` under the existing 22px `--checker` gradient. Left panel,
   top to bottom: the vertical `ZA! ARCADE` wordmark (`writing-mode:
   vertical-rl`, rotated 180°, `white-space: nowrap`, `--cheese` with a 3px
   `--sauce` offset shadow), the wall of fame, and one art window. Right panel:
   the chalkboard special, and one art window.

4. **The panels carry live data, not wallpaper.** The wall of fame is the
   existing score list, sorted, top four, `--cheese` numerals — it updates as
   the round scores. The chalkboard special is the round's active modifier in
   `--font-script` over a VT323 explainer line. If a panel would have nothing
   real to show, it renders empty rather than inventing a placeholder.

5. **Art windows.** One per side, `panel-w × panel-w * 1.33`, dashed `--bezel`
   border over `--cabinet` until the assets land. Prompts and dimensions are in
   `ART.md` beside this file. The panels must read correctly with the dashed
   window in place — that is the shipping state until the murals exist, and it
   should not look like a bug.

6. **What the cabinet does when something happens.** A chain raises the oven
   glow from `.20` to `.38` alpha and plants the running total beside the oven.
   A shout puts `ZA!` across the playfield at 64 / 84 / 120px by notch, rotated
   -6°, `--cheese` with `--sauce` and black offset shadows. A win prints the
   winner on the right panel as a `--cheese` plaque with a 4px `--void` border.
   All three are transform and opacity, all three are additive — the board
   underneath does not move, and at widths below the cap the win plaque falls
   back to the existing dialog.

Rules for the whole job:

- The server owns the game. None of this changes a rule, a state shape, or the
  wire protocol. The wall of fame and the special both come from the snapshot
  the client already receives. If a change seems to require a server change,
  stop and ask.
- Everything under the shell stays `box-sizing: border-box`. Assert
  `panel-w * 2 + play-max === viewport` at 2400 before you call it done.
- Tokens only. Zero radii, hard offset shadows, stepped easing.
- 12px Press Start floor; card indices at 11px are the exception.
- Transform and opacity only. Under `prefers-reduced-motion` the glow deltas
  apply instantly and the shout appears without travel.
- Ask before adding any dependency. The project has exactly one (`ws`).
