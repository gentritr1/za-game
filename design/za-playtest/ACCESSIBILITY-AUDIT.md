# ZA! table prototype — accessibility and intuitiveness audit

Audit date: 11 August 2026
Scope: the self-contained four-player table prototype, participant and researcher modes, keyboard and touch interaction patterns, responsive layouts, and assistive-technology semantics.

## Executive verdict

The original build communicated the core match rule well in portrait, but several states could give a false answer about who was next, important phone-landscape actions could be clipped, decision windows expired without an accessible timing control, and inactive information was dimmed below readable contrast.

Those release-blocking issues are fixed in pass 9. The prototype now has one truthful NOW/NEXT derivation, complete turn and outcome announcements, explicit untimed choices, visible pause/replay controls, an on-demand rule book, AA-contrast state styling, and dedicated short-landscape and reflow layouts.

This is a strong playtest build, not a WCAG conformance claim. A final pass with real screen readers and physical touch devices is still required.

| Dimension | Before | Pass 9 | Evidence |
|---|---:|---:|---|
| Accessibility | 2/4 | 3/4 | Semantic regions/groups, live feedback, modal focus handling, keyboard controls, reduced motion, measured contrast |
| Performance | 3/4 | 4/4 | Offline bundle, no fallback image failures, hand-scroll work throttled to animation frames |
| Responsive | 2/4 | 4/4 | Portrait, two-column short landscape, safe overflow, 320 px reflow, visible-viewport and safe-area handling |
| Theming | 1/4 | 3/4 | Semantic surface, border, text, suit, information, warning, danger, and success tokens |
| Visual integrity | 4/4 | 4/4 | The distinctive pixel-arcade hierarchy and color-plus-glyph suit grammar are preserved |
| **Total** | **12/20** | **18/20** | Two points remain reserved for human assistive-technology and production integration evidence |

## Findings and remediation

### Turn and effect truth

- Fixed: a frozen Skip or +2 frame could mark the penalized player as both SKIPPED and NEXT.
- Pass 9 stores the forced destination during effect resolution. The victim stays SKIPPED and the actual destination receives NEXT.
- Reverse updates direction and next-player copy together.
- Seat groups now expose one spoken phrase containing player name, card count, and current status.

### Knowing what to play

- The Match plaque always states the topping and number/action alternative.
- Playable cards are raised and marked ✓. Illegal cards stay operable so activating one explains the exact required match in the polite live region.
- Illegal and waiting cards use opaque foreground/background states instead of low group opacity.
- Action cards now print both their effect and topping at every card width; full accessible names remain available.
- A drawn playable card presents the explicit PLAY IT / KEEP & PASS decision. A non-match explains that the turn ends.

### Knowing how to play

- HOW TO PLAY opens a labelled modal with the turn, matching, drawing, action-card, direction, NEXT, and ZA rules.
- The dialog takes focus, traps Tab on its close control, closes with Escape, hides the game from the accessibility tree while open, and restores focus to its trigger.
- On first touch, an unfamiliar special card states its consequence and says TAP AGAIN TO PLAY.

### Turn, pause, and round announcements

- YOUR TURN now includes the current match instruction.
- Invalid-card reasons, pause/resume, card outcomes, Skip/+2 destinations, Reverse direction, winners, and empty-deck endings are announced.
- Urgent ZA choices and round outcomes use the assertive channel; routine table narration uses the polite channel.
- Participant freeze now exposes a real, focused RESUME TABLE button. The undocumented participant-only long press was removed.
- Round end always exposes PLAY AGAIN, including participant mode and empty-deck stalemates.

### Timing

- ZA recovery and callout choices no longer expire after eight or nine seconds.
- Each window explicitly says it waits for the player and closes only after a visible choice.
- There is no automatic round restart.

### Mobile and reflow

- Portrait keeps the table ring above the hand.
- Short landscape uses the same visual language in a side-by-side table/hand composition, keeping DRAW A CARD visible.
- Compact Match content stacks so side seats do not obscure the rule.
- An overflowing hand always begins at a reachable left edge and can reveal its right edge.
- At very short portrait heights or 320 px reflow, one vertical scroll replaces clipping; there is no horizontal page scroll.
- Layout measurement follows the visible viewport and observes visual-viewport resize/scroll. Safe-area insets protect the outer edges and hand zone.
- Participant controls remain at least 44 px high; cards remain at least 54 px wide.

### Contrast and non-color cues

- Measured illegal-card text: 6.65:1.
- Measured instruction text: 6.65:1.
- Measured cabinet boundary: 3.43:1 against the background.
- Inactive seat content and card counts are fully opaque.
- Suit meaning continues to use color, glyph, printed topping, border, and accessible name rather than color alone.

## Verification matrix

The bundled prototype was exercised at:

- 320×256 reflow: vertical reachability, no horizontal overflow.
- 320×640, 360×640, 390×667, and 390×844 portrait.
- 568×320, 667×390, and 844×390 landscape.
- 720×640 and 721×640 with a ten-card hand.
- 390×844 frozen Reverse and 667×390 frozen/compact table geometry.
- ZA recovery held open for more than nine seconds.
- Invalid-card activation and live reason.
- Skip victim/NEXT truth and focused participant resume.
- Last-card win, assertive result, PLAY AGAIN, and reset.
- HOW TO PLAY focus entry, Tab containment, Escape close, accessibility-tree hiding, and focus restoration.

Automated checks also validate component syntax, all bundle JSON islands, escaped closing tags, readable-source/bundle equality, and the existing game-rule test suite.

## Recommended human acceptance pass

1. Run iOS VoiceOver + Safari, Android TalkBack + Chrome, and one desktop screen reader. Confirm turn changes, invalid-card reasons, urgent ZA choices, dialog entry/exit, and winner announcements occur once and in the right priority.
2. On a physical phone, confirm the first-touch special-card preview never commits the card, and a ten-card horizontal swipe never activates one.
3. Repeat the comprehension script with first-time players. Target an immediate correct answer to: whose turn, what is playable, why it is playable, and who is next.
4. Repeat at 200% and 400% browser text zoom. Vertical scrolling is acceptable; horizontal page scrolling and hidden controls are not.
5. When this grammar is ported to production, keep the server snapshot authoritative for legality, turn order, ZA vulnerability, deadlines, penalties, and round state. The offline prototype simulates those rules only for playtesting.

## Maintainer handoff

- Edit `ZA-Table-Prototype.source.html`.
- Run `node prototype-bundle.mjs build`.
- Run `node prototype-bundle.mjs verify`.
- Ship `ZA-Table-Prototype.html`; it remains self-contained and works offline.
