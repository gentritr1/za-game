'use strict';

/**
 * Simple bot player ("Chef" bots). The bot only reads the public game state and
 * its own hand, exactly like a human client would.
 */

const game = require('./game');

const BOT_NAMES = [
  'Chef Mario',
  'Chef Luigi',
  'Chef Sofia',
  'Chef Nonna',
  'Chef Enzo',
  'Chef Bianca',
  'Chef Rocco',
];

/**
 * The regulars. Six named bots that share this one brain. `notice` is the
 * chance of spotting a missed ZA, `pause` is the think delay range in ms and
 * `bias` only reorders the move list `decide()` already builds.
 */
const REGULARS = [
  { id: 'vito',    name: 'Vito',       line: "I'm saving it.",
    notice: 0.70, pause: [800, 1000],  bias: { hoardWildsUntil: 3 } },
  { id: 'carmela', name: 'Carmela',    line: 'I saw that.',
    notice: 0.95, pause: [500, 700],   bias: {} },
  { id: 'paulie',  name: 'Big Paulie', line: '...eh.',
    notice: 0.60, pause: [1900, 2500], bias: { preferDraw2: true } },
  { id: 'pina',    name: 'Nonna Pina', line: 'Eat, eat.',
    notice: 0.40, pause: [1200, 1600], bias: { avoidAttacks: true } },
  { id: 'dominic', name: 'Dominic',    line: 'Bada-bing.',
    notice: 0.55, pause: [600, 800],   bias: { playHighest: true } },
  { id: 'ray',     name: 'Ray',        line: 'later',
    notice: 0.50, pause: [250, 400],   bias: {} },
];

/**
 * The one move each regular comments on. Kept beside REGULARS rather than in
 * it, so the table above stays exactly the shape the design handoff specifies.
 * The cues are the ones `game.js` knows how to raise.
 */
const CATCHPHRASE_CUES = {
  vito: 'wild',
  carmela: 'callout',
  paulie: 'draw2',
  pina: 'lownumber',
  dominic: 'nine',
  ray: 'win',
};

/** Used when a seat has no regular (the seventh bot at a full table). */
const DEFAULT_NOTICE = 0.7;

/** The regular with that id, or null. */
function findRegular(id) {
  if (!id) return null;
  return REGULARS.find((r) => r.id === id) || null;
}

/**
 * Picks who walks in. `wantedId` is optional: an unknown id, or the id of a
 * regular who is already seated, falls back to a random free one. Returns null
 * when all six are at the table, and the caller falls back to a plain chef.
 */
function pickRegular(usedNames, wantedId) {
  const taken = new Set(usedNames.map((n) => String(n).toLowerCase()));
  const free = REGULARS.filter((r) => !taken.has(r.name.toLowerCase()));
  if (free.length === 0) return null;
  const wanted = free.find((r) => r.id === wantedId);
  if (wanted) return wanted;
  return free[Math.floor(Math.random() * free.length)];
}

/** The move a regular comments on, as a cue `game.js` understands. */
function cueFor(regular) {
  if (!regular) return null;
  return CATCHPHRASE_CUES[regular.id] || null;
}

/** Picks a bot name that is not used in the room yet. */
function pickBotName(usedNames) {
  const taken = new Set(usedNames.map((n) => n.toLowerCase()));
  const free = BOT_NAMES.find((n) => !taken.has(n.toLowerCase()));
  if (free) return free;
  let i = 2;
  while (taken.has(`chef bot ${i}`.toLowerCase())) i++;
  return `Chef Bot ${i}`;
}

/** The topping the bot holds most of. Used when it plays a wild card. */
function bestTopping(hand) {
  const counts = {};
  for (const topping of game.TOPPINGS) counts[topping] = 0;
  for (const card of hand) if (card.suit) counts[card.suit]++;
  return game.TOPPINGS.reduce((best, t) => (counts[t] > counts[best] ? t : best), game.TOPPINGS[0]);
}

/** Ranks playable cards. Action cards first, wilds last, so wilds are kept. */
function rankCard(card) {
  switch (card.kind) {
    case game.KINDS.DRAW2: return 0;
    case game.KINDS.SKIP: return 1;
    case game.KINDS.REVERSE: return 2;
    case game.KINDS.NUMBER: return 3;
    case game.KINDS.WILD4: return 4;
    case game.KINDS.WILD: return 5;
    default: return 6;
  }
}

/** The cards that hand somebody else a bad afternoon. */
const ATTACKS = new Set([game.KINDS.SKIP, game.KINDS.DRAW2, game.KINDS.WILD4]);

/**
 * The same rank, nudged by one regular's bias. A bias only ever moves a card
 * up or down the preference list; every card in the list is already legal, so
 * no bias can produce an illegal move.
 */
function rankWithBias(card, bias, handSize) {
  let rank = rankCard(card);
  if (bias.preferDraw2 && card.kind === game.KINDS.DRAW2) rank -= 10;
  if (bias.avoidAttacks && ATTACKS.has(card.kind)) rank += 10;
  if (typeof bias.hoardWildsUntil === 'number' && game.isWild(card)) {
    // Held back while the hand is still fat, then dumped once it is thin.
    rank += handSize > bias.hoardWildsUntil ? 20 : -30;
  }
  return rank;
}

/** Breaks a tie inside one rank. Only `playHighest` has an opinion. */
function tieBreak(a, b, bias) {
  if (!bias.playHighest) return 0;
  const value = (card) => (card.kind === game.KINDS.NUMBER ? card.value : -1);
  return value(b) - value(a);
}

/**
 * Decides the next bot action.
 * @param {object} state the game state
 * @param {string} botId the seat deciding
 * @param {object|null} [regular] one entry of REGULARS. Without it the bot
 *        keeps the house defaults it had before the regulars moved in.
 * @returns {{ action: 'play', cardId: string, topping?: string }
 *          |{ action: 'draw' }
 *          |{ action: 'pass' }
 *          |{ action: 'za' }
 *          |{ action: 'callout', targetId: string }
 *          |null}
 */
function decide(state, botId, regular) {
  const bot = game.findPlayer(state, botId);
  if (!bot || bot.left || state.status !== 'playing') return null;

  const notice = regular && typeof regular.notice === 'number' ? regular.notice : DEFAULT_NOTICE;
  const bias = (regular && regular.bias) || {};

  // Catch a careless neighbour. Bots are not perfect, so they miss some.
  const target = state.players.find(
    (p) => p.id !== botId && !p.left && p.vulnerable && p.hand.length === 1
  );
  if (target && state.rng() < notice) return { action: 'callout', targetId: target.id };

  if (game.currentPlayer(state).id !== botId) return null;

  // Shout before playing the second to last card.
  if (bot.hand.length <= 2 && !bot.declaredZa) return { action: 'za' };

  const playableIds = new Set(game.playableCardIds(state, botId));
  const options = bot.hand.filter((c) => playableIds.has(c.id));

  if (options.length > 0) {
    const size = bot.hand.length;
    options.sort(
      (a, b) => rankWithBias(a, bias, size) - rankWithBias(b, bias, size) || tieBreak(a, b, bias)
    );
    const card = options[0];
    const move = { action: 'play', cardId: card.id };
    if (game.isWild(card)) move.topping = bestTopping(bot.hand.filter((c) => c.id !== card.id));
    return move;
  }

  if (state.drawnCard && state.drawnCard.playerId === botId) return { action: 'pass' };
  return { action: 'draw' };
}

module.exports = {
  decide,
  pickBotName,
  BOT_NAMES,
  REGULARS,
  findRegular,
  pickRegular,
  cueFor,
  DEFAULT_NOTICE,
};
