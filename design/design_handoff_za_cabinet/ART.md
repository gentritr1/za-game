# Art windows — 1A, the literal cabinet

Two placeholders only. Both are dashed windows in the rendered board, sized
from `--panel-w`. At a 2400px viewport with a 1900px cap that is **250 × 333**
per side; they scale with the panel, so generate at 2x (500 × 666) and let CSS
fit them.

Nothing in the game depends on these existing — the panels read correctly with
the dashed window in place, which is how they should ship until the art lands.

## Left panel — chef mural

Vertical arcade cabinet side art. A pizza chef mid-toss, seen from the side,
dough disc in the air above outstretched hands. Flat colour, hard edges, no
gradients, four colours only: `#ff2e6b`, `#ffe14d`, `#3ddc7f`, `#0d0f1a`.
Heavy black keylines. 1980s cabinet vinyl, not illustration — think screen
print with visible registration.

## Right panel — oven mural

The same treatment: a stone oven mouth seen straight on, flames inside, a peel
leaning against it. Same four colours, same keylines. It should read as the
mirror of the left panel at a glance and not compete with the chalkboard
special sitting above it.

## Both

- No text in the art. The panels carry their own type.
- No perspective, no shading, no soft light.
- Transparent background is fine; the panel checker sits behind it.
- Deliver as PNG at 2x, `public/assets/cabinet-left.png` and
  `public/assets/cabinet-right.png`.

---

## As shipped — transparent, and animated in two frames

Both murals shipped background-removed (RGBA over the panel checker, as this
file allows) and each carries a second frame for an arcade-style two-frame
loop: `cabinet-left-b.png` (the dough drops to the fingertips) and
`cabinet-right-b.png` (the flames in an alternate lick). The flip is two
stacked images and a stepped opacity swap — `steps(1, end)`, opacity only,
frame A alone under `prefers-reduced-motion`.
