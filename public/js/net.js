/**
 * WebSocket connection with automatic reconnect.
 *
 * The client keeps the name, the table code and the seat token, so a short
 * network drop puts the player back in the same seat without any action from
 * them. The token is what proves the seat is theirs. It stays in this tab only:
 * `sessionStorage` keeps it over a page reload and drops it when the tab closes.
 */

const RETRY_STEPS = [500, 1000, 2000, 3000, 5000];
const SEAT_KEY = 'pizzuno.seat.';

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

export class Connection {
  constructor({ onMessage, onStatus }) {
    this.onMessage = onMessage;
    this.onStatus = onStatus || (() => {});
    this.socket = null;
    this.retry = 0;
    this.credentials = null; // { name, code, token }
    this.closedByUser = false;
    this.queue = [];
  }

  get url() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${location.host}`;
  }

  connect() {
    this.closedByUser = false;
    this.onStatus(this.retry === 0 ? 'connecting' : 'reconnecting');

    const socket = new WebSocket(this.url);
    this.socket = socket;

    socket.addEventListener('open', () => {
      this.retry = 0;
      this.onStatus('open');
      // Take the seat again after a drop.
      if (this.credentials) {
        socket.send(JSON.stringify({
          type: 'joinRoom',
          name: this.credentials.name,
          code: this.credentials.code,
          token: this.credentials.token,
        }));
      }
      for (const payload of this.queue.splice(0)) socket.send(JSON.stringify(payload));
    });

    socket.addEventListener('message', (event) => {
      let message;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }
      this.onMessage(message);
    });

    socket.addEventListener('close', () => {
      this.socket = null;
      if (this.closedByUser) {
        this.onStatus('closed');
        return;
      }
      const wait = RETRY_STEPS[Math.min(this.retry, RETRY_STEPS.length - 1)];
      this.retry += 1;
      this.onStatus('reconnecting');
      setTimeout(() => this.connect(), wait);
    });

    socket.addEventListener('error', () => { /* close follows */ });
  }

  /** Remembers how to get back into the room after a reconnect. */
  remember(name, code, token) {
    this.credentials = { name, code, token };
    writeSeat(code, { name, token });
  }

  forget() {
    if (this.credentials) writeSeat(this.credentials.code, null);
    this.credentials = null;
  }

  /** The token for a table this tab already sat at, if there is one. */
  storedToken(code) {
    const seat = readSeat(code);
    return seat && seat.token ? seat.token : undefined;
  }

  send(payload) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(payload));
    } else {
      this.queue.push(payload);
    }
  }
}
