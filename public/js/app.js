/**
 * Za client.
 *
 * The server owns the game. This file only draws the state it receives and
 * sends the player's intent back. It never decides if a move is legal.
 */

import { Connection } from './net.js';
import { renderCard, isWild, TOPPING_META, TOPPING_ORDER } from './cards.js';

// ---------------------------------------------------------------- elements --
const $ = (id) => document.getElementById(id);

const el = {
  app: $('app'),
  screens: Array.from(document.querySelectorAll('.screen')),
  // home
  formCreate: $('form-create'),
  formJoin: $('form-join'),
  inputName: $('input-name'),
  inputCode: $('input-code'),
  // lobby
  lobbyCode: $('lobby-code'),
  btnCopyCode: $('btn-copy-code'),
  seatList: $('seat-list'),
  lobbyEmpty: $('lobby-empty'),
  lobbyNote: $('lobby-note'),
  btnAddBot: $('btn-add-bot'),
  btnStart: $('btn-start'),
  btnLeaveLobby: $('btn-leave-lobby'),
  // hud
  hudCode: $('hud-code'),
  hudCodeText: $('hud-code-text'),
  turnBanner: $('turn-banner'),
  turnText: $('turn-text'),
  dirIndicator: $('dir-indicator'),
  dirText: $('dir-text'),
  btnLeaveGame: $('btn-leave-game'),
  // table
  opponents: $('opponents'),
  drawPile: $('draw-pile'),
  drawSlot: $('draw-slot'),
  drawCount: $('draw-count'),
  discardSlot: $('discard-slot'),
  toppingNow: $('topping-now'),
  logList: $('log-list'),
  // hand
  handZone: document.querySelector('.hand-zone'),
  hand: $('hand'),
  btnZa: $('btn-za'),
  btnCallout: $('btn-callout'),
  btnCalloutText: $('btn-callout-text'),
  btnPass: $('btn-pass'),
  handHint: $('hand-hint'),
  // popovers
  picker: $('picker'),
  pickerTitle: $('picker-title'),
  pickerGrid: $('picker-grid'),
  pickerCancel: $('picker-cancel'),
  calloutPop: $('callout-pop'),
  calloutRows: $('callout-rows'),
  calloutCancel: $('callout-cancel'),
  flyLayer: $('fly-layer'),
  // round over
  overlay: $('overlay-round'),
  dialog: document.querySelector('#overlay-round .dialog'),
  roundEmoji: $('round-emoji'),
  roundTitle: $('round-title'),
  roundSub: $('round-sub'),
  scoreboard: $('scoreboard'),
  btnNextRound: $('btn-next-round'),
  btnToLobby: $('btn-to-lobby'),
  roundWait: $('round-wait'),
  // chrome
  toast: $('toast'),
  connBanner: $('conn-banner'),
  connBannerText: $('conn-banner-text'),
};

// ------------------------------------------------------------------- state --
const ui = {
  snapshot: null,
  screen: 'home',
  handSlots: new Map(), // cardId -> slot element
  seatNodes: new Map(), // playerId -> seat element
  gameId: null,
  lastLogId: -1,
  pendingWild: null, // { cardId, sourceEl }
  toastTimer: 0,
  copyTimers: new WeakMap(),
  dealing: false, // true for the first hand render of a round
  roundFocusReturn: null,
};

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const wantsMotion = () => !reduceMotion.matches;

// ------------------------------------------------------------------ motion --
// Durations and curves live in the stylesheet. They are read once here so the
// JS that has to line up with a CSS transition cannot drift from it.
function cssTime(name, fallback) {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const value = parseFloat(raw);
  if (!Number.isFinite(value)) return fallback;
  return raw.endsWith('ms') ? value : value * 1000;
}

const D_FLY = cssTime('--d-slow', 280); // matches .fly-card
const D_ENTER = cssTime('--d-mid', 220); // matches .card
const EASE_OUT =
  getComputedStyle(document.documentElement).getPropertyValue('--ease-out').trim() ||
  'cubic-bezier(0.23, 1, 0.32, 1)';

/** Stable small hash, so one card always looks the same on the table. */
function hashOf(text) {
  let hash = 7;
  for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) % 99991;
  return hash;
}

// ------------------------------------------------------------- connection --
const net = new Connection({
  onMessage: handleMessage,
  onStatus: handleStatus,
});

function send(payload) {
  net.send(payload);
}

function handleStatus(status) {
  if (status === 'open') {
    hide(el.connBanner);
    return;
  }
  el.connBannerText.textContent =
    status === 'connecting'
      ? 'Knocking on the kitchen door…'
      : 'Lost the kitchen. Getting you back to your seat…';
  show(el.connBanner);
}

function handleMessage(message) {
  switch (message.type) {
    case 'joined':
      net.remember(message.youName, message.roomCode, message.token);
      if (message.reconnected) toast('Welcome back. Your seat is still warm.');
      break;
    case 'state':
      applySnapshot(message);
      break;
    case 'left':
      net.forget();
      ui.snapshot = null;
      resetGameView();
      showScreen('home');
      break;
    case 'error':
      toast(message.message);
      // A failed reconnect means the table is gone. Send the player home.
      if (!ui.snapshot) {
        net.forget();
        showScreen('home');
      }
      break;
    default:
      break;
  }
}

// ---------------------------------------------------------------- helpers --
function show(node) { node.classList.add('is-open'); }
function hide(node) { node.classList.remove('is-open'); }

function openRoundOverlay() {
  if (el.overlay.classList.contains('is-open')) return;
  ui.roundFocusReturn = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  show(el.overlay);
  el.app.inert = true;
  requestAnimationFrame(() => {
    const firstAction = !el.btnNextRound.hidden
      ? el.btnNextRound
      : !el.btnToLobby.hidden
        ? el.btnToLobby
        : el.dialog;
    firstAction.focus({ preventScroll: true });
  });
}

function closeRoundOverlay() {
  const wasOpen = el.overlay.classList.contains('is-open');
  hide(el.overlay);
  el.app.inert = false;
  if (!wasOpen) return;
  const returnTarget = ui.roundFocusReturn;
  ui.roundFocusReturn = null;
  requestAnimationFrame(() => {
    if (returnTarget && returnTarget.isConnected && !returnTarget.closest('[inert]')) {
      returnTarget.focus({ preventScroll: true });
      return;
    }
    const fallback = ui.screen === 'game' ? el.btnLeaveGame : el.btnLeaveLobby;
    if (fallback && !fallback.hidden) fallback.focus({ preventScroll: true });
  });
}

function toast(text) {
  el.toast.textContent = text;
  show(el.toast);
  clearTimeout(ui.toastTimer);
  ui.toastTimer = setTimeout(() => hide(el.toast), 3200);
}

function showScreen(name) {
  if (ui.screen === name) return;
  ui.screen = name;
  for (const screen of el.screens) {
    const active = screen.dataset.screen === name;
    screen.classList.toggle('is-active', active);
    screen.inert = !active;
  }
}

function flashCopied(chip) {
  chip.classList.add('is-copied');
  clearTimeout(ui.copyTimers.get(chip));
  ui.copyTimers.set(chip, setTimeout(() => chip.classList.remove('is-copied'), 1100));
}

async function copyCode(chip) {
  const code = ui.snapshot && ui.snapshot.roomCode;
  if (!code) return;
  try {
    await navigator.clipboard.writeText(code);
    flashCopied(chip);
  } catch {
    toast(`Table code: ${code}`);
  }
}

// ------------------------------------------------------- press feedback ----
// Pressable things answer on pointer-down, not on release.
document.addEventListener('pointerdown', (event) => {
  const target = event.target.closest(
    '.btn, .card.is-playable, .code-chip, .topping-btn, .callout-btn, .pile--draw, .seat-row__kick'
  );
  if (!target || target.disabled) return;
  target.classList.add('is-pressed');
  const release = () => target.classList.remove('is-pressed');
  window.addEventListener('pointerup', release, { once: true });
  window.addEventListener('pointercancel', release, { once: true });
});

// ============================================================== SNAPSHOT ===
function applySnapshot(snapshot) {
  ui.snapshot = snapshot;

  // Every round has its own id, so a new round starts with a clean log.
  const gameId = snapshot.game ? snapshot.game.gameId : null;
  if (gameId !== ui.gameId) {
    ui.gameId = gameId;
    ui.lastLogId = -1;
    // A new round deals a whole fresh hand, so it is staggered in rather than
    // flown card by card off the dough pile.
    ui.dealing = true;
    el.logList.replaceChildren();
  }

  el.lobbyCode.textContent = snapshot.roomCode;
  el.hudCodeText.textContent = snapshot.roomCode;

  if (snapshot.phase === 'lobby') {
    closePopovers();
    closeRoundOverlay();
    renderLobby(snapshot);
    showScreen('lobby');
    resetGameView();
    return;
  }

  renderGame(snapshot);
  showScreen('game');

  if (snapshot.phase === 'roundOver') {
    // Only the first snapshot of the round-over stages the scoreboard. A later
    // one, from somebody arriving or leaving, just updates it in place.
    renderRoundOver(snapshot, !el.overlay.classList.contains('is-open'));
    openRoundOverlay();
    closePopovers();
  } else {
    closeRoundOverlay();
  }
}

function resetGameView() {
  ui.handSlots.clear();
  ui.seatNodes.clear();
  ui.gameId = null;
  ui.lastLogId = -1;
  ui.dealing = true;
  el.flyLayer.replaceChildren();
  el.hand.replaceChildren();
  el.opponents.replaceChildren();
  el.logList.replaceChildren();
  el.discardSlot.replaceChildren();
}

function renderAvatar(node, person) {
  node.replaceChildren();
  if (person.isBot) {
    const image = document.createElement('img');
    image.className = 'avatar__image';
    image.src = 'assets/avatar-chef-bot.png';
    image.alt = '';
    image.width = 256;
    image.height = 256;
    image.decoding = 'async';
    image.draggable = false;
    node.append(image);
    return;
  }
  node.textContent = person.connected === false ? '💤' : '🧑';
}

// ================================================================= LOBBY ===
function renderLobby(snapshot) {
  const rows = new DocumentFragment();
  for (const seat of snapshot.seats) {
    const row = document.createElement('li');
    row.className = 'seat-row';

    const avatar = document.createElement('span');
    avatar.className = 'seat-row__avatar';
    renderAvatar(avatar, seat);
    row.append(avatar);

    const name = document.createElement('span');
    name.className = 'seat-row__name';
    name.textContent = seat.name;
    row.append(name);

    if (seat.id === snapshot.youId) row.append(tag('you', 'You'));
    if (seat.id === snapshot.hostId) row.append(tag('host', 'Host'));
    if (seat.isBot) row.append(tag('bot', 'Bot'));
    if (!seat.connected && !seat.isBot) row.append(tag('away', 'Away'));

    if (snapshot.isHost && seat.isBot) {
      const kick = document.createElement('button');
      kick.className = 'seat-row__kick';
      kick.type = 'button';
      kick.textContent = '×';
      kick.setAttribute('aria-label', `Remove ${seat.name}`);
      kick.addEventListener('click', () => send({ type: 'removeSeat', seatId: seat.id }));
      row.append(kick);
    }
    rows.append(row);
  }
  el.seatList.replaceChildren(rows);

  const count = snapshot.seats.length;
  const enough = count >= snapshot.minPlayers;
  el.lobbyEmpty.hidden = count !== 1;
  el.btnStart.disabled = !snapshot.isHost || !enough;
  el.btnAddBot.disabled = !snapshot.isHost || count >= snapshot.maxPlayers;

  if (!enough) {
    el.lobbyNote.textContent = snapshot.isHost
      ? 'A table of one is just a sad snack. Hire a bot or wait for a friend.'
      : 'One more hungry player and we can start…';
  } else if (snapshot.isHost) {
    el.lobbyNote.textContent = `${count} at the table. The oven is yours.`;
  } else {
    el.lobbyNote.textContent = 'Napkin tucked in. Waiting for the host to bake it…';
  }
}

function tag(kind, text) {
  const node = document.createElement('span');
  node.className = `tag tag--${kind}`;
  node.textContent = text;
  return node;
}

// ================================================================== GAME ===
function renderGame(snapshot) {
  const view = snapshot.game;
  if (!view) return;

  const yourTurn = view.turnPlayerId === snapshot.youId && view.status === 'playing';

  renderTurnBanner(snapshot, view, yourTurn);
  renderDirection(view);
  renderOpponents(snapshot, view);
  renderPiles(view, yourTurn);
  renderHand(snapshot, view, yourTurn);
  renderActionBar(snapshot, view, yourTurn);
  renderLog(view);

  el.handZone.classList.toggle('is-your-turn', yourTurn);
}

function renderTurnBanner(snapshot, view, yourTurn) {
  el.turnBanner.classList.toggle('is-you', yourTurn);
  setTurnText(turnLabel(view, yourTurn));
}

function turnLabel(view, yourTurn) {
  if (view.status !== 'playing') return 'Round over';
  if (yourTurn) return view.mustPlayDrawnCard ? 'Your turn — play it or pass' : 'Your turn, chef';
  const current = view.players.find((p) => p.id === view.turnPlayerId);
  return current ? `${current.name} is eyeing the pile…` : 'Waiting…';
}

/**
 * Swaps the turn label. The new text drops in over 180ms so the change is felt
 * and not only read. A second turn change cancels the first one instead of
 * stacking on top of it.
 */
function setTurnText(text) {
  if (el.turnText.textContent === text) return;
  el.turnText.textContent = text;
  if (!wantsMotion() || typeof el.turnText.animate !== 'function') return;
  for (const running of el.turnText.getAnimations()) running.cancel();
  el.turnText.animate(
    [
      { opacity: 0, transform: 'translateY(-5px)' },
      { opacity: 1, transform: 'none' },
    ],
    { duration: 180, easing: EASE_OUT }
  );
}

function renderDirection(view) {
  el.dirIndicator.classList.toggle('is-reversed', view.direction === -1);
  el.dirText.textContent = view.direction === 1 ? 'to the left' : 'to the right';
}

/** Opponents in play order, starting from the seat after you. */
function orderedOpponents(snapshot, view) {
  const players = view.players.filter((p) => !p.left);
  const mine = players.findIndex((p) => p.id === snapshot.youId);
  if (mine === -1) return players;
  return [...players.slice(mine + 1), ...players.slice(0, mine)];
}

function renderOpponents(snapshot, view) {
  const list = orderedOpponents(snapshot, view);
  const seen = new Set();
  const order = [];

  for (const player of list) {
    seen.add(player.id);
    let node = ui.seatNodes.get(player.id);
    if (!node) {
      node = buildSeat(player);
      ui.seatNodes.set(player.id, node);
    }
    updateSeat(node, player, view);
    order.push(node);
  }

  for (const [id, node] of ui.seatNodes) {
    if (!seen.has(id)) {
      node.remove();
      ui.seatNodes.delete(id);
    }
  }

  // Reorder without rebuilding, so entry animations are not restarted.
  order.forEach((node, index) => {
    if (el.opponents.children[index] !== node) el.opponents.insertBefore(node, el.opponents.children[index] || null);
    // A gentle arc makes the players look seated around the far edge.
    const count = order.length;
    const norm = count === 1 ? 0 : (index - (count - 1) / 2) / ((count - 1) / 2);
    node.style.setProperty('--arc', `${(Math.abs(norm) ** 2 * -10).toFixed(1)}px`);
  });
}

function buildSeat(player) {
  const node = document.createElement('div');
  node.className = 'seat';
  node.dataset.id = player.id;

  const avatar = document.createElement('div');
  avatar.className = 'seat__avatar';
  node.append(avatar);

  const name = document.createElement('span');
  name.className = 'seat__name';
  node.append(name);

  const count = document.createElement('span');
  count.className = 'seat__count';
  node.append(count);

  const mini = document.createElement('div');
  mini.className = 'seat__mini';
  node.append(mini);

  const badge = document.createElement('span');
  badge.className = 'seat__badge';
  node.append(badge);

  node._parts = { avatar, name, count, mini, badge };
  return node;
}

function updateSeat(node, player, view) {
  const parts = node._parts;
  const avatarState = `${player.isBot}:${player.connected}`;
  if (node.dataset.avatarState !== avatarState) {
    node.dataset.avatarState = avatarState;
    renderAvatar(parts.avatar, player);
  }
  parts.name.textContent = player.name;
  parts.count.textContent = `🂠 ${player.cardCount} card${player.cardCount === 1 ? '' : 's'}`;

  node.classList.toggle('is-turn', view.turnPlayerId === player.id && view.status === 'playing');
  node.classList.toggle('is-away', !player.connected);

  // The mini stack only gets rebuilt when the count changes.
  const shown = Math.min(player.cardCount, 6);
  if (Number(node.dataset.shown) !== shown) {
    node.dataset.shown = String(shown);
    const stack = new DocumentFragment();
    for (let i = 0; i < shown; i++) stack.append(renderCard(null, { faceDown: true, size: 'mini' }));
    parts.mini.replaceChildren(stack);
  }

  const badge = parts.badge;
  if (player.vulnerable && player.cardCount === 1) {
    badge.textContent = 'FORGOT!';
    badge.className = 'seat__badge seat__badge--caught is-shown';
  } else if (player.cardCount === 1) {
    badge.textContent = 'ZA!';
    badge.className = 'seat__badge seat__badge--za is-shown';
  } else {
    badge.className = 'seat__badge';
  }
}

function renderPiles(view, yourTurn) {
  // draw pile
  if (!el.drawSlot.children.length) {
    el.drawSlot.append(
      renderCard(null, { faceDown: true, size: 'pile' }),
      renderCard(null, { faceDown: true, size: 'pile' }),
      renderCard(null, { faceDown: true, size: 'pile' })
    );
  }
  el.drawCount.textContent = String(view.drawPileCount);
  const canDraw = yourTurn && !view.mustPlayDrawnCard;
  el.drawPile.disabled = !canDraw;
  el.drawPile.classList.toggle('is-ready', canDraw);

  // discard pile: only rebuild when the top card changes
  const top = view.topCard;
  const topKey = top ? `${top.id}:${view.currentTopping}` : 'none';
  if (el.discardSlot.dataset.key !== topKey) {
    el.discardSlot.dataset.key = topKey;
    const holder = document.createElement('span');
    holder.className = 'discard-holder';
    // How the card lies in the oven, and the spin it unwinds as it settles,
    // both come from the card id. The same card always lands the same way.
    const seed = top ? hashOf(top.id) : 0;
    holder.style.setProperty('--tilt', `${((seed % 81) / 10 - 4).toFixed(1)}deg`);
    holder.style.setProperty('--enter-spin', `${(Math.floor(seed / 7) % 13) - 6}deg`);
    if (top) holder.append(renderCard(top, { size: 'pile' }));
    el.discardSlot.replaceChildren(holder);
  }

  // current topping badge
  const meta = TOPPING_META[view.currentTopping];
  if (meta) {
    el.toppingNow.className = `topping-now t-${view.currentTopping}`;
    el.toppingNow.querySelector('.topping-now__emoji').textContent = meta.emoji;
    el.toppingNow.querySelector('.topping-now__name').textContent = meta.label;
  }
}

function renderHand(snapshot, view, yourTurn) {
  const playable = new Set(view.playableCardIds);
  const seen = new Set();
  const fresh = [];
  const order = [];

  for (const card of view.hand) {
    seen.add(card.id);
    let slot = ui.handSlots.get(card.id);
    if (!slot) {
      slot = document.createElement('div');
      slot.className = 'hand-slot';
      const node = renderCard(card, { size: 'hand', interactive: true });
      node.addEventListener('click', () => onCardActivate(card, slot));
      slot.append(node);
      ui.handSlots.set(card.id, slot);
      fresh.push(slot);
    }
    const node = slot.firstElementChild;
    const isPlayable = yourTurn && playable.has(card.id);
    node.classList.toggle('is-playable', isPlayable);
    node.classList.toggle('is-dimmed', !isPlayable);
    node.disabled = !isPlayable;
    order.push(slot);
  }

  for (const [id, slot] of ui.handSlots) {
    if (!seen.has(id)) {
      slot.remove();
      ui.handSlots.delete(id);
    }
  }

  order.forEach((slot, index) => {
    if (el.hand.children[index] !== slot) el.hand.insertBefore(slot, el.hand.children[index] || null);
  });

  layoutHand(order);

  // Cards that just arrived. At the start of a round the whole fan is dealt in
  // with a stagger. During play a card can only come off the dough pile, so it
  // travels from the pile and the real card takes over where it lands.
  // Interaction is never blocked either way.
  if (fresh.length) {
    const dealing = ui.dealing;
    fresh.forEach((slot, index) => {
      if (dealing) {
        delayEntry(slot, Math.min(index * 55, 275));
        return;
      }
      const start = index * 70;
      delayEntry(slot, start + D_FLY - 80);
      flyFromDrawPile(slot, start);
    });
  }
  // Only a hand that actually has cards in it counts as dealt.
  if (order.length) ui.dealing = false;
}

/** Holds a fresh card back until its turn in the stagger, or until it lands. */
function delayEntry(slot, delay) {
  if (!wantsMotion() || delay <= 0) return;
  const node = slot.firstElementChild;
  node.style.transitionDelay = `${delay}ms`;
  setTimeout(() => { node.style.transitionDelay = ''; }, delay + D_ENTER + 120);
}

/** Spreads the hand into a fan that always fits the width available. */
function layoutHand(slots) {
  const total = slots.length;
  if (!total) return;
  const cardWidth = slots[0].offsetWidth || 84;
  const available = Math.max(el.hand.clientWidth - 16, cardWidth);

  let overlap = -Math.round(cardWidth * 0.3);
  const needed = total * cardWidth + (total - 1) * overlap;
  if (needed > available && total > 1) {
    overlap = Math.floor((available - total * cardWidth) / (total - 1));
  }
  overlap = Math.max(overlap, -Math.round(cardWidth * 0.84));

  const spread = Math.min(4.2, 32 / Math.max(total - 1, 1));
  slots.forEach((slot, index) => {
    const norm = total === 1 ? 0 : (index - (total - 1) / 2) / ((total - 1) / 2);
    slot.style.setProperty('--overlap', `${overlap}px`);
    slot.style.setProperty('--tilt', `${(norm * spread * Math.max(total - 1, 1) / 2).toFixed(2)}deg`);
    slot.style.setProperty('--rise', `${(Math.abs(norm) ** 2 * 7).toFixed(1)}px`);
    slot.style.zIndex = String(index + 1);
  });
}

function renderActionBar(snapshot, view, yourTurn) {
  const me = view.players.find((p) => p.id === snapshot.youId);
  const live = view.status === 'playing';

  el.btnZa.disabled = !view.canDeclareZa;
  el.btnZa.classList.toggle('is-urgent', Boolean(view.canDeclareZa && me && me.cardCount <= 2));

  const targets = view.calloutTargets || [];
  el.btnCallout.hidden = !live || targets.length === 0;
  if (targets.length === 1) {
    const target = view.players.find((p) => p.id === targets[0]);
    el.btnCalloutText.textContent = `Call out ${target ? target.name : 'them'}`;
  } else {
    el.btnCalloutText.textContent = 'Call out';
  }

  el.btnPass.hidden = !view.canPass;

  el.handHint.textContent = handHint(view, yourTurn, me);
}

function handHint(view, yourTurn, me) {
  if (view.status !== 'playing') return '';
  if (view.mustPlayDrawnCard) return 'Fresh out of the oven. Play it, or pocket it and pass.';
  if (!yourTurn) return '';
  if (view.playableCardIds.length === 0) return 'Nothing fits. Grab one off the dough pile.';
  if (me && me.cardCount === 2) return 'One card away — shout before you play!';
  if (me && me.cardCount === 1) return 'Last slice. Make it count.';
  return 'Pick a glowing card.';
}

function renderLog(view) {
  const fragment = new DocumentFragment();
  let added = 0;
  for (const entry of view.log) {
    if (entry.id <= ui.lastLogId) continue;
    ui.lastLogId = entry.id;
    const item = document.createElement('li');
    item.className = 'log__entry';
    item.textContent = entry.text;
    fragment.append(item);
    added++;
  }
  if (!added) return;
  el.logList.append(fragment);
  while (el.logList.children.length > 40) el.logList.firstElementChild.remove();
  el.logList.scrollTop = el.logList.scrollHeight;
}

// ============================================================ ROUND OVER ===
function renderRoundOver(snapshot, staged) {
  const view = snapshot.game;
  const winner = view.players.find((p) => p.id === view.winnerId);
  const youWon = winner && winner.id === snapshot.youId;

  el.roundEmoji.textContent = youWon ? '🏆' : winner ? '🍕' : '🤷';
  el.roundTitle.textContent = youWon
    ? 'Empty box. Full glory.'
    : winner ? `${winner.name} cleaned their plate` : 'Kitchen closed';
  el.roundSub.textContent = youWon
    ? 'The kitchen bows. Somebody get this chef a drink.'
    : winner
      ? 'You still have crusts in hand. Rematch?'
      : 'Nobody finished the pie. Awkward.';

  if (el.dialog) el.dialog.classList.toggle('is-win', Boolean(youWon));

  const rows = new DocumentFragment();
  const ranked = [...snapshot.seats].sort((a, b) => b.wins - a.wins || a.name.localeCompare(b.name));
  ranked.forEach((seat, index) => {
    const row = document.createElement('li');
    row.className = 'score-row';
    if (seat.id === view.winnerId) row.classList.add('is-winner');
    // The board deals itself in behind the crown.
    if (staged && wantsMotion()) row.style.transitionDelay = `${Math.min(220 + index * 45, 420)}ms`;

    const icon = document.createElement('span');
    icon.textContent = seat.isBot ? '👨‍🍳' : '🧑';
    const name = document.createElement('span');
    name.className = 'score-row__name';
    name.textContent = seat.name + (seat.id === snapshot.youId ? ' (you)' : '');
    const wins = document.createElement('span');
    wins.className = 'score-row__wins';
    wins.textContent = `${seat.wins} 🍕`;

    row.append(icon, name, wins);
    rows.append(row);
  });
  el.scoreboard.replaceChildren(rows);

  el.btnNextRound.hidden = !snapshot.isHost;
  el.btnToLobby.hidden = !snapshot.isHost;
  el.roundWait.textContent = snapshot.isHost ? '' : 'Waiting for the host to roll out more dough…';
}

// =============================================================== ACTIONS ===
function onCardActivate(card, slot) {
  const node = slot.firstElementChild;
  if (!node.classList.contains('is-playable')) return;

  if (isWild(card)) {
    openPicker(card, slot);
    return;
  }
  commitPlay(card, null, slot);
}

function commitPlay(card, topping, slot) {
  closePopovers();
  const node = slot.firstElementChild;
  flyToDiscard(node);
  node.classList.add('is-leaving');
  node.disabled = true;
  send({ type: 'play', cardId: card.id, topping: topping || undefined });
}

/**
 * Sends a copy of a card across the table, from one rectangle to another.
 *
 * The copy rides a CSS transition, so a second flight can start while the first
 * one is still going and neither restarts from the beginning. It only carries
 * transform and opacity, and it hands over to the real card as it lands.
 */
function flyBetween(template, from, to, spin) {
  if (!wantsMotion()) return;
  if (!from || !to || !from.w || !to.w) return;

  const clone = template.cloneNode(true);
  clone.classList.add('fly-card');
  clone.classList.remove('is-playable', 'is-dimmed', 'is-pressed', 'is-leaving');
  clone.removeAttribute('disabled');
  clone.setAttribute('aria-hidden', 'true');
  clone.style.left = `${(from.cx - from.w / 2).toFixed(1)}px`;
  clone.style.top = `${(from.cy - from.h / 2).toFixed(1)}px`;
  clone.style.width = `${from.w}px`;
  clone.style.height = `${from.h}px`;
  clone.style.setProperty('--card-w', `${from.w}px`);
  el.flyLayer.append(clone);

  const dx = to.cx - from.cx;
  const dy = to.cy - from.cy;
  const scale = to.w / from.w;

  requestAnimationFrame(() => {
    clone.style.transform =
      `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) scale(${scale.toFixed(3)}) rotate(${spin}deg)`;
    clone.style.opacity = '0.001';
  });
  setTimeout(() => clone.remove(), D_FLY + 140);
}

/**
 * Where a card is and how big it really is. Hand cards are tilted, so their
 * bounding box is wider than the card; the layout size is used for the scale
 * and only the centre comes from the box.
 */
function cardMetrics(node) {
  const rect = node.getBoundingClientRect();
  return {
    cx: rect.left + rect.width / 2,
    cy: rect.top + rect.height / 2,
    w: node.offsetWidth || rect.width,
    h: node.offsetHeight || rect.height,
  };
}

/** The played card travels from the hand into the oven. */
function flyToDiscard(sourceNode) {
  flyBetween(
    sourceNode,
    cardMetrics(sourceNode),
    cardMetrics(el.discardSlot),
    (Math.random() * 10 - 5).toFixed(1)
  );
}

/** A drawn card travels from the dough pile into its place in the hand. */
function flyFromDrawPile(slot, startDelay) {
  if (!wantsMotion()) return;
  const launch = () => {
    if (!slot.isConnected) return;
    flyBetween(cardBack(), cardMetrics(el.drawSlot), cardMetrics(slot), 4);
  };
  // One frame of slack lets the fan finish respacing before the target is read.
  if (startDelay > 0) setTimeout(launch, startDelay);
  else requestAnimationFrame(launch);
}

let backTemplate = null;
/** A detached card back, used as the source for a flight off the dough pile. */
function cardBack() {
  if (!backTemplate) backTemplate = renderCard(null, { faceDown: true, size: 'pile' });
  return backTemplate;
}

// ------------------------------------------------------------- popovers ----
function closePopovers() {
  hide(el.picker);
  hide(el.calloutPop);
  ui.pendingWild = null;
}

function openPicker(card, slot) {
  ui.pendingWild = { card, slot };
  el.pickerTitle.textContent = card.kind === 'wild4'
    ? 'The Whole Pie +4 — pick a topping'
    : "Chef's Choice — pick a topping";

  const buttons = new DocumentFragment();
  for (const key of TOPPING_ORDER) {
    const meta = TOPPING_META[key];
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `topping-btn t-${key}`;
    const emoji = document.createElement('i');
    emoji.textContent = meta.emoji;
    const label = document.createElement('span');
    label.textContent = meta.label;
    button.append(emoji, label);
    button.addEventListener('click', () => {
      const pending = ui.pendingWild;
      closePopovers();
      if (pending) commitPlay(pending.card, key, pending.slot);
    });
    buttons.append(button);
  }
  el.pickerGrid.replaceChildren(buttons);

  // The popover grows out of the card that opened it.
  const cardRect = slot.getBoundingClientRect();
  show(el.picker);
  const popRect = el.picker.getBoundingClientRect();
  const originX = cardRect.left + cardRect.width / 2 - popRect.left;
  el.picker.style.setProperty('--origin-x', `${Math.max(8, Math.min(popRect.width - 8, originX)).toFixed(0)}px`);
  const first = el.pickerGrid.querySelector('button');
  if (first) first.focus({ preventScroll: true });
}

function openCalloutPopover() {
  const view = ui.snapshot && ui.snapshot.game;
  if (!view) return;
  const targets = view.calloutTargets || [];
  if (targets.length === 0) return;
  if (targets.length === 1) {
    send({ type: 'callout', targetId: targets[0] });
    return;
  }
  const rows = new DocumentFragment();
  for (const id of targets) {
    const player = view.players.find((p) => p.id === id);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'callout-btn';
    button.textContent = `☝️ ${player ? player.name : 'Player'}`;
    button.addEventListener('click', () => {
      closePopovers();
      send({ type: 'callout', targetId: id });
    });
    rows.append(button);
  }
  el.calloutRows.replaceChildren(rows);
  show(el.calloutPop);
  const trigger = el.btnCallout.getBoundingClientRect();
  const popRect = el.calloutPop.getBoundingClientRect();
  const originX = trigger.left + trigger.width / 2 - popRect.left;
  el.calloutPop.style.setProperty(
    '--origin-x',
    `${Math.max(8, Math.min(popRect.width - 8, originX)).toFixed(0)}px`
  );
}

// ================================================================ EVENTS ===
el.formCreate.addEventListener('submit', (event) => {
  event.preventDefault();
  const name = el.inputName.value.trim();
  if (!name) {
    el.inputName.focus();
    toast('The chef needs a name to shout.');
    return;
  }
  localStorage.setItem('za.name', name);
  send({ type: 'createRoom', name });
});

el.formJoin.addEventListener('submit', (event) => {
  event.preventDefault();
  const name = el.inputName.value.trim();
  const code = el.inputCode.value.trim().toUpperCase();
  if (!name) {
    el.inputName.focus();
    toast('The chef needs a name to shout.');
    return;
  }
  if (!code) {
    el.inputCode.focus();
    toast('Which table? Enter the code.');
    return;
  }
  localStorage.setItem('za.name', name);
  // A token from an earlier visit to this table takes the same seat back.
  send({ type: 'joinRoom', name, code, token: net.storedToken(code) });
});

el.btnCopyCode.addEventListener('click', () => copyCode(el.btnCopyCode));
el.hudCode.addEventListener('click', () => copyCode(el.hudCode));
el.btnAddBot.addEventListener('click', () => send({ type: 'addBot' }));
el.btnStart.addEventListener('click', () => send({ type: 'startGame' }));
el.btnLeaveLobby.addEventListener('click', () => send({ type: 'leaveRoom' }));
el.btnLeaveGame.addEventListener('click', () => send({ type: 'leaveRoom' }));

el.drawPile.addEventListener('click', () => {
  if (el.drawPile.disabled) return;
  send({ type: 'draw' });
});

el.btnPass.addEventListener('click', () => send({ type: 'pass' }));
el.btnZa.addEventListener('click', () => send({ type: 'za' }));
el.btnCallout.addEventListener('click', openCalloutPopover);
el.pickerCancel.addEventListener('click', closePopovers);
el.calloutCancel.addEventListener('click', closePopovers);
el.btnNextRound.addEventListener('click', () => send({ type: 'newRound' }));
el.btnToLobby.addEventListener('click', () => send({ type: 'backToLobby' }));

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closePopovers();
  if (event.key !== 'Tab' || !el.overlay.classList.contains('is-open')) return;

  const controls = Array.from(el.dialog.querySelectorAll('button:not([disabled]):not([hidden])'))
    .filter((control) => control.offsetParent !== null);
  if (controls.length === 0) {
    event.preventDefault();
    el.dialog.focus({ preventScroll: true });
    return;
  }

  const first = controls[0];
  const last = controls[controls.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus({ preventScroll: true });
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus({ preventScroll: true });
  }
});

// A click outside closes an open popover.
document.addEventListener('pointerdown', (event) => {
  const open = el.picker.classList.contains('is-open') || el.calloutPop.classList.contains('is-open');
  if (!open) return;
  if (event.target.closest('.popover, .card, .btn--callout')) return;
  closePopovers();
});

let resizeFrame = 0;
window.addEventListener('resize', () => {
  cancelAnimationFrame(resizeFrame);
  resizeFrame = requestAnimationFrame(() => layoutHand([...el.hand.children]));
});

// ================================================================== BOOT ===
function boot() {
  // The `hidden` attributes are only a no-JS fallback. Classes drive it now.
  for (const screen of el.screens) {
    screen.hidden = false;
    screen.inert = screen.dataset.screen !== 'home';
  }
  const saved = localStorage.getItem('za.name');
  if (saved) el.inputName.value = saved;

  const code = new URLSearchParams(location.search).get('code');
  if (code) el.inputCode.value = code.toUpperCase();

  el.inputName.focus({ preventScroll: true });
  net.connect();
}

boot();
