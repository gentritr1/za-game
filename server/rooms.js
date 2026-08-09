'use strict';

/**
 * Room manager. Holds the lobbies, the authoritative game state and the timers
 * for bots and for players who went away.
 */

const crypto = require('crypto');

const game = require('./game');
const bot = require('./bot');

const CODE_WORDS = [
  'PIZZA', 'DOUGH', 'CRUST', 'BASIL', 'OLIVE', 'PESTO',
  'SAUCE', 'SLICE', 'OVEN', 'CALZO', 'TOMATO', 'PARMA',
];

const TICK_MS = 250;
const BOT_THINK_MS = 800; // pause before a bot with no regular takes its turn
const BOT_QUICK_MS = 300; // follow-up pause for a shout or a call-out
const AWAY_TURN_TIMEOUT_MS = 12000; // skip the turn of a player who is away
const IDLE_TURN_TIMEOUT_MS = 45000; // skip the turn of a player who is here but still
// The same, for a player whose last turn already ran out. Deliberately its own
// number rather than a reuse of `AWAY_TURN_TIMEOUT_MS`: the two rules answer
// the same evidence today and should be tunable apart tomorrow.
const IDLE_STRUCK_TIMEOUT_MS = 12000;
const IDLE_WARN_MS = 10000; // the last stretch of that, counted down on screen
const RECONNECT_GRACE_MS = 120000; // time to come back before the seat is freed
const EMPTY_ROOM_TTL_MS = 60000; // floor on how long a room with nobody in it lives
const MAX_NAME_LENGTH = 16;
const MAX_ROOMS = 2000; // stops one client from filling the memory with lobbies

/**
 * The same numbers, in one mutable place, because every timing above is read
 * through here at run time.
 *
 * This exists so the tests can prove a policy without waiting two minutes for
 * it: a case shrinks the field it cares about, runs, and puts it back. Nothing
 * in the game reads these — they are all clock, no rule — and the constants
 * above stay the single statement of what the real values are.
 */
const TIMINGS = {
  awayTurn: AWAY_TURN_TIMEOUT_MS,
  idleTurn: IDLE_TURN_TIMEOUT_MS,
  idleStruck: IDLE_STRUCK_TIMEOUT_MS,
  idleWarn: IDLE_WARN_MS,
  reconnectGrace: RECONNECT_GRACE_MS,
  emptyRoomTtl: EMPTY_ROOM_TTL_MS,
};

let seatCounter = 0;

function nextSeatId() {
  seatCounter += 1;
  return `p${seatCounter}-${Math.random().toString(36).slice(2, 7)}`;
}

function cleanName(raw) {
  const name = String(raw || '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LENGTH);
  return name;
}

/**
 * How long this seat sits there before it moves. Each regular has their own
 * range; a bot without one keeps the old fixed pause.
 */
function botPauseFor(seat) {
  const regular = seat && seat.regularId ? bot.findRegular(seat.regularId) : null;
  const range = regular && Array.isArray(regular.pause) ? regular.pause : null;
  if (!range) return BOT_THINK_MS;
  const [low, high] = range;
  return Math.round(low + Math.random() * Math.max(0, high - low));
}

// ---------------------------------------------------------------------------

class Room {
  constructor(code) {
    this.code = code;
    this.seats = []; // { id, name, isBot, socket, connected, disconnectedAt, wins }
    this.hostId = null;
    this.phase = 'lobby'; // 'lobby' | 'playing' | 'roundOver'
    this.game = null;
    this.botDueAt = 0;
    this.awayDueAt = 0;
    this.idleDueAt = 0;
    this.idleWarnMs = 0; // how much of the clock in play is the warning
    this.awayTurnSerial = -1;
    this.emptySince = Date.now();
    // Who dealt last, and how many rounds this room has dealt. See
    // `startingSeatIndex`.
    this.lastStarterId = null;
    this.roundsDealt = 0;
  }

  // -- seats ---------------------------------------------------------------

  humanSeats() {
    return this.seats.filter((s) => !s.isBot);
  }

  connectedHumanSeats() {
    return this.humanSeats().filter((s) => s.connected);
  }

  findSeat(id) {
    return this.seats.find((s) => s.id === id) || null;
  }

  findSeatByName(name) {
    const key = name.toLowerCase();
    return this.seats.find((s) => s.name.toLowerCase() === key) || null;
  }

  addSeat({ name, isBot = false, socket = null, regularId = null }) {
    const seat = {
      id: nextSeatId(),
      name,
      isBot,
      // Which of the regulars is sitting here. Server side only: the snapshot
      // publishes the name they were hired under and nothing else.
      regularId: isBot ? regularId : null,
      // Proves that a later socket is the same player. It goes to that one
      // client and to nobody else. A bot has no client, so it needs none.
      token: isBot ? null : crypto.randomBytes(16).toString('hex'),
      socket,
      connected: isBot ? true : Boolean(socket),
      disconnectedAt: null,
      wins: 0,
      calloutWindow: null, // bots decide once per call-out window
      // Consecutive turns this seat has had taken off it by the idle clock.
      // Any action they take puts it back to nothing. See `idleClockFor`.
      idleStrikes: 0,
    };
    this.seats.push(seat);
    if (!this.hostId && !isBot) this.hostId = seat.id;
    return seat;
  }

  removeSeat(seatId) {
    const index = this.seats.findIndex((s) => s.id === seatId);
    if (index === -1) return;
    const [seat] = this.seats.splice(index, 1);
    if (this.game) {
      game.removePlayer(this.game, seat.id);
      // Losing a player can end the round, so the phase must follow.
      this.finishRoundIfOver();
    }
    if (this.hostId === seat.id) {
      const nextHost = this.humanSeats().find((s) => s.connected) || this.humanSeats()[0];
      this.hostId = nextHost ? nextHost.id : null;
    }
  }

  /**
   * Hands the oven to somebody who is actually standing at it.
   *
   * A host who dropped used to keep the title for the full two-minute grace,
   * and every host-only control went with them: nobody could start the next
   * round, nobody could start the game in the lobby. The table just sat there.
   *
   * The rule, stated once so it is not re-invented: **the host is the
   * longest-seated connected human.** `this.seats` is push-ordered, so the
   * first connected human in it is exactly that. The election runs the moment
   * the current host stops being connected, and the original host does NOT get
   * the title back when they return — they come back as a regular player and
   * whoever picked it up keeps it. That way nothing depends on what the acting
   * host did or did not do while they were gone.
   *
   * If nobody else is connected there is no election: the title stays where it
   * is, so a solo player who drops and comes back is still the host of their
   * own table. Returns true when the host actually changed.
   */
  electActingHost() {
    const host = this.hostId ? this.findSeat(this.hostId) : null;
    if (host && !host.isBot && host.connected) return false;
    const next = this.humanSeats().find((s) => s.connected);
    if (!next || next.id === this.hostId) return false;
    this.hostId = next.id;
    return true;
  }

  /**
   * The last moment any seat here is still owed its place.
   *
   * An empty room may not be swept before this. The TTL was sixty seconds and
   * the seat grace two minutes, so a solo player's seat outlived the room it
   * was in: they came back inside their grace to "No table has that code."
   */
  graceEndsAt() {
    let latest = 0;
    for (const seat of this.seats) {
      if (seat.isBot || seat.connected || !seat.disconnectedAt) continue;
      latest = Math.max(latest, seat.disconnectedAt + TIMINGS.reconnectGrace);
    }
    return latest;
  }

  /** Copies the connection flags into the game state so clients can show them. */
  syncConnectionFlags() {
    if (!this.game) return;
    for (const player of this.game.players) {
      const seat = this.findSeat(player.id);
      player.connected = seat ? seat.connected : false;
    }
  }

  /** The regular sitting in a seat, by seat id. Null for humans. */
  regularOf(seatId) {
    const seat = this.findSeat(seatId);
    return seat && seat.isBot ? bot.findRegular(seat.regularId) : null;
  }

  // -- lifecycle -----------------------------------------------------------

  /**
   * The deal passes round the table, one seat per round.
   *
   * Every round used to open at seat zero, which is the host, so one player
   * moved first in every round the room ever played. First move is a real
   * edge in a game about shedding cards, and it was going to the same chair
   * for the same reason a chair is listed first.
   *
   * By round, not by winner: handing the opening to whoever just won pays the
   * lead to the player already ahead. Passing the deal is what card games have
   * always done with it, and it gives every seat the first move equally often.
   *
   * Rotation is tracked by WHO dealt, not by a counter over seat positions, so
   * people arriving and leaving between rounds cannot shuffle whose turn it is
   * to deal. Only when that player is gone does it fall back to the round
   * count, which keeps it deterministic without pretending to remember a seat
   * that no longer exists.
   */
  startingSeatIndex(seats) {
    if (!this.lastStarterId) return 0;
    const at = seats.findIndex((s) => s.id === this.lastStarterId);
    if (at === -1) return this.roundsDealt % seats.length;
    return (at + 1) % seats.length;
  }

  startRound() {
    // A player inside the reconnect grace period keeps their seat in the new
    // round. The away timer skips their turns until they come back.
    const seats = this.seats;
    if (seats.length < game.MIN_PLAYERS) {
      return { ok: false, error: `You need at least ${game.MIN_PLAYERS} players.` };
    }
    if (seats.length > game.MAX_PLAYERS) {
      return { ok: false, error: `A table holds at most ${game.MAX_PLAYERS} players.` };
    }
    const startIndex = this.startingSeatIndex(seats);
    this.game = game.createGame(seats.map((s) => {
      const regular = s.isBot ? bot.findRegular(s.regularId) : null;
      return {
        id: s.id,
        name: s.name,
        isBot: s.isBot,
        // The catchphrase and the one move it belongs to travel with the seat,
        // so the log line can carry it where the line is built.
        line: regular ? regular.line : null,
        cue: bot.cueFor(regular),
      };
    }), { startIndex });
    // Recorded after the round is built, so a table that failed to start does
    // not burn a turn of the deal.
    this.lastStarterId = seats[startIndex].id;
    this.roundsDealt += 1;
    this.phase = 'playing';
    this.syncConnectionFlags();
    this.scheduleTimers(true);
    return { ok: true };
  }

  finishRoundIfOver() {
    if (this.phase === 'playing' && this.game && this.game.status === 'roundOver') {
      this.phase = 'roundOver';
      const winner = this.findSeat(this.game.winnerId);
      if (winner) winner.wins += 1;
    }
  }

  /**
   * How long this seat gets, and how much of it is the warning.
   *
   * The 45 seconds buys benefit of the doubt: they might be reading the table
   * or choosing a topping. Once a turn has actually run out, that doubt has
   * been answered, and charging the table the full 45 again on every lap is a
   * tax on the people who are still here — four players, one of them gone, ten
   * laps, and the round spends seven and a half minutes waiting for a chair.
   *
   * So it is two stages and no more. Full price once; after that the short
   * clock, until the moment they touch anything, which makes them an ordinary
   * player again with the full 45 back. There is no third rung, no kick and no
   * conversion to a bot: this decides how long a turn waits, and nothing else.
   *
   * The warning scales with the clock in play. A fixed ten seconds against a
   * twelve second turn is not a warning, it is the whole turn painted red.
   */
  idleClockFor(seat) {
    const ms = seat && seat.idleStrikes > 0 ? TIMINGS.idleStruck : TIMINGS.idleTurn;
    return { ms, warn: Math.min(TIMINGS.idleWarn, Math.round(ms / 2)) };
  }

  /** Puts the connected-idle clock on the seat, or takes it off entirely. */
  armIdleClock(seat) {
    if (!seat || seat.isBot || !seat.connected) {
      this.idleDueAt = 0;
      this.idleWarnMs = 0;
      return;
    }
    const clock = this.idleClockFor(seat);
    this.idleDueAt = Date.now() + clock.ms;
    this.idleWarnMs = clock.warn;
  }

  /** Resets the bot delay and both turn timers after any change of turn. */
  scheduleTimers(force = false) {
    if (this.phase !== 'playing' || !this.game || this.game.status !== 'playing') {
      this.botDueAt = 0;
      this.awayDueAt = 0;
      this.idleDueAt = 0;
      return;
    }
    const serial = this.game.turnSerial;
    if (!force && serial === this.awayTurnSerial) return;
    this.awayTurnSerial = serial;

    const current = game.currentPlayer(this.game);
    const seat = this.findSeat(current.id);
    this.botDueAt = seat && seat.isBot ? Date.now() + botPauseFor(seat) : 0;
    this.awayDueAt = seat && !seat.isBot && !seat.connected ? Date.now() + TIMINGS.awayTurn : 0;
    this.armIdleClock(seat);
  }

  /**
   * Gives the player on turn their full clock back.
   *
   * The away timer only ever covered players whose socket had gone; somebody
   * sitting there connected and not moving held the table open for ever. This
   * is the other half: a connected human gets 45 seconds, and any action at
   * the table — theirs or anybody's — winds it up again, because a table where
   * something just happened is not a table that is stuck.
   *
   * Separate from `scheduleTimers` on purpose: a shout or a call-out does not
   * change the turn serial, so `scheduleTimers` correctly declines to re-arm,
   * and this still has to.
   */
  touchIdleTimer(actorId = null) {
    // Whoever just did something is demonstrably at the table, so their record
    // of missed turns is wiped — not decremented. One move is the whole proof.
    // This runs before the early return: acting on the last card of a round
    // still clears the strikes it earned.
    if (actorId) {
      const actor = this.findSeat(actorId);
      if (actor) actor.idleStrikes = 0;
    }
    if (this.phase !== 'playing' || !this.game || this.game.status !== 'playing') {
      this.idleDueAt = 0;
      this.idleWarnMs = 0;
      return;
    }
    const current = game.currentPlayer(this.game);
    this.armIdleClock(current ? this.findSeat(current.id) : null);
  }

  // -- per player view -----------------------------------------------------

  snapshotFor(seatId) {
    const seat = this.findSeat(seatId);
    return {
      type: 'state',
      phase: this.phase,
      roomCode: this.code,
      youId: seatId,
      youName: seat ? seat.name : null,
      hostId: this.hostId,
      isHost: this.hostId === seatId,
      minPlayers: game.MIN_PLAYERS,
      maxPlayers: game.MAX_PLAYERS,
      // Additive, and both may be null. How long the player on turn still has
      // before the table moves on without them, as a remaining duration rather
      // than a wall-clock stamp: the two ends never agree on what time it is,
      // and a client that reads a duration can tick it down on its own between
      // snapshots. Null whenever nobody is on a connected-idle clock.
      turnIdleMsLeft: this.idleDueAt ? Math.max(0, this.idleDueAt - Date.now()) : null,
      // The warning that belongs to the clock actually running, not the house
      // default: a struck seat is on a short turn and gets a short warning.
      turnIdleWarnMs: this.idleDueAt ? this.idleWarnMs : null,
      seats: this.seats.map((s) => ({
        id: s.id,
        name: s.name,
        isBot: s.isBot,
        connected: s.connected,
        wins: s.wins,
        // Additive. True for a seat the table has already moved on without,
        // and which has not touched anything since, so the room can show why
        // the turns are going past so quickly.
        idleSkipped: s.idleStrikes > 0,
      })),
      game: this.game ? game.viewFor(this.game, seatId) : null,
    };
  }

  broadcast() {
    this.syncConnectionFlags();
    for (const seat of this.seats) {
      if (!seat.socket || seat.socket.readyState !== 1) continue;
      // One broken socket must not stop the other players from getting the state.
      try {
        seat.socket.send(JSON.stringify(this.snapshotFor(seat.id)));
      } catch (err) {
        console.error('[za] broadcast failed:', err && err.message);
      }
    }
  }
}

// ---------------------------------------------------------------------------

class RoomManager {
  constructor() {
    this.rooms = new Map();
    this.timer = setInterval(() => this.tick(), TICK_MS);
    if (this.timer.unref) this.timer.unref();
  }

  stop() {
    clearInterval(this.timer);
  }

  generateCode() {
    for (let attempt = 0; attempt < 200; attempt++) {
      const word = CODE_WORDS[Math.floor(Math.random() * CODE_WORDS.length)];
      const digits = String(Math.floor(1000 + Math.random() * 9000));
      const code = `${word}-${digits}`;
      if (!this.rooms.has(code)) return code;
    }
    return `PIZZA-${Date.now().toString().slice(-4)}`;
  }

  getRoom(code) {
    return this.rooms.get(String(code || '').trim().toUpperCase()) || null;
  }

  createRoom(name, socket) {
    const cleaned = cleanName(name);
    if (!cleaned) return { ok: false, error: 'Enter your name first.' };
    if (this.rooms.size >= MAX_ROOMS) {
      return { ok: false, error: 'The pizzeria is full. Try again in a minute.' };
    }
    const room = new Room(this.generateCode());
    this.rooms.set(room.code, room);
    const seat = room.addSeat({ name: cleaned, socket });
    room.emptySince = 0;
    return { ok: true, room, seat };
  }

  joinRoom(code, name, socket, token) {
    const cleaned = cleanName(name);
    if (!cleaned) return { ok: false, error: 'Enter your name first.' };
    const room = this.getRoom(code);
    if (!room) return { ok: false, error: 'No table has that code.' };

    const existing = room.findSeatByName(cleaned);
    if (existing) {
      if (existing.isBot) return { ok: false, error: 'A chef bot already uses that name.' };
      if (existing.connected) return { ok: false, error: 'That name is already at the table.' };
      // The seat is empty but it belongs to somebody. Only the client that got
      // the token when the seat was taken may sit down again, so nobody can
      // walk into another player's place and read their hand.
      if (existing.token && existing.token !== String(token == null ? '' : token)) {
        return { ok: false, error: 'That chef is already seated. Pick another name.' };
      }
      // Reconnect into the same seat.
      existing.socket = socket;
      existing.connected = true;
      existing.disconnectedAt = null;
      room.emptySince = 0;
      if (!room.hostId) room.hostId = existing.id;
      // If the table has been sitting there hostless because the host dropped
      // while nobody else was connected, the first person back takes the oven.
      // A returning original host finds themselves still connected-and-host, so
      // this is a no-op for them.
      room.electActingHost();
      room.syncConnectionFlags();
      room.scheduleTimers(true);
      return { ok: true, room, seat: existing, reconnected: true };
    }

    if (room.phase !== 'lobby') {
      return { ok: false, error: 'That round already started. Wait for the next one.' };
    }
    if (room.seats.length >= game.MAX_PLAYERS) {
      return { ok: false, error: 'That table is full.' };
    }
    const seat = room.addSeat({ name: cleaned, socket });
    room.emptySince = 0;
    return { ok: true, room, seat };
  }

  /** Called when a socket closes. The seat stays for the grace period. */
  handleDisconnect(room, seat) {
    if (!room || !seat) return;
    seat.socket = null;
    seat.connected = false;
    seat.disconnectedAt = Date.now();

    if (room.phase === 'lobby') {
      room.removeSeat(seat.id);
    }
    // The oven does not go with them. Whoever is still at the table takes it.
    room.electActingHost();
    if (room.connectedHumanSeats().length === 0) {
      room.emptySince = Date.now();
    }
    room.scheduleTimers(true);
    room.broadcast();
    this.cleanupIfEmpty(room);
  }

  cleanupIfEmpty(room) {
    const noHumans = room.humanSeats().length === 0;
    // Codes come back into use, so only delete this very room.
    if (noHumans && this.rooms.get(room.code) === room) {
      this.rooms.delete(room.code);
      return true;
    }
    return noHumans;
  }

  // -- moves ---------------------------------------------------------------

  /**
   * Applies a game action. Returns `{ ok, error }`. Every action is checked
   * against the authoritative state, so a bad client cannot cheat.
   */
  applyAction(room, seatId, message) {
    if (!room.game) return { ok: false, error: 'The round has not started.' };
    const state = room.game;
    let result;

    switch (message.type) {
      case 'play':
        result = game.playCard(state, seatId, message.cardId, message.topping);
        break;
      case 'draw':
        result = game.drawCard(state, seatId);
        break;
      case 'pass':
        result = game.passTurn(state, seatId);
        break;
      case 'za':
        result = game.declareZa(state, seatId);
        break;
      case 'callout':
        result = game.callOut(state, seatId, message.targetId);
        break;
      default:
        return { ok: false, error: 'Unknown action.' };
    }

    if (result.ok) {
      room.finishRoundIfOver();
      room.scheduleTimers();
      // Something happened, so the player on turn is not the one holding it up
      // — and whoever did it is no longer a seat anybody is waiting on.
      room.touchIdleTimer(seatId);
    }
    return result;
  }

  // -- timers --------------------------------------------------------------

  tick() {
    const now = Date.now();
    for (const room of [...this.rooms.values()]) {
      // One bad table must never stop the timers of every other table.
      try {
        this.tickRoom(room, now);
      } catch (err) {
        console.error('[za] room tick failed:', err);
      }
    }
  }

  /** One timer pass over a single room. */
  tickRoom(room, now) {
    let changed = false;

    // Free seats of players who did not come back in time.
    for (const seat of [...room.seats]) {
      if (seat.isBot || seat.connected || !seat.disconnectedAt) continue;
      if (now - seat.disconnectedAt > TIMINGS.reconnectGrace) {
        room.removeSeat(seat.id);
        if (room.game) room.finishRoundIfOver();
        changed = true;
      }
    }

    // Remove rooms nobody uses.
    if (room.humanSeats().length === 0) {
      this.cleanupIfEmpty(room);
      return;
    }
    // The TTL is a floor, not a deadline. A room with nobody connected in it
    // still lives until the last seat it owes a place to has run out of grace,
    // or a solo player would come back inside their two minutes to no table.
    if (room.emptySince && now - room.emptySince > TIMINGS.emptyRoomTtl && now >= room.graceEndsAt()) {
      if (this.rooms.get(room.code) === room) this.rooms.delete(room.code);
      return;
    }

    if (room.phase === 'playing' && room.game && room.game.status === 'playing') {
      room.scheduleTimers();

      // A bot takes its turn.
      if (room.botDueAt && now >= room.botDueAt) {
        room.botDueAt = 0;
        const serialBefore = room.game.turnSerial;
        const current = game.currentPlayer(room.game);
        const move = bot.decide(room.game, current.id, room.regularOf(current.id));
        if (move) {
          this.applyAction(room, current.id, { type: move.action, ...move });
        } else {
          game.forceSkip(room.game, current.id, `${current.name} passes.`);
        }
        room.finishRoundIfOver();
        // A shout or a call-out does not end the turn, so the timer must be
        // wound up again or the bot would sit there for ever.
        room.scheduleTimers(true);
        if (room.botDueAt && room.game.turnSerial === serialBefore) {
          room.botDueAt = now + BOT_QUICK_MS;
        }
        changed = true;
      }

      // The current player is away, so the table moves on.
      if (
        room.phase === 'playing' &&
        room.game.status === 'playing' &&
        room.awayDueAt &&
        now >= room.awayDueAt
      ) {
        room.awayDueAt = 0;
        const current = game.currentPlayer(room.game);
        game.forceSkip(room.game, current.id, `${current.name} is away. Turn skipped.`);
        room.scheduleTimers(true);
        room.finishRoundIfOver();
        changed = true;
      }

      // The current player is here and has stopped. Same move as the away
      // path — `forceSkip` draws them a card and passes the turn on — because
      // it is the same problem seen from the other side, and a table that
      // waits for ever on somebody who has walked off is not a game.
      if (
        room.phase === 'playing' &&
        room.game.status === 'playing' &&
        room.idleDueAt &&
        now >= room.idleDueAt
      ) {
        room.idleDueAt = 0;
        const current = game.currentPlayer(room.game);
        // The doubt this seat was given has now been answered once. From here
        // their turns are on the short clock until they act.
        const struck = room.findSeat(current.id);
        if (struck) struck.idleStrikes += 1;
        game.forceSkip(room.game, current.id, `${current.name} took too long. Turn skipped.`);
        room.scheduleTimers(true);
        room.finishRoundIfOver();
        changed = true;
      }
    }

    // Bots also watch for a missed ZA while it is not their turn. Each
    // bot makes up its mind once per call-out window. A decision on every
    // tick would add up to a certainty, and no player would ever get away.
    if (room.phase === 'playing' && room.game && room.game.status === 'playing') {
      const window = room.game.players
        .filter((p) => !p.left && p.vulnerable && p.hand.length === 1)
        .map((p) => p.id)
        .join(',');
      for (const seat of room.seats) {
        if (!seat.isBot) continue;
        if (!window) {
          seat.calloutWindow = null;
          continue;
        }
        if (seat.calloutWindow === window) continue;
        seat.calloutWindow = window;
        const move = bot.decide(room.game, seat.id, room.regularOf(seat.id));
        if (move && move.action === 'callout') {
          const res = game.callOut(room.game, seat.id, move.targetId);
          if (res.ok) changed = true;
        }
      }
    }

    if (changed) room.broadcast();
  }
}

module.exports = { RoomManager, Room, cleanName, TIMINGS };
