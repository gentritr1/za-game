# Paste this into Claude Code

Run it from the root of the `pizzuno` repo.

---

The hand is broken at 18 cards. After two Whole Pies the bottom rail is a
rainbow wall: every card a different suit colour, 5px keylines stacked into
stripes, banners truncated mid-word, and no way to find the one card you can
play. The current mitigations (sort, two shrink steps, banner hide, halved
lift, scrolling strip with edge fades) make it survivable at 15 and poor at 18.

Replace the fan with **THE PIT**. A dead card is reference, not a card: dead
cards drop into a rib strip and only the playable ones stand up full size in a
near rail. The hand re-sorts itself the instant your turn starts, and that sort
is the turn signal.

The rendered design is bundled offline at
`design_handoff_za_pit/ZA-Overstuffed-Hand-standalone.html` — open it in a
browser. Set the harness to 18 cards, then use TURN, DRAW and PLAY, and drag
across the rib strip.

Implement in this order, committing after each step:

1. **The rib card mode.** In `public/js/cards.js`, add `size: 'rib'`. It is
   today's `'mini'` with its corner index un-hidden and centred instead of
   cornered: keyline, suit colour, index, nothing else. In
   `public/css/styles.css`, `.card--rib` is 20px wide and 46px tall, or 28px
   wide when its index is two glyphs (`+2`, `<>`, `+4`) — Press Start 2P is
   fixed pitch at 11px a glyph, so two glyphs need 22px inside the 3px
   keylines. The index never scales; the rib is what changes. `renderCard()`
   stays the only place card markup is built.

2. **Split the hand.** In `renderHand()` in `public/js/app.js`, partition the
   sorted hand by `view.playableCardIds` into a pit list and a near list, and
   render two rails inside `.hand-zone`: the pit (`overflow` recessed console
   strip, `inset 0 3px 0 var(--bezel)`) above, the near rail below. Keep
   `ui.handSlots` keyed by card id and keep the existing entry-delay and
   `releaseEntry` logic — a card's slot moves between rails, it is not
   rebuilt.

3. **Near-rail layout.** Live cards render at the full 84px `size: 'hand'` with
   8px gaps and no overlap up to four. Past four, overlap 24% (`-20px`) — never
   shrink, and never re-introduce a density step. Playable cards keep their
   `--lift: -12px` and their cheese ring; the ring must be an `outline` on the
   card root, not an inset shadow inside `overflow: hidden`, or 2px of its 3px
   band is clipped away.

4. **Banner placement.** A banner is centred across 84px, but an overlapped
   card only exposes its leftmost 50px, so a centred label is always cut
   mid-word. When a card is covered, left-align the banner into the exposed
   strip with 6px of inset and print the three-letter suit token (`PEP`, `BAS`,
   `CHZ`, `ANC`). Print the full label only where it fits the exposed width —
   the last card in a rail, and any live card, which the 7px neighbour part
   already gives 57px of face. Never place a label in a strip it cannot finish
   in. This replaces the crowded-hand banner hide, which comes out.

5. **The scrub.** The pit is one continuous control, not a row of targets — a
   20px rib is far under the touch minimum. Pointer down anywhere in the strip
   captures the pointer and shows a peek: the full 84px card, following the
   finger, clamped inside the rail, landing **over the near rail** (there is
   only 15px of room above the pit at 375px). Pointer up clears it. The peek
   can never play a card; play happens only in the near rail. `touch-action:
   none` on the strip so the page does not scroll under the drag.

6. **Promotion and exit.** A drawn card lands in the pit as a rib with a
   two-frame cheese flash. If it is playable, it promotes: the rib slides up
   into the near rail and grows to full size — that promotion is the news, not
   the draw. A played card leaves the near rail, the gap closes in one step,
   and any pit card the new top card just made live promotes in behind it.
   Promotions fire on a snapshot whose top card changed, never mid-turn, so
   the near rail holds still for the whole of your turn.

7. **Not your turn.** Nothing is live, so nothing stands up: the near rail
   collapses to zero and the whole hand moves into the pit at 32px review
   width, wrapping to two rows, breathing as one block on the existing
   `.hand.is-breathing` roll. Your turn arrives, the breath stops dead, and the
   live cards leap forward. Reserve the rail's 132px only while a peek needs
   somewhere to land.

Rules for the whole job:

- The server owns the game. None of this changes a rule, a state shape, or the
  wire protocol. The pit is derived entirely from `view.hand` and
  `view.playableCardIds`, both already in the snapshot. If a change seems to
  require a server change, stop and ask.
- `renderCard()` stays the single source of card markup. `'rib'` is a mode of
  the existing frame, not a new card.
- Motion is transform and opacity only, stepped easing (`steps(3, end)` for
  promotions and closes, `steps(5, end)` for counts). Nothing animates a
  layout property, nothing blurs, nothing rounds.
- Under `prefers-reduced-motion`, promotion and collapse become instant
  re-layout at the same end state and the breath is off. All of it stays
  playable, because the layout carries the meaning, not the animation.
- The 12px Press Start floor holds. Card corner indices at 11px are the one
  sanctioned exception.
- Nothing shrinks. Both existing density steps (`tight`, `packed`) come out,
  along with the scrolling strip and its edge fades.
- Ask before adding any dependency. The project has exactly one (`ws`) and
  should keep it.

---

## As shipped — resolutions for four ambiguities in the steps above

The spec above is the handoff as received and is left unedited. These are the
calls the implementation made where it was imprecise or self-contradictory, so
the next reader does not have to re-derive them from the code.

**Step 4, banner placement.** The rule shipped as one deterministic measurement
for every card in the near rail, with no exemption for live cards: exposed width
is the card's own width for the last card in the rail and `width + gap` (gap is
negative) for any card the next one covers. A label prints only if it fits that
width (VT323 at 13px runs 5.3px a character, plus 8px for the inset); a covered
card takes the three-letter token; a strip too narrow even for the token prints
nothing. The step's justification — "any live card, which the 7px neighbour part
already gives 57px of face" — refers to the hover parting of the fan this
redesign deletes, so it does not apply: a live card past four in the rail is
covered like any other and takes its token. The crowded-hand banner hide is gone.

**Step 5, the scrub across two rows.** The pit wraps to two rows in review mode,
which the step does not address. The pointer maps to a rib by nearest squared
distance on *both* axes, so a finger between rows resolves to the nearer one and
the mapping stays continuous across the wrap. The 84px peek is clamped to the
hand's own width and lands below the pit, over the near rail, in both modes.

**Step 5, the peek and the keyboard.** The scrub is pointer-only, so focus is the
keyboard's way in: ribs stay focusable (`aria-disabled`, never `disabled`),
landing on one shows the same peek and leaving it clears it. The peek itself is
`aria-hidden` — it duplicates a rib that is already in the accessibility tree
with its own label, and naming it too would announce every card twice. The pit
carries a live label with its own count ("18 cards, drag across to review them").

**Step 6, promotion timing.** The step says a drawn card promotes and also that
promotions "never" fire mid-turn; a draw does not change the top card, so those
cannot both hold. As shipped there are exactly two triggers: a snapshot where the
top card or the turn changed (the only things that can change what is playable),
and your own draw, which promotes after its flight lands. Both are your own
actions or a new turn, so the near rail still holds still for the whole of a turn
you are thinking through. A dealt hand is not a draw — it arrives sorted and goes
straight to the rail each card belongs in, rather than promoting seven cards
across the deal stagger.
