# The Kitchen Log

ZA! is a pizza parlour that pretends to be a card game: vanilla JS, one
dependency (`ws`), no build step. Most of it was written by delegated agents in
parallel worktrees, with a reviewing orchestrator merging — an arrangement that
is fast, and also an excellent machine for producing confident, plausible, wrong
answers. So we keep this log.

It is not a changelog. A changelog says what shipped; this says **what went
wrong, what we believed while it was going wrong, and what the fix taught us**.
Every entry runs the same beats: what we saw, what we almost did, what it
actually was, and the counter — the fix *plus* the rule that kills the class.

**On honesty.** A claim goes in only if someone observed it, and the entry says
where: each carries a provenance line — the commit, design doc, or project
memory note it came from. Where the only record is this cycle's incident notes
rather than something in the repo, the entry says so in those words. "Tests
pass" is not evidence here, and neither is a screenshot of something that never
moved. You will see why below.

---

## I. Measuring the truth, not the config

The most expensive bugs here were not in the product but in the instruments we
pointed at it.

### The pane that froze time

*2026-08-08 and earlier — project memory (`za-fleet-build`); commit `ce93dae`.
The probe counts are from this cycle's incident notes.*

**What we saw.** An agent instrumented the deal cascade for frame pacing and
reported a p95 of 1969 ms. Separately, dialogs screenshotted blank — frame,
border, nothing inside.

**What we almost did.** Treat 1969 ms as a performance finding and optimise the
deal. It has the shape of a real number: a percentile, over a real window, from
a real page.

**What it actually was.** The probe captured **5 frames where the window and
frame rate predicted 223**. Agents drive a browser pane that is usually hidden,
and a hidden pane freezes CSS animations *and* throttles `requestAnimationFrame`
away entirely. The p95 was the gap between two samples minutes apart; the
dialogs' contents sat at the entry animation's opacity 0 forever.

**The counter.** **Reconcile sample count against `window × expected rate`
before quoting any percentile** — 5 of 223 is not a measurement with a bad p95,
it is a broken instrument that outputs a number. And **never verify motion by
screenshotting motion**: read state with `getComputedStyle`, `getAnimations()`,
or by seeking through WAAPI.

**The sequel, which is why this entry exists.** Days later a second agent hit
the same wall from the other side: it screenshotted a seat's focus-ring
cross-fade and nearly "fixed" correct code. A transition sampled at
`currentTime` 0 reads its **start** value — indistinguishable from a ring that
never lights. Finishing it through WAAPI showed the end state was right.

### The 48px rib that measured 42

*2026-08-08 — this cycle's incident notes; the entry animation is the pit's,
commit `2f2a971`.*

**What we saw.** A probe asserted the pit's rib width and failed: 42px where the
spec said 48. **What we almost did:** widen the rib — trivial arithmetic that
would have shipped a rib six pixels too wide forever.

**What it actually was.** `getBoundingClientRect()` returns the *visual* box,
transforms included, and the read landed mid-entry while the rib was inside a
0.88 entry scale: 48 × 0.88 = 42.24. The card was the right size; the ruler was
moving.

**The counter.** **Size assertions use `offsetWidth` / `offsetHeight`**, which
ignore transforms. Rects are for positions, and only once transforms are settled
— which, per the entry above, you have to actually verify.

### The breakpoint that never fired

*2026-08-08 — commit `e7d67e3`, "Step 8: 375px, and reduced motion".*

**What we saw.** Resizing 1280 → 375 left the desktop arrangement in place: the
counter stayed a counter at phone width, walking turn token still on screen.
**What we almost did:** suspect the breakpoint value, then the CSS, then the
mode-switch logic — three places that were all correct.

**What it actually was.** The relayout rode the resize handler's
`requestAnimationFrame` coalescing, and in a hidden or backgrounded pane rAF is
throttled away entirely. The event arrived; the work behind it never ran.

**The counter.** **A layout-mode flip listens to `matchMedia` change, not to a
resize handler behind rAF** — verified live in a pane where `document.hidden` is
true and rAF never fires, the condition that produced the bug. The FLIP cleanup
got the same belt: a 300 ms timer behind the rAF, or a strip comes back from the
background holding its inverted offsets.

---

## II. CSS that lies politely

CSS rarely throws. It computes something, renders it, and lets you believe you
asked for it.

### The custom property that was present, unusable, and silent

*2026-08-08 — commits `2f2094e`, `3f457bf`; "As shipped" sections in
`design/design_handoff_za_cabinet/PROMPT.md` and `PROMPT-marquee.md`.*

**What we saw.** The cabinet's width policy was one line from the handoff —
`--panel-w: max(0, (100vw - var(--play-max)) / 2)`, with `--play-max` parked at
`none`. Panels computed `width: auto` instead of zero, and the popover under the
shell measured itself wrong. **What we almost did:** assume the `var()` fallback
had us covered — it is the mechanism for a property that is not set yet.

**What it actually was.** Two traps in one declaration. A `calc()`/`max()` over
`none` is invalid — and **a present-but-unusable custom property never triggers
the `var()` fallback**. Fallback fires when a property is *missing*, not when
its value is nonsense, so the declaration went invalid at computed-value time
and consumers quietly landed on `auto`. (Same line, smaller lie: `max()` beside
a length needs `0px`, not a bare `0`.)

**The counter.** **Gate arithmetic behind a length-valued twin.** `--play-max`
stays as the statement of intent; `--play-cap` — always a real length, `100vw`
while uncapped — is what the arithmetic reads, under a written invariant that
holds on both sides of the cap: `panel-w × 2 + play-cap == 100vw`.

### `@starting-style` loses fights it never announces

*2026-08-07 — project memory (`za-fleet-build`), juice pass.*

**What we saw.** Dimmed (unplayable) hand cards appeared instantly; every other
card faded in. **What we almost did:** retune the transition. The timing was the
obvious suspect, and the timing was fine.

**What it actually was.** `@starting-style` obeys the cascade. The dimmed-card
rule set opacity at higher specificity, so the "from" value never applied — the
element starts where it ends and the transition has nothing to traverse.

**The counter.** **Restate the starting style after the rule it has to beat**,
and check specificity *and* document order whenever an entry animation covers a
subset that has its own opacity rule.

### The stagger that one `offsetWidth` killed

*2026-08-07 — commit `3e809e2`; project memory (`za-fleet-build`), since
promoted to a standing red flag.*

**What we saw.** The deal cascade dealt all seven cards at once — and had done
since the day it shipped. The animation is fast, and "all at once" reads as
"quick". **What we almost did:** nothing, for weeks. It was found by probing
computed transition delays at runtime, not by watching the deal.

**What it actually was.** The render inserted the nodes, read `offsetWidth` to
force layout, then wrote each card's `transition-delay`. That forced read
**resolves `@starting-style` immediately**: every card had already left its
starting state, so correct delays applied to nothing.

**The counter.** **Write transition delays at construction, before the first
layout read** — verified the only way this class can be, by reading the computed
delays back off live nodes: 0 / 55 / 110 / 165 / 220 ms. Now a standing red
flag, because it is invisible to every headless check.

### The hatch that wasn't

*2026-08-08 — commit `4df5b24`; sibling incident in `fc67b1d`.*

**What we saw.** Opponent card fans rendered as black smudges, from a hatch and
keyline implemented exactly as specified. **What we almost did:** nothing — it
*matched the spec*, which is what made it dangerous.

**What it actually was.** The hatch was `#151b33` stripes on `#101426` and the
keyline a near-black border on near-black felt. Every value was correct in
isolation and none had contrast against the surface it sat on. A hatch nobody
can see is a fill; a border the colour of the background is not a border.

**The counter.** **Contrast is a property of a pairing, not of a value** —
checked against the surface the element sits on, at the size it renders. The fix
was an identity, not a brightness tweak: the ZA! card back's own language at
sliver scale, bezel-on-cabinet weave and cheese keyline. *Sibling, same week:*
the cabinet murals went transparent with a second frame, but only frame B
animated — correct while B covered an opaque A. Transparent, both dough discs
showed at once. **Transparent frames must counter-phase.**

### A grid row is as tall as its tallest tenant

*2026-08-08 — commit `a006f8e`, "Every seat in the lobby tray is the same box".*

**What we saw.** The lobby seat tray read as two rows of different-sized tiles —
but only once somebody sat down. **What we almost did:** raise the `min-height`
until it covered the tallest case, which works until the next thing grows a seat.

**What it actually was.** Tiles had a `min-height`, and a seated chef with a
nickname chip outgrew it. A grid row sizes to its tallest item, so **only the
tiles sharing that row** stretched; the tray was being sized item by item.

**The counter.** **`grid-auto-rows: 1fr`** — the module owns the height, not the
item. A nickname chip now grows every seat together instead of one.

---

## III. The process protects the product

Several agents, several worktrees, one machine, one browser pane. Most of these
scars are not about code.

### The shell that remembered where it was

*2026-08-07 — project memory (`za-fleet-build`).*

**What we saw.** Commits meant for the main line landing on an agent's worktree
branch. **What we almost did:** blame the agent, which had done nothing wrong.

**What it actually was.** The Bash tool's working directory **persists between
calls**. One `cd` into a worktree earlier in the session silently redirected
every later `git commit`.

**The counter.** **Absolute paths and `git -C <path>`, always** — whenever more
than one checkout exists, which here is always. (This document was written under
that rule; the agent that wrote it never left its own worktree.)

### `git add -A` scooped up the agents

*2026-08-07 — project memory (`za-fleet-build`).*

**What we saw.** A merge commit containing entire embedded worktree
repositories.

**What it actually was.** `git add -A` from the repo root swept
`.claude/worktrees` — other agents' checkouts — into the index.

**The counter.** `.claude/` is gitignored now, but the durable rule is narrower:
**stage explicit paths (or `git add -u`), never `-A` from the root.**

### The pattern kill that hit the wrong process

*2026-08-07 — project memory (`za-fleet-build`).*

**What we saw.** An agent's dev server dying mid-verification, with no error it
could see.

**What it actually was.** A sibling agent ran `pkill -f "node server"` to clean
up its own server. The pattern matched everyone's.

**The counter.** **Kill by port, never by pattern**: `lsof -ti:PORT | xargs
kill`. Parallel agents get distinct ports and are told the rule explicitly,
because the default instinct is the pattern.

### A delegate's verification is a premise, not a fact

*Standing rule from the working harness; illustrated by commits `2f2a971`,
`a3227c6`, `dab5b22` and this cycle's review notes.*

**What we saw.** Agent reports of the form "implemented, all tests green".
**What we almost did:** approve them. The reports were honest and the tests were
genuinely green.

**What it actually was.** Green tests prove the delegate's *new* code runs. They
say nothing about whether the **original failing path** is fixed, and nothing at
all about the defects no headless check can see — see all of section I. On the
pit merge, three surfaced only by re-running the crowded-hand scenario live at
375px: a rail stretching its container, a promotion breaking sort order, an
unreadable wild rib.

**The counter.** **Review means re-running the original failing scenario**, on
the original artifact where possible. "Tests pass" is banned as standalone
evidence; every claim is tagged VERIFIED (with the command, device or
observation) or UNVERIFIED (with the reason). And twice this cycle the agent's
**UNVERIFIED** lines were worth more than its VERIFIED ones: it said plainly it
could not test real-input limits, and could not toggle OS-level reduced motion —
it had checked reduced motion by serving the stylesheet with the media condition
rewritten to one always true, and said so rather than claiming the OS setting.
Both admissions aimed the second pass. An agent that admits a gap is more useful
than one that fills it.

### Specs meet reality and lose politely

*2026-08-07/08 — `design/design_handoff_za_pit/PROMPT.md`,
`design/design_handoff_za_cabinet/{PROMPT.md,PROMPT-marquee.md,ART.md}`,
`design/za-arcade-juice-spec.md`; commits `a3227c6`, `8c7e6ed`.*

**What we saw.** Every handoff collided with the codebase somewhere. The pit
spec contradicted itself (a drawn card promotes, *and* promotions never fire
mid-turn — but a draw does not change the top card, so both cannot hold). The
cabinet's width arithmetic could not ship literally. The juice board specified
an eyelid blink for portraits that are baked PNGs with no separable eyes, a lid
angle opposite to its own captions, and an animation on `width`.

**What we almost did.** Silently do the sensible thing — and every resolution
*was* sensible. But six months on, the next reader diffs code against spec,
finds a mismatch, and cannot tell a considered decision from a mistake.

**What it actually was.** A documentation problem wearing a code problem's
clothes — in the pit's case literally: all four findings were already resolved
deterministically in code, and the fix touched nothing in `public/`.

**The counter.** **The vendored spec stays verbatim; the delta is appended next
to it** under an "As shipped" heading, with reasoning — the pit's four
ambiguities, the cabinet's `--play-cap` gate, the murals' transparency, inline
`NOTE:` markers on three shipped keyframe deviations. The spec stays the record
of what was asked for; the appendix is what reality said back.

### The brief was ten commits stale

*2026-08-08 — this cycle's incident notes.*

**What we saw.** A worktree agent started from the base commit its brief named,
and found that base ten commits behind the branch it was to build on. **What we
almost did:** trust the brief. It was written by the orchestrator, it named a
specific base, and it was wrong.

**The counter.** The agent fast-forwarded itself and said so before starting.
**Facts stated in a brief are premises too**, including the ones the reviewer
wrote. Verify the base before building on it.

---

## IV. Design decisions that came from playtests

Two of the best changes here came from someone playing the game and asking a
short question.

### The pit that compressed nothing

*2026-08-08 — commits `2f2a971`, `1413517`, `fc67b1d`.*

**What we saw.** The overstuffed-hand redesign worked: dead cards drop into a
recessed strip of 20px ribs, playable cards stand full size in a near rail
below. It shipped, and it did that at every width. **What we almost did:** call
it done — it matched the handoff exactly.

**What it actually was.** One playtest question — *"how useful is it to stay
there when we have space?"* — and the answer was: not at all. Compression earns
its cost when cards do not fit; with a monitor's worth of room and a seven-card
hand it is not managing density, it is **hiding cards for no reason**.

**The counter.** The pit became the open kitchen: it **engages only when the
hand genuinely does not fit**, measured at runtime from a probe slot and
re-checked on resize. Otherwise every card stands full size, dead ones dimmed,
overlap only under pressure. **A density mechanism must measure the density it
responds to** — never assume the crowded case.

### The turn order everyone could see and nobody could read

*2026-08-08 — `design/design_handoff_za_table/PROMPT.md` (table branch); commits
`e2ad916`, `ce93dae`, `14ec4c1`.*

**What we saw.** Players asking whose turn it was, and who was next, while
looking straight at the answer. The opponent row was already sorted into true
turn order from the player after you, and already reversed on a Flip the Pie.
**What we almost did:** label it harder — ordinal badges, a bigger highlight,
arrows. More paint on a surface that was not the problem.

**What it actually was.** **A row of equal panels reads as a roster, not a
queue.** Nothing in the shape says "sequence", so players read the name off the
marquee and then hunted for the matching panel. A second loss rode along: card
counts were numerals, so "Nonna Pina is down to two" was something you read
rather than something you saw.

**The counter.** Furniture instead of labels. Chefs sit around a counter drawn
in three dashed sides, open at the near edge where your hand already is — turn
order becomes *where people are sitting*. Counts became physical: up to seven
cards is a literal fan, eight or more a deck with the numeral on its tray. A
chevron token walks from the chef playing to the chef next, and a reverse is
**the token turning around and walking back**. The tell that this was the right
shape: it **deleted** code — the reversal in `orderedOpponents()` and the whole
hard-swap path came out, verified by asserting every seat's
`offsetLeft`/`offsetTop` and the pile's rect byte-identical across a turn
advance and a direction flip.

---

## House rules

The transferable one-liners. Each cost us something.

**Instruments**
- Reconcile sample count against `window × expected rate` before any percentile.
- Never verify motion with a screenshot of motion — `getComputedStyle`,
  `getAnimations()`, or seek/finish through WAAPI.
- A transition at `currentTime` 0 reads its start value; finish it before you
  judge it.
- Size assertions use `offsetWidth`/`offsetHeight`; rects lie mid-animation.
- Verify in the environment that produced the bug, not a friendlier one.

**CSS**
- A present-but-unusable custom property never falls back. Gate arithmetic
  behind a length-valued twin, and write the invariant down.
- `max()` beside a length needs `0px`, not `0`.
- `@starting-style` obeys the cascade; restate it after any rule that outranks
  it on opacity.
- Never force a layout read between inserting nodes and writing their delays.
- Contrast is measured against the surface an element sits on, at rendered size.
- Transparent frames in a two-frame loop must counter-phase.
- `grid-auto-rows: 1fr` when the module should own the height, not the item.
- Layout-mode flips listen to `matchMedia`, never to rAF behind a resize.

**Process**
- Shell cwd persists between calls. `git -C` and absolute paths, always.
- Stage explicit paths. Never `git add -A` from the root with worktrees around.
- Kill by port, never by pattern.
- A delegate's verification is a premise: re-run the original failing scenario.
- An honest UNVERIFIED beats a confident VERIFIED — it aims the second pass.
- Facts stated in a brief are premises too, including the base commit.
- Vendored specs stay verbatim; append "As shipped", with reasoning, beside them.

**Design**
- A mechanism that manages a constraint must measure it at runtime.
- If people cannot read what is already on screen, the visual language is
  throwing it away — change the shape, not the labels.
- The right structural fix usually deletes code.
