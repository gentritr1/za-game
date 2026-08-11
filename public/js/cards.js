/**
 * Card rendering module.
 *
 * Every card on screen comes from `renderCard()`. Nothing else in the client
 * builds card markup. To swap the emoji placeholders for real artwork, drop the
 * files into `public/assets/cards/` and set `USE_IMAGES = true`. The game logic
 * does not change. See the README for the full file naming convention.
 */

import { icon } from './icons.js';

/**
 * Arcade direction: the frame, indexes and banner are DOM + Press Start 2P,
 * and only the sprite in the centre window is generated art. The 55 baked
 * card faces from the parlour build stay on disk but are not used here.
 */
export const USE_IMAGES = false;

export const ASSET_DIR = 'assets/cards';
export const SPRITE_DIR = 'assets/sprites';

/**
 * Topping suits. `slug` is the part used in the asset file name; `token` is the
 * three-letter form a banner falls back to when the strip it has to print in is
 * too narrow to finish the full word. Cheese is CHZ, not CHE, so no two tokens
 * share their first two letters with a different suit in a hurry.
 */
export const TOPPINGS = {
  pepperoni: { slug: 'pepperoni', label: 'Pepperoni', emoji: '🍕', token: 'PEP' },
  basil: { slug: 'basil', label: 'Basil', emoji: '🌿', token: 'BAS' },
  cheese: { slug: 'cheese', label: 'Cheese', emoji: '🧀', token: 'CHZ' },
  anchovy: { slug: 'anchovy', label: 'Anchovy', emoji: '🐟', token: 'ANC' },
};

export const TOPPING_ORDER = ['pepperoni', 'basil', 'cheese', 'anchovy'];

/** Card kinds. `index` is the small corner symbol, like on a real card. */
const KINDS = {
  number: { label: null, emoji: null, index: null, slug: null },
  /* ASCII indexes: Press Start 2P has no glyph for ⊘ ⇄ ★. */
  skip: { label: 'Burnt Slice', emoji: '🔥', index: 'X', slug: 'burnt-slice' },
  reverse: { label: 'Flip the Pie', emoji: '🔄', index: '<>', slug: 'flip-the-pie' },
  draw2: { label: 'Extra Toppings', emoji: '🫒', index: '+2', slug: 'extra-toppings' },
  wild: { label: "Chef's Choice", emoji: '👨‍🍳', index: '*', slug: 'chefs-choice' },
  wild4: { label: 'The Whole Pie', emoji: '🍕', index: '+4', slug: 'whole-pie' },
};

export function isWild(card) {
  return card && (card.kind === 'wild' || card.kind === 'wild4');
}

/**
 * THE EFFECT-FIRST CARDS.
 *
 * Playtesting the comprehension prototype turned up the same answer over and
 * over: a player looking at Burnt Slice cannot tell you what it does, and a
 * player looking at ⊘ SKIP can. The three cards whose whole point is what they
 * do to the table therefore lead with the effect — a big glyph in the window
 * and the effect word on the banner — while the topping steps back to the
 * keyline colour and the corner mark. The parlour names are not deleted; they
 * move to where a name belongs, which is the spoken label and the rule book.
 *
 * `word` is the banner. `glyph` names an icon in `icons.js`, or `text` is set
 * when the effect is already a legible pair of characters and drawing it would
 * be a worse version of typing it. Both never at once.
 */
export const EFFECTS = {
  skip: { word: 'Skip', glyph: 'skip', text: null, spoken: 'skip' },
  reverse: { word: 'Reverse', glyph: 'reverse', text: null, spoken: 'reverse' },
  draw2: { word: 'Draw two', glyph: null, text: '+2', spoken: 'draw two' },
};

/** The effect a card leads with, or null for a number, a wild or no card. */
export function effectOf(card) {
  if (!card) return null;
  return EFFECTS[card.kind] || null;
}

/** Full spoken name of a card. Used for the log and for aria labels. */
export function describeCard(card) {
  if (!card) return 'no card';
  if (isWild(card)) return KINDS[card.kind].label + (card.kind === 'wild4' ? ' plus four' : '');
  const suit = TOPPINGS[card.suit].label;
  if (card.kind === 'number') return `${suit} ${card.value}`;
  // A name is not an effect: "Extra Toppings" heard on its own could be
  // anything, and so could "Burnt Slice" and "Flip the Pie". The +2 has said
  // what it costs for a while; now that the printed face leads with the effect
  // on all three, all three say it out loud too, in the one word the banner
  // uses. Word order is unchanged — the effect is appended, never swapped in
  // front of the name, so every line that prints this reads as it always did.
  const effect = EFFECTS[card.kind];
  if (effect) return `${suit} ${KINDS[card.kind].label}, ${effect.spoken}`;
  return `${suit} ${KINDS[card.kind].label}`;
}

/**
 * The other way onto the pile, in words.
 *
 * A card is legal if it matches the topping, OR if it repeats what the top
 * card IS: the same number, or the same action. This is that second thing,
 * named for a player who has just been told their card does not match.
 *
 * A wild on top names nothing — after it, only the topping somebody chose is
 * asked for — so it returns the empty string rather than a word, and the
 * sentence it is printed into never offers a way in that is not there.
 */
export function matchValue(card) {
  if (!card || isWild(card)) return '';
  if (card.kind === 'number') return String(card.value);
  const effect = EFFECTS[card.kind];
  if (effect) return effect.word;
  return KINDS[card.kind].label;
}

/**
 * File name for the artwork of a card, following the documented convention.
 *   pepperoni-7.png · basil-burnt-slice.png · wild-chefs-choice.png · card-back.png
 */
export function cardAssetPath(card) {
  if (!card) return `${ASSET_DIR}/card-back.png`;
  if (isWild(card)) return `${ASSET_DIR}/wild-${KINDS[card.kind].slug}.png`;
  const suit = TOPPINGS[card.suit].slug;
  const tail = card.kind === 'number' ? String(card.value) : KINDS[card.kind].slug;
  return `${ASSET_DIR}/${suit}-${tail}.png`;
}

/** The big glyph in the middle of a card. */
function centerGlyph(card) {
  if (card.kind === 'number') return String(card.value);
  return KINDS[card.kind].emoji;
}

/** The small symbol in the two opposite corners. */
function cornerIndex(card) {
  if (card.kind === 'number') return String(card.value);
  return KINDS[card.kind].index;
}

/** The short line of text under the glyph. Suits never rely on colour alone. */
function footLabel(card) {
  if (card.kind === 'wild') return 'Any topping';
  if (card.kind === 'wild4') return 'Whole pie +4';
  if (card.kind === 'number') return TOPPINGS[card.suit].label;
  // SKIP, REVERSE, DRAW TWO. The parlour name is on the rules page, in the
  // chatter and in the spoken label; the banner is the one place on the card
  // where a player who has never seen this deck needs the answer, not the joke.
  // The topping token stays beside the effect so the card never asks somebody
  // to recover its match suit from colour alone.
  const effect = EFFECTS[card.kind];
  if (effect) return `${effect.word} · ${TOPPINGS[card.suit].token}`;
  return KINDS[card.kind].label;
}

/**
 * The three-letter suit token, for a banner printed into a strip too narrow to
 * finish the full label in. A wild has no suit, so it says so.
 */
export function suitToken(card) {
  if (!card) return '';
  if (isWild(card)) return 'WILD';
  return TOPPINGS[card.suit].token;
}

/** The small corner symbol, for anyone sizing a frame around it. */
export function cardIndex(card) {
  return card ? cornerIndex(card) : '';
}

/**
 * One ASCII letter for the suit: P, B, C, A — the first letter of the same
 * three-letter token a narrow banner falls back to, so the two forms never
 * disagree. A wild has no suit until somebody names one, and Press Start 2P
 * has no star glyph, so it says W rather than drawing a tofu box.
 *
 * This exists for the rib, which is the whole card at 20px: no window, no
 * banner, second corner hidden. Without it the only thing on a rib saying what
 * suit it is, is the colour of its keyline.
 */
export function suitLetter(card) {
  if (!card) return '';
  if (isWild(card)) return 'W';
  return TOPPINGS[card.suit].token.charAt(0);
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * Builds one card element.
 *
 * @param {object|null} card       card data from the server, or null for a back
 * @param {object} [options]
 * @param {boolean} [options.faceDown]  render the back of the card
 * @param {string}  [options.size]      'hand' | 'pile' | 'mini' | 'rib'
 * @param {boolean} [options.playable]  highlight it as playable
 * @param {boolean} [options.dimmed]    fade it as not playable
 * @param {boolean} [options.interactive] make it a real button
 * @returns {HTMLElement}
 */
export function renderCard(card, options = {}) {
  const { faceDown = false, size = 'hand', playable = false, dimmed = false, interactive = false } = options;

  const root = el(interactive ? 'button' : 'div', 'card');
  root.classList.add(`card--${size}`);
  if (interactive) root.type = 'button';

  if (faceDown || !card) {
    root.classList.add('card--back');
    root.setAttribute('aria-hidden', 'true');
    if (USE_IMAGES) {
      const img = el('img', 'card__art');
      img.src = cardAssetPath(null);
      img.alt = '';
      img.decoding = 'async';
      img.draggable = false;
      root.append(img);
      return root;
    }
    const art = el('span', 'card__back-art');
    art.append(el('span', 'card__back-word', 'ZA!'));
    root.append(art);
    return root;
  }

  const suitKey = isWild(card) ? 'wild' : card.suit;
  root.classList.add(`card--${suitKey}`);
  if (isWild(card)) root.classList.add('card--is-wild');
  if (playable) root.classList.add('is-playable');
  if (dimmed) root.classList.add('is-dimmed');
  root.dataset.cardId = card.id;
  root.dataset.kind = card.kind;

  const label = describeCard(card);
  if (interactive) root.setAttribute('aria-label', `Play ${label}`);
  else {
    root.setAttribute('role', 'img');
    root.setAttribute('aria-label', label);
  }

  if (USE_IMAGES) {
    const img = el('img', 'card__art');
    img.src = cardAssetPath(card);
    img.alt = '';
    img.decoding = 'async';
    img.draggable = false;
    img.loading = 'lazy';
    root.append(img);
    return root;
  }

  // --- arcade face: DOM frame + sprite window ---
  const index = cornerIndex(card);
  // Press Start 2P is fixed pitch at 11px a glyph, so a two-glyph index (+2,
  // <>, +4) needs 22px of face where a one-glyph index needs 11. Only the rib
  // is narrow enough to care, but the count belongs with the markup rather
  // than with whoever happens to be sizing the frame.
  root.dataset.glyphs = String(index.length);

  // The suit letter rides in the corner with the index and is drawn only at
  // rib size (the stylesheet decides). A rib hides the window, the banner and
  // the second corner, so without this its suit reaches the player as nothing
  // but the colour of its keyline. The letter is the same colour as that
  // keyline, so it adds a glyph and no new colour.
  const mark = suitLetter(card);

  const makeCorner = (side) => {
    const corner = el('span', `card__index card__index--${side}`);
    corner.setAttribute('aria-hidden', 'true');
    corner.append(el('b', 'card__index-val', index), el('i', 'card__index-suit', mark));
    return corner;
  };

  const windowEl = el('span', 'card__window');
  windowEl.setAttribute('aria-hidden', 'true');
  const sprite = el('img', 'card__sprite');
  sprite.src = `${SPRITE_DIR}/${spriteSlug(card)}.png`;
  sprite.alt = '';
  sprite.decoding = 'async';
  sprite.loading = 'lazy';
  sprite.draggable = false;

  // THE EFFECT LEADS. On a number the window prints its value, exactly as it
  // always did. On the three effect cards the two-character index ("<>", "X")
  // was the one thing in the middle of the card, and it is a code — the player
  // has to have been told what it stands for. It becomes a drawn glyph at the
  // size the value used to be, with the word underneath on the banner. The
  // generated sprite stays behind it: the art is the parlour's, only the
  // reading order changed.
  const effect = effectOf(card);
  if (effect) root.classList.add('card--effect');
  const value = el('span', 'card__value');
  if (effect && effect.glyph) {
    value.classList.add('card__value--glyph');
    value.append(icon(effect.glyph));
  } else {
    value.textContent = effect && effect.text ? effect.text : index;
  }
  windowEl.append(sprite, value);

  // The banner carries both forms of its own name and the stylesheet picks
  // one: a card the next card covers can only finish the three-letter token in
  // the strip it still exposes, and a label is never placed in a strip it
  // cannot finish in. Both are built here so `renderCard` stays the only place
  // card markup is made — the choice between them is a class, not a rewrite.
  const banner = el('span', 'card__banner');
  banner.setAttribute('aria-hidden', 'true');
  banner.append(
    el('b', 'card__banner-full', footLabel(card)),
    el('b', 'card__banner-tok', suitToken(card))
  );

  root.append(makeCorner('tl'), windowEl, banner, makeCorner('br'));
  return root;
}

/** Which window sprite a card face uses. One per suit, action kind, or wild. */
function spriteSlug(card) {
  if (card.kind === 'wild') return 'chefs-choice';
  if (card.kind === 'wild4') return 'whole-pie';
  if (card.kind === 'number') return TOPPINGS[card.suit].slug;
  return KINDS[card.kind].slug;
}

/** Small swatch used by the topping picker and the current-topping badge. */
export function toppingChip(toppingKey) {
  const meta = TOPPINGS[toppingKey];
  const node = el('span', `chip chip--${toppingKey}`);
  node.append(el('i', 'chip__emoji', meta.emoji), el('b', 'chip__label', meta.label));
  return node;
}

export { TOPPINGS as TOPPING_META };
