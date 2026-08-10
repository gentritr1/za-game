ZA! — TABLE PROTOTYPE (playtest build, pass 5)

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
- A long hand scrolls sideways; the faded right edge means there is more.

The table sizes itself to the window. Checked at 390×667, 390×720, 390×844 and
1280×780: nothing scrolls, and the active seat, the match target, the hand and
DRAW A CARD are always above the fold. Cards never fall below 54 px wide.

CHANGED SINCE PASS 4
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
Tab-then-Enter on a real phone and a real keyboard, and a swipe across a
ten-card hand on a touchscreen. Both are implemented through click activation
with a 10 px drag guard, but neither can be faithfully simulated in a harness.

FOR IMPLEMENTATION
Port the visual grammar, not this engine. Legality, ZA availability,
vulnerability, callout windows, penalties and turn progression must keep coming
from the server; this build decides them locally only so it can be played
offline.
