'use strict';

/**
 * Pizzuno rules engine.
 *
 * This module is self-contained and has no knowledge of networking, rooms or
 * sockets. It builds the deck, validates every move and advances the turn.
 * All functions that change the game take the state as the first argument and
 * return either `{ ok: true, ... }` or `{ ok: false, error: '...' }`.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** The four topping suits. They replace the colours of a normal card game. */
const TOPPINGS = ['pepperoni', 'basil', 'cheese', 'anchovy'];

const TOPPING_INFO = {
  pepperoni: { label: 'Pepperoni', color: 'red' },
  basil: { label: 'Basil', color: 'green' },
  cheese: { label: 'Cheese', color: 'yellow' },
  anchovy: { label: 'Anchovy', color: 'blue' },
};

/** Card kinds. `skip`, `reverse` and `draw2` are the themed action cards. */
const KINDS = {
  NUMBER: 'number',
  SKIP: 'skip',      // "Burnt Slice"
  REVERSE: 'reverse', // "Flip the Pie"
  DRAW2: 'draw2',    // "Extra Toppings +2"
  WILD: 'wild',      // "Chef's Choice"
  WILD4: 'wild4',    // "The Whole Pie +4"
};

const KIND_LABEL = {
  [KINDS.SKIP]: 'Burnt Slice',
  [KINDS.REVERSE]: 'Flip the Pie',
  [KINDS.DRAW2]: 'Extra Toppings +2',
  [KINDS.WILD]: "Chef's Choice",
  [KINDS.WILD4]: 'The Whole Pie +4',
};

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 8;
const HAND_SIZE = 7;
const CALLOUT_PENALTY = 2;
const LOG_LIMIT = 60;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Small seedable generator. Keeps rounds repeatable in tests. */
function makeRng(seed) {
  if (seed === undefined || seed === null) return Math.random;
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(cards, rng = Math.random) {
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

function isWild(card) {
  return card.kind === KINDS.WILD || card.kind === KINDS.WILD4;
}

/** Human readable card name, used by the event log. */
function describeCard(card) {
  if (!card) return 'nothing';
  if (isWild(card)) return KIND_LABEL[card.kind];
  const suit = TOPPING_INFO[card.suit].label;
  if (card.kind === KINDS.NUMBER) return `${suit} ${card.value}`;
  return `${suit} ${KIND_LABEL[card.kind]}`;
}

// ---------------------------------------------------------------------------
// Deck
// ---------------------------------------------------------------------------

/**
 * Builds the full 108 card deck.
 * Per suit: one 0, two of each 1-9, two of each action card  =  25 cards.
 * Plus four "Chef's Choice" and four "The Whole Pie +4".
 */
function buildDeck() {
  const deck = [];
  let serial = 0;
  const add = (card) => deck.push({ id: `k${serial++}`, ...card });

  for (const suit of TOPPINGS) {
    add({ suit, kind: KINDS.NUMBER, value: 0 });
    for (let value = 1; value <= 9; value++) {
      add({ suit, kind: KINDS.NUMBER, value });
      add({ suit, kind: KINDS.NUMBER, value });
    }
    for (const kind of [KINDS.SKIP, KINDS.REVERSE, KINDS.DRAW2]) {
      add({ suit, kind, value: null });
      add({ suit, kind, value: null });
    }
  }
  for (let i = 0; i < 4; i++) {
    add({ suit: null, kind: KINDS.WILD, value: null });
    add({ suit: null, kind: KINDS.WILD4, value: null });
  }
  return deck;
}

// ---------------------------------------------------------------------------
// Game creation
// ---------------------------------------------------------------------------

/**
 * Starts a round.
 * @param {Array<{id: string, name: string, isBot?: boolean}>} seats
 * @param {{ seed?: number, strictWildFour?: boolean }} options
 */
function createGame(seats, options = {}) {
  if (seats.length < MIN_PLAYERS) throw new Error('Not enough players.');
  if (seats.length > MAX_PLAYERS) throw new Error('Too many players.');

  const rng = makeRng(options.seed);
  const drawPile = shuffle(buildDeck(), rng);

  const state = {
    rng,
    // Identifies this round. The client uses it to reset its event log.
    gameId: Math.random().toString(36).slice(2, 10),
    strictWildFour: Boolean(options.strictWildFour),
    players: seats.map((seat) => ({
      id: seat.id,
      name: seat.name,
      isBot: Boolean(seat.isBot),
      hand: [],
      declaredPizzuno: false,
      vulnerable: false, // can be called out for a missed PIZZUNO
      left: false,
      connected: true,
    })),
    drawPile,
    discardPile: [],
    currentTopping: null,
    turnIndex: 0,
    direction: 1, // 1 = to the left, -1 = to the right
    drawnCard: null, // { playerId, cardId } while a drawn card may still be played
    status: 'playing', // 'playing' | 'roundOver'
    winnerId: null,
    log: [],
    logSeq: 0,
    turnSerial: 0, // grows on every turn change; used for turn timers
  };

  for (let i = 0; i < HAND_SIZE; i++) {
    for (const player of state.players) player.hand.push(state.drawPile.pop());
  }

  // The starting card must be a number card. It keeps the opening simple and
  // avoids an action card with no player to act on.
  let first = state.drawPile.pop();
  while (first.kind !== KINDS.NUMBER) {
    state.drawPile.splice(Math.floor(rng() * state.drawPile.length), 0, first);
    first = state.drawPile.pop();
  }
  state.discardPile.push(first);
  state.currentTopping = first.suit;

  addLog(state, `🔥 The oven is hot. First out of it: ${describeCard(first)}.`);
  addLog(state, `${currentPlayer(state).name} is up first. No pressure.`);
  return state;
}

// ---------------------------------------------------------------------------
// State readers
// ---------------------------------------------------------------------------

function topCard(state) {
  return state.discardPile[state.discardPile.length - 1] || null;
}

function currentPlayer(state) {
  return state.players[state.turnIndex];
}

function findPlayer(state, playerId) {
  return state.players.find((p) => p.id === playerId) || null;
}

function activePlayers(state) {
  return state.players.filter((p) => !p.left);
}

/** True when `card` may legally go on the discard pile right now. */
function canPlay(state, card, hand) {
  const top = topCard(state);
  if (!top) return false;
  if (card.kind === KINDS.WILD) return true;
  if (card.kind === KINDS.WILD4) {
    if (!state.strictWildFour) return true;
    // Strict rule: only legal when you hold no card of the current topping.
    return !hand.some((c) => c.suit === state.currentTopping);
  }
  if (card.suit === state.currentTopping) return true;
  if (card.kind === KINDS.NUMBER && top.kind === KINDS.NUMBER) {
    return card.value === top.value;
  }
  return !isWild(top) && card.kind === top.kind;
}

/** Ids of the cards in a player's hand that are playable this turn. */
function playableCardIds(state, playerId) {
  const player = findPlayer(state, playerId);
  if (!player || state.status !== 'playing') return [];
  if (currentPlayer(state).id !== playerId) return [];
  if (state.drawnCard) {
    // After a draw only the freshly drawn card may be played.
    const card = player.hand.find((c) => c.id === state.drawnCard.cardId);
    return card && canPlay(state, card, player.hand) ? [card.id] : [];
  }
  return player.hand.filter((c) => canPlay(state, c, player.hand)).map((c) => c.id);
}

// ---------------------------------------------------------------------------
// Internal mutators
// ---------------------------------------------------------------------------

function addLog(state, text) {
  state.log.push({ id: state.logSeq++, text, ts: Date.now() });
  if (state.log.length > LOG_LIMIT) state.log.splice(0, state.log.length - LOG_LIMIT);
}

/** Picks one of several phrasings, so the kitchen chatter stays fresh. */
function pick(state, lines) {
  return lines[Math.floor(state.rng() * lines.length)];
}

/** Refills the draw pile from the discard pile, keeping the top card. */
function refillDrawPile(state) {
  if (state.discardPile.length <= 1) return false;
  const top = state.discardPile.pop();
  const recycled = state.discardPile;
  state.discardPile = [top];
  state.drawPile = shuffle(recycled, state.rng);
  addLog(state, '🌀 Dough pile empty. The chef kneads the old slices back in.');
  return true;
}

/** Gives `count` cards to a player. Returns the cards actually dealt. */
function dealTo(state, player, count) {
  const dealt = [];
  for (let i = 0; i < count; i++) {
    if (state.drawPile.length === 0 && !refillDrawPile(state)) break;
    dealt.push(state.drawPile.pop());
  }
  player.hand.push(...dealt);
  if (player.hand.length > 1) {
    player.declaredPizzuno = false;
    player.vulnerable = false;
  }
  return dealt;
}

/** Index of the seat `steps` places away, skipping players who left. */
function seatAfter(state, fromIndex, steps) {
  const total = state.players.length;
  let index = fromIndex;
  let moved = 0;
  let guard = 0;
  while (moved < steps && guard++ < total * steps + total) {
    index = (index + state.direction + total) % total;
    if (!state.players[index].left) moved++;
  }
  return index;
}

function advanceTurn(state, steps = 1) {
  state.drawnCard = null;
  const from = state.turnIndex;
  const next = seatAfter(state, state.turnIndex, steps);
  state.turnIndex = next;
  state.turnSerial++;
  // The call-out window for the new current player closes now. A turn that
  // comes straight back to the same seat (a skip at a table of two, for
  // example) is not a full round of the table, so that window stays open.
  const player = state.players[next];
  if (player && next !== from) player.vulnerable = false;
}

function endRound(state, winner, reason) {
  state.status = 'roundOver';
  state.winnerId = winner ? winner.id : null;
  state.drawnCard = null;
  if (winner) {
    addLog(state, reason || `🏆 ${winner.name} emptied the box and takes the round!`);
  } else {
    addLog(state, reason || 'The round ended with nobody at the oven.');
  }
}

/** Ends the round when only one player is still in the game. */
function checkLastPlayerStanding(state) {
  if (state.status !== 'playing') return;
  const remaining = activePlayers(state);
  if (remaining.length <= 1) {
    endRound(
      state,
      remaining[0] || null,
      remaining[0]
        ? `🏆 ${remaining[0].name} wins the parlour by default. Everybody else walked out.`
        : 'The parlour is empty. Lights out.'
    );
  }
}

// ---------------------------------------------------------------------------
// Moves
// ---------------------------------------------------------------------------

function assertTurn(state, playerId) {
  if (state.status !== 'playing') return { ok: false, error: 'The round is over.' };
  const player = findPlayer(state, playerId);
  if (!player) return { ok: false, error: 'Unknown player.' };
  if (player.left) return { ok: false, error: 'You left the game.' };
  if (currentPlayer(state).id !== playerId) return { ok: false, error: 'It is not your turn.' };
  return { ok: true, player };
}

/**
 * Plays a card from the hand of `playerId`.
 * `chosenTopping` is required for wild cards.
 */
function playCard(state, playerId, cardId, chosenTopping) {
  const turn = assertTurn(state, playerId);
  if (!turn.ok) return turn;
  const player = turn.player;

  const index = player.hand.findIndex((c) => c.id === cardId);
  if (index === -1) return { ok: false, error: 'That card is not in your hand.' };
  const card = player.hand[index];

  if (state.drawnCard && state.drawnCard.cardId !== cardId) {
    return { ok: false, error: 'You may only play the card you just drew, or pass.' };
  }
  if (!canPlay(state, card, player.hand)) {
    return { ok: false, error: `${describeCard(card)} does not match.` };
  }
  if (isWild(card) && !TOPPINGS.includes(chosenTopping)) {
    return { ok: false, error: 'Choose a topping for that wild card.' };
  }

  player.hand.splice(index, 1);
  state.discardPile.push(card);
  state.currentTopping = isWild(card) ? chosenTopping : card.suit;
  state.drawnCard = null;

  addLog(state, playLine(state, player, card, chosenTopping));

  // Win check happens before the card effect. A last card that forces a draw
  // still ends the round.
  if (player.hand.length === 0) {
    endRound(state, player);
    return { ok: true, card };
  }

  if (player.hand.length === 1) {
    player.vulnerable = !player.declaredPizzuno;
    if (player.declaredPizzuno) addLog(state, `${player.name} is down to one slice. Watch them.`);
  }

  applyCardEffect(state, card, player);
  return { ok: true, card };
}

/** The kitchen chatter for one play. */
function playLine(state, player, card, chosenTopping) {
  const who = player.name;
  const what = describeCard(card);
  switch (card.kind) {
    case KINDS.SKIP:
      return pick(state, [
        `🔥 ${who} slammed down a Burnt Slice!`,
        `🔥 ${who} pulled a Burnt Slice out of the oven.`,
      ]);
    case KINDS.REVERSE:
      return pick(state, [
        `🔄 ${who} flipped the whole pie over!`,
        `🔄 ${who} gave the pie a spin.`,
      ]);
    case KINDS.DRAW2:
      return pick(state, [
        `🫒 ${who} piled on Extra Toppings +2!`,
        `🫒 ${who} said "more toppings" and meant it. +2.`,
      ]);
    case KINDS.WILD:
      return `👨‍🍳 ${who} pulled chef's rank and called for ${TOPPING_INFO[chosenTopping].label}.`;
    case KINDS.WILD4:
      return `🍕 ${who} dropped THE WHOLE PIE. Four cards, and ${TOPPING_INFO[chosenTopping].label} from now on.`;
    default:
      return pick(state, [
        `${who} slid ${what} onto the pie.`,
        `${who} served up ${what}.`,
        `${who} played ${what}.`,
      ]);
  }
}

function applyCardEffect(state, card, player) {
  const twoPlayerGame = activePlayers(state).length === 2;

  switch (card.kind) {
    case KINDS.SKIP: {
      const victim = state.players[seatAfter(state, state.turnIndex, 1)];
      addLog(state, pick(state, [
        `😤 ${victim.name} got the burnt bit and sits this one out.`,
        `😤 Tough luck, ${victim.name}. No turn for you.`,
      ]));
      advanceTurn(state, 2);
      return;
    }
    case KINDS.REVERSE: {
      if (twoPlayerGame) {
        addLog(state, `Only two at the table, so ${player.name} goes again. Cheeky.`);
        advanceTurn(state, 2);
      } else {
        state.direction *= -1;
        addLog(state, `Play now runs to the ${state.direction === 1 ? 'left' : 'right'}.`);
        advanceTurn(state, 1);
      }
      return;
    }
    case KINDS.DRAW2:
    case KINDS.WILD4: {
      const count = card.kind === KINDS.DRAW2 ? 2 : 4;
      const victim = state.players[seatAfter(state, state.turnIndex, 1)];
      const dealt = dealTo(state, victim, count);
      addLog(state, `😩 ${victim.name} chokes down ${dealt.length} extra card${dealt.length === 1 ? '' : 's'} and loses a turn.`);
      advanceTurn(state, 2);
      return;
    }
    default:
      advanceTurn(state, 1);
  }
}

/** Takes one card from the draw pile. The card may then be played or passed. */
function drawCard(state, playerId) {
  const turn = assertTurn(state, playerId);
  if (!turn.ok) return turn;
  const player = turn.player;
  if (state.drawnCard) return { ok: false, error: 'Play the drawn card or pass.' };

  const dealt = dealTo(state, player, 1);
  if (dealt.length === 0) {
    addLog(state, `Not a scrap of dough left. ${player.name} passes.`);
    advanceTurn(state, 1);
    return { ok: true, card: null };
  }

  const card = dealt[0];
  addLog(state, pick(state, [
    `${player.name} grabbed one fresh out of the oven.`,
    `${player.name} took a card off the dough pile.`,
    `${player.name} had nothing, so they took a card.`,
  ]));

  if (canPlay(state, card, player.hand)) {
    // Keep the turn open so the player can play the fresh card.
    state.drawnCard = { playerId, cardId: card.id };
    return { ok: true, card, playable: true };
  }
  advanceTurn(state, 1);
  return { ok: true, card, playable: false };
}

/** Gives up the turn after a draw. */
function passTurn(state, playerId) {
  const turn = assertTurn(state, playerId);
  if (!turn.ok) return turn;
  if (!state.drawnCard || state.drawnCard.playerId !== playerId) {
    return { ok: false, error: 'You must draw a card before you pass.' };
  }
  addLog(state, `${turn.player.name} pockets the card and passes.`);
  advanceTurn(state, 1);
  return { ok: true };
}

/**
 * Forces the turn of a player who is away. The player draws one card and the
 * turn moves on.
 */
function forceSkip(state, playerId, reason) {
  const turn = assertTurn(state, playerId);
  if (!turn.ok) return turn;
  const player = turn.player;
  if (!state.drawnCard) dealTo(state, player, 1);
  addLog(state, reason || `${player.name} stepped away from the table. Skipped.`);
  advanceTurn(state, 1);
  return { ok: true };
}

/** The PIZZUNO! button. Legal when the hand is down to one or two cards. */
function declarePizzuno(state, playerId) {
  const player = findPlayer(state, playerId);
  if (!player) return { ok: false, error: 'Unknown player.' };
  if (state.status !== 'playing') return { ok: false, error: 'The round is over.' };
  if (player.hand.length > 2) {
    return { ok: false, error: 'You have too many cards to call PIZZUNO.' };
  }
  if (player.declaredPizzuno) return { ok: false, error: 'You already called PIZZUNO.' };

  player.declaredPizzuno = true;
  player.vulnerable = false;
  addLog(state, pick(state, [
    `📣 ${player.name} shouts PIZZUNO!`,
    `📣 "PIZZUNO!" yells ${player.name}. The whole parlour hears it.`,
  ]));
  return { ok: true };
}

/** Calls out a player who has one card and forgot to shout. */
function callOut(state, callerId, targetId) {
  const caller = findPlayer(state, callerId);
  const target = findPlayer(state, targetId);
  if (!caller || caller.left) return { ok: false, error: 'Unknown player.' };
  if (!target) return { ok: false, error: 'Unknown target.' };
  if (state.status !== 'playing') return { ok: false, error: 'The round is over.' };
  if (callerId === targetId) return { ok: false, error: 'You cannot call out yourself.' };
  if (!target.vulnerable || target.hand.length !== 1) {
    return { ok: false, error: `${target.name} cannot be called out right now.` };
  }

  target.vulnerable = false;
  const dealt = dealTo(state, target, CALLOUT_PENALTY);
  addLog(
    state,
    `☝️ ${caller.name} caught ${target.name} keeping quiet! No PIZZUNO, so that is ${dealt.length} card${dealt.length === 1 ? '' : 's'} back in the hand.`
  );
  return { ok: true };
}

/** Removes a player for good. Their cards go back into the draw pile. */
function removePlayer(state, playerId) {
  const player = findPlayer(state, playerId);
  if (!player || player.left) return { ok: false, error: 'Unknown player.' };
  const wasTheirTurn = state.status === 'playing' && currentPlayer(state).id === playerId;

  player.left = true;
  state.drawPile.push(...player.hand.splice(0));
  shuffle(state.drawPile, state.rng);
  addLog(state, `👋 ${player.name} walked out of the parlour.`);

  if (state.status !== 'playing') return { ok: true };
  checkLastPlayerStanding(state);
  if (state.status === 'playing' && wasTheirTurn) advanceTurn(state, 1);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Client view
// ---------------------------------------------------------------------------

/**
 * Builds the snapshot that one player is allowed to see: their own hand plus
 * public table information. Other hands are reduced to a card count.
 */
function viewFor(state, playerId) {
  const me = findPlayer(state, playerId);
  const turnPlayer = state.status === 'playing' ? currentPlayer(state) : null;
  return {
    gameId: state.gameId,
    status: state.status,
    direction: state.direction,
    currentTopping: state.currentTopping,
    topCard: topCard(state),
    drawPileCount: state.drawPile.length,
    discardCount: state.discardPile.length,
    turnPlayerId: turnPlayer ? turnPlayer.id : null,
    turnSerial: state.turnSerial,
    winnerId: state.winnerId,
    players: state.players.map((p) => ({
      id: p.id,
      name: p.name,
      isBot: p.isBot,
      connected: p.connected,
      left: p.left,
      cardCount: p.hand.length,
      declaredPizzuno: p.declaredPizzuno,
      vulnerable: p.vulnerable,
    })),
    hand: me ? me.hand.slice() : [],
    playableCardIds: me ? playableCardIds(state, playerId) : [],
    mustPlayDrawnCard: Boolean(state.drawnCard && state.drawnCard.playerId === playerId),
    canPass: Boolean(state.drawnCard && state.drawnCard.playerId === playerId),
    canDeclarePizzuno: Boolean(
      me && state.status === 'playing' && me.hand.length <= 2 && !me.declaredPizzuno
    ),
    calloutTargets: state.players
      .filter((p) => p.id !== playerId && !p.left && p.vulnerable && p.hand.length === 1)
      .map((p) => p.id),
    log: state.log.slice(-30),
  };
}

module.exports = {
  TOPPINGS,
  TOPPING_INFO,
  KINDS,
  KIND_LABEL,
  MIN_PLAYERS,
  MAX_PLAYERS,
  HAND_SIZE,
  buildDeck,
  createGame,
  canPlay,
  playableCardIds,
  playCard,
  drawCard,
  passTurn,
  forceSkip,
  declarePizzuno,
  callOut,
  removePlayer,
  describeCard,
  topCard,
  currentPlayer,
  findPlayer,
  activePlayers,
  viewFor,
  shuffle,
  makeRng,
  isWild,
};
