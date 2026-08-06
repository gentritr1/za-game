'use strict';

/**
 * Za server. Serves the client from /public and runs the authoritative
 * game over a WebSocket connection.
 */

const http = require('http');
const path = require('path');
const { WebSocketServer } = require('ws');

const game = require('./game');
const bot = require('./bot');
const { RoomManager } = require('./rooms');
const { createStaticHandler } = require('./static');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const manager = new RoomManager();
const staticHandler = createStaticHandler(PUBLIC_DIR);

const server = http.createServer((req, res) => {
  // No request may ever take the whole pizzeria down.
  try {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, rooms: manager.rooms.size }));
      return;
    }
    staticHandler(req, res);
  } catch (err) {
    console.error('[za] request failed:', err);
    if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Server error');
  }
});

// A game message is a few hundred bytes. Anything larger is not a player.
const wss = new WebSocketServer({ server, maxPayload: 16 * 1024 });

function send(socket, payload) {
  if (socket.readyState === 1) socket.send(JSON.stringify(payload));
}

function sendError(socket, message) {
  send(socket, { type: 'error', message });
}

wss.on('connection', (socket) => {
  /** @type {{ room: import('./rooms').Room | null, seatId: string | null }} */
  const session = { room: null, seatId: null };

  socket.isAlive = true;
  socket.on('pong', () => { socket.isAlive = true; });

  socket.on('message', (raw) => {
    let message;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      sendError(socket, 'Malformed message.');
      return;
    }
    if (!message || typeof message.type !== 'string') {
      sendError(socket, 'Malformed message.');
      return;
    }

    try {
      handleMessage(socket, session, message);
    } catch (err) {
      console.error('[za] action failed:', err);
      sendError(socket, 'The kitchen had a problem with that move.');
    }
  });

  socket.on('close', () => {
    if (!session.room || !session.seatId) return;
    const room = session.room;
    const seat = room.findSeat(session.seatId);
    session.room = null;
    session.seatId = null;
    try {
      manager.handleDisconnect(room, seat);
    } catch (err) {
      console.error('[za] disconnect failed:', err);
    }
  });

  socket.on('error', () => { /* the close handler does the cleanup */ });
});

function handleMessage(socket, session, message) {
  // ---- joining ----------------------------------------------------------
  if (message.type === 'createRoom' || message.type === 'joinRoom') {
    if (session.room) {
      const seat = session.room.findSeat(session.seatId);
      manager.handleDisconnect(session.room, seat);
      session.room = null;
      session.seatId = null;
    }
    const result = message.type === 'createRoom'
      ? manager.createRoom(message.name, socket)
      : manager.joinRoom(message.code, message.name, socket, message.token);

    if (!result.ok) {
      sendError(socket, result.error);
      return;
    }
    session.room = result.room;
    session.seatId = result.seat.id;
    send(socket, {
      type: 'joined',
      roomCode: result.room.code,
      youId: result.seat.id,
      youName: result.seat.name,
      // The key to this seat. It goes to this one client only.
      token: result.seat.token,
      reconnected: Boolean(result.reconnected),
    });
    result.room.broadcast();
    return;
  }

  const room = session.room;
  const seatId = session.seatId;
  if (!room || !seatId) {
    sendError(socket, 'Join a table first.');
    return;
  }
  const seat = room.findSeat(seatId);
  if (!seat) {
    sendError(socket, 'Your seat is gone. Please join again.');
    return;
  }

  switch (message.type) {
    // ---- lobby ---------------------------------------------------------
    case 'addBot': {
      if (room.hostId !== seatId) return sendError(socket, 'Only the host can add a chef bot.');
      if (room.phase !== 'lobby') return sendError(socket, 'You can only add bots in the lobby.');
      if (room.seats.length >= game.MAX_PLAYERS) return sendError(socket, 'The table is full.');
      const name = bot.pickBotName(room.seats.map((s) => s.name));
      room.addSeat({ name, isBot: true });
      break;
    }
    case 'removeSeat': {
      if (room.hostId !== seatId) return sendError(socket, 'Only the host can remove a player.');
      if (room.phase !== 'lobby') return sendError(socket, 'You can only remove players in the lobby.');
      const target = room.findSeat(message.seatId);
      if (!target) return sendError(socket, 'That seat is empty.');
      if (!target.isBot) return sendError(socket, 'You can only remove chef bots.');
      room.removeSeat(target.id);
      break;
    }
    case 'startGame':
    case 'newRound': {
      if (room.hostId !== seatId) return sendError(socket, 'Only the host can start the round.');
      if (room.phase === 'playing') return sendError(socket, 'The round is already running.');
      const started = room.startRound();
      if (!started.ok) return sendError(socket, started.error);
      break;
    }
    case 'backToLobby': {
      if (room.hostId !== seatId) return sendError(socket, 'Only the host can do that.');
      room.phase = 'lobby';
      room.game = null;
      break;
    }
    case 'leaveRoom': {
      room.removeSeat(seatId);
      session.room = null;
      session.seatId = null;
      send(socket, { type: 'left' });
      room.broadcast();
      manager.cleanupIfEmpty(room);
      return;
    }

    // ---- game moves ----------------------------------------------------
    case 'play':
    case 'draw':
    case 'pass':
    case 'za':
    case 'callout': {
      if (room.phase !== 'playing') return sendError(socket, 'The round is not running.');
      const result = manager.applyAction(room, seatId, message);
      if (!result.ok) {
        sendError(socket, result.error);
        // Resend the state so the client display matches the server again.
        send(socket, room.snapshotFor(seatId));
        return;
      }
      break;
    }

    case 'sync':
      send(socket, room.snapshotFor(seatId));
      return;

    default:
      sendError(socket, `Unknown message: ${message.type}`);
      return;
  }

  room.broadcast();
}

// Drop sockets that stopped answering.
const heartbeat = setInterval(() => {
  for (const socket of wss.clients) {
    if (socket.isAlive === false) {
      socket.terminate();
      continue;
    }
    socket.isAlive = false;
    socket.ping();
  }
}, 30000);
if (heartbeat.unref) heartbeat.unref();

server.listen(PORT, () => {
  console.log(`\n  Za! is open for business.`);
  console.log(`  Open http://localhost:${PORT} in your browser.\n`);
});

function shutdown() {
  console.log('\n  Closing the pizzeria...');
  clearInterval(heartbeat);
  manager.stop();
  for (const socket of wss.clients) socket.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

module.exports = { server, manager };
