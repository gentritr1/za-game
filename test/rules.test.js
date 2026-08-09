'use strict';

/**
 * Rules tests. Run with `npm test`.
 * No test framework: plain assertions so the project keeps one dependency.
 */

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');
const game = require('../server/game');
const { Room, RoomManager, TIMINGS } = require('../server/rooms');
const { createStaticHandler } = require('../server/static');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ok    ${name}`);
  } catch (err) {
    failed++;
    console.log(`  FAIL  ${name}`);
    console.log(`        ${err.message}`);
  }
}

/** Cases that need a socket or a timer. They run after the plain ones. */
const pending = [];
function testAsync(name, fn) {
  pending.push({ name, fn });
}

/** Builds a game and then forces known hands, so a case is repeatable. */
function scenario(names, hands, top, topping) {
  const state = game.createGame(
    names.map((name, index) => ({ id: `p${index}`, name })),
    { seed: 42 }
  );
  hands.forEach((hand, index) => { state.players[index].hand = hand; });
  if (top) {
    state.discardPile = [top];
    state.currentTopping = topping || top.suit;
  }
  state.turnIndex = 0;
  return state;
}

const card = (suit, kind, value = null) => ({ id: `x${Math.random().toString(36).slice(2)}`, suit, kind, value });
const num = (suit, value) => card(suit, 'number', value);

console.log('\nZa rules\n');

// ---------------------------------------------------------------- the deck --
test('the deck holds 108 cards', () => {
  assert.strictEqual(game.buildDeck().length, 108);
});

test('each suit has 25 cards and each wild appears four times', () => {
  const deck = game.buildDeck();
  for (const suit of game.TOPPINGS) {
    assert.strictEqual(deck.filter((c) => c.suit === suit).length, 25, `suit ${suit}`);
    assert.strictEqual(deck.filter((c) => c.suit === suit && c.kind === 'number' && c.value === 0).length, 1);
    assert.strictEqual(deck.filter((c) => c.suit === suit && c.kind === 'number' && c.value === 7).length, 2);
    for (const kind of ['skip', 'reverse', 'draw2']) {
      assert.strictEqual(deck.filter((c) => c.suit === suit && c.kind === kind).length, 2, `${suit} ${kind}`);
    }
  }
  assert.strictEqual(deck.filter((c) => c.kind === 'wild').length, 4);
  assert.strictEqual(deck.filter((c) => c.kind === 'wild4').length, 4);
  assert.strictEqual(new Set(deck.map((c) => c.id)).size, 108, 'ids are unique');
});

// -------------------------------------------------------------- the deal --
test('every player gets seven cards and the first card is a number', () => {
  const state = game.createGame([
    { id: 'a', name: 'Ana' }, { id: 'b', name: 'Bo' }, { id: 'c', name: 'Cy' },
  ], { seed: 7 });
  for (const player of state.players) assert.strictEqual(player.hand.length, 7);
  assert.strictEqual(game.topCard(state).kind, 'number');
  assert.strictEqual(state.currentTopping, game.topCard(state).suit);
  assert.strictEqual(state.drawPile.length, 108 - 21 - 1);
});

test('a table needs 2 to 8 players', () => {
  assert.throws(() => game.createGame([{ id: 'a', name: 'Ana' }]));
  const nine = Array.from({ length: 9 }, (_, i) => ({ id: `p${i}`, name: `P${i}` }));
  assert.throws(() => game.createGame(nine));
});

// -------------------------------------------------------------- matching --
test('a card matches by topping, by number or by symbol', () => {
  const top = num('pepperoni', 5);
  const state = scenario(['Ana', 'Bo'], [[], []], top);

  assert.ok(game.canPlay(state, num('pepperoni', 9), []), 'same topping');
  assert.ok(game.canPlay(state, num('basil', 5), []), 'same number');
  assert.ok(!game.canPlay(state, num('basil', 9), []), 'no match');
  assert.ok(game.canPlay(state, card('basil', 'wild'), []), 'wild is always fine');
  assert.ok(game.canPlay(state, card('pepperoni', 'skip'), []), 'same topping action');
  assert.ok(!game.canPlay(state, card('basil', 'skip'), []), 'action of another topping');
});

test('symbols match across toppings', () => {
  const state = scenario(['Ana', 'Bo'], [[], []], card('pepperoni', 'skip'), 'pepperoni');
  assert.ok(game.canPlay(state, card('anchovy', 'skip'), []));
  assert.ok(!game.canPlay(state, card('anchovy', 'reverse'), []));
});

test('the topping chosen for a wild card is what the next player must match', () => {
  const wild = card(null, 'wild');
  const state = scenario(['Ana', 'Bo'], [[wild], [num('basil', 3)]], num('pepperoni', 5));
  assert.ok(game.playCard(state, 'p0', wild.id, 'basil').ok);
  assert.strictEqual(state.currentTopping, 'basil');
  assert.ok(game.canPlay(state, num('basil', 9), []));
  assert.ok(!game.canPlay(state, num('pepperoni', 9), []));
});

test('a wild card without a topping is refused', () => {
  const wild = card(null, 'wild');
  const state = scenario(['Ana', 'Bo'], [[wild], []], num('pepperoni', 5));
  const result = game.playCard(state, 'p0', wild.id);
  assert.strictEqual(result.ok, false);
  assert.match(result.error, /topping/i);
});

// ---------------------------------------------------------- turn advance --
test('a plain card moves play on by one', () => {
  const play = num('pepperoni', 3);
  const state = scenario(['Ana', 'Bo', 'Cy'], [[play, num('basil', 1)], [], []], num('pepperoni', 5));
  assert.ok(game.playCard(state, 'p0', play.id).ok);
  assert.strictEqual(game.currentPlayer(state).name, 'Bo');
});

test('Burnt Slice makes the next player miss a turn', () => {
  const skip = card('pepperoni', 'skip');
  const state = scenario(['Ana', 'Bo', 'Cy'], [[skip, num('basil', 1)], [], []], num('pepperoni', 5));
  assert.ok(game.playCard(state, 'p0', skip.id).ok);
  assert.strictEqual(game.currentPlayer(state).name, 'Cy');
});

test('Flip the Pie turns the direction around', () => {
  const flip = card('pepperoni', 'reverse');
  const state = scenario(['Ana', 'Bo', 'Cy'], [[flip, num('basil', 1)], [], []], num('pepperoni', 5));
  assert.ok(game.playCard(state, 'p0', flip.id).ok);
  assert.strictEqual(state.direction, -1);
  assert.strictEqual(game.currentPlayer(state).name, 'Cy');
});

test('with two players Flip the Pie works like a skip', () => {
  const flip = card('pepperoni', 'reverse');
  const state = scenario(['Ana', 'Bo'], [[flip, num('basil', 1)], []], num('pepperoni', 5));
  assert.ok(game.playCard(state, 'p0', flip.id).ok);
  assert.strictEqual(game.currentPlayer(state).name, 'Ana', 'Ana plays again');
});

test('Extra Toppings +2 gives two cards and one lost turn', () => {
  const draw2 = card('pepperoni', 'draw2');
  const state = scenario(['Ana', 'Bo', 'Cy'], [[draw2, num('basil', 1)], [], []], num('pepperoni', 5));
  assert.ok(game.playCard(state, 'p0', draw2.id).ok);
  assert.strictEqual(state.players[1].hand.length, 2);
  assert.strictEqual(game.currentPlayer(state).name, 'Cy');
});

test('The Whole Pie +4 gives four cards and one lost turn', () => {
  const wild4 = card(null, 'wild4');
  const state = scenario(['Ana', 'Bo', 'Cy'], [[wild4, num('basil', 1)], [], []], num('pepperoni', 5));
  assert.ok(game.playCard(state, 'p0', wild4.id, 'cheese').ok);
  assert.strictEqual(state.players[1].hand.length, 4);
  assert.strictEqual(state.currentTopping, 'cheese');
  assert.strictEqual(game.currentPlayer(state).name, 'Cy');
});

// ------------------------------------------------------------------ draws --
test('a drawn card that matches may be played at once', () => {
  const state = scenario(['Ana', 'Bo'], [[num('basil', 2)], []], num('pepperoni', 5));
  state.drawPile = [num('pepperoni', 8)];
  const result = game.drawCard(state, 'p0');
  assert.strictEqual(result.playable, true);
  assert.strictEqual(game.currentPlayer(state).name, 'Ana', 'the turn stays open');
  assert.deepStrictEqual(game.playableCardIds(state, 'p0'), [result.card.id]);
});

test('a drawn card that does not match ends the turn', () => {
  const state = scenario(['Ana', 'Bo'], [[num('basil', 2)], []], num('pepperoni', 5));
  state.drawPile = [num('cheese', 8)];
  const result = game.drawCard(state, 'p0');
  assert.strictEqual(result.playable, false);
  assert.strictEqual(game.currentPlayer(state).name, 'Bo');
});

test('only the drawn card may be played, and passing needs a draw first', () => {
  const keeper = num('pepperoni', 2);
  const state = scenario(['Ana', 'Bo'], [[keeper], []], num('pepperoni', 5));
  assert.strictEqual(game.passTurn(state, 'p0').ok, false, 'no pass before a draw');

  state.drawPile = [num('pepperoni', 8)];
  game.drawCard(state, 'p0');
  const refused = game.playCard(state, 'p0', keeper.id);
  assert.strictEqual(refused.ok, false);
  assert.ok(game.passTurn(state, 'p0').ok);
  assert.strictEqual(game.currentPlayer(state).name, 'Bo');
});

test('the discard pile is shuffled back in when the draw pile runs out', () => {
  const state = scenario(['Ana', 'Bo'], [[num('basil', 2)], []], num('pepperoni', 5));
  state.drawPile = [];
  state.discardPile = [num('cheese', 1), num('cheese', 2), num('pepperoni', 5)];
  const result = game.drawCard(state, 'p0');
  assert.ok(result.card, 'a card was still dealt');
  assert.strictEqual(state.discardPile.length, 1, 'only the top card stays');
});

test('a player out of turn is refused', () => {
  const play = num('pepperoni', 3);
  const state = scenario(['Ana', 'Bo'], [[], [play]], num('pepperoni', 5));
  const result = game.playCard(state, 'p1', play.id);
  assert.strictEqual(result.ok, false);
  assert.match(result.error, /not your turn/i);
});

test('a card that is not in the hand is refused', () => {
  const state = scenario(['Ana', 'Bo'], [[num('pepperoni', 3)], []], num('pepperoni', 5));
  const result = game.playCard(state, 'p0', 'made-up-id');
  assert.strictEqual(result.ok, false);
});

// --------------------------------------------------------------- ZA --
test('a silent player with one card can be called out for two cards', () => {
  const play = num('pepperoni', 3);
  const state = scenario(['Ana', 'Bo'], [[play, num('basil', 1)], []], num('pepperoni', 5));
  assert.ok(game.playCard(state, 'p0', play.id).ok);
  assert.strictEqual(state.players[0].hand.length, 1);
  assert.strictEqual(state.players[0].vulnerable, true);

  assert.ok(game.callOut(state, 'p1', 'p0').ok);
  assert.strictEqual(state.players[0].hand.length, 3);
  assert.strictEqual(state.players[0].vulnerable, false);
  assert.strictEqual(game.callOut(state, 'p1', 'p0').ok, false, 'no double penalty');
});

test('a player who shouts ZA cannot be called out', () => {
  const play = num('pepperoni', 3);
  const state = scenario(['Ana', 'Bo'], [[play, num('basil', 1)], []], num('pepperoni', 5));
  assert.ok(game.declareZa(state, 'p0').ok, 'may shout with two cards');
  assert.ok(game.playCard(state, 'p0', play.id).ok);
  assert.strictEqual(state.players[0].vulnerable, false);
  assert.strictEqual(game.callOut(state, 'p1', 'p0').ok, false);
});

test('the call-out window closes when the turn comes back round', () => {
  const play = num('pepperoni', 3);
  const reply = num('pepperoni', 4);
  const state = scenario(
    ['Ana', 'Bo'],
    [[play, num('basil', 1)], [reply, num('cheese', 6)]],
    num('pepperoni', 5)
  );
  assert.ok(game.playCard(state, 'p0', play.id).ok);
  assert.strictEqual(state.players[0].vulnerable, true);
  assert.ok(game.playCard(state, 'p1', reply.id).ok);
  assert.strictEqual(state.status, 'playing');
  assert.strictEqual(game.currentPlayer(state).name, 'Ana');
  assert.strictEqual(state.players[0].vulnerable, false, 'too late now');
});

test('ZA is refused with three cards or more', () => {
  const state = scenario(['Ana', 'Bo'], [[num('pepperoni', 1), num('pepperoni', 2), num('pepperoni', 3)], []], num('pepperoni', 5));
  assert.strictEqual(game.declareZa(state, 'p0').ok, false);
});

test('drawing cards cancels an early ZA shout', () => {
  const state = scenario(['Ana', 'Bo'], [[num('basil', 1), num('basil', 2)], []], num('pepperoni', 5));
  assert.ok(game.declareZa(state, 'p0').ok);
  state.drawPile = [num('cheese', 9), num('cheese', 8)];
  game.drawCard(state, 'p0');
  assert.strictEqual(state.players[0].declaredZa, false);
});

// ------------------------------------------------------------- round end --
test('the round ends when a hand is empty', () => {
  const last = num('pepperoni', 3);
  const state = scenario(['Ana', 'Bo'], [[last], []], num('pepperoni', 5));
  assert.ok(game.playCard(state, 'p0', last.id).ok);
  assert.strictEqual(state.status, 'roundOver');
  assert.strictEqual(state.winnerId, 'p0');
  assert.strictEqual(game.drawCard(state, 'p1').ok, false, 'no moves after the round');
});

test('a last card that forces a draw still wins', () => {
  const last = card('pepperoni', 'draw2');
  const state = scenario(['Ana', 'Bo'], [[last], []], num('pepperoni', 5));
  assert.ok(game.playCard(state, 'p0', last.id).ok);
  assert.strictEqual(state.winnerId, 'p0');
  assert.strictEqual(state.players[1].hand.length, 0, 'no penalty after the win');
});

// ------------------------------------------------------------ leaving ------
test('turn order steps over a player who left', () => {
  const play = num('pepperoni', 3);
  const state = scenario(['Ana', 'Bo', 'Cy'], [[play, num('basil', 1)], [], []], num('pepperoni', 5));
  game.removePlayer(state, 'p1');
  assert.ok(game.playCard(state, 'p0', play.id).ok);
  assert.strictEqual(game.currentPlayer(state).name, 'Cy');
});

test('the last player at the table wins the round', () => {
  const state = scenario(['Ana', 'Bo'], [[num('pepperoni', 1)], [num('basil', 1)]], num('pepperoni', 5));
  game.removePlayer(state, 'p1');
  assert.strictEqual(state.status, 'roundOver');
  assert.strictEqual(state.winnerId, 'p0');
});

test('an away player can be skipped', () => {
  const state = scenario(['Ana', 'Bo'], [[num('basil', 9)], [num('basil', 8)]], num('pepperoni', 5));
  assert.ok(game.forceSkip(state, 'p0').ok);
  assert.strictEqual(state.players[0].hand.length, 2, 'they took a card');
  assert.strictEqual(game.currentPlayer(state).name, 'Bo');
});

// -------------------------------------------------------------- the view --
test('a player only sees their own hand', () => {
  const state = game.createGame([
    { id: 'a', name: 'Ana' }, { id: 'b', name: 'Bo' },
  ], { seed: 3 });
  const view = game.viewFor(state, 'a');
  assert.strictEqual(view.hand.length, 7);
  assert.strictEqual(view.players.length, 2);
  for (const player of view.players) {
    assert.ok(!('hand' in player), 'no hand leaks out');
    assert.strictEqual(typeof player.cardCount, 'number');
  }
  assert.ok(Array.isArray(view.playableCardIds));
  assert.strictEqual(typeof view.gameId, 'string');
});

test('the strict Whole Pie +4 rule blocks it when you hold the topping', () => {
  const wild4 = card(null, 'wild4');
  const holding = num('pepperoni', 2);
  const state = game.createGame([
    { id: 'p0', name: 'Ana' }, { id: 'p1', name: 'Bo' },
  ], { seed: 5, strictWildFour: true });
  state.players[0].hand = [wild4, holding];
  state.discardPile = [num('pepperoni', 5)];
  state.currentTopping = 'pepperoni';
  state.turnIndex = 0;

  assert.strictEqual(game.playCard(state, 'p0', wild4.id, 'basil').ok, false);
  state.players[0].hand = [wild4, num('basil', 2)];
  assert.strictEqual(game.playCard(state, 'p0', wild4.id, 'basil').ok, true);
});

test('a Burnt Slice at a table of two keeps the call-out window open', () => {
  const skip = card('pepperoni', 'skip');
  const state = scenario(['Ana', 'Bo'], [[skip, num('basil', 1)], [num('cheese', 6)]], num('pepperoni', 5));
  assert.ok(game.playCard(state, 'p0', skip.id).ok);
  assert.strictEqual(game.currentPlayer(state).name, 'Ana', 'Ana plays again');
  assert.strictEqual(state.players[0].hand.length, 1);
  assert.strictEqual(state.players[0].vulnerable, true, 'she never shouted, so Bo may still catch her');
  assert.ok(game.callOut(state, 'p1', 'p0').ok);
  assert.strictEqual(state.players[0].hand.length, 3);
});

// ---------------------------------------------------------------- a soak -----
test('full rounds of chef bots keep all 108 cards and always find a winner', () => {
  const bot = require('../server/bot');
  for (let seed = 1; seed <= 80; seed++) {
    const count = 2 + (seed % 7);
    const seats = Array.from({ length: count }, (_, i) => ({ id: `p${i}`, name: `P${i}`, isBot: true }));
    const state = game.createGame(seats, { seed, strictWildFour: seed % 3 === 0 });
    const cards = () => state.drawPile.length + state.discardPile.length
      + state.players.reduce((n, p) => n + p.hand.length, 0);

    let guard = 0;
    while (state.status === 'playing' && guard++ < 4000) {
      const current = game.currentPlayer(state);
      const move = bot.decide(state, current.id);
      let result;
      if (!move) result = game.forceSkip(state, current.id);
      else if (move.action === 'play') result = game.playCard(state, current.id, move.cardId, move.topping);
      else if (move.action === 'draw') result = game.drawCard(state, current.id);
      else if (move.action === 'pass') result = game.passTurn(state, current.id);
      else if (move.action === 'za') result = game.declareZa(state, current.id);
      else result = game.callOut(state, current.id, move.targetId);
      assert.ok(result.ok, `seed ${seed}: ${move && move.action} refused: ${result.error}`);
      assert.strictEqual(cards(), 108, `seed ${seed}: cards went missing`);
    }
    assert.ok(guard < 4000, `seed ${seed}: the round never ended`);
    assert.ok(state.winnerId, `seed ${seed}: no winner`);
  }
});

// ------------------------------------------------------- the regulars -------
test('a table of biased regulars still only ever makes legal moves', () => {
  const bot = require('../server/bot');
  assert.strictEqual(bot.REGULARS.length, 6, 'six regulars');

  for (let seed = 1; seed <= 40; seed++) {
    // Every regular gets a seat, so every bias runs in every round.
    const seats = bot.REGULARS.map((r) => ({ id: r.id, name: r.name, isBot: true }));
    const state = game.createGame(seats, { seed, strictWildFour: seed % 3 === 0 });
    const persona = (id) => bot.REGULARS.find((r) => r.id === id);
    const cards = () => state.drawPile.length + state.discardPile.length
      + state.players.reduce((n, p) => n + p.hand.length, 0);

    let guard = 0;
    while (state.status === 'playing' && guard++ < 4000) {
      const current = game.currentPlayer(state);
      const move = bot.decide(state, current.id, persona(current.id));
      let result;
      if (!move) result = game.forceSkip(state, current.id);
      else if (move.action === 'play') result = game.playCard(state, current.id, move.cardId, move.topping);
      else if (move.action === 'draw') result = game.drawCard(state, current.id);
      else if (move.action === 'pass') result = game.passTurn(state, current.id);
      else if (move.action === 'za') result = game.declareZa(state, current.id);
      else result = game.callOut(state, current.id, move.targetId);
      assert.ok(result.ok, `seed ${seed}: ${move && move.action} refused: ${result.error}`);
      assert.strictEqual(cards(), 108, `seed ${seed}: cards went missing`);
    }
    assert.ok(guard < 4000, `seed ${seed}: the round never ended`);
    assert.ok(state.winnerId, `seed ${seed}: no winner`);
  }
});

test('each bias reorders the preference list it is given', () => {
  const bot = require('../server/bot');
  const regular = (id) => bot.REGULARS.find((r) => r.id === id);
  const chosen = (hand, persona) => {
    const state = scenario(['Bot', 'Bo'], [hand, [num('basil', 4)]], num('pepperoni', 5));
    state.players[0].declaredZa = true; // no ZA shout in the way
    const move = bot.decide(state, 'p0', persona);
    assert.ok(move && move.action === 'play', 'a card was chosen');
    return hand.find((c) => c.id === move.cardId);
  };

  // Vito sits on the wild while his hand is fat, then leads with it at three.
  const fat = [card(null, 'wild'), num('pepperoni', 3), num('pepperoni', 6), num('pepperoni', 7)];
  assert.notStrictEqual(chosen(fat, regular('vito')).kind, 'wild', 'four cards: he is saving it');
  const thin = [card(null, 'wild'), num('pepperoni', 3), num('pepperoni', 6)];
  assert.strictEqual(chosen(thin, regular('vito')).kind, 'wild', 'three cards: out it comes');

  // Nonna Pina leaves the mean cards alone while anything else fits...
  const mean = [card('pepperoni', 'draw2'), num('pepperoni', 3)];
  assert.strictEqual(chosen(mean, regular('pina')).kind, 'number', 'she plays the quiet one');
  // ...but she still plays one when it is the only legal card.
  const forced = [card('pepperoni', 'draw2'), num('basil', 9)];
  assert.strictEqual(chosen(forced, regular('pina')).kind, 'draw2', 'no other option');

  // Dominic takes the biggest number on the table.
  const numbers = [num('pepperoni', 2), num('pepperoni', 8), num('pepperoni', 5)];
  assert.strictEqual(chosen(numbers, regular('dominic')).value, 8);

  // Big Paulie reaches for the +2 first.
  const paulies = [num('pepperoni', 8), card('pepperoni', 'draw2')];
  assert.strictEqual(chosen(paulies, regular('paulie')).kind, 'draw2');
});

test('the call-out chance is the regular sitting there, not one house number', () => {
  const bot = require('../server/bot');
  const regular = (id) => bot.REGULARS.find((r) => r.id === id);
  const looks = (persona) => {
    const state = scenario(['Bot', 'Bo'], [[num('basil', 4)], [num('basil', 5)]], num('pepperoni', 5));
    state.players[1].hand = [num('basil', 5)];
    state.players[1].vulnerable = true;
    state.rng = () => 0.8; // the same roll for everybody
    const move = bot.decide(state, 'p0', persona);
    return Boolean(move && move.action === 'callout');
  };
  assert.strictEqual(looks(regular('carmela')), true, 'Carmela notices at 95%');
  assert.strictEqual(looks(regular('pina')), false, 'Nonna Pina, at 40%, does not');
  assert.strictEqual(looks(null), false, 'and the house default is still 70%');
});

test('an addBot with no id, or an id nobody has, still seats a regular', () => {
  const bot = require('../server/bot');
  const ids = new Set(bot.REGULARS.map((r) => r.id));

  const asked = bot.pickRegular([], 'vito');
  assert.strictEqual(asked.id, 'vito', 'the host gets who they asked for');

  const unknown = bot.pickRegular([], 'gabagool');
  assert.ok(unknown && ids.has(unknown.id), 'an unknown id falls back to a real regular');

  const anybody = bot.pickRegular([]);
  assert.ok(anybody && ids.has(anybody.id), 'no id at all works the same way');

  // A regular who is already at the table is never sent in twice.
  const busy = bot.pickRegular(['Vito'], 'vito');
  assert.ok(busy && busy.id !== 'vito', 'Vito is seated, so somebody else comes');

  const allSeated = bot.pickRegular(bot.REGULARS.map((r) => r.name), 'ray');
  assert.strictEqual(allSeated, null, 'a full house falls back to a plain chef');
});

test('a regular says their line on their move and stays quiet otherwise', () => {
  const bot = require('../server/bot');
  const vito = bot.REGULARS.find((r) => r.id === 'vito');
  const wild = card(null, 'wild');
  const plain = num('pepperoni', 3);
  const state = game.createGame(
    [
      { id: 'p0', name: vito.name, isBot: true, line: vito.line, cue: bot.cueFor(vito) },
      { id: 'p1', name: 'Bo' },
    ],
    { seed: 11 }
  );
  state.players[0].hand = [plain, wild, num('basil', 7)];
  state.discardPile = [num('pepperoni', 5)];
  state.currentTopping = 'pepperoni';
  state.turnIndex = 0;

  assert.ok(game.playCard(state, 'p0', plain.id).ok);
  assert.ok(!state.log[state.log.length - 1].text.includes(vito.line), 'a number is not his moment');

  state.turnIndex = 0;
  assert.ok(game.playCard(state, 'p0', wild.id, 'basil').ok);
  assert.ok(state.log[state.log.length - 1].text.includes(`"${vito.line}"`), 'the wild is');
});

test('a room hands each bot seat its own pause and its own catchphrase', () => {
  const bot = require('../server/bot');
  const room = new Room('TEST-0002');
  room.emptySince = 0;
  room.addSeat({ name: 'Ana' }).connected = true;
  const ray = bot.REGULARS.find((r) => r.id === 'ray');
  const seat = room.addSeat({ name: ray.name, isBot: true, regularId: 'ray' });

  assert.strictEqual(room.regularOf(seat.id).id, 'ray');
  assert.ok(room.startRound().ok);
  const player = game.findPlayer(room.game, seat.id);
  assert.strictEqual(player.line, ray.line, 'the line rides along with the seat');
  assert.strictEqual(player.cue, 'win');

  // Ray is quick, so his pause must land inside his own range, not the house one.
  room.game.turnIndex = room.game.players.findIndex((p) => p.id === seat.id);
  room.scheduleTimers(true);
  const wait = room.botDueAt - Date.now();
  assert.ok(wait >= ray.pause[0] - 40 && wait <= ray.pause[1] + 40, `pause was ${wait}ms`);

  // Nothing about the regular reaches the wire.
  const snapshot = JSON.stringify(room.snapshotFor(seat.id));
  assert.ok(!snapshot.includes('regularId'), 'the roster stays on the server');
  assert.ok(!snapshot.includes('"line"'), 'the catchphrase reaches the client as log text only');
  assert.ok(!snapshot.includes('"cue"'), 'and the cue never leaves the server at all');
});

// ------------------------------------------------------------- the room ------

/** A room with seats but no sockets. Bot seats are the names that start "Chef". */
function table(names) {
  const room = new Room('TEST-0001');
  room.emptySince = 0;
  const seats = names.map((name) => {
    const isBot = name.startsWith('Chef');
    const seat = room.addSeat({ name, isBot });
    if (!isBot) seat.connected = true;
    return seat;
  });
  return { room, seats };
}

test('a player who leaves mid-round closes the round and credits the win', () => {
  const { room, seats } = table(['Ana', 'Bo']);
  assert.ok(room.startRound().ok);
  room.removeSeat(seats[1].id); // Bo uses the leave button
  assert.strictEqual(room.game.status, 'roundOver');
  assert.strictEqual(room.phase, 'roundOver', 'the room must not stay in play');
  assert.strictEqual(seats[0].wins, 1);
});

test('the deal moves round the table instead of parking on the host', () => {
  const { room, seats } = table(['Ana', 'Bo', 'Cy', 'Di']);
  const starters = [];
  for (let round = 0; round < 5; round++) {
    assert.ok(room.startRound().ok);
    starters.push(room.game.players[room.game.turnIndex].id);
    room.phase = 'roundOver';
  }

  // The whole bug: every one of these used to be Ana.
  assert.strictEqual(
    new Set(starters.slice(0, 4)).size, 4,
    `four rounds must open at four different seats, got ${starters.slice(0, 4).join(',')}`
  );
  assert.deepStrictEqual(
    starters,
    [seats[0].id, seats[1].id, seats[2].id, seats[3].id, seats[0].id],
    'and it passes one seat at a time, wrapping back round'
  );
});

test('the deal keeps moving when the chef who dealt last walks out', () => {
  const { room, seats } = table(['Ana', 'Bo', 'Cy', 'Di']);
  assert.ok(room.startRound().ok);
  assert.strictEqual(room.game.players[room.game.turnIndex].id, seats[0].id);
  room.phase = 'roundOver';

  // Ana dealt and then left. The rotation cannot point at her any more, and
  // it must not collapse back onto whoever is now listed first.
  room.removeSeat(seats[0].id);
  room.phase = 'roundOver';
  assert.ok(room.startRound().ok);
  const after = room.game.players[room.game.turnIndex].id;
  assert.ok(
    room.seats.some((s) => s.id === after),
    'the round opens at a seat that is actually at the table'
  );
  assert.notStrictEqual(after, seats[0].id, 'and never at the seat that left');

  // It is still rotating, not stuck: the next round moves on again.
  room.phase = 'roundOver';
  assert.ok(room.startRound().ok);
  assert.notStrictEqual(
    room.game.players[room.game.turnIndex].id, after,
    'the round after that opens somewhere new again'
  );
});

test('a player inside the reconnect grace period stays in the next round', () => {
  const { room, seats } = table(['Ana', 'Bo']);
  assert.ok(room.startRound().ok);
  room.phase = 'roundOver';
  seats[1].connected = false; // Bo dropped out but still holds the seat
  seats[1].disconnectedAt = Date.now();

  assert.ok(room.startRound().ok, 'the host can start with a player away');
  assert.strictEqual(room.game.players.length, 2);
  const bo = game.findPlayer(room.game, seats[1].id);
  assert.ok(bo, 'Bo keeps a place at the table');
  assert.strictEqual(bo.hand.length, 7);
  assert.strictEqual(bo.connected, false);
});

test('a bot makes one call-out decision per window, not one per tick', () => {
  const manager = new RoomManager();
  const { room } = table(['Ana', 'Chef Mario']);
  manager.rooms.set(room.code, room);
  assert.ok(room.startRound().ok);
  // Ana is down to one card and kept quiet. It is her turn, so no timer fires.
  room.game.turnIndex = 0;
  room.game.players[0].hand = [num('basil', 4)];
  room.game.players[0].vulnerable = true;

  let rolls = 0;
  room.game.rng = () => { rolls++; return 0.99; }; // this chef always looks away
  for (let i = 0; i < 6; i++) manager.tickRoom(room, Date.now());
  manager.stop();

  assert.strictEqual(rolls, 1, 'the bot made up its mind once');
  assert.strictEqual(room.game.players[0].hand.length, 1, 'so Ana got away with it');
});

test('cleaning up a stale room leaves a live room with the same code alone', () => {
  const manager = new RoomManager();
  const stale = new Room('PIZZA-0001');
  const live = new Room('PIZZA-0001');
  live.addSeat({ name: 'Ana' }).connected = true;
  manager.rooms.set(live.code, live);
  manager.cleanupIfEmpty(stale);
  manager.stop();
  assert.strictEqual(manager.rooms.get('PIZZA-0001'), live);
});

// ---------------------------------------------------- the seat token ---------
test('a seat gets a token, a chef bot does not, and no snapshot gives it away', () => {
  const manager = new RoomManager();
  const created = manager.createRoom('Ana', null);
  manager.stop();
  assert.ok(created.ok);
  assert.match(created.seat.token, /^[0-9a-f]{32}$/, 'a long random token');

  const room = created.room;
  const chef = room.addSeat({ name: 'Chef Mario', isBot: true });
  assert.strictEqual(chef.token, null, 'a bot needs no token');

  const snapshot = room.snapshotFor(created.seat.id);
  assert.ok(!JSON.stringify(snapshot).includes(created.seat.token), 'the token never goes on the table');
  for (const seat of snapshot.seats) assert.ok(!('token' in seat));
});

test('only the client holding the token may take an empty seat again', () => {
  const manager = new RoomManager();
  const created = manager.createRoom('Ana', {});
  const room = created.room;
  room.addSeat({ name: 'Chef Mario', isBot: true });
  assert.ok(room.startRound().ok);
  const token = created.seat.token;

  // Ana's socket drops. The seat waits for her inside the grace period.
  manager.handleDisconnect(room, created.seat);
  assert.strictEqual(created.seat.connected, false);

  const noToken = manager.joinRoom(room.code, 'Ana', {});
  assert.strictEqual(noToken.ok, false, 'a stranger may not sit down');
  assert.match(noToken.error, /already seated/i);

  const wrongToken = manager.joinRoom(room.code, 'ana', {}, 'f'.repeat(32));
  assert.strictEqual(wrongToken.ok, false, 'a guessed token is no good either');

  const back = manager.joinRoom(room.code, 'Ana', {}, token);
  manager.stop();
  assert.strictEqual(back.ok, true);
  assert.strictEqual(back.reconnected, true);
  assert.strictEqual(back.seat.id, created.seat.id, 'the same seat, with the same hand');
  assert.strictEqual(back.seat.token, token, 'the token stays good for the next drop');
});

test('a free name still joins without a token, and a taken name is still refused', () => {
  const manager = new RoomManager();
  const created = manager.createRoom('Ana', {});
  const room = created.room;

  const fresh = manager.joinRoom(room.code, 'Bo', {});
  assert.strictEqual(fresh.ok, true, 'a new player needs no token');
  assert.ok(fresh.seat.token && fresh.seat.token !== created.seat.token, 'and gets one of their own');

  const twice = manager.joinRoom(room.code, 'BO', {}, fresh.seat.token);
  manager.stop();
  assert.strictEqual(twice.ok, false, 'not even the token opens a seat somebody sits in');
  assert.match(twice.error, /already at the table/i);
});

// ------------------------------------------- the table must not stall -------
/**
 * These three are policies, not rules, and every one of them is a clock. None
 * of them sleeps: `TIMINGS` is the mutable copy of the constants that the room
 * manager reads at run time, so a case shrinks the field it is about, drives
 * `tick()` by hand with a `now` it chooses, and puts the field back.
 *
 * Driving `tickRoom(room, now)` directly is the point — it is the same method
 * the real 250ms interval calls, with the same argument, so what is under test
 * is the shipped timer path and not a reimplementation of it.
 */
function withTimings(overrides, fn) {
  const saved = { ...TIMINGS };
  Object.assign(TIMINGS, overrides);
  try {
    return fn();
  } finally {
    Object.assign(TIMINGS, saved);
  }
}

test('an empty room outlives the seat grace it still owes', () => {
  // The shipped numbers were the bug: 60s room, 120s seat. A solo player who
  // dropped came back inside their grace to "No table has that code."
  withTimings({ emptyRoomTtl: 1000, reconnectGrace: 5000 }, () => {
    const manager = new RoomManager();
    manager.stop(); // no background interval; this case drives the clock itself
    const created = manager.createRoom('Ana', {});
    const room = created.room;
    room.addSeat({ name: 'Bot', isBot: true });
    assert.ok(room.startRound().ok);

    const t0 = Date.now();
    created.seat.connected = false;
    created.seat.socket = null;
    created.seat.disconnectedAt = t0;
    room.emptySince = t0;

    // Past the room TTL, well inside her grace: the table has to still be there.
    manager.tickRoom(room, t0 + 2000);
    assert.strictEqual(manager.getRoom(room.code), room, 'the room outlives its own TTL');
    assert.ok(
      manager.joinRoom(room.code, 'Ana', {}, created.seat.token).ok,
      'and she can actually take her seat back'
    );

    // Now let the grace itself run out on a fresh drop.
    const t1 = Date.now();
    const seat = room.findSeat(created.seat.id);
    seat.connected = false;
    seat.socket = null;
    seat.disconnectedAt = t1;
    room.emptySince = t1;
    manager.tickRoom(room, t1 + 6000);
    assert.strictEqual(manager.getRoom(room.code), null, 'once nothing is owed, it goes');
  });
});

test('a host who drops hands the oven to the longest-seated connected human', () => {
  const manager = new RoomManager();
  manager.stop();
  const created = manager.createRoom('Ana', {});
  const room = created.room;
  const bo = manager.joinRoom(room.code, 'Bo', {});
  const cy = manager.joinRoom(room.code, 'Cy', {});
  assert.strictEqual(room.hostId, created.seat.id, 'the founder starts as host');
  assert.ok(room.startRound().ok, 'in a running round the seats survive a drop');

  manager.handleDisconnect(room, created.seat);

  assert.strictEqual(room.hostId, bo.seat.id, 'Bo sat down first, so Bo takes it');
  // The snapshot is what the client reads; the field has to move there too.
  assert.strictEqual(room.snapshotFor(bo.seat.id).hostId, bo.seat.id);
  assert.strictEqual(room.snapshotFor(bo.seat.id).isHost, true);
  assert.strictEqual(room.snapshotFor(cy.seat.id).isHost, false);

  // Ana comes back inside her grace. She does NOT get the oven back: whatever
  // the acting host has done since, the answer is the same one.
  const back = manager.joinRoom(room.code, 'Ana', {}, created.seat.token);
  assert.strictEqual(back.ok, true);
  assert.strictEqual(room.hostId, bo.seat.id, 'the returning host is a regular player now');
  assert.strictEqual(room.snapshotFor(created.seat.id).isHost, false);
});

test('a host who drops alone keeps the table, and the first one back takes it', () => {
  const manager = new RoomManager();
  manager.stop();
  const created = manager.createRoom('Ana', {});
  const room = created.room;
  const bo = manager.joinRoom(room.code, 'Bo', {});
  assert.ok(room.startRound().ok);

  manager.handleDisconnect(room, bo.seat);
  manager.handleDisconnect(room, created.seat);
  assert.strictEqual(room.hostId, created.seat.id, 'nobody to elect, so nothing moves');

  const boBack = manager.joinRoom(room.code, 'Bo', {}, bo.seat.token);
  assert.strictEqual(boBack.ok, true);
  assert.strictEqual(room.hostId, bo.seat.id, 'a hostless table is not left hostless');
});

test('a connected player who stops moving loses the turn to the clock', () => {
  withTimings({ idleTurn: 1000 }, () => {
    const manager = new RoomManager();
    manager.stop();
    const created = manager.createRoom('Ana', {});
    const room = created.room;
    manager.joinRoom(room.code, 'Bo', {});
    assert.ok(room.startRound().ok);

    // Put Ana on turn, connected, with nothing wrong with her socket.
    const current = game.currentPlayer(room.game);
    const seat = room.findSeat(current.id);
    assert.strictEqual(seat.connected, true, 'this is the connected case, not the away one');
    room.scheduleTimers(true);
    assert.ok(room.idleDueAt > 0, 'a connected human on turn is on a clock at all');
    assert.strictEqual(room.awayDueAt, 0, 'and it is not the away clock');

    const serialBefore = room.game.turnSerial;
    const leftAtStart = room.snapshotFor(seat.id).turnIdleMsLeft;
    assert.ok(leftAtStart > 0 && leftAtStart <= 1000, `snapshot carries the time left (${leftAtStart})`);

    // Not yet.
    manager.tickRoom(room, Date.now() + 500);
    assert.strictEqual(room.game.turnSerial, serialBefore, 'half way through, nothing happens');

    // Past the deadline: the same draw-and-pass the away path plays.
    manager.tickRoom(room, Date.now() + 1500);
    assert.notStrictEqual(room.game.turnSerial, serialBefore, 'the table moved on');
    assert.match(
      room.game.log[room.game.log.length - 1].text,
      /took too long/i,
      'and said so in the log'
    );
  });
});

test('any action winds the idle clock back up', () => {
  withTimings({ idleTurn: 1000 }, () => {
    const manager = new RoomManager();
    manager.stop();
    const created = manager.createRoom('Ana', {});
    const room = created.room;
    manager.joinRoom(room.code, 'Bo', {});
    assert.ok(room.startRound().ok);
    room.scheduleTimers(true);

    const first = room.idleDueAt;
    assert.ok(first > 0);
    // A call-out does not change the turn, so `scheduleTimers` correctly
    // declines to re-arm — this is exactly the gap `touchIdleTimer` fills.
    room.idleDueAt = Date.now() - 1; // pretend most of the clock has run down
    room.touchIdleTimer();
    assert.ok(room.idleDueAt > Date.now() + 500, 'the clock is full again');
  });
});

test('the second turn in a row costs the table the short clock, not the full one', () => {
  withTimings({ idleTurn: 4000, idleStruck: 1000, idleWarn: 10000 }, () => {
    const manager = new RoomManager();
    manager.stop();
    const created = manager.createRoom('Ana', {});
    const room = created.room;
    manager.joinRoom(room.code, 'Bo', {});
    assert.ok(room.startRound().ok);

    const seat = room.findSeat(game.currentPlayer(room.game).id);
    room.scheduleTimers(true);
    assert.strictEqual(seat.idleStrikes, 0, 'everybody starts with the benefit of the doubt');

    // First expiry: they were given, and have now spent, the full 4s.
    const t0 = Date.now();
    manager.tickRoom(room, t0 + 4500);
    assert.strictEqual(seat.idleStrikes, 1, 'the doubt has been answered once');

    // Bring the same seat back on turn and re-arm exactly as a turn change does.
    room.game.turnIndex = room.game.players.findIndex((p) => p.id === seat.id);
    room.scheduleTimers(true);
    const budget = room.idleDueAt - Date.now();
    assert.ok(
      budget <= 1000 + 50 && budget > 0,
      `a struck seat waits out the short clock, got ${budget}ms (full price would be ~4000)`
    );

    // And the warning came down with it: ten seconds of warning on a one
    // second turn is not a warning.
    const warn = room.snapshotFor(seat.id).turnIdleWarnMs;
    assert.strictEqual(warn, 500, `the warning is half the clock in play, got ${warn}`);

    // It really does fire early: half of the OLD clock is already past the new one.
    const serial = room.game.turnSerial;
    manager.tickRoom(room, Date.now() + 2000);
    assert.notStrictEqual(room.game.turnSerial, serial, 'the table moved on at the short clock');
    assert.strictEqual(seat.idleStrikes, 2, 'and it stays struck while they stay away');
  });
});

test('one move makes a struck player an ordinary player again', () => {
  withTimings({ idleTurn: 4000, idleStruck: 1000 }, () => {
    const manager = new RoomManager();
    manager.stop();
    const created = manager.createRoom('Ana', {});
    const room = created.room;
    manager.joinRoom(room.code, 'Bo', {});
    assert.ok(room.startRound().ok);

    const seat = room.findSeat(game.currentPlayer(room.game).id);
    room.scheduleTimers(true);
    manager.tickRoom(room, Date.now() + 4500);
    assert.strictEqual(seat.idleStrikes, 1);
    assert.strictEqual(
      room.snapshotFor(seat.id).seats.find((s) => s.id === seat.id).idleSkipped, true,
      'and the table can see it'
    );

    // They come back and do something — anything. `draw` is the cheapest move
    // that always exists, and it goes through the real action path.
    room.game.turnIndex = room.game.players.findIndex((p) => p.id === seat.id);
    room.scheduleTimers(true);
    const acted = manager.applyAction(room, seat.id, { type: 'draw' });
    assert.ok(acted.ok, `the action itself must land: ${acted.error || ''}`);
    assert.strictEqual(seat.idleStrikes, 0, 'one move is the whole proof they are here');
    assert.strictEqual(
      room.snapshotFor(seat.id).seats.find((s) => s.id === seat.id).idleSkipped, false,
      'and the table stops flagging them'
    );

    // Their next turn is back at full price.
    room.game.turnIndex = room.game.players.findIndex((p) => p.id === seat.id);
    room.scheduleTimers(true);
    const budget = room.idleDueAt - Date.now();
    assert.ok(budget > 1000 + 50, `back to the full clock, got ${budget}ms`);
  });
});

// ------------------------------------------------- the client's own freeze ---
/**
 * A source-level guard, not a runtime one: there is no DOM here, and adding one
 * would cost a dependency this project does not have. It exists because the bug
 * it catches was invisible to every runtime check we had.
 *
 * `syncDesynced` disables the action controls while the connection is out and
 * then returns early on the way back, trusting the next snapshot to re-enable
 * them. That trust has to be earned control by control. ZA! and the dough pile
 * are re-derived every snapshot; PASS and CALL OUT were only ever assigned
 * `.hidden`, so nothing turned them back on — and because `connect()` opens
 * every page load in `connecting`, the freeze ran on the ordinary boot path and
 * both stayed dead for the entire session. A player told to "play it or pass"
 * could not pass.
 *
 * So: anything that freeze switches off must be switched back on somewhere else.
 */
test('every control the desync freeze disables has an owner that turns it back on', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'app.js'), 'utf8');
  const start = src.indexOf('function syncDesynced(');
  assert.ok(start > 0, 'syncDesynced is still the freeze');

  const after = src.indexOf('\nfunction ', start + 10);
  const body = src.slice(start, after > 0 ? after : src.length);
  const list = body.match(/for \(const button of \[([^\]]+)\]\)\s*\{\s*if \(button\) button\.disabled = true;/);
  assert.ok(list, 'the freeze still switches off a list of controls');

  const frozen = list[1].split(',').map((s) => s.trim()).filter(Boolean);
  assert.ok(frozen.length >= 4, `expected the four action controls, got ${frozen.join(',')}`);

  // Everything except the freeze itself. An owner has to live somewhere else:
  // the freeze re-enabling its own list would just be the early return again.
  const rest = src.slice(0, start) + src.slice(start + body.length);
  for (const name of frozen) {
    // An assignment of `true` is another way of switching the control OFF, so
    // it cannot be the owner that switches it back on. Everything else counts:
    // the real owners are written `= !view.canPass`, not `= false`, and
    // demanding the literal `false` would fail the code that actually fixed
    // this.
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Collect the right-hand sides rather than trying to exclude `true` inside
    // the pattern: `\s*` backtracks, so a lookahead placed after it happily
    // matches at the space and the assertion silently stops asserting.
    const assigns = [...rest.matchAll(new RegExp(`${escaped}\\.disabled\\s*=\\s*([^;]+);`, 'g'))];
    const owner = assigns.some((m) => m[1].trim() !== 'true');
    assert.ok(
      owner,
      `${name} is switched off by the desync freeze and nothing outside it ever assigns `
      + `.disabled — this is exactly how PASS and CALL OUT died on every boot`
    );
  }
});

// ------------------------------------------------------- the file server -----
test('the file server refuses a NUL byte instead of throwing', () => {
  const handler = createStaticHandler(path.join(__dirname, '..', 'public'));
  const res = { code: 0, body: '' };
  res.writeHead = (code) => { res.code = code; return res; };
  res.end = (chunk) => { res.body = String(chunk || ''); return res; };
  assert.doesNotThrow(() => handler({ url: '/%00' }, res));
  assert.strictEqual(res.code, 400);
});

testAsync('the file server serves the client and nothing above it', async () => {
  const handler = createStaticHandler(path.join(__dirname, '..', 'public'));
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const get = async (url) => (await fetch(base + url)).status;
  try {
    assert.strictEqual(await get('/'), 200, 'the client loads');
    assert.strictEqual(await get('/%00'), 400, 'a NUL byte is refused');
    assert.strictEqual(await get('/../server/game.js'), 404, 'no server source');
    assert.strictEqual(await get('/..%2f..%2fserver/game.js'), 404, 'no encoded escape');
    assert.strictEqual(await get('/%2e%2e/%2e%2e/package.json'), 404, 'no project files');
    assert.strictEqual(await get('/nope.html'), 404);
  } finally {
    server.close();
  }
});

(async () => {
  for (const item of pending) {
    try {
      await item.fn();
      passed++;
      console.log(`  ok    ${item.name}`);
    } catch (err) {
      failed++;
      console.log(`  FAIL  ${item.name}`);
      console.log(`        ${err.message}`);
    }
  }
  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
})();
