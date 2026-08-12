ZA! — TABLE PROTOTYPE (accessibility + mobile playtest build, pass 9)

Open ZA-Table-Prototype.html in any browser. No install, no server, works offline.

WHAT THIS IS
One table, four players. A comprehension test, not a finished game, and not
production code. Art, sound and arcade polish are absent on purpose.

TWO MODES
  Researcher (default)   RESET TABLE, the scenario picker and FREEZE are visible.
  Participant            ?mode=participant — all test machinery hidden.

Set up the deal in researcher mode, then hand over a participant-mode window.

BEFORE THE TESTER ARRIVES
Pick a scenario from the dropdown beside RESET TABLE, or use the URL:

  ?scenario=skip          ?scenario=draw2         ?scenario=incoming2
  ?scenario=wild          ?scenario=draw-playable ?scenario=draw-nomatch
  ?scenario=za            ?scenario=callout       ?scenario=bighand
  ?scenario=last-card     ?scenario=empty-deck

FREEZE ON (or ?freeze=1) stops the table on each teaching beat — Skip, +2,
Reverse, a penalty landing — until someone activates the visible CONTINUE
(researcher) or RESUME TABLE (participant) button. The C key remains a
researcher shortcut. Focus moves to the button, including on a phone.

HOW TO RUN THE TEST
Say nothing beforehand. Hand it over and let them play.
After 20 seconds, ask, in this order:

  1. Whose turn is it?
  2. What can you play?
  3. Why can you play that?
  4. Who plays next?
  5. What just happened?
  6. Why did that player receive two cards?      (after a +2 or a callout)
  7. What do you think ZA does?
  8. Who will play after Pina now?               (after a Reverse)

If the answers are not immediate, the fix is comprehension, not polish.
Run it once more with the OS "reduce motion" setting on and score that separately.

DECISION WINDOWS
When you forget ZA, or an opponent forgets it, the table says ZA WINDOW OPEN and
the button takes focus immediately. The prototype never invents a countdown:
the window stays open until CALL ZA NOW, SAY NOTHING, CALL OUT NOW or LET IT PASS
is chosen.

NOTES FOR THE TESTER
- Desktop: hover a card to see what it will do, click to play. Tab and Enter work.
- Phone: number cards play in one tap. A special card asks twice the first time
  you meet it, then behaves like the rest. Swiping the hand never plays a card.
- Illegal cards are recessed but still tappable — tapping one explains why.
- Outside your turn the hand is genuinely disabled, not just dimmed.
- DRAW A CARD draws one. If it is playable you choose PLAY IT or KEEP & PASS;
  if it is not, your turn ends by itself.
- +2 makes the next player draw two AND lose their turn.
- Action cards keep both facts printed at every size: the effect and the topping.
  The border, topping glyph and full accessible name reinforce the same rule.
- The travelling order ticket means only "the turn is moving here". It is not ZA.
- A long hand scrolls sideways. The faded edges follow the scroll position, and
  the swipe line retires once they have swiped once.
- Screen readers get turn changes, event outcomes and invalid-card reasons on a
  polite channel; costly ZA choices and round outcomes use the assertive channel.
- Focus moves onto each new decision: CALL ZA NOW, CALL OUT NOW, PLAY IT, and
  the first topping in the Wild picker. It also moves to RESUME TABLE, PLAY AGAIN
  and the HOW TO PLAY dialog, then returns to the control that opened the rules.

The table sizes itself to the visible viewport. Portrait keeps the ring above the
hand. Short landscape uses the same table/hand patterns side by side. Checked at
320×640, 360×640, 390×667, 390×844, 568×320, 667×390, 720×640, 844×390 and
1280×780. At extreme zoom or very short portrait heights, one vertical scroll
keeps every action reachable without horizontal page scrolling. Cards never fall
below 54 px wide and controls stay at least 44 px high.

CHANGED SINCE PASS 8
Turn truth is now shared by every seat label, so a Skip or +2 frame marks the
victim SKIPPED and the real destination NEXT · every visual-only YOUR TURN,
invalid play, pause, winner and empty-deck result is announced · ZA and callout
choices wait for an explicit decision instead of expiring · participant freeze
uses a real focused RESUME TABLE button · round end always offers PLAY AGAIN ·
HOW TO PLAY is available on demand in a labelled, focus-trapped dialog · action
cards print both effect and topping · inactive seats and illegal cards use opaque
AA-contrast states instead of group opacity · short landscape is a two-column
composition, 720 px hand overflow starts safely at the left edge, compact Match
content stacks clear of side seats, and visible-viewport plus safe-area insets are
honoured · readable source and the offline bundle now have a deterministic sync
command in prototype-bundle.mjs.

The pass notes below are retained as design history. Pass 9 above supersedes
their older timer, participant-freeze and compact-Match behavior.

CHANGED SINCE PASS 6
Picking a Wild is now a decision panel like a drawn card: the played Wild is
shown once, the four toppings sit in a labelled 2×2 group, and on phone the hand
and DRAW step aside · the two-card ZA lesson is one row on phone, keeping its two
cards while the consequence moves to the footer · seat density and pile size are
derived from the measured stage rather than an estimate, so a panel can never
leave the ring positioned against height it has already taken · accepting a drawn
Wild clears the draw decision before the picker opens, so PLAY IT and KEEP & PASS
can never sit beside PICK THE NEXT TOPPING · drawing or opening a Wild clears the
YOUR TURN banner immediately · a frozen phone can be resumed without a keyboard
(pass 9 replaces that old long press with RESUME TABLE) · the hand header now
names what is actually there —
ZA WINDOW, CALLOUT WINDOW, PICK A TOPPING, DRAW DECISION, TABLE PAUSED.

Verified at 390×667 and 390×720 with every panel open: no element overlaps
another, nothing is clipped, and no state overflows the frame.

CHANGED SINCE PASS 7
Decisions replace the hand on desktop too, not only on phone: opening a Wild
pick, a drawn-card decision, a ZA window or a callout at 1280×780 or 1366×768
now returns the ring its height instead of squeezing Dominic onto the Match
plaque, and the played Wild is shown once rather than twice · compact geometry is
chosen by measured stage height rather than by viewport width, so a short laptop
compacts exactly as a phone does · the direction row folds into the Match plaque
whenever the centre column would otherwise reach your own seat · the turn ticket
is placed in pixels against its plate rather than in percentages.

Verified at 1280×780, 1024×768 and 390×667 across the ordinary table, Wild, the
two-card lesson, drawn-card decisions and the callout window: the only remaining
intersection is the turn ticket resting on the top edge of its own seat, which
is deliberate.

CHANGED IN PASS 5
On phone a ZA window, callout, drawn-card decision or freeze now REPLACES the
hand instead of pushing the ring up, and the Match plaque collapses to a
one-line chip — no seat can overlap it · the overflow cue follows the scroll
(right fade only while there is more to the right, left fade once you have
moved, and the swipe line retires after the first swipe) · a polite live region
carries the event line and an assertive one carries the two timed opportunities,
each CTA described by its visible reason · focus moves to PLAY IT and to the
first topping in the Wild picker · a frozen beat says only PAUSED to the
participant.

CHANGED IN PASS 4
One central announcement at a time — playing a card dismisses YOUR TURN before
any effect is shown, and reduced-motion Reverse uses that same channel · timed
windows say ACT NOW, never HANDS OFF, keep their buttons on one line, and hold
open in scripted deals · locking is semantic: disabled controls, skipped by Tab,
with honest spoken names · participant mode hides the harness · FREEZE stops the
table on each teaching beat · desktop hand centred under the player with the
count beside YOUR HAND · phone hand shows a fade cue and a swipe line · shorter
effect copy (CARMELA IS SKIPPED, CARMELA DRAWS 2 — SKIPPED, CARMELA FORGOT ZA,
YOU PLAYED TO 1 WITHOUT ZA) · the Match plaque stacks on phone so it can never
collide with the side seats.

STILL WORTH ONE HUMAN PASS
Tab-then-Enter on a real keyboard, a swipe across a ten-card hand on a
touchscreen, and one run with an actual screen reader. All three are implemented,
but none can be faithfully simulated in a harness.

FOR IMPLEMENTATION
Port the visual grammar, not this engine. Legality, ZA availability,
vulnerability, callout windows, penalties and turn progression must keep coming
from the server; this build decides them locally only so it can be played
offline.

================================================================================
AS SHIPPED — TABLE CENTRE (match plaque · direction · turn ticket · effect
faces · narration). Re-stated against pass 8; the earlier appendix went with
the pass-6 README when the vendored spec was refreshed.

The spec above is verbatim. Every place the port decided something the
prototype could not know about is here, with the measurement behind it.

MATCH PLAQUE
- Under the piles, not over them: from 520px up the chefs and the centre column
  share one grid cell, and the top of that cell is where people are sitting.
  The prototype's chefs are below its plaque; ours are around it.
- It replaced the old IN PLAY · <TOPPING> badge outright. Two statements of one
  fact, one of them half the rule, is what this pass exists to remove.
- Printed form is aria-hidden and one spoken sentence carries it. Four nodes
  and a conjunction read out in sequence is a list, not a condition.
- Below 520px it is the pass-6 one-line chip: MATCH, topping, OR, alternative,
  on one line, 31.7px tall against the stacked block's 41.8px. It keeps the
  word MATCH at 7px — the pass-6 note does not require it, and it is the only
  word that says what the numbers beside it are for.

DIRECTION, AND WHEN IT FOLDS (pass 8)
- The condition is geometric, as spec'd, and it is measured rather than named:
  the row folds when the centre column, with the row standing on its own,
  would either overrun the felt or reach a chef sitting over it. Both are read
  off live boxes on every render and on every resize.
- Our felt is not a viewport size. It is the grid's 1fr row — whatever the
  marquee and the hand zone leave — and the hand zone grows with the hand, so
  the same window folds with fifteen cards and does not with seven. A width
  rule would have been wrong at both ends: verified unfolded at 768x1024 and
  1366x960, folded at 1024x600, 1280x720, 1366x768 and 600x800.
- The column is pinned to the BOTTOM of the felt, so adding the row reaches
  further UP, toward the chefs — never down toward your own strip. That is the
  opposite of the prototype's direction of travel, which is why the test is
  written against the column's top and against seat bottoms.
- The chip is MOVED, not copied: `renderDirection` writes one node and the
  node changes address. There is no `folded` boolean either — the chip's
  parent is the state, because two owners is none.
- Folded on a phone, the direction is the glyph alone — the `MATCH ↻` the spec
  prints. With the word in, the widest sentence the deck can make at 390px is
  434px wide with its right edge at 448, drawn 58px outside the window; glyph
  only it is 308px. The word is not lost: the marquee's chevron chase is on
  screen at exactly those widths and `#dir-announce` still speaks it in full.

THE TURN TICKET IN PIXELS (pass 8)
- Both ends are measured off the plates. `getBoundingClientRect` and not
  `offsetLeft`, against the usual rule, because a counter seat carries a static
  `translateX(-50%)` and the rect is the only reading that includes it — and
  where the plate IS is the whole question. It is read after the arrangement
  has written every seat's position, not before, which is why `placeToken` now
  runs at the END of `placeSeats`.
- y is the mean of the two plates' TOP EDGES, so the ticket rests on the edge
  of the seat it has arrived at — the one intersection pass 8 keeps. Measured
  over 15 hops at a crowded eight-chef table: the ticket's y is that mean to
  within 0.04px and its x to within 0.05px, including hops between plates of
  111px and 175px. The percentages it replaced were 27px out on the same
  frame, and out by a different amount at every seat count.
- You are the one end with no plate: there is no chef panel for yourself on the
  felt. That end stays a proportion of the felt, because there is nothing there
  to read.

EFFECT-FIRST FACES · NARRATION
- Unchanged from the earlier appendix. Skip, Reverse and Draw Two lead with a
  drawn glyph and the effect word; Press Start 2P has no character for two of
  the three, so they are inline SVG in the game's own icon set, and `+2` is
  typed because it is already the picture of itself. The parlour names moved to
  the spoken label and the rule book. A covered card in the near rail still
  prints its three-letter SUIT token, because the rail measures whether a token
  fits with the same function that produces it.
- The narration shortens the server's log and never composes a second account:
  each event is recognised by a phrase the server writes in every one of its
  phrasings, names and numbers come from the snapshot the line arrived with,
  and anything unrecognised prints the server's own sentence with the
  decoration stripped. The last entry is the one shown, because the server
  writes cause then consequence.

KNOWN, NOT FIXED
- The felt's height budget. The oven-under-the-chatter-ribbon overlap flagged
  at 390x667 is GONE — measured on this build at 390x667 with four chefs: oven
  182.8-288.1, plaque 292.1-323.8, ribbon 339.6-367.8, hand zone from 367.8,
  every gap positive and nothing intersecting. What survives is the piles
  reaching up into the chefs when the felt is short: 107.5px at 390x667 with
  eight chefs, 175.5px at 1024x600 with eight. The plaque and the direction
  chip clear every seat in both of those; it is the piles above them that do
  not, and the lever is felt height, which belongs to the hand pass.

--------------------------------------------------------------------------------
AS SHIPPED · PASS 8, PART TWO — the felt's own density

"Seat density and pile size are derived from the measured stage rather than an
estimate." The table side of that clause, which had never been implemented.

WHAT WAS WRONG. The piles reached into the chefs — 175px at 1024x600 and 107px
at 390x667, both with eight at the table. Not because the felt was short: the
felt's CONTENTS were sized by a media-query ladder that only ever asked how
WIDE the window was, so a 1024x600 laptop drew 96px pile cards and 46px
portraits into a felt of 312px.

MEASURED, NOT MODELLED. There is no formula here relating a portrait edge to a
finished seat height, because a seat is a portrait, a name plate that wraps, a
fan that grows with the hand and a nickname chip that appears when it is
earned. So a five-rung ladder is walked and the result is READ — one forced
layout per rung, and the test is a true rectangle intersection of the centre
column against every seat, both axes, never a band.

  rungs      1 · 0.90 · 0.80 · 0.72 · 0.64  of whatever the stylesheet says
             full size is at this width, so the 1600px and 2200px cabinets
             step down from THEIR chefs instead of being flattened to a laptop's

  floors     pile card 54px · the deck's own stated floor. At 54 the card is
                             76px tall, so the dough pile — the only pile that
                             is a button — is a 54x76 target.
             portrait  34px · already shipped: the queue's tail portraits have
                             been 34px since the seating pass.
             notch     0.78 · already shipped: the phone's own --k.

  is-tight   a rung, not a width. It takes the ROWS a seat spends on things
             that are not the chef: the 13px line held open for a word only a
             thinking bot says, and the 23px ordinal chip, which becomes a
             corner badge instead of a row. Worth 36px of a 160px queue seat.
  is-tight-2 the two pile labels. The plaque under them names the topping and
             the oven is the one card lying face up.

IT CLIMBS BACK. Tightening alone was wrong in the expensive direction: the
first render of a round measures a table whose arrangement has not landed, so
the walk ran to the floor and stayed there — 37px portraits where 46px already
had zero intersections. Each render now also applies the next rung UP and
measures it, keeping it only if it fits. Tightening is instant, loosening takes
a render, so the table is only ever briefly too small.

TWO COUPLINGS, BOTH FOUND BY MEASURING
- The fold runs first and stays down while a rung is spent. Ordered, because
  unfolding frees no room and costs 24px: the ladder would pay for it by
  tightening, the room would read as space to unfold into, and the table would
  breathe in and out once a snapshot.
- A rung change re-runs the arrangement. The turn ticket is placed against the
  plates and `placeSeats` runs before the ladder does, so without the second
  pass the ticket kept the position it measured at the rung before — 8.7px off
  the plate centres, against 0.00 once the two are in step.

AND THE TICKET CAME OFF RECTS. It was written with `getBoundingClientRect` on
the argument that a rect is the only reading that includes a seat's static
`translateX(-50%)`. True, and it also includes every OTHER transform between
there and the viewport: the game screen carries an entry scale, and one beat
after a round began the same seat read 95.6px wide by rect against 97px by
`offsetWidth`, its centre 661.3 against 668. The ticket was placed 6.7px out,
in scaled pixels, against a token positioned in unscaled ones — settling
correctly and wrong for exactly as long as a player is looking hardest. It and
the fold now walk the offset chain and put the one transform that is real
geometry back by hand, from `data-anchor`.

MEASURED MINIMUM FELT, for re-calibrating the hand pass's FELT_FLOOR (348).
The centre column's own height at the floor rung, which is the height below
which the piles start going under the hand zone:

  1280x780 / 1366x768   160px      1024x600   146px      390x667 / 360x640   120px

At 390x667 with eight chefs the whole felt needs strip 132 + belt 8 + column
120 + chatter row 29 = 289px, against the 329px it is given today. FELT_FLOOR
is therefore stale in the safe direction by roughly 59px at that size.
