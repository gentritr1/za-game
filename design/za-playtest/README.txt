ZA! — TABLE PROTOTYPE (playtest build, pass 8)

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

FREEZE ON (or ?freeze=1) stops the table on each teaching beat — Skip, +2,
Reverse, a penalty landing — until you press CONTINUE. Use it to ask the
question against the frame the tester actually saw.

In participant mode a frozen table says only PAUSED — no facilitator wording, no
button, nothing telling the tester which frame to study. Resume it three ways:
the CONTINUE button (researcher mode), the C key, or a one-second press on the
PAUSED panel itself. The long press is the one that works on a phone with no
keyboard; a second browser window cannot resume the tester's device.

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

TIMED MOMENTS
When you forget ZA, or an opponent forgets it, the table says ZA WINDOW OPEN and
the button takes focus immediately. In a scripted scenario the window has no
deadline — read the banner aloud at normal speed and the call still works. In
free play it stays open for eight seconds. SAY NOTHING and LET IT PASS decline it.

NOTES FOR THE TESTER
- Desktop: hover a card to see what it will do, click to play. Tab and Enter work.
- Phone: number cards play in one tap. A special card asks twice the first time
  you meet it, then behaves like the rest. Swiping the hand never plays a card.
- Illegal cards are recessed but still tappable — tapping one explains why.
- Outside your turn the hand is genuinely disabled, not just dimmed.
- DRAW A CARD draws one. If it is playable you choose PLAY IT or KEEP & PASS;
  if it is not, your turn ends by itself.
- +2 makes the next player draw two AND lose their turn.
- Action cards say what they do: ↻ REVERSE, ⊘ SKIP, +2 DRAW TWO. The topping is
  the border and the corner mark.
- The travelling order ticket means only "the turn is moving here". It is not ZA.
- A long hand scrolls sideways. The faded edges follow the scroll position, and
  the swipe line retires once they have swiped once.
- Screen readers get the event ribbon on a polite channel and timed ZA
  opportunities on an assertive one, with the reason attached to the button.
- Focus moves onto each new decision: CALL ZA NOW, CALL OUT NOW, PLAY IT, and
  the first topping in the Wild picker.

The table sizes itself to the window. Checked at 390×667, 390×720, 390×844 and
1280×780: nothing scrolls, and the active seat, the match target, the hand and
DRAW A CARD are always above the fold. Cards never fall below 54 px wide.
The supported minimum width is 360 px; below that the two-card lesson starts to
crowd the ring and would need its own composition.

CHANGED SINCE PASS 6
Picking a Wild is now a decision panel like a drawn card: the played Wild is
shown once, the four toppings sit in a labelled 2×2 group, and on phone the hand
and DRAW step aside · the two-card ZA lesson is one row on phone, keeping its two
cards while the consequence moves to the footer · seat density and pile size are
derived from the measured stage rather than an estimate, so a panel can never
leave the ring positioned against height it has already taken · accepting a drawn
Wild clears the draw decision before the picker opens, so PLAY IT and KEEP & PASS
can never sit beside PICK THE NEXT TOPPING · drawing or opening a Wild clears the
YOUR TURN banner immediately · a frozen phone can be resumed by a one-second
press on the PAUSED panel · the hand header now names what is actually there —
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
