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
const BOT_THINK_MS = 800; // pause before a bot takes its turn
const BOT_QUICK_MS = 300; // follow-up pause for a shout or a call-out
const AWAY_TURN_TIMEOUT_MS = 12000; // skip the turn of a player who is away
const RECONNECT_GRACE_MS = 120000; // time to come back before the seat is freed
const EMPTY_ROOM_TTL_MS = 60000; // delete a room with no connected humans
const MAX_NAME_LENGTH = 16;
const MAX_ROOMS = 2000; // stops one client from filling the memory with lobbies

let seatCounter = 0;

function nextSeatId() {
  seatCounter += 1;
  return `p${seatCounter}-${Math.random().toString(36).slice(2, 7)}`;
}

function cleanName(raw) {
  const name = String(raw || '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LENGTH);
  return name;
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
    this.awayTurnSerial = -1;
    this.emptySince = Date.now();
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

  addSeat({ name, isBot = false, socket = null }) {
    const seat = {
      id: nextSeatId(),
      name,
      isBot,
      // Proves that a later socket is the same player. It goes to that one
      // client and to nobody else. A bot has no client, so it needs none.
      token: isBot ? null : crypto.randomBytes(16).toString('hex'),
      socket,
      connected: isBot ? true : Boolean(socket),
      disconnectedAt: null,
      wins: 0,
      calloutWindow: null, // bots decide once per call-out window
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

  /** Copies the connection flags into the game state so clients can show them. */
  syncConnectionFlags() {
    if (!this.game) return;
    for (const player of this.game.players) {
      const seat = this.findSeat(player.id);
      player.connected = seat ? seat.connected : false;
    }
  }

  // -- lifecycle -----------------------------------------------------------

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
    this.game = game.createGame(seats.map((s) => ({ id: s.id, name: s.name, isBot: s.isBot })));
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

  /** Resets the bot delay and the away timer after any change of turn. */
  scheduleTimers(force = false) {
    if (this.phase !== 'playing' || !this.game || this.game.status !== 'playing') {
      this.botDueAt = 0;
      this.awayDueAt = 0;
      return;
    }
    const serial = this.game.turnSerial;
    if (!force && serial === this.awayTurnSerial) return;
    this.awayTurnSerial = serial;

    const current = game.currentPlayer(this.game);
    const seat = this.findSeat(current.id);
    this.botDueAt = seat && seat.isBot ? Date.now() + BOT_THINK_MS : 0;
    this.awayDueAt = seat && !seat.isBot && !seat.connected ? Date.now() + AWAY_TURN_TIMEOUT_MS : 0;
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
      seats: this.seats.map((s) => ({
        id: s.id,
        name: s.name,
        isBot: s.isBot,
        connected: s.connected,
        wins: s.wins,
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
      if (now - seat.disconnectedAt > RECONNECT_GRACE_MS) {
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
    if (room.emptySince && now - room.emptySince > EMPTY_ROOM_TTL_MS) {
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
        const move = bot.decide(room.game, current.id);
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
        const move = bot.decide(room.game, seat.id);
        if (move && move.action === 'callout') {
          const res = game.callOut(room.game, seat.id, move.targetId);
          if (res.ok) changed = true;
        }
      }
    }

    if (changed) room.broadcast();
  }
}

module.exports = { RoomManager, Room, cleanName };
