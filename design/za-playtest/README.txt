ZA! — TABLE PROTOTYPE (playtest build, pass 6)

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

In participant mode a frozen table says only PAUSED: no button, no instruction
to inspect anything. Resume with the C key from wherever you are sitting. In participant mode the
freeze shows only PAUSED, with no facilitator wording and no button: resume by
pressing the C key on the tester's device, or hand it back and press CONTINUE in
a researcher window.

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

CHANGED SINCE PASS 5
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
AS SHIPPED — TABLE GRAMMAR (match plaque · turn geography · effect faces ·
narration), ported into the styled client on 2026-08-10.

The spec above is left verbatim. Where the port had to decide something the
prototype could not know about, the decision and its reason are here.

MATCH PLAQUE
- Under the piles, not above them. From 520px up the chefs and the centre
  column share one grid cell and the top of that cell is where people are
  sitting; the prototype's chefs sit below its plaque, ours sit around it.
- The plaque replaces the old IN PLAY · <TOPPING> badge outright rather than
  standing beside it. Two statements of the same fact, one of them half the
  rule, is the thing this pass exists to remove.
- Wording follows the prototype: MATCH / <topping> OR <number>, MATCH /
  <topping> OR <effect>, CURRENT TOPPING / <topping> on a wild. The topping is
  drawn in its own colour and the alternative in plain ink, because the
  alternative is not a topping and must not read as one.
- Printed form is aria-hidden; one spoken sentence carries it instead. Four
  nodes and a conjunction read out in sequence is a list, not a condition.
- PASS 6, the phone chip. Below 520px the plaque lays flat: MATCH, topping
  icon, topping, OR, and the alternative, all on one line. It is one line at
  every width and for every content this deck can produce — measured at 320px,
  where the widest sentence the game has (MATCH · PEPPERONI OR DRAW TWO) is
  260px in a 320px window, and the other three worst cases are 205-251px. The
  type steps down once more below 380px so that stays true.
- The chip KEEPS the word MATCH, at 7px, which the pass-6 note does not
  require. It is the only word that says what the two things under it are for,
  and it costs width, which below 520px is the axis we have — the chefs are a
  queue in their own grid row there, so nothing the chip does sideways can
  reach a seat. Drop it if the spec meant it dropped.
- Our reason for the chip is not the prototype's. Its phone plaque grows
  towards side seats; ours cannot, because our phone has no side seats. What
  the chip buys here is HEIGHT: 31.7px against the stacked block's 41.8px,
  measured side by side in the same frame, and the felt is short by tens of
  pixels on a phone (see KNOWN, NOT FIXED).
- The pass-6 prototype at design/za-playtest/ does NOT render this chip. Loaded
  fresh at 390x667, 390x844 and 430x932 its plaque is still the stacked block,
  80.4 x 62px, `flex-direction: column` on both the plaque and its body. The
  README says chip and the running reference says stack; this port followed the
  README and the written brief.

DIRECTION
- The prototype's word is CLOCKWISE / COUNTER-CLOCKWISE and the server's is
  "play runs to the left / right". Both are true of different things: the
  server describes a real table from above, the chip describes this screen.
  `direction: 1` seats the next chef down the left wall, so play runs
  bottom -> left -> top -> right, which on a clock face is 6 -> 9 -> 12 -> 3.
  Clockwise. The visually-hidden announcement was changed to match the chip so
  a screen reader and the screen do not use two vocabularies for one fact.
- The chip is a third carrier, not a replacement: the marquee's chevron chase
  (below 520px) and the token walking the counter (520px and up) both stay.
  Neither is on screen at every width, which is why the word exists.

TURN GEOGRAPHY
- The seat ordinal chip already existed and was drawn only in the phone queue.
  On the counter it now appears for exactly two ranks — NOW and NEXT — and
  stays hidden for 03 and up. Position is the ordinal on a counter; "whose
  turn" and "who is next" were the two it could not answer.
- It is placed last in the seat, not over the portrait: the ZA! / FORGOT!
  badge already owns the space above the head.

EFFECT-FIRST CARD FACES
- Skip, Reverse and Draw Two lead with a drawn glyph in the sprite window and
  the effect word on the banner. The generated sprite stays behind the glyph —
  the art is unchanged, the reading order is not.
- Press Start 2P has no glyph for the symbols the prototype types, so the two
  that need drawing are drawn as inline SVG in the game's icon set. `+2` is
  typed, because it is already the picture of itself.
- The parlour names (Burnt Slice, Flip the Pie, Extra Toppings) leave the
  banner and stay in the spoken label, the chatter and the rule book. The
  spoken label gains the effect word after the name: "Basil Flip the Pie,
  reverse".
- The topping steps back to the keyline colour PLUS the corner suit letter,
  which effect cards now show at every size. A topping is never colour alone.
- A COVERED card in the near rail still prints its three-letter SUIT token,
  not an effect token. The rail measures whether a token fits using the same
  function that produces it; changing one without the other is two copies of
  one number, and the rail is another agent's floor. The big glyph carries the
  effect on a covered card.

NARRATION
- Shortened from the server's log, never composed from scratch. Each event is
  recognised by a phrase the server writes in every one of its phrasings —
  never by the emoji, which carries joiners and variation selectors, and never
  by a whole sentence, which `pick()` swaps. Names and numbers come from the
  snapshot the line arrived with. An unrecognised line prints the server's own
  words with the decoration stripped.
- The LAST log entry is the one shown. The server writes cause then
  consequence, so the last entry is the penalty landing, the order turning, the
  seat losing its turn — which is the news, and which is what the prototype
  shows.
- "YOU PLAYED TO 1 WITHOUT ZA" is not ported. Nothing in the log marks it; it
  is a property of the snapshot (`vulnerable`), and the call-out window already
  draws it. Inventing a log line for it would be the client keeping score.

KNOWN, NOT FIXED
- The felt is the grid's `1fr` row and the hand zone grows with the hand. On a
  short window the felt is smaller than the piles alone — measured on the
  PRE-CHANGE build at 390x667: the discard pile ran to y=293.6 against a hand
  zone starting at y=265, and the topping badge under it was entirely covered.
  This pass does not fix that budget; it makes the squeeze land somewhere
  survivable. The centre column is pinned to the BOTTOM of the felt and paints
  over the seats, so a squeeze rides the piles up into the portraits instead of
  feeding the plaque and the direction chip to an opaque hand zone. Fixing the
  budget properly means touching the hand zone, which belongs to the hand pass.
- Which is also why "no seat can overlap the chip" is only PARTLY true at
  390x667. The chip is bottom-pinned and already sits as low as the felt goes;
  the queue seats reach 29.8px below its top in the squeezed state, so the
  overlap left is exactly the felt's shortfall and nothing to do with the
  chip's size. Paired sampling at 390x667, four chefs, twelve ticks, both forms
  measured in the same frame: chip overlaps in 10 of 12, stacked in 12 of 12,
  and where the stacked block was 5px into the seats the chip is clear. The
  chip removes precisely the 10.1px it saves in height. At 390x844 — eight
  chefs, the crowded table — the chip overlaps nothing at all.
- Two levers inside the centre column were measured and NOT pulled, because
  they move the wrong thing: hiding the pile labels below 520px, and dropping
  the pile card width to 68px. Both were tried live and moved the chip's top by
  0.0px — the stack is pinned from the bottom, so shrinking the piles lowers
  the piles, not the plaque. Only felt height clears the rest, and roughly 30px
  of it does.
