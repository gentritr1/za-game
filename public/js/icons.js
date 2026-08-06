/**
 * The parlour icon set. Every glyph the UI needs, drawn as inline SVG in the
 * game's own palette, so no icon ever falls back to an emoji font and the
 * whole interface reads as one hand.
 *
 * Monochrome icons (cycle, cardback, chefhat) use currentColor and inherit
 * the text colour of wherever they sit. The suit emblems and the slice carry
 * their own brand colours.
 */

/* Arcade direction: neon suits on cabinet darks. */
const PALETTE = {
  tomato: '#ff2e6b',
  tomatoDeep: '#c11a4c',
  basil: '#3ddc7f',
  basilDeep: '#22a058',
  cheese: '#ffe14d',
  cheeseDeep: '#c9a800',
  anchovy: '#4d7dff',
  anchovyDeep: '#2a52c9',
  crust: '#ffe14d',
  crustDeep: '#c9a800',
  cream: '#e8ecff',
  cheesePale: '#fff08a',
};

const P = PALETTE;

const DRAWINGS = {
  // A slice seen from the side: crust arc, cheese body, three pepperoni.
  slice: `
    <path d="M2.8 6.6 C7.6 3.4 16.4 3.4 21.2 6.6 L19.8 9.2 C15.6 6.6 8.4 6.6 4.2 9.2 Z" fill="${P.crust}"/>
    <path d="M4.2 9.2 C8.4 6.6 15.6 6.6 19.8 9.2 L12 21.8 Z" fill="${P.cheesePale}"/>
    <circle cx="12" cy="11.4" r="1.7" fill="${P.tomato}"/>
    <circle cx="9" cy="14.2" r="1.4" fill="${P.tomato}"/>
    <circle cx="13.6" cy="15.8" r="1.3" fill="${P.tomato}"/>
  `,
  // Suit emblems, matching the card corner symbols.
  pepperoni: `
    <circle cx="12" cy="12" r="8.6" fill="${P.tomato}"/>
    <circle cx="12" cy="12" r="8.6" fill="none" stroke="${P.tomatoDeep}" stroke-width="1.4"/>
    <circle cx="9.4" cy="10" r="1.5" fill="${P.tomatoDeep}"/>
    <circle cx="14.8" cy="9.4" r="1.2" fill="${P.tomatoDeep}"/>
    <circle cx="10.4" cy="14.8" r="1.2" fill="${P.tomatoDeep}"/>
    <circle cx="15" cy="13.8" r="1.5" fill="${P.tomatoDeep}"/>
  `,
  basil: `
    <path d="M12 21 C12 14 12.6 8.4 13.8 4.4" fill="none" stroke="${P.basilDeep}" stroke-width="1.6" stroke-linecap="round"/>
    <path d="M13.4 5.4 C9 4 5.6 5.8 4.4 9.6 C8.6 11.4 12.4 9.8 13.4 5.4 Z" fill="${P.basil}"/>
    <path d="M13.9 6.2 C18 5.2 20.6 7 21.2 10.4 C17.4 11.8 14.4 10.2 13.9 6.2 Z" fill="${P.basilDeep}"/>
  `,
  cheese: `
    <path d="M2.6 17.8 L21.4 9.4 L21.4 18.6 L2.6 18.6 Z" fill="${P.cheese}"/>
    <path d="M2.6 17.8 L21.4 9.4 L21.4 11.2 L4.8 18.6 L2.6 18.6 Z" fill="${P.cheeseDeep}" opacity=".55"/>
    <circle cx="14.6" cy="14.6" r="1.5" fill="${P.cream}"/>
    <circle cx="9.4" cy="16.6" r="1.1" fill="${P.cream}"/>
    <circle cx="18.4" cy="16.4" r="1" fill="${P.cream}"/>
  `,
  anchovy: `
    <path d="M3.4 12 C6.4 8.2 11.4 6.8 15.8 8.8 C18 9.8 19.6 11 20.6 12 C19.6 13 18 14.2 15.8 15.2 C11.4 17.2 6.4 15.8 3.4 12 Z" fill="${P.anchovy}"/>
    <path d="M20.6 12 L23 8.8 L23 15.2 Z" fill="${P.anchovyDeep}" transform="translate(-2.4 0)"/>
    <circle cx="6.8" cy="11.2" r="1" fill="${P.cream}"/>
  `,
  // A licking flame for the oven buttons.
  flame: `
    <path d="M12 2.6 C13.2 6 17.8 8.2 17.8 13.2 C17.8 17.6 15.2 20.6 12 20.6 C8.8 20.6 6.2 17.6 6.2 13.2 C6.2 10.4 7.6 8.6 8.8 7 C8.9 8.4 9.4 9.4 10.4 10 C10 7.2 10.8 4.4 12 2.6 Z" fill="${P.tomato}"/>
    <path d="M12 9.4 C12.9 11 14.8 12.2 14.8 14.9 C14.8 17.3 13.6 18.8 12 18.8 C10.4 18.8 9.2 17.3 9.2 14.9 C9.2 13.3 9.9 12.2 10.6 11.3 C10.8 12.1 11.2 12.7 11.7 13 C11.4 11.7 11.5 10.5 12 9.4 Z" fill="${P.cheese}"/>
  `,
  // A chef's hat for hiring the bot. Monochrome, inherits text colour.
  chefhat: `
    <path d="M7.2 10.2 C5 10.2 3.4 8.7 3.4 6.9 C3.4 5.1 5 3.7 6.9 3.7 C7.4 2.3 9.4 1.3 12 1.3 C14.6 1.3 16.6 2.3 17.1 3.7 C19 3.7 20.6 5.1 20.6 6.9 C20.6 8.7 19 10.2 16.8 10.2 L16.8 14.2 L7.2 14.2 Z" fill="currentColor" opacity=".92"/>
    <path d="M7.2 16 L16.8 16 L16.8 19.6 C16.8 20.4 16.2 21 15.4 21 L8.6 21 C7.8 21 7.2 20.4 7.2 19.6 Z" fill="currentColor"/>
  `,
  // A face-down card for the hand count. Monochrome.
  cardback: `
    <rect x="5.4" y="2.8" width="13.2" height="18.4" rx="2.6" fill="none" stroke="currentColor" stroke-width="1.8"/>
    <rect x="8.4" y="5.8" width="7.2" height="12.4" rx="1.2" fill="currentColor" opacity=".45"/>
  `,
  // A pointing hand for calling somebody out. Monochrome.
  point: `
    <path d="M10.2 2.6 C11.1 2.6 11.8 3.3 11.8 4.2 L11.8 10.6 L13 10.9 L13 9.4 C13 8.6 13.6 8 14.4 8 C15.2 8 15.8 8.6 15.8 9.4 L15.8 11.5 L17 11.8 L17 10.6 C17 9.9 17.6 9.3 18.3 9.3 C19 9.3 19.6 9.9 19.6 10.6 L19.6 15.4 C19.6 18.8 17.2 21.4 13.8 21.4 C10.9 21.4 9 20.2 7.4 17.6 L4.9 13.6 C4.5 13 4.7 12.2 5.3 11.8 C5.9 11.4 6.6 11.5 7.1 12 L8.6 13.6 L8.6 4.2 C8.6 3.3 9.3 2.6 10.2 2.6 Z" fill="currentColor"/>
  `,
  // Two stacked cards for the copy chip. Monochrome.
  copy: `
    <rect x="8.6" y="8.4" width="11" height="12.8" rx="2.2" fill="none" stroke="currentColor" stroke-width="1.9"/>
    <path d="M5.6 15.4 C4.7 15.4 4.2 14.8 4.2 14 L4.2 4.6 C4.2 3.8 4.8 3.2 5.6 3.2 L13.6 3.2 C14.4 3.2 15 3.8 15 4.6" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>
  `,
  // Two arrows chasing each other: the direction of play.
  cycle: `
    <path d="M6.4 9.2 A6.6 6.6 0 0 1 18 10.6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    <path d="M18.8 6.6 L18.4 11.2 L14 10 Z" fill="currentColor"/>
    <path d="M17.6 14.8 A6.6 6.6 0 0 1 6 13.4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    <path d="M5.2 17.4 L5.6 12.8 L10 14 Z" fill="currentColor"/>
  `,
};

/** Returns a fresh inline-SVG icon element. */
export function icon(name, className) {
  const drawing = DRAWINGS[name];
  const span = document.createElement('span');
  span.className = className ? `ico ${className}` : 'ico';
  span.setAttribute('aria-hidden', 'true');
  if (drawing) {
    span.innerHTML =
      `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" focusable="false">${drawing}</svg>`;
  }
  return span;
}

/** The suit emblem for a topping key ('pepperoni' | 'basil' | ...). */
export function suitIcon(topping, className) {
  return icon(topping, className);
}
