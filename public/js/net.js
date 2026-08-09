/**
 * WebSocket connection with automatic reconnect.
 *
 * The client keeps the name, the table code and the seat token, so a short
 * network drop puts the player back in the same seat without any action from
 * them. The token is what proves the seat is theirs. It stays in this tab only:
 * `sessionStorage` keeps it over a page reload and drops it when the tab closes.
 *
 * A reload is just a drop that lost its variables, so it takes the same road:
 * the app reads the stored seat and hands it to `restore()` before `connect()`,
 * and from the socket's point of view nothing is different from a reconnect —
 * `joining`, then the first `state`, or the refusal that sends the player home.
 *
 * ## The four states
 *
 * An open socket is not a seat. Between the two there is a rejoin in flight,
 * and for as long as it is in flight this client's picture of the table is a
 * memory, not a fact. So the connection publishes an explicit state and the
 * screen holds until it says `synchronized`:
 *
 *   disconnected — no socket at all (first load, or waiting to retry)
 *   connecting   — a socket is opening
 *   joining      — the socket is open and a `joinRoom` is in flight
 *   synchronized — a fresh `joined` AND the first `state` after it have landed
 *
 * With no seat to reclaim (the home screen) an open socket goes straight to
 * `synchronized`: there is no table to be out of step with.
 *
 * ## Nothing is queued
 *
 * Every message that means something only against a particular round —
 * a card, a draw, a pass, a shout, a call-out, and every host control — is
 * DROPPED while the state is not `synchronized`, and `send` returns false so
 * the caller can say so. Replaying them was the bug: a card chosen in a round
 * that has since ended would fire into whatever round the table is in now.
 * Nothing here is idempotent enough to be worth keeping, so there is no queue.
 */

const RETRY_STEPS = [500, 1000, 2000, 3000, 5000];
const SEAT_KEY = 'za.seat.';

/**
 * Messages whose meaning depends on the state of a round or a lobby. These are
 * the actual wire names the server switches on in `server/index.js` — not the
 * client's function names. `createRoom`, `joinRoom` and `sync` are deliberately
 * absent: they are how a client GETS synchronized, so gating them would
 * deadlock the reconnect.
 */
const STATE_DEPENDENT = new Set([
  'play', 'draw', 'pass', 'za', 'callout',
  'startGame', 'newRound', 'backToLobby',
  'addBot', 'removeSeat', 'leaveRoom',
]);

function seatStore(code) {
  return SEAT_KEY + String(code || '').toUpperCase();
}

/** Storage is not always there (private windows), so every call is guarded. */
function readSeat(code) {
  try {
    return JSON.parse(sessionStorage.getItem(seatStore(code)) || 'null');
  } catch {
    return null;
  }
}

function writeSeat(code, value) {
  try {
    if (value) sessionStorage.setItem(seatStore(code), JSON.stringify(value));
    else sessionStorage.removeItem(seatStore(code));
  } catch {
    /* nothing to keep it in */
  }
}

/**
 * Every seat this tab still holds a token for, newest first.
 *
 * A tab that has hopped between tables keeps a credential per table, so
 * "the room I was in" is the most recently written one and not merely the
 * first key storage happens to hand back. Records written before seats
 * carried an `at` sort oldest, which is exactly what they are.
 */
function allSeats() {
  const seats = [];
  try {
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (!key || !key.startsWith(SEAT_KEY)) continue;
      let value = null;
      try {
        value = JSON.parse(sessionStorage.getItem(key) || 'null');
      } catch {
        continue;
      }
      if (!value || !value.token || !value.name) continue;
      seats.push({
        code: key.slice(SEAT_KEY.length),
        name: value.name,
        token: value.token,
        at: Number(value.at) || 0,
      });
    }
  } catch {
    return [];
  }
  return seats.sort((a, b) => b.at - a.at);
}

export class Connection {
  constructor({ onMessage, onStatus }) {
    this.onMessage = onMessage;
    this.onStatus = onStatus || (() => {});
    this.socket = null;
    this.retry = 0;
    this.credentials = null; // { name, code, token }
    this.closedByUser = false;
    this.state = 'disconnected';
    // True between a `joined` and the first `state` that follows it. Only that
    // pair — in that order — closes the gate.
    this.awaitingFirstState = false;
  }

  /** Publishes a state change once, so the screen never repaints on a no-op. */
  setState(next) {
    if (this.state === next) return;
    this.state = next;
    this.onStatus(next);
  }

  get synchronized() {
    return this.state === 'synchronized' && !this.awaitingFirstState;
  }

  get url() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${location.host}`;
  }

  connect() {
    this.closedByUser = false;
    this.awaitingFirstState = false;
    this.setState('connecting');

    const socket = new WebSocket(this.url);
    this.socket = socket;

    socket.addEventListener('open', () => {
      this.retry = 0;
      // Take the seat again after a drop. The board stays inert until the
      // server has answered, so the state moves to `joining` and not further.
      if (this.credentials) {
        this.awaitingFirstState = false;
        this.setState('joining');
        socket.send(JSON.stringify({
          type: 'joinRoom',
          name: this.credentials.name,
          code: this.credentials.code,
          token: this.credentials.token,
        }));
        return;
      }
      // No seat to reclaim: there is nothing to be out of step with.
      this.setState('synchronized');
    });

    socket.addEventListener('message', (event) => {
      let message;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }
      const context = this.observe(message);
      try {
        this.onMessage(message, context);
      } finally {
        // Let the app clear the stale table while it is still frozen, then drop
        // the credentials that the server just refused. `forget()` also returns
        // an otherwise healthy open socket to the synchronized home state.
        if (context && context.rejoinRefused) this.forget();
      }
    });

    socket.addEventListener('close', () => {
      this.socket = null;
      this.awaitingFirstState = false;
      if (this.closedByUser) {
        this.setState('disconnected');
        this.onStatus('closed');
        return;
      }
      const wait = RETRY_STEPS[Math.min(this.retry, RETRY_STEPS.length - 1)];
      this.retry += 1;
      this.setState('disconnected');
      setTimeout(() => this.connect(), wait);
    });

    socket.addEventListener('error', () => { /* close follows */ });
  }

  /**
   * Reads the traffic the state machine cares about, before the app sees it.
   *
   * `joined` alone is not enough: it carries the seat, not the table. Only the
   * `state` that follows it proves this client is looking at the round the
   * server is actually running.
   */
  observe(message) {
    if (message.type === 'joined') {
      // Only the flag, never the state. A reconnect is already in `joining`
      // (the open handler put it there), and a first join from the home screen
      // is `synchronized` with no table behind it — moving that one to
      // `joining` would raise the banner and freeze the screen for the gap
      // between `joined` and the `state` that follows it in the same tick.
      this.awaitingFirstState = true;
      return;
    }
    if (message.type === 'state' && this.awaitingFirstState) {
      this.awaitingFirstState = false;
      this.setState('synchronized');
      return;
    }
    if (message.type === 'left') {
      // Out of the room and back on the home screen: nothing left to sync.
      this.awaitingFirstState = false;
      this.setState('synchronized');
      return;
    }
    if (message.type === 'error' && this.state === 'joining' && this.awaitingFirstState === false) {
      // A rejoin the server refused. Keep the remembered board frozen until
      // the app has cleared it; the message handler forgets this lost seat
      // immediately after the app handles this explicit context.
      return { rejoinRefused: true };
    }
    return undefined;
  }

  /** Remembers how to get back into the room after a reconnect. */
  remember(name, code, token) {
    this.credentials = { name, code, token };
    writeSeat(code, { name, token, at: Date.now() });
  }

  /**
   * Arms the seat a fresh page load should reclaim, BEFORE `connect()`.
   *
   * A reload is a reconnect that lost its variables. `remember()` is how a
   * live join records a seat; this is how the next load picks that record back
   * up, and it deliberately leaves the stored `at` alone so restoring twice
   * does not make a stale table look like the newest one. From here the
   * ordinary machine does the rest: the `open` handler sends the `joinRoom`,
   * the board stays frozen at `joining`, and a refusal takes the existing
   * `rejoinRefused` path home.
   */
  restore(seat) {
    if (!seat || !seat.code || !seat.token || !seat.name) return false;
    this.credentials = { name: seat.name, code: seat.code, token: seat.token };
    return true;
  }

  /** The seat this tab most recently sat in, if the token is still here. */
  lastSeat() {
    return allSeats()[0] || null;
  }

  /** The seat this tab holds for one particular table, if any. */
  seatFor(code) {
    const seat = readSeat(code);
    if (!seat || !seat.token || !seat.name) return null;
    return { code: String(code).toUpperCase(), name: seat.name, token: seat.token };
  }

  forget() {
    if (this.credentials) writeSeat(this.credentials.code, null);
    this.credentials = null;
    // Without credentials an open socket has nothing to reclaim.
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.awaitingFirstState = false;
      this.setState('synchronized');
    }
  }

  /** The token for a table this tab already sat at, if there is one. */
  storedToken(code) {
    const seat = readSeat(code);
    return seat && seat.token ? seat.token : undefined;
  }

  /**
   * Sends a message, or drops it. Returns true only if it actually went out,
   * so the caller can tell the player rather than leaving them clicking into
   * a void. Nothing is ever held back for later — see the note at the top.
   */
  send(payload) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return false;
    const type = payload && payload.type;
    if (STATE_DEPENDENT.has(type) && !this.synchronized) return false;
    this.socket.send(JSON.stringify(payload));
    return true;
  }
}
