# Paste this into Claude Code

Run it from the root of the `pizzuno` repo. The design reference files are in
`design_handoff_za_arcade/` — read `README.md` there first.

---

We're rebranding this game from Pizzuno to **ZA! Arcade** — a 1980s New York
pizzeria seen through a CRT arcade cabinet. The full design spec is in
`design_handoff_za_arcade/README.md`. Read it first.

The visual reference — every card face, screen, effect frame and expansion,
rendered — is here:

https://1f5741af-4f9d-4620-bc05-5d07346c9518.claudeusercontent.com/v1/design/projects/1f5741af-4f9d-4620-bc05-5d07346c9518/serve/design_handoff_za_arcade/ZA-Arcade-Kit-standalone.html?t=b388bf0d169d202da5a9249aa0354f31539dc9733f18235f83f3371faed2449c.3010fd2d-0ad0-400c-b044-1feb8b750bad.5646e5b3-cad6-4351-8654-c09665b19fe4.1786059442.fp&direct=1

The same file is bundled offline at
`design_handoff_za_arcade/ZA-Arcade-Kit-standalone.html` — open it in a browser
if the link has expired.

Implement it in this order, committing after each step:

1. **Tokens.** Replace the `:root` block in `public/css/styles.css` with the
   contents of `design_handoff_za_arcade/za-arcade-tokens.css`. Legacy variable
   names are aliased, so no existing selector should need editing. Verify the
   app still renders before touching anything else.

2. **Fonts.** In `public/index.html`, swap the Fredoka/Nunito link for Press
   Start 2P, VT323 and Kaushan Script. Bump body font-size from 15px to 18px —
   VT323 runs small.

3. **Card indices.** In `public/js/cards.js`, change the `KINDS` index values to
   ASCII: `X`, `<>`, `+2`, `*`, `+4`. Press Start 2P has no glyph for ⊘ ⇄ ★ and
   they render as tofu boxes.

4. **Ambience.** Add one `.crt-overlay` div to the app shell in
   `public/index.html`. The rule is already in the token file. That is the whole
   ambience system — no image assets.

5. **Screens.** Restyle home, lobby, game table and round-over to match the
   layouts in the spec. Structure and IDs stay as they are; this is a styling
   pass, not a rewrite.

6. **Effects.** Implement the nine effects in section 4 of the README, with the
   stated frame timings and easings. Honour `prefers-reduced-motion` exactly as
   the current stylesheet already does.

7. **The Regulars.** Add the `REGULARS` array to `server/bot.js` and wire the
   per-bot `notice` and `pause` fields into the existing bot logic. Add the hire
   flow to the lobby. Do not add new AI — `bias` only reorders the move
   preference list the bot already builds. `npm test` must still pass,
   including the bot-versus-bot soak.

8. **The Receipt.** Rebuild the round-over screen as itemised receipts, using
   the round's existing event data. No new server state.

9. **The Anchovy Problem.** Client-side only. Crowd boo on any anchovy card,
   with the escalation ladder in the spec.

Rules for the whole job:

- The server owns the game. None of this changes a rule, a state shape, or the
  wire protocol. If a change seems to require one, stop and ask.
- Motion is transform and opacity only, as the current stylesheet already
  requires. Nothing animates a layout property.
- Card art stays PNG at 5:7 in `public/assets/cards/`. The 55 file names do not
  change. Art regeneration is a separate task.
- Ask before adding any dependency. The project has exactly one (`ws`) and
  should keep it.
