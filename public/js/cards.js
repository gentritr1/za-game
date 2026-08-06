/**
 * Card rendering module.
 *
 * Every card on screen comes from `renderCard()`. Nothing else in the client
 * builds card markup. To swap the emoji placeholders for real artwork, drop the
 * files into `public/assets/cards/` and set `USE_IMAGES = true`. The game logic
 * does not change. See the README for the full file naming convention.
 */

/** The complete generated deck is installed in public/assets/cards/. */
export const USE_IMAGES = true;

export const ASSET_DIR = 'assets/cards';

/** Topping suits. `slug` is the part used in the asset file name. */
export const TOPPINGS = {
  pepperoni: { slug: 'pepperoni', label: 'Pepperoni', emoji: '🍕' },
  basil: { slug: 'basil', label: 'Basil', emoji: '🌿' },
  cheese: { slug: 'cheese', label: 'Cheese', emoji: '🧀' },
  anchovy: { slug: 'anchovy', label: 'Anchovy', emoji: '🐟' },
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

/** Full spoken name of a card. Used for the log and for aria labels. */
export function describeCard(card) {
  if (!card) return 'no card';
  if (isWild(card)) return KINDS[card.kind].label + (card.kind === 'wild4' ? ' plus four' : '');
  const suit = TOPPINGS[card.suit].label;
  if (card.kind === 'number') return `${suit} ${card.value}`;
  return `${suit} ${KINDS[card.kind].label}`;
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
  return KINDS[card.kind].label;
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
 * @param {string}  [options.size]      'hand' | 'pile' | 'mini'
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
    art.append(el('span', 'card__back-pie', '🍕'), el('span', 'card__back-word', 'ZA'));
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

  // --- emoji placeholder face ---
  const suitEmoji = isWild(card) ? '🍕' : TOPPINGS[card.suit].emoji;
  const index = cornerIndex(card);

  const makeCorner = (side) => {
    const corner = el('span', `card__index card__index--${side}`);
    corner.setAttribute('aria-hidden', 'true');
    corner.append(el('b', 'card__index-val', index));
    if (!isWild(card)) corner.append(el('i', 'card__index-suit', suitEmoji));
    return corner;
  };

  const face = el('span', 'card__face');
  const disc = el('span', 'card__disc');
  disc.setAttribute('aria-hidden', 'true');
  disc.append(el('span', 'card__glyph', centerGlyph(card)));

  face.append(disc, el('span', 'card__foot', footLabel(card)));

  root.append(makeCorner('tl'), face, makeCorner('br'));
  return root;
}

/** Small swatch used by the topping picker and the current-topping badge. */
export function toppingChip(toppingKey) {
  const meta = TOPPINGS[toppingKey];
  const node = el('span', `chip chip--${toppingKey}`);
  node.append(el('i', 'chip__emoji', meta.emoji), el('b', 'chip__label', meta.label));
  return node;
}

export { TOPPINGS as TOPPING_META };
