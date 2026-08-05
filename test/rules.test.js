'use strict';

/**
 * Rules tests. Run with `npm test`.
 * No test framework: plain assertions so the project keeps one dependency.
 */

const assert = require('assert');
const http = require('http');
const path = require('path');
const game = require('../server/game');
const { Room, RoomManager } = require('../server/rooms');
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

console.log('\nPizzuno rules\n');

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

// --------------------------------------------------------------- PIZZUNO --
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

test('a player who shouts PIZZUNO cannot be called out', () => {
  const play = num('pepperoni', 3);
  const state = scenario(['Ana', 'Bo'], [[play, num('basil', 1)], []], num('pepperoni', 5));
  assert.ok(game.declarePizzuno(state, 'p0').ok, 'may shout with two cards');
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

test('PIZZUNO is refused with three cards or more', () => {
  const state = scenario(['Ana', 'Bo'], [[num('pepperoni', 1), num('pepperoni', 2), num('pepperoni', 3)], []], num('pepperoni', 5));
  assert.strictEqual(game.declarePizzuno(state, 'p0').ok, false);
});

test('drawing cards cancels an early PIZZUNO shout', () => {
  const state = scenario(['Ana', 'Bo'], [[num('basil', 1), num('basil', 2)], []], num('pepperoni', 5));
  assert.ok(game.declarePizzuno(state, 'p0').ok);
  state.drawPile = [num('cheese', 9), num('cheese', 8)];
  game.drawCard(state, 'p0');
  assert.strictEqual(state.players[0].declaredPizzuno, false);
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
      else if (move.action === 'pizzuno') result = game.declarePizzuno(state, current.id);
      else result = game.callOut(state, current.id, move.targetId);
      assert.ok(result.ok, `seed ${seed}: ${move && move.action} refused: ${result.error}`);
      assert.strictEqual(cards(), 108, `seed ${seed}: cards went missing`);
    }
    assert.ok(guard < 4000, `seed ${seed}: the round never ended`);
    assert.ok(state.winnerId, `seed ${seed}: no winner`);
  }
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
