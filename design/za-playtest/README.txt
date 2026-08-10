ZA! — TABLE PROTOTYPE (playtest build, pass 7)

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
