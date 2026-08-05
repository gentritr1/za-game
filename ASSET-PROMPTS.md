# Pizzuno — Image Generation Prompts (GPT Image 2)

Ready-to-paste prompts for generating the final art for Pizzuno with GPT Image 2 (or any
capable image model). The game already works with CSS/emoji placeholders; these assets are
a drop-in replacement.

## How to install the generated art

1. Generate each card image and save it with the **exact file name** from the tables below.
2. Drop the files into `public/assets/cards/` (create the folder if needed).
3. In [public/js/cards.js](public/js/cards.js) set `USE_IMAGES = true`.
4. Ambience images go in `public/assets/` and are wired up in `public/css/styles.css`
   (replace the CSS-drawn backgrounds where noted).

Nothing else changes — the render module builds every card through one function.

## Technical spec (applies to every card)

- **Aspect ratio:** 5:7 portrait (e.g. 1000 × 1400 px). PNG.
- **Full bleed, square corners.** Do NOT bake rounded corners or drop shadows into the
  image — the CSS clips corners and adds shadows.
- **Composition (matches a real playing card):** value/symbol index in the top-left and
  bottom-right corners (bottom-right rotated 180°), one big central emblem, card name in a
  small banner near the bottom.
- **Legibility first:** the corner index must be readable at 60 px card height.
- Keep a consistent seed/style reference across the whole batch if the tool supports it.

## Global style block — prepend this to EVERY prompt

> Flat, playful cartoon illustration in a warm 1970s Italian pizza-parlor style. Thick
> confident outlines, soft grain texture, slightly imperfect hand-printed screen-print look.
> Warm palette anchored in tomato red, basil green, mozzarella cream, and crust brown.
> Cozy, appetizing, charming — like a beloved neighborhood pizzeria's menu art. No
> photorealism, no 3D render, no gradients heavier than subtle paper shading, no drop
> shadows, no rounded corners, full-bleed composition, 5:7 portrait playing card.

## Suit palettes

| Suit | Card base color | Accent | Emblem |
|---|---|---|---|
| Pepperoni | Tomato red `#D94F3C` | Deep red `#A93226` | A glossy pepperoni slice with charred edges |
| Basil | Basil green `#5C8A4E` | Deep green `#3E6B34` | A fresh basil sprig with two leaves |
| Cheese | Mozzarella yellow `#E8B94A` | Golden `#C99530` | A melty cheese wedge with a cheese-pull |
| Anchovy | Mediterranean blue `#4A7A9B` | Deep navy `#2F5670` | A cheeky little anchovy fish, eyes open |

## 1. Number cards (40 files)

Files: `pepperoni-0.png` … `pepperoni-9.png`, `basil-0.png` … `basil-9.png`,
`cheese-0.png` … `cheese-9.png`, `anchovy-0.png` … `anchovy-9.png`

Template — replace `{SUIT}`, `{EMBLEM}`, `{BASE}`, `{ACCENT}`, `{N}`:

> [Global style block] Playing card face for the card game "Pizzuno". Background: cream
> paper `#F5EFE0` with a wide border frame in {BASE}. Large numeral "{N}" in the center on
> a round cream plate, in a chunky friendly retro sign-painter font, colored {ACCENT}.
> The {EMBLEM} sits tucked behind the plate, peeking out. Small "{N}" index with a tiny
> {SUIT} icon in the top-left and bottom-right corners (bottom-right rotated 180°). A small
> banner at the bottom reads "{SUIT}". Subtle checkered-tablecloth pattern watermark in the
> frame corners.

## 2. Action cards (12 files)

Files: `{suit}-burnt-slice.png`, `{suit}-flip-the-pie.png`, `{suit}-extra-toppings.png`
for each of `pepperoni`, `basil`, `cheese`, `anchovy`.

**Burnt Slice (skip)** — corner index `⊘`:

> [Global style block] Action card for "Pizzuno" in the {SUIT} suit, base color {BASE}.
> Central emblem: a pizza slice with comically charred black bubbly edges and a thin wisp
> of smoke, on a round cream plate. A bold prohibition ring `⊘` around the slice in
> {ACCENT}. Corner indices "⊘" top-left and bottom-right with a tiny {SUIT} icon. Bottom
> banner reads "BURNT SLICE". Mood: oops, the oven was too hot.

**Flip the Pie (reverse)** — corner index `⇄`:

> [Global style block] Action card for "Pizzuno" in the {SUIT} suit, base color {BASE}.
> Central emblem: a whole pizza mid-flip in the air, spinning, with two curved arrows
> chasing each other around it in {ACCENT}, a proud chef's hand tossing it from below.
> Corner indices "⇄" top-left and bottom-right with a tiny {SUIT} icon. Bottom banner reads
> "FLIP THE PIE". Mood: show-off pizzaiolo energy.

**Extra Toppings +2 (draw two)** — corner index `+2`:

> [Global style block] Action card for "Pizzuno" in the {SUIT} suit, base color {BASE}.
> Central emblem: a generous hand raining extra toppings (olives, mushrooms, peppers, and
> plenty of {SUIT}) down onto a waiting pizza slice on a round cream plate. A bold "+2" in
> {ACCENT} beside the plate. Corner indices "+2" top-left and bottom-right with a tiny
> {SUIT} icon. Bottom banner reads "EXTRA TOPPINGS". Mood: abundance, maybe too much.

## 3. Wild cards (2 files)

**`wild-chefs-choice.png`** — corner index `★`:

> [Global style block] Wild card for "Pizzuno". Background: rich crust brown `#6B4A2F`
> with a cream frame. Central emblem: a jolly mustachioed chef in a tall white hat,
> presenting a pizza divided into four equal quarters — tomato red, basil green, mozzarella
> yellow, Mediterranean blue — one quarter per suit. Corner indices "★" top-left and
> bottom-right. Bottom banner reads "CHEF'S CHOICE". Mood: the chef decides, trust him.

**`wild-whole-pie.png`** — corner index `+4`:

> [Global style block] Wild card for "Pizzuno". Background: deep crust brown `#54391F`
> with a cream frame, slightly more dramatic lighting than the other cards. Central emblem:
> a whole uncut pizza seen from above, its surface split into four quarters colored tomato
> red, basil green, mozzarella yellow, and Mediterranean blue, with a bold "+4" stamped
> across it in cream. Tiny sweat drop on the pizza — it knows what it's doing. Corner
> indices "+4" top-left and bottom-right. Bottom banner reads "THE WHOLE PIE". Mood: the
> heaviest card in the box.

## 4. Card back (1 file)

**`card-back.png`**:

> [Global style block] The back of every card in "PizzUNO". Red-and-cream checkered
> tablecloth pattern `#D94F3C` / `#F5EFE0` at a 45° angle, with a central round crust-brown
> medallion containing a single pizza slice and the word "PIZZUNO" in a chunky retro
> sign-painter arc. Symmetrical in both axes so it reads the same upside down. Ornamental
> thin border line in crust brown.

## 5. Ambience & surrounding art

Save these in `public/assets/` and wire them in `public/css/styles.css`.

**`bg-tablecloth.png`** — home / lobby background (replaces the CSS checker pattern):

> [Global style block] Seamless tileable texture, top-down view of a red-and-cream
> checkered pizzeria tablecloth `#D94F3C` / `#F5EFE0`, with very subtle fabric weave,
> faint flour dust, and the occasional tiny tomato-sauce fingerprint. Low contrast so UI
> cards float on top legibly. Square, 1024 × 1024, seamless edges.

**`bg-table-wood.png`** — game table background:

> [Global style block] Seamless tileable texture, top-down view of a warm dark walnut
> pizzeria tabletop, hand-worn, with subtle wood grain, faint ring stains from soda
> glasses, and a light dusting of semolina flour near the edges. Dark and low-contrast so
> bright playing cards pop against it. Square, 1024 × 1024, seamless edges.

**`logo-wordmark.png`** — home screen wordmark (transparent PNG):

> [Global style block] Logo wordmark "PIZZUNO" in a chunky, bouncy retro sign-painter
> style, letters in tomato red with a cream outline and crust-brown drop edge, the letter
> "U" replaced by a folded pizza slice. A little steam curl rises off the "O". A small
> green "EXTRA CHEESY" award ribbon tucked behind the last letter. Transparent background.

**`favicon.png`** — browser tab icon, 256 × 256:

> [Global style block] App icon: a single cheerful pizza slice with one bite taken out,
> thick outline, on a tomato-red rounded-square background. Readable at 16 × 16.

**`avatar-chef-bot.png`** — the chef bot's face in lobby and at the table:

> [Global style block] Round avatar portrait of a jolly robot pizza chef: square friendly
> tin face, curly mustache made of copper wire, tall white chef's hat, one raised eyebrow
> LED. Cream background circle. Transparent outside the circle. 512 × 512.

**`win-confetti.png`** — win screen celebration art (transparent PNG):

> [Global style block] Celebration burst: pizza slices, olives, basil leaves, and little
> anchovies flying outward like confetti with motion streaks, on a transparent background.
> Composed as a ring with an empty center so a headline fits in the middle.

**`empty-table.png`** — lobby empty state ("a table of one is just a sad snack"):

> [Global style block] A small round pizzeria table set for two with one empty chair, a
> single lonely slice on a plate, and a hopeful little anchovy peeking over the table edge.
> Soft, funny, inviting. Transparent background vignette.

## 6. Optional audio ambience (for an audio model, later)

- **Room tone:** "Cozy Italian pizzeria at a quiet hour: faint accordion radio, distant
  oven door, occasional cutlery clink, low murmur. Seamless 60-second loop, unobtrusive."
- **Card play:** "One soft card snap on a wooden table, warm, dry, under 300 ms."
- **Draw:** "A quick card slide off a paper deck, subtle, under 250 ms."
- **PIZZUNO shout sting:** "A tiny playful two-note kazoo-and-bell sting, under 1 second."
- **Win:** "A short cheerful trattoria fanfare: accordion + hand claps, 2 seconds."

## Consistency checklist (read before generating the batch)

- [ ] Same style block prepended to every prompt, same seed/style reference if available.
- [ ] All cards 5:7 portrait, full bleed, square corners, no baked shadows.
- [ ] Corner indices legible at 60 px height; bottom-right index rotated 180°.
- [ ] The four suit base colors stay exactly on palette so suits read at a glance.
- [ ] Number glyphs use the same font/style across all 40 number cards.
- [ ] Card back is symmetrical upside down.
- [ ] Textures (`bg-*.png`) tile seamlessly.
