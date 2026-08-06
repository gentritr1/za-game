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

/**
 * Decides the next bot action.
 * @returns {{ action: 'play', cardId: string, topping?: string }
 *          |{ action: 'draw' }
 *          |{ action: 'pass' }
 *          |{ action: 'za' }
 *          |{ action: 'callout', targetId: string }
 *          |null}
 */
function decide(state, botId) {
  const bot = game.findPlayer(state, botId);
  if (!bot || bot.left || state.status !== 'playing') return null;

  // Catch a careless neighbour. Bots are not perfect, so they miss some.
  const target = state.players.find(
    (p) => p.id !== botId && !p.left && p.vulnerable && p.hand.length === 1
  );
  if (target && state.rng() < 0.7) return { action: 'callout', targetId: target.id };

  if (game.currentPlayer(state).id !== botId) return null;

  // Shout before playing the second to last card.
  if (bot.hand.length <= 2 && !bot.declaredZa) return { action: 'za' };

  const playableIds = new Set(game.playableCardIds(state, botId));
  const options = bot.hand.filter((c) => playableIds.has(c.id));

  if (options.length > 0) {
    options.sort((a, b) => rankCard(a) - rankCard(b));
    const card = options[0];
    const move = { action: 'play', cardId: card.id };
    if (game.isWild(card)) move.topping = bestTopping(bot.hand.filter((c) => c.id !== card.id));
    return move;
  }

  if (state.drawnCard && state.drawnCard.playerId === botId) return { action: 'pass' };
  return { action: 'draw' };
}

module.exports = { decide, pickBotName, BOT_NAMES };
