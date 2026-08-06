/**
 * Za client.
 *
 * The server owns the game. This file only draws the state it receives and
 * sends the player's intent back. It never decides if a move is legal.
 */

import { Connection } from './net.js';
import { renderCard, isWild, describeCard, TOPPING_META, TOPPING_ORDER } from './cards.js';
import { icon, suitIcon } from './icons.js';
import { sound } from './sounds.js';

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

// ----------------------------------------------------------- the regulars --
/**
 * The roster, for drawing only. The server owns who is hired, what they are
 * called and how they play; this is the poster on the wall. `tell` is the one
 * line the player reads before they pick, and it describes the bias the server
 * actually applies.
 */
const REGULARS = [
  {
    id: 'vito',
    name: 'Vito',
    line: "I'm saving it.",
    tell: 'Vito hoards his wilds until he is down to three cards. Then out they come, together.',
  },
  {
    id: 'carmela',
    name: 'Carmela',
    line: 'I saw that.',
    tell: 'Carmela catches almost everything. Forget to shout in front of her and it is already too late.',
  },
  {
    id: 'paulie',
    name: 'Big Paulie',
    line: '...eh.',
    tell: 'Big Paulie takes his time, and he always reaches for the +2 first.',
  },
  {
    id: 'pina',
    name: 'Nonna Pina',
    line: 'Eat, eat.',
    tell: 'Nonna Pina will not attack you if she has anything else to play. Right up until she wins.',
  },
  {
    id: 'dominic',
    name: 'Dominic',
    line: 'Bada-bing.',
    tell: 'Dominic plays his highest number, every time. No plan, occasionally devastating.',
  },
  {
    id: 'ray',
    name: 'Ray',
    line: 'later',
    tell: 'Ray moves before you have finished reading the card. He is not looking at your hand.',
  },
];

const ANYBODY_TELL = 'Whoever is free walks in. Somebody always is.';

/** The regular sitting under this seat name, or null for a plain chef bot. */
function regularByName(name) {
  const key = String(name || '').toLowerCase();
  return REGULARS.find((r) => r.name.toLowerCase() === key) || null;
}

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
  roster: null, // the hire panel, built once on first use
  // Everything the receipts are made of. Filled in from snapshots as they
  // arrive, because none of it is on the wire as a number.
  tab: null,
  // Last-seen table state, so a new snapshot can be animated as a diff:
  // an opponent's card flies to the oven, a penalty flies to its victim.
  prevTopId: null,
  prevCounts: new Map(), // playerId -> cardCount
  prevStatus: null,
  prevDir: 0,
  topChanged: false,
  // Per-snapshot diff, read by the effects. Filled by animateTableDiff before
  // anything else draws, so the pile and the seats see the same picture.
  gained: new Map(), // playerId -> cards taken since the last snapshot
  playedById: null, // whoever's hand shrank, including you
  // Effect state. All of it is client-side and none of it is a game rule.
  prevTopKind: null,
  chain: 0, // consecutive +2/+4 tops, the visual ladder of README 4A
  anchovyCount: 0, // anchovies this round, for the 6C escalation
  callouts: new Map(), // playerId -> { node, mine }
  calloutBeeps: [],
  shoutArmedAt: 0, // when the shout became legal, for the timing score
  dirJustFlipped: false,
  btnMute: null,
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
    // The chain ladder and the crowd's patience with anchovies both reset with
    // the round. Going quiet at the fourth anchovy is the joke; it would stop
    // being one if it carried over.
    resetRoundEffects();
  }

  trackTab(snapshot);

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
    const staged = !el.overlay.classList.contains('is-open');
    renderRoundOver(snapshot, staged);
    openRoundOverlay();
    closePopovers();
    if (staged) celebrate(snapshot);
  } else {
    closeRoundOverlay();
  }
}

/**
 * I · the win celebration. The only effect in the game allowed past 300ms: the
 * checker behind the dialog scrolls one 40px tile per frame for 1.2s while the
 * scoreboard types itself in a row at a time, and the jingle overstays.
 * Nothing fires without a winner — a round that ended because the table
 * emptied gets the dialog and nothing else.
 */
function celebrate(snapshot) {
  const view = snapshot.game;
  if (!view || !view.winnerId) return;
  el.overlay.classList.add('is-celebrating');
  setTimeout(() => el.overlay.classList.remove('is-celebrating'), 1250);
  sound.play('victory-jingle');
}

/** Drops every per-round effect counter and cancels anything still running. */
function resetRoundEffects() {
  ui.chain = 0;
  ui.prevTopKind = null;
  ui.anchovyCount = 0;
  ui.shoutArmedAt = 0;
  // A new round always runs to the left again. Without this a round that ended
  // reversed would flash and scrub the moment the next one dealt.
  ui.prevDir = 0;
  setOvenStep(0);
  for (const id of [...ui.callouts.keys()]) closeCalloutWindow(id, 'reset');
}

function resetGameView() {
  resetRoundEffects();
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

/** A regular's portrait when the bot is one of the six, by name. */
function regularPortrait(name) {
  const regular = REGULARS.find((r) => r.name === name);
  return regular ? `assets/regulars/${regular.id}.png` : null;
}

function renderAvatar(node, person) {
  node.replaceChildren();
  if (person.isBot) {
    const image = document.createElement('img');
    image.className = 'avatar__image';
    image.src = regularPortrait(person.name) || 'assets/avatar-chef-bot.png';
    image.alt = '';
    image.width = 256;
    image.height = 256;
    image.decoding = 'async';
    image.draggable = false;
    node.append(image);
    return;
  }
  const image = document.createElement('img');
  image.className = 'avatar__image';
  image.src = 'assets/avatar-patron.png';
  image.alt = '';
  image.width = 256;
  image.height = 256;
  image.decoding = 'async';
  image.draggable = false;
  node.classList.toggle('is-away', person.connected === false);
  node.append(image);
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

// ------------------------------------------------------- the hire roster ----
/**
 * The panel behind "Hire a chef bot". It is built once, from here, and reuses
 * the popover treatment the topping picker and the call-out list already use.
 */
function buildRoster() {
  const panel = document.createElement('div');
  panel.className = 'popover popover--roster';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'false');
  panel.setAttribute('aria-label', 'Hire a chef bot');

  const title = document.createElement('p');
  title.className = 'popover__title';
  title.textContent = "Who's coming in?";

  const grid = document.createElement('div');
  grid.className = 'roster';

  const tell = document.createElement('p');
  tell.className = 'roster__tell';
  tell.setAttribute('role', 'status');
  tell.textContent = ANYBODY_TELL;

  const cancel = document.createElement('button');
  cancel.className = 'btn btn--quiet btn--sm btn--block';
  cancel.type = 'button';
  cancel.textContent = 'Cancel';
  cancel.addEventListener('click', closePopovers);

  panel.append(title, grid, tell, cancel);
  ui.roster = { panel, grid, tell };
  return ui.roster;
}

/** One tile. `regular` is null for the ANYBODY tile. */
function rosterTile(regular, seated) {
  const tile = document.createElement('button');
  tile.type = 'button';
  tile.className = regular ? 'roster-tile' : 'roster-tile roster-tile--any';
  const line = regular ? regular.tell : ANYBODY_TELL;

  const window_ = document.createElement('span');
  window_.className = 'roster-tile__window';
  window_.setAttribute('aria-hidden', 'true');
  if (regular) {
    const face = document.createElement('img');
    face.className = 'roster-tile__portrait';
    face.src = `assets/regulars/${regular.id}.png`;
    face.alt = '';
    face.draggable = false;
    window_.append(face);
  }

  const name = document.createElement('span');
  name.className = 'roster-tile__name';
  name.textContent = regular ? regular.name : 'Anybody';

  tile.append(window_, name);
  // The tell is only shown for the tile under the pointer, so every tile
  // carries it as its own label too. A screen reader gets the whole roster.
  tile.setAttribute('aria-label', regular ? `Hire ${regular.name}. ${regular.tell}` : `Hire anybody. ${ANYBODY_TELL}`);

  if (seated) {
    tile.classList.add('is-seated');
    // Left focusable on purpose: the tell is the tutorial, and a keyboard
    // player should still be able to read the one for a chef already seated.
    tile.setAttribute('aria-disabled', 'true');
    tile.setAttribute('aria-label', `${regular.name} is already at the table. ${regular.tell}`);
    const label = document.createElement('span');
    label.className = 'roster-tile__seated';
    label.textContent = 'Seated';
    tile.append(label);
  }

  const describe = () => { ui.roster.tell.textContent = line; };
  tile.addEventListener('pointerenter', describe);
  tile.addEventListener('focus', describe);
  tile.addEventListener('click', () => {
    if (seated) {
      toast(`${regular.name} is already at the table.`);
      return;
    }
    closePopovers();
    send(regular ? { type: 'addBot', regularId: regular.id } : { type: 'addBot' });
  });
  return tile;
}

function openRoster(snapshot) {
  const roster = ui.roster || buildRoster();
  if (!roster.panel.isConnected) {
    const host = el.btnAddBot.closest('.panel') || el.btnAddBot.parentElement;
    host.append(roster.panel);
  }

  const seated = new Set(
    snapshot.seats.filter((s) => s.isBot).map((s) => s.name.toLowerCase())
  );
  const tiles = new DocumentFragment();
  for (const regular of REGULARS) {
    tiles.append(rosterTile(regular, seated.has(regular.name.toLowerCase())));
  }
  tiles.append(rosterTile(null, false));
  roster.grid.replaceChildren(tiles);
  roster.tell.textContent = ANYBODY_TELL;

  show(roster.panel);
  const first = roster.grid.querySelector('.roster-tile:not(.is-seated)');
  if (first) first.focus({ preventScroll: true });
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

  animateTableDiff(snapshot, view);
  renderTurnBanner(snapshot, view, yourTurn);
  renderDirection(view);
  renderOpponents(snapshot, view);
  syncCalloutWindows(snapshot, view);
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

  // F · Flip the Pie. The arrow does a show-off spin and then flashes cyan
  // twice; renderOpponents picks the flag up and reorders the seats without a
  // tween, so the panels swap rather than slide.
  const flipped = Boolean(ui.prevDir && ui.prevDir !== view.direction);
  ui.dirJustFlipped = flipped;
  if (flipped) {
    const arrow = el.dirIndicator.querySelector('.dir-arrow');
    if (arrow) {
      arrow.classList.remove('is-flipping');
      void arrow.offsetWidth; // restart the flash if two flips land together
      arrow.classList.add('is-flipping');
      setTimeout(() => arrow.classList.remove('is-flipping'), 520);
    }
    sound.play('tape-scrub');
  }
  if (flipped && wantsMotion() && typeof el.dirIndicator.animate === 'function') {
    for (const running of el.dirIndicator.getAnimations()) running.cancel();
    el.dirIndicator.animate(
      [{ transform: 'rotate(0deg)' }, { transform: `rotate(${view.direction === -1 ? '' : '-'}360deg)` }],
      { duration: 450, easing: EASE_OUT }
    );
  }
  ui.prevDir = view.direction;
}

/**
 * Opponents in play order, starting from whoever plays after you.
 *
 * The order follows the direction of play, so a Flip the Pie genuinely
 * reverses the row of chef panels — that reversal is effect F, and without it
 * there would be nothing for the hard swap in renderOpponents to swap.
 */
function orderedOpponents(snapshot, view) {
  const players = view.players.filter((p) => !p.left);
  const mine = players.findIndex((p) => p.id === snapshot.youId);
  if (mine === -1) return players;
  const after = [...players.slice(mine + 1), ...players.slice(0, mine)];
  return view.direction === -1 ? after.reverse() : after;
}

function renderOpponents(snapshot, view) {
  const list = orderedOpponents(snapshot, view);
  const seen = new Set();
  const order = [];

  // Your own call-out window, read off the snapshot you already have. While it
  // is open, every bot at the table is a seat that could catch you.
  const me = view.players.find((p) => p.id === snapshot.youId);
  const exposed = Boolean(
    me && me.vulnerable && me.cardCount === 1 && view.status === 'playing'
  );

  for (const player of list) {
    seen.add(player.id);
    let node = ui.seatNodes.get(player.id);
    if (!node) {
      node = buildSeat(player);
      ui.seatNodes.set(player.id, node);
    }
    updateSeat(node, player, view, exposed);
    order.push(node);
  }

  for (const [id, node] of ui.seatNodes) {
    if (!seen.has(id)) {
      node.remove();
      ui.seatNodes.delete(id);
    }
  }

  // F · after a flip the order reverses on the spot. Suspending the seat
  // transition for the reorder is what makes it a hard swap and not a slide.
  const hardSwap = ui.dirJustFlipped;
  ui.dirJustFlipped = false;
  if (hardSwap) {
    el.opponents.classList.add('is-hard-swap');
    const release = () => el.opponents.classList.remove('is-hard-swap');
    requestAnimationFrame(() => requestAnimationFrame(release));
    // A backgrounded tab throttles rAF, and a suspended class would leave the
    // seats without a transition for the rest of the round. The timer is the
    // belt to that pair of braces.
    setTimeout(release, 200);
  }

  // Reorder without rebuilding, so entry animations are not restarted.
  order.forEach((node, index) => {
    if (el.opponents.children[index] !== node) el.opponents.insertBefore(node, el.opponents.children[index] || null);
    // A gentle arc makes the players look seated around the far edge. The
    // desktop chef column is a straight list and overrides it in CSS.
    const count = order.length;
    const norm = count === 1 ? 0 : (index - (count - 1) / 2) / ((count - 1) / 2);
    node.style.setProperty('--arc', `${(Math.abs(norm) ** 2 * -10).toFixed(1)}px`);
  });

  // "CHEFS · n" counts everyone still at the table, you included.
  el.opponents.dataset.chefs = String(view.players.filter((p) => !p.left).length);
  renderChefStats(snapshot);
}

/**
 * SCORE and RND, side by side at the foot of the chef column. The stats are
 * built here rather than in index.html so the markup stays as it is; the
 * indexed reorder above depends on them staying the last child.
 */
function renderChefStats(snapshot) {
  let node = el.opponents.querySelector('.chef-stats');
  if (!node) {
    node = document.createElement('div');
    node.className = 'chef-stats';
    node._parts = {
      score: buildChefStat(node, 'score', 'Score'),
      rnd: buildChefStat(node, 'rnd', 'Rnd'),
    };
  }
  // Always last, so `children[index]` keeps addressing the seats.
  el.opponents.append(node);

  const me = snapshot.seats.find((s) => s.id === snapshot.youId);
  node._parts.score.textContent = String(me ? me.wins : 0).padStart(2, '0');

  // The wire protocol carries no round number, and the server owns the
  // protocol, so the tile stays hidden until one exists.
  const round = snapshot.game && Number.isFinite(snapshot.game.roundNumber)
    ? snapshot.game.roundNumber
    : null;
  node._parts.rnd.parentElement.hidden = round === null;
  if (round !== null) node._parts.rnd.textContent = String(round).padStart(2, '0');
}

/** One tile. Returns the value node so the caller can keep writing to it. */
function buildChefStat(parent, kind, label) {
  const tile = document.createElement('div');
  tile.className = `chef-stat chef-stat--${kind}`;
  const labelEl = document.createElement('span');
  labelEl.className = 'chef-stat__label';
  labelEl.textContent = label;
  const value = document.createElement('b');
  value.className = 'chef-stat__value';
  tile.append(labelEl, value);
  parent.append(tile);
  return value;
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

  // Two readings of the same number: "5 cards" for the chip row and for a
  // screen reader, and the two-digit plate the desktop chef column prints.
  const count = document.createElement('span');
  count.className = 'seat__count';
  const countLong = document.createElement('span');
  countLong.className = 'seat__count-long';
  const countNum = document.createElement('b');
  countNum.className = 'seat__count-num';
  countNum.setAttribute('aria-hidden', 'true');
  count.append(countLong, countNum);
  node.append(count);

  const mini = document.createElement('div');
  mini.className = 'seat__mini';
  node.append(mini);

  const status = document.createElement('span');
  status.className = 'seat__status';
  node.append(status);

  const badge = document.createElement('span');
  badge.className = 'seat__badge';
  node.append(badge);

  node._parts = { avatar, name, count, countLong, countNum, mini, badge, status };
  return node;
}

/**
 * One status word for a chef bot, from state the snapshot already carries.
 * A human opponent gets nothing: their tell is their own business.
 */
function seatStatus(player, view, exposed) {
  if (!player.isBot || player.left || view.status !== 'playing') return '';
  if (exposed) return 'watching you';
  if (view.turnPlayerId === player.id) return 'thinking';
  return '';
}

function updateSeat(node, player, view, exposed) {
  const parts = node._parts;
  const avatarState = `${player.isBot}:${player.connected}`;
  if (node.dataset.avatarState !== avatarState) {
    node.dataset.avatarState = avatarState;
    renderAvatar(parts.avatar, player);
  }
  parts.name.textContent = player.name;
  parts.countLong.replaceChildren(
    icon('cardback'),
    document.createTextNode(` ${player.cardCount} card${player.cardCount === 1 ? '' : 's'}`)
  );
  parts.countNum.textContent = String(player.cardCount).padStart(2, '0');

  node.classList.toggle('is-turn', view.turnPlayerId === player.id && view.status === 'playing');
  node.classList.toggle('is-away', !player.connected);
  // Their call-out window is open: the chef column dashes the panel in sauce.
  node.classList.toggle('is-vulnerable', Boolean(player.vulnerable) && player.cardCount === 1);

  const word = seatStatus(player, view, exposed);
  parts.status.textContent = word;
  parts.status.classList.toggle('is-shown', Boolean(word));
  parts.status.classList.toggle('is-watching', word === 'watching you');

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

// ------------------------------------------------------- C · the catch ----
/**
 * The call-out window, drawn from the snapshot.
 *
 * The server has no timer: a player is `vulnerable` from the moment they play
 * down to one card without shouting until play comes back round to them. The
 * three seconds in the handoff are the client's dramatisation of that window,
 * so the bar drains in five countable steps and then simply stops. It never
 * decides anything — the CALL OUT button stays governed by `calloutTargets`.
 *
 * A window closes three ways, and they are told apart in the loop below.
 */
function syncCalloutWindows(snapshot, view) {
  const open = new Set();
  if (view.status === 'playing') {
    for (const player of view.players) {
      if (!player.left && player.vulnerable && player.cardCount === 1) open.add(player.id);
    }
  }

  for (const id of open) {
    if (!ui.callouts.has(id)) openCalloutWindow(id, id === snapshot.youId);
  }
  for (const id of [...ui.callouts.keys()]) {
    if (open.has(id)) continue;
    const took = ui.gained.get(id) || 0;
    // Three ways out: somebody called it (cards, pile untouched), a penalty
    // card landed on them and closed it as a side effect (cards, new top), or
    // they got away with it (no cards at all).
    const how = took > 0 ? (ui.topChanged ? 'moot' : 'caught') : 'clean';
    closeCalloutWindow(id, how);
  }
}

function openCalloutWindow(playerId, isMine) {
  const entry = { node: null, mine: isMine };
  ui.callouts.set(playerId, entry);

  const drain = document.createElement('span');
  drain.className = 'callout-drain';
  drain.setAttribute('aria-hidden', 'true');
  const fill = document.createElement('span');
  fill.className = 'callout-drain__fill';
  drain.append(fill);

  if (isMine) {
    // You have no chef panel of your own, so your window lives on the rail
    // above the hand, where the ZA! button that closes it already is.
    const box = document.createElement('div');
    box.className = 'callout-self';
    const label = document.createElement('span');
    label.className = 'callout-self__label';
    label.textContent = 'Shout ZA! — they can call you out';
    box.append(label, drain);
    el.handZone.append(box);
    entry.node = box;
  } else {
    const seat = ui.seatNodes.get(playerId);
    if (!seat) return;
    seat.classList.add('is-callout');
    seat.append(drain);
    entry.node = drain;
  }

  // One rising beep per drained step, and only ever for one window at a time:
  // two seats caught out together would otherwise double every beep.
  if (ui.callouts.size === 1) {
    for (let i = 0; i < 5; i++) {
      ui.calloutBeeps.push(setTimeout(() => sound.play('timer-beep', i + 1), i * 600));
    }
  }
}

function closeCalloutWindow(playerId, how) {
  const entry = ui.callouts.get(playerId);
  ui.callouts.delete(playerId);
  if (!entry) return;

  const seat = ui.seatNodes.get(playerId);
  if (seat) seat.classList.remove('is-callout');

  if (ui.callouts.size === 0) {
    for (const timer of ui.calloutBeeps) clearTimeout(timer);
    ui.calloutBeeps = [];
  }

  if (how === 'caught') {
    // The penalty cards flying into their hand and the log line are the visual;
    // the buzzer is only the noise on top of it.
    sound.play('buzzer');
  }

  if (entry.mine && entry.node) {
    if (how === 'clean') {
      entry.node.classList.add('is-safe');
      entry.node.firstElementChild.textContent = 'Safe — nobody was listening';
      sound.play('relieved-chime');
      setTimeout(() => entry.node.remove(), 900);
      return;
    }
    entry.node.remove();
    return;
  }
  if (entry.node) entry.node.remove();
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
    // Landing drama for the mean cards, whoever played them. Only when the
    // card itself is new (not when a wild repaints the topping), and never
    // for the round's opening flip.
    const prevTopId = el.discardSlot.dataset.topId || '';
    const isNew = Boolean(top && top.id !== prevTopId);
    const landed = isNew && Boolean(prevTopId);

    // A · the chain. A client-side ladder over what the rules already do:
    // consecutive draw cards landing on one another. Nothing here stacks a
    // penalty — the server still resolves every +2 and +4 on the spot.
    if (landed) {
      const isDraw = top.kind === 'draw2' || top.kind === 'wild4';
      const wasDraw = ui.prevTopKind === 'draw2' || ui.prevTopKind === 'wild4';
      ui.chain = isDraw ? (wasDraw ? ui.chain + 1 : 1) : 0;
    }
    if (isNew) {
      el.discardSlot.dataset.topId = top.id;
      ui.prevTopKind = top.kind;
    }

    el.discardSlot.dataset.key = topKey;
    const holder = document.createElement('span');
    holder.className = 'discard-holder';
    if (landed && ui.chain >= 1) holder.classList.add('is-chain');
    // How the card lies in the oven, and the spin it unwinds as it settles,
    // both come from the card id. The same card always lands the same way.
    const seed = top ? hashOf(top.id) : 0;
    holder.style.setProperty('--tilt', `${((seed % 81) / 10 - 4).toFixed(1)}deg`);
    holder.style.setProperty('--enter-spin', `${(Math.floor(seed / 7) % 13) - 6}deg`);
    if (view.currentTopping) holder.dataset.topping = view.currentTopping;
    if (top) holder.append(renderCard(top, { size: 'pile' }));
    el.discardSlot.replaceChildren(holder);

    if (landed) onCardLanded(view, top);
  }

  // current topping badge
  const meta = TOPPING_META[view.currentTopping];
  if (meta) {
    el.toppingNow.className = `topping-now t-${view.currentTopping}`;
    const emblem = el.toppingNow.querySelector('.topping-now__emoji');
    if (emblem.dataset.suit !== view.currentTopping) {
      emblem.dataset.suit = view.currentTopping;
      emblem.classList.add('ico', 'ico--plate');
      emblem.replaceChildren(...suitIcon(view.currentTopping).childNodes);
    }
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

/**
 * How far one card may hide behind the next. Past this the fan stops being a
 * hand and becomes a stack of slivers: two eaten Whole Pies used to squeeze
 * the cards down to a sixth of their width. The strip scrolls instead.
 */
const MAX_OVERLAP = 0.55;

/** Spreads the hand into a fan, and scrolls it once the fan stops fitting. */
function layoutHand(slots) {
  const total = slots.length;
  if (!total) {
    el.hand.classList.remove('is-scrolling');
    return;
  }
  const cardWidth = slots[0].offsetWidth || 84;
  // `.hand` carries 8px of side padding in both modes, so this is the room the
  // cards actually get, and it does not change when the strip starts scrolling.
  const available = Math.max(el.hand.clientWidth - 16, cardWidth);

  let overlap = -Math.round(cardWidth * 0.3);
  const needed = total * cardWidth + (total - 1) * overlap;
  if (needed > available && total > 1) {
    overlap = Math.floor((available - total * cardWidth) / (total - 1));
  }
  overlap = Math.max(overlap, -Math.round(cardWidth * MAX_OVERLAP));

  const width = total * cardWidth + (total - 1) * overlap;
  const scrolling = width > available;
  el.hand.classList.toggle('is-scrolling', scrolling);

  // A scrolling strip clips on both axes, so the fan flattens: no tilt, no
  // rise. The lift and the cheese ring keep their room in the padding.
  const spread = scrolling ? 0 : Math.min(4.2, 32 / Math.max(total - 1, 1));
  slots.forEach((slot, index) => {
    const norm = total === 1 ? 0 : (index - (total - 1) / 2) / ((total - 1) / 2);
    slot.style.setProperty('--overlap', `${overlap}px`);
    slot.style.setProperty('--tilt', `${(norm * spread * Math.max(total - 1, 1) / 2).toFixed(2)}deg`);
    slot.style.setProperty('--rise', scrolling ? '0px' : `${(Math.abs(norm) ** 2 * 7).toFixed(1)}px`);
    slot.style.zIndex = String(index + 1);
  });
}

function renderActionBar(snapshot, view, yourTurn) {
  const me = view.players.find((p) => p.id === snapshot.youId);
  const live = view.status === 'playing';

  // B · the clock for the timing score starts the instant the shout becomes
  // legal. That transition is the only reference point the client can see.
  if (view.canDeclareZa) {
    if (!ui.shoutArmedAt) ui.shoutArmedAt = Date.now();
  } else {
    ui.shoutArmedAt = 0;
  }

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

// =============================================================== THE TAB ===
/**
 * The running bill.
 *
 * Nothing here is on the wire. The server publishes a card count per player, a
 * top card, a turn and a call-out flag; every line on the receipt is read out
 * of the difference between one snapshot and the next, the same way the table
 * animations are. A player who joins mid-round only gets charged for what they
 * were in the room to see, and that is the honest answer.
 */
function freshBill() {
  // `*Cost` is what the player actually took, which is the printed +2 or +4
  // unless the dough ran out mid-deal. It keeps the lines adding up to OWED.
  return {
    played: 0, anchovy: 0,
    extra: 0, extraCost: 0,
    whole: 0, wholeCost: 0,
    caught: 0, caughtCost: 0,
    dead: 0, owed: 0,
  };
}

function resetTab(view) {
  ui.tab = {
    gameId: view ? view.gameId : null,
    bills: new Map(),
    prevTopId: null,
    prevCounts: new Map(),
    prevVulnerable: new Map(),
    pendingDraw: new Set(), // drew a card, and the turn stayed with them
  };
}

function billFor(id) {
  if (!ui.tab.bills.has(id)) ui.tab.bills.set(id, freshBill());
  return ui.tab.bills.get(id);
}

function trackTab(snapshot) {
  const view = snapshot.game;
  if (!view) {
    if (!ui.tab || ui.tab.gameId !== null) resetTab(null);
    return;
  }
  if (!ui.tab || ui.tab.gameId !== view.gameId) resetTab(view);

  const tab = ui.tab;
  const top = view.topCard;
  const topId = top ? top.id : null;
  const landed = topId !== tab.prevTopId && tab.prevTopId !== null;

  // Who played it: the top card changed and exactly one hand got smaller.
  // Two at once (somebody walked out on the same beat) is not worth guessing.
  let author = null;
  if (landed) {
    const shrank = view.players.filter((p) => {
      const before = tab.prevCounts.get(p.id);
      return before !== undefined && p.cardCount < before;
    });
    if (shrank.length === 1) author = shrank[0].id;
  }

  // A card drawn last time is only a dead turn once the turn has moved on
  // without it being played.
  for (const id of [...tab.pendingDraw]) {
    if (id === author) {
      tab.pendingDraw.delete(id); // they drew it and played it. No charge.
    } else if (view.turnPlayerId !== id || view.status !== 'playing') {
      const bill = billFor(id);
      bill.dead += 1;
      bill.owed += 1;
      tab.pendingDraw.delete(id);
    }
  }

  if (author) {
    const bill = billFor(author);
    bill.played += 1;
    if (top && top.suit === 'anchovy') bill.anchovy += 1;
  }

  const penalty = landed && top && (top.kind === 'draw2' || top.kind === 'wild4');

  for (const player of view.players) {
    const before = tab.prevCounts.get(player.id);
    if (before === undefined || player.cardCount <= before) continue;
    const taken = player.cardCount - before;
    const bill = billFor(player.id);

    if (penalty && player.id !== author) {
      // Forced by the card that just landed. The cost is what they actually
      // took, which is the +2 or the +4 unless the dough ran out mid-deal.
      if (top.kind === 'draw2') { bill.extra += 1; bill.extraCost += taken; }
      else { bill.whole += 1; bill.wholeCost += taken; }
      bill.owed += taken;
      continue;
    }
    if (tab.prevVulnerable.get(player.id) && !player.vulnerable) {
      bill.caught += 1;
      bill.caughtCost += taken;
      bill.owed += taken;
      continue;
    }
    if (taken === 1 && !landed) {
      // A plain draw. Whether it was a dead turn is decided next snapshot.
      if (view.turnPlayerId === player.id && view.status === 'playing') {
        tab.pendingDraw.add(player.id);
      } else {
        bill.dead += 1;
        bill.owed += 1;
      }
    }
  }

  tab.prevTopId = topId;
  tab.prevCounts = new Map(view.players.map((p) => [p.id, p.cardCount]));
  tab.prevVulnerable = new Map(view.players.map((p) => [p.id, Boolean(p.vulnerable)]));
}

// ============================================================ ROUND OVER ===
function renderRoundOver(snapshot, staged) {
  const view = snapshot.game;
  const winner = view.players.find((p) => p.id === view.winnerId);
  const youWon = winner && winner.id === snapshot.youId;

  if (winner) {
    const crownArt = document.createElement('img');
    crownArt.className = 'dialog__crown-art';
    crownArt.src = 'assets/sprites/trophy.png';
    crownArt.alt = '';
    crownArt.width = 96;
    crownArt.height = 96;
    crownArt.draggable = false;
    el.roundEmoji.replaceChildren(crownArt);
  } else {
    el.roundEmoji.replaceChildren();
  }
  el.roundTitle.textContent = youWon
    ? 'Empty box. Full glory.'
    : winner ? `${winner.name} cleaned their plate` : 'Kitchen closed';
  el.roundSub.textContent = youWon
    ? 'The kitchen bows. Somebody get this chef a drink.'
    : winner
      ? 'You still have crusts in hand. Rematch?'
      : 'Nobody finished the pie. Awkward.';

  if (el.dialog) el.dialog.classList.toggle('is-win', Boolean(youWon));

  renderReceipts(snapshot, staged);

  el.btnNextRound.hidden = !snapshot.isHost;
  el.btnToLobby.hidden = !snapshot.isHost;
  el.roundWait.textContent = snapshot.isHost ? '' : 'Waiting for the host to roll out more dough…';
}

// =============================================================== RECEIPTS ==
/** The footer line, straight off the handoff table. */
function receiptFooter({ won, owed, caught, regular }) {
  if (won) return 'ON THE HOUSE';
  if (regular) return `“${regular.line}”`;
  if (caught >= 2) return 'WE HEARD NOTHING';
  if (owed >= 12) return 'PLEASE SETTLE UP FRONT';
  if (owed >= 6) return 'NO REFUNDS';
  return 'GRAZIE · COME AGAIN';
}

function receiptLine(label, amount, flavour) {
  const row = document.createElement('div');
  row.className = flavour ? `receipt__line receipt__line--${flavour}` : 'receipt__line';
  const text = document.createElement('span');
  text.textContent = label;
  const cost = document.createElement('span');
  cost.textContent = String(amount);
  row.append(text, cost);
  return row;
}

/** One player's bill, printed on cream paper. */
function buildReceipt(snapshot, view, seat, index, anchovyLover, staged) {
  const bill = (ui.tab && ui.tab.bills.get(seat.id)) || freshBill();
  const player = view.players.find((p) => p.id === seat.id);
  const won = view.winnerId === seat.id;
  const regular = seat.isBot && !won ? regularByName(seat.name) : null;

  const paper = document.createElement('li');
  paper.className = 'receipt';
  if (won) paper.classList.add('is-winner');
  if (seat.id === snapshot.youId) paper.classList.add('is-you');
  // Receipts print left to right, 120ms apart.
  if (staged && wantsMotion()) paper.style.transitionDelay = `${180 + index * 120}ms`;

  const brand = document.createElement('span');
  brand.className = 'receipt__brand';
  brand.append(document.createTextNode('ZA! PIZZERIA'), document.createElement('br'),
    document.createTextNode('THANK YOU'));

  const who = document.createElement('span');
  who.className = 'receipt__who';
  const place = snapshot.seats.findIndex((s) => s.id === seat.id) + 1;
  const desk = seat.isBot ? 'CPU' : `SEAT ${place}`;
  who.textContent = `${seat.name}${seat.id === snapshot.youId ? ' (you)' : ''} · ${desk}`;

  paper.append(brand, who);

  const items = document.createElement('div');
  items.className = 'receipt__items';

  if (bill.played) items.append(receiptLine('CARDS PLAYED', bill.played));
  // The winner pays for nothing, so nothing they were charged is itemised
  // either. A bill of costs over a total of zero would only read as a mistake.
  if (!won) {
    if (bill.extra) items.append(receiptLine(`${bill.extra} EXTRA TOPPINGS`, bill.extraCost));
    if (bill.whole) items.append(receiptLine(`${bill.whole} WHOLE PIE EATEN`, bill.wholeCost));
    if (bill.caught) {
      items.append(receiptLine(`FORGOT TO SHOUT ×${bill.caught}`, bill.caughtCost, 'bad'));
    }
    if (bill.dead) items.append(receiptLine('DREW ON A DEAD TURN', bill.dead));
  }
  if (bill.anchovy) items.append(receiptLine(`ANCHOVY PLAYED ×${bill.anchovy}`, '—'));
  if (anchovyLover) items.append(receiptLine('ANCHOVY LOVER', '0', 'badge'));
  items.append(receiptLine('ROUNDS WON', seat.wins));
  if (!items.children.length) items.append(receiptLine('NOTHING ON THE TAB', '—'));
  paper.append(items);

  const total = document.createElement('div');
  total.className = 'receipt__total';
  const owedLabel = document.createElement('span');
  owedLabel.textContent = 'OWED';
  const owedValue = document.createElement('span');
  owedValue.textContent = String(won ? 0 : bill.owed);
  total.append(owedLabel, owedValue);
  paper.append(total);

  const foot = document.createElement('span');
  foot.className = 'receipt__foot';
  foot.textContent = receiptFooter({ won, owed: bill.owed, caught: bill.caught, regular });
  paper.append(foot);

  // A player who left mid-round has no hand left to speak of; say so rather
  // than printing a bill that looks paid.
  if (player && player.left) {
    const gone = document.createElement('span');
    gone.className = 'receipt__foot receipt__foot--gone';
    gone.textContent = 'WALKED OUT';
    paper.append(gone);
  }
  return paper;
}

/**
 * The round-over dialog: one receipt per player. Yours prints first, on every
 * screen size, so the punchline lands on your own bill.
 */
function renderReceipts(snapshot, staged) {
  const view = snapshot.game;
  const inRound = new Set(view.players.map((p) => p.id));
  const seats = snapshot.seats.filter((s) => inRound.has(s.id));
  const mine = seats.filter((s) => s.id === snapshot.youId);
  const others = seats.filter((s) => s.id !== snapshot.youId);
  const order = [...mine, ...others];

  // The ANCHOVY LOVER badge goes to whoever played the most of them. A tie is
  // nobody's badge: three people holding it says nothing about any of them.
  const counts = order.map((s) => ((ui.tab && ui.tab.bills.get(s.id)) || freshBill()).anchovy);
  const most = Math.max(0, ...counts);
  const alone = counts.filter((n) => n === most).length === 1;

  const papers = new DocumentFragment();
  order.forEach((seat, index) => {
    const lover = most > 0 && alone && counts[index] === most;
    papers.append(buildReceipt(snapshot, view, seat, index, lover, staged));
  });

  el.scoreboard.className = 'receipts';
  el.scoreboard.classList.toggle('receipts--many', order.length > 3);
  el.scoreboard.replaceChildren(papers);
  if (el.dialog) el.dialog.classList.add('dialog--receipts');
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

/**
 * Reads a new snapshot as a diff against the last one and flies cards for the
 * moves other players made: their played card travels from their seat to the
 * oven, and drawn cards (a routine draw or a penalty) travel from the dough
 * pile to their seat. Your own moves already fly from the hand handlers, so
 * they are excluded here.
 */
function animateTableDiff(snapshot, view) {
  const counts = new Map();
  for (const p of view.players) counts.set(p.id, p.cardCount);

  // The same diff the effects read: who took cards, and whose hand shrank.
  // Published before anything draws, so the pile, the seats and the call-out
  // windows all reason about one picture of the turn.
  ui.gained = new Map();
  ui.playedById = null;
  // A call-out never touches the discard pile. That is the only thing that
  // tells a catch apart from eating an Extra Toppings: both hand exactly two
  // cards to the same player and clear their vulnerable flag.
  ui.topChanged = (view.topCard ? view.topCard.id : null) !== ui.prevTopId;
  for (const p of view.players) {
    const before = ui.prevCounts.get(p.id);
    if (before === undefined) continue;
    if (p.cardCount > before) ui.gained.set(p.id, p.cardCount - before);
    else if (p.cardCount < before && !ui.playedById) ui.playedById = p.id;
  }

  const ready =
    wantsMotion() &&
    ui.prevStatus === 'playing' &&
    view.status === 'playing' &&
    ui.prevTopId !== null;

  if (ready) {
    // An opponent's play: the top card changed and their hand shrank.
    if (view.topCard && view.topCard.id !== ui.prevTopId) {
      const player = view.players.find(
        (p) => p.id !== snapshot.youId && (ui.prevCounts.get(p.id) ?? 0) > p.cardCount
      );
      const seat = player && ui.seatNodes.get(player.id);
      if (seat) {
        flyBetween(
          renderCard(view.topCard, { size: 'pile' }),
          cardMetrics(seat),
          cardMetrics(el.discardSlot),
          (Math.random() * 10 - 5).toFixed(1)
        );
      }
    }

    // Opponents' draws: card backs leave the pile for the seat, one by one.
    for (const p of view.players) {
      if (p.id === snapshot.youId) continue;
      const before = ui.prevCounts.get(p.id);
      if (before === undefined || p.cardCount <= before) continue;
      const seat = ui.seatNodes.get(p.id);
      if (!seat) continue;
      const flights = Math.min(p.cardCount - before, 4);
      for (let i = 0; i < flights; i++) {
        setTimeout(() => {
          if (!seat.isConnected) return;
          flyBetween(cardBack(), cardMetrics(el.drawSlot), cardMetrics(seat), -6);
        }, i * 90);
      }
    }
  }

  ui.prevTopId = view.topCard ? view.topCard.id : null;
  ui.prevCounts = counts;
  ui.prevStatus = view.status;
}

/** A Burnt Slice sends three wisps of smoke up off the oven. */
function puffSmoke() {
  const pile = el.discardSlot.closest('.pile');
  if (!pile) return;
  for (let i = 0; i < 3; i++) {
    const wisp = document.createElement('span');
    wisp.className = 'smoke-wisp';
    wisp.setAttribute('aria-hidden', 'true');
    wisp.style.setProperty('--wx', `${(i - 1) * 14}px`);
    wisp.style.animationDelay = `${i * 90}ms`;
    pile.append(wisp);
    setTimeout(() => wisp.remove(), 950 + i * 90);
  }
}

/**
 * The Whole Pie +4 heats the whole room for a moment: a warm edge glow. The
 * `chain` variant is the fourth-link cabinet flash from README 4A — same
 * one-shot, cheese instead of sauce.
 */
function flashTable(variant) {
  const host = document.querySelector('.screen--game');
  if (!host) return;
  const flash = document.createElement('div');
  flash.className = variant ? `table-flash table-flash--${variant}` : 'table-flash';
  flash.setAttribute('aria-hidden', 'true');
  host.append(flash);
  setTimeout(() => flash.remove(), 800);
}

// ================================================================ EFFECTS ===
/**
 * Everything a newly landed top card sets off. It is called once per card that
 * actually lands — never for the round's opening flip, and never when a wild
 * only repaints the current topping.
 *
 * Sound is deliberately outside the reduced-motion guards: a cue is not
 * motion. What each cue rides on is noted at the call.
 */
function onCardLanded(view, top) {
  const motion = wantsMotion();

  // A · one link of the chain.
  if (ui.chain >= 1) {
    setOvenStep(Math.min(ui.chain, 4));
    // Rides the landing slam and the oven brightening a step.
    sound.play('coin-blip', ui.chain);
    if (motion) shakeFrame();
    if (ui.chain >= 2) stampCombo(ui.chain);
    if (ui.chain >= 4 && motion) flashTable('chain');
    // "If nobody counters, no run — just the thud." A lone +2 resolves without
    // one; only a real chain that landed on somebody gets the descent.
    const gotSomebody = [...ui.gained.values()].some((n) => n > 0);
    if (ui.chain >= 2 && gotSomebody) {
      setTimeout(() => sound.play('descend-run'), 380);
    }
  } else {
    setOvenStep(0);
  }

  // E · burnt slice. Smoke off the oven plus the greyed-out seat carry it.
  if (top.kind === 'skip') {
    if (motion) puffSmoke();
    stampSkippedSeat(view);
    sound.play('sizzle-buzz');
  }

  // The +4's own heat flash, unless the chain already lit the cabinet.
  if (top.kind === 'wild4' && motion && ui.chain < 4) flashTable();

  // 6C · the room has opinions about anchovies.
  if (!isWild(top) && top.suit === 'anchovy') anchovyLanded(view, top);
}

/** A · the oven bloom brightens one step per link, and drops back on reset. */
function setOvenStep(step) {
  const centre = document.querySelector('.table-center');
  if (centre) centre.style.setProperty('--oven-step', String(step));
}

/**
 * A · four pixels, two frames, and out. The three rows of the game screen move
 * together; `.fly-layer` is left alone on purpose, because it is `position:
 * fixed` and a transform on its ancestor would re-anchor cards in flight.
 */
function shakeFrame() {
  const host = document.querySelector('.screen--game');
  if (!host) return;
  host.classList.remove('is-shaking');
  void host.offsetWidth; // restart the shake if two links land back to back
  host.classList.add('is-shaking');
  setTimeout(() => host.classList.remove('is-shaking'), 160);
}

/** A · the combo stamp, top-right of the oven, from the second link on. */
function stampCombo(link) {
  const pile = el.discardSlot.closest('.pile');
  if (!pile) return;
  const stamp = document.createElement('span');
  stamp.className = 'combo-stamp';
  stamp.setAttribute('aria-hidden', 'true');
  stamp.textContent = `x${link}`;
  pile.append(stamp);
  requestAnimationFrame(() => stamp.classList.add('is-on'));
  setTimeout(() => stamp.classList.remove('is-on'), 760);
  setTimeout(() => stamp.remove(), 1000);
}

/**
 * E · greys the skipped seat for 400ms and stamps SKIPPED over it.
 *
 * The server has already advanced two seats by the time this snapshot arrives,
 * so the player who lost their turn is exactly one seat back from whoever is
 * on now, against the current direction.
 */
function stampSkippedSeat(view) {
  const players = view.players.filter((p) => !p.left);
  const now = players.findIndex((p) => p.id === view.turnPlayerId);
  if (now === -1 || players.length < 2) return;
  const back = (now - view.direction + players.length * 2) % players.length;
  const seat = ui.seatNodes.get(players[back].id);
  // If the skipped player is you there is no chef panel to stamp. The smoke
  // off the oven and the log line still say what happened.
  if (!seat) return;

  seat.classList.add('is-skipped');
  const stamp = document.createElement('span');
  stamp.className = 'seat__stamp';
  stamp.setAttribute('aria-hidden', 'true');
  stamp.textContent = 'SKIPPED';
  seat.append(stamp);
  requestAnimationFrame(() => stamp.classList.add('is-on'));
  setTimeout(() => {
    seat.classList.remove('is-skipped');
    stamp.classList.remove('is-on');
  }, 400);
  setTimeout(() => stamp.remove(), 640);
}

/**
 * 6C · the anchovy problem. Client-side only; the server never learns that the
 * crowd has opinions.
 *
 * The escalation runs per round: one polite voice, then the whole room, then a
 * slow clap on top, and from the fourth anchovy on — nothing at all. The
 * silence is the joke, so a fourth anchovy gets no stamp and no sound.
 */
function anchovyLanded(view, top) {
  ui.anchovyCount++;
  const level = ui.anchovyCount;
  if (level > 3) return;

  const life = [1200, 1500, 1700][level - 1];
  sound.play('boo', level);
  if (level === 3) setTimeout(() => sound.play('slow-clap'), 180);

  const pile = el.discardSlot.closest('.pile');
  if (pile) {
    const stamp = document.createElement('span');
    stamp.className = 'anchovy-stamp';
    stamp.setAttribute('aria-hidden', 'true');
    stamp.textContent = level >= 2 ? 'BOOOOOOO' : 'BOOOOO';
    pile.append(stamp);
    // Frame 2 at 120ms: the card lands clean first, then the room reacts.
    setTimeout(() => stamp.classList.add('is-on'), 120);
    setTimeout(() => stamp.classList.remove('is-on'), life);
    setTimeout(() => stamp.remove(), life + 300);
  }

  // The shove is the only part reduced motion drops; the stamp cross-fades
  // in place either way, so the gag never depends on movement or on sound.
  if (wantsMotion()) {
    const host = document.querySelector('.screen--game');
    if (host) {
      setTimeout(() => {
        host.classList.add('is-shoved');
        setTimeout(() => host.classList.remove('is-shoved'), 200);
      }, 120);
    }
  }

  // Frame 3 at 520ms: one line in the log, and it is over.
  setTimeout(() => logAside(anchovyLine(view, top)), 520);
}

function anchovyLine(view, top) {
  const player = ui.playedById && view.players.find((p) => p.id === ui.playedById);
  const who = player ? player.name : 'Somebody';
  return `> ${who.toUpperCase()} PLAYS ${describeCard(top).toUpperCase()}. THE ROOM DISAGREES.`;
}

/**
 * Adds a client-side line to the kitchen chatter. The server's log is keyed by
 * id and read in renderLog; this writes straight to the list and never touches
 * `ui.lastLogId`, so the two cannot collide.
 */
function logAside(text) {
  const item = document.createElement('li');
  item.className = 'log__entry';
  item.textContent = text;
  el.logList.append(item);
  while (el.logList.children.length > 40) el.logList.firstElementChild.remove();
  el.logList.scrollTop = el.logList.scrollHeight;
}

/** The played card travels from the hand into the oven. */
function flyToDiscard(sourceNode) {
  flyBetween(
    sourceNode,
    cardMetrics(sourceNode),
    cardMetrics(el.discardSlot),
    (Math.random() * 10 - 5).toFixed(1)
  );
  // D · the flight steps five times, so five blips are scheduled across it —
  // one per visible jump, not one per frame. Only your own card gets them: a
  // four-card penalty flying in would otherwise be twenty blips.
  if (!wantsMotion()) return;
  for (let i = 0; i < 5; i++) {
    setTimeout(() => sound.play('flight-blip', i), (i * D_FLY) / 5);
  }
}

/**
 * A drawn card travels from the dough pile into its place in the hand, and
 * turns over on the way: it leaves as a card back and lands face up, so the
 * reveal happens mid-air instead of at the end.
 */
function flyFromDrawPile(slot, startDelay) {
  if (!wantsMotion()) return;
  const launch = () => {
    if (!slot.isConnected) return;
    flyFlip(slot.firstElementChild, cardMetrics(el.drawSlot), cardMetrics(slot));
  };
  // One frame of slack lets the fan finish respacing before the target is read.
  if (startDelay > 0) setTimeout(launch, startDelay);
  else requestAnimationFrame(launch);
}

/**
 * Like flyBetween, but the traveller is a two-sided card that rotates 180° in
 * flight: back showing at launch, face showing on landing. The face is a clone
 * of the real card that will take over at the destination.
 */
function flyFlip(faceNode, from, to) {
  if (!from || !to || !from.w || !to.w) return;

  const wrap = document.createElement('div');
  wrap.className = 'fly-card fly-card--flip';
  wrap.setAttribute('aria-hidden', 'true');

  const back = cardBack().cloneNode(true);
  back.classList.add('flip-side', 'flip-side--back');

  const face = faceNode.cloneNode(true);
  face.classList.remove('is-playable', 'is-dimmed', 'is-pressed', 'is-leaving');
  face.removeAttribute('disabled');
  face.classList.add('flip-side', 'flip-side--face');

  wrap.append(back, face);
  wrap.style.left = `${(from.cx - from.w / 2).toFixed(1)}px`;
  wrap.style.top = `${(from.cy - from.h / 2).toFixed(1)}px`;
  wrap.style.width = `${from.w}px`;
  wrap.style.height = `${from.h}px`;
  wrap.style.setProperty('--card-w', `${from.w}px`);
  el.flyLayer.append(wrap);

  const dx = to.cx - from.cx;
  const dy = to.cy - from.cy;
  const scale = to.w / from.w;

  requestAnimationFrame(() => {
    wrap.style.transform =
      `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) scale(${scale.toFixed(3)}) rotateY(180deg)`;
    wrap.style.opacity = '0.001';
  });
  setTimeout(() => wrap.remove(), D_FLY + 140);
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
  if (ui.roster) hide(ui.roster.panel);
  ui.pendingWild = null;
}

/** True while any popover, including the hire roster, is on screen. */
function popoverOpen() {
  return (
    el.picker.classList.contains('is-open') ||
    el.calloutPop.classList.contains('is-open') ||
    Boolean(ui.roster && ui.roster.panel.classList.contains('is-open'))
  );
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
    const emblem = suitIcon(key, 'ico--plate');
    const label = document.createElement('span');
    label.textContent = meta.label;
    button.append(emblem, label);
    button.addEventListener('click', () => {
      const pending = ui.pendingWild;
      closePopovers();
      // H · the ding rides the IN PLAY badge recolouring.
      sound.play('confirm-ding');
      if (pending) commitPlay(pending.card, key, pending.slot);
    });
    buttons.append(button);
  }
  el.pickerGrid.replaceChildren(buttons);

  // The popover grows out of the card that opened it.
  const cardRect = slot.getBoundingClientRect();
  show(el.picker);
  sound.play('menu-blip'); // H · rides the 2x2 grid entering at 0.97
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

// -------------------------------------------------------- B · the shout ----
/**
 * Three frames over 150ms — small, huge, settled — with a pixel starburst
 * behind the middle frame only. It fires from the ZA! button, not the centre
 * of the screen, because the shout is yours.
 *
 * The timing score is measured from the moment the shout became legal, which
 * is the transition of `canDeclareZa` in the snapshot. The kit measures from
 * "playing the card"; the client never observes that instant for the play that
 * armed the button, and the wire protocol is not ours to extend, so this is
 * the nearest honest reference point. `TOO SLOW` is not implemented at all: a
 * missed window is never a button press, and the FORGOT! badge and the call-out
 * penalty already narrate it.
 */
function playShout() {
  sound.play('power-up'); // rides the button slam and the starburst
  const bar = el.btnZa.closest('.hand-bar');
  if (!bar) return;

  const barRect = bar.getBoundingClientRect();
  const btnRect = el.btnZa.getBoundingClientRect();
  bar.style.setProperty('--bx', `${(btnRect.left + btnRect.width / 2 - barRect.left).toFixed(0)}px`);
  bar.style.setProperty('--by', `${(btnRect.top + btnRect.height / 2 - barRect.top).toFixed(0)}px`);

  el.btnZa.classList.remove('is-shouting');
  void el.btnZa.offsetWidth; // restart the slam on a second shout
  el.btnZa.classList.add('is-shouting');
  setTimeout(() => el.btnZa.classList.remove('is-shouting'), 220);

  if (wantsMotion()) {
    const burst = document.createElement('span');
    burst.className = 'za-burst';
    burst.setAttribute('aria-hidden', 'true');
    bar.append(burst);
    setTimeout(() => burst.remove(), 280);
  }

  const armed = ui.shoutArmedAt;
  ui.shoutArmedAt = 0;
  if (!armed) return;
  const perfect = Date.now() - armed < 800;
  const score = document.createElement('span');
  score.className = perfect ? 'shout-score' : 'shout-score shout-score--ok';
  score.setAttribute('aria-hidden', 'true');
  score.textContent = perfect ? 'PERFECT! +500' : 'OK +100';
  bar.append(score);
  requestAnimationFrame(() => score.classList.add('is-on'));
  setTimeout(() => score.classList.remove('is-on'), 780);
  setTimeout(() => score.remove(), 1020);
}

// ---------------------------------------------------------- sound toggle ----
/**
 * The cabinet's volume knob. Built here rather than in index.html so the
 * markup keeps exactly the ids it has. Nothing in the game is communicated by
 * sound alone, so muting costs the player nothing but the noise.
 */
function buildMuteToggle() {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'btn btn--quiet btn--sm hud__mute';
  button.setAttribute('aria-label', 'Cabinet sound');
  button.addEventListener('click', () => {
    sound.muted = !sound.muted;
    paintMuteToggle();
    // The blip is the confirmation that sound is back; the label is the
    // confirmation either way.
    if (!sound.muted) sound.play('menu-blip');
  });
  ui.btnMute = button;
  paintMuteToggle();
  el.btnLeaveGame.parentNode.insertBefore(button, el.btnLeaveGame);
}

function paintMuteToggle() {
  const button = ui.btnMute;
  if (!button) return;
  const on = !sound.muted;
  button.textContent = on ? 'SND ON' : 'SND OFF';
  button.setAttribute('aria-pressed', String(on));
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
el.btnAddBot.addEventListener('click', () => {
  if (!ui.snapshot) return;
  if (ui.roster && ui.roster.panel.classList.contains('is-open')) {
    closePopovers();
    return;
  }
  openRoster(ui.snapshot);
});
el.btnStart.addEventListener('click', () => send({ type: 'startGame' }));
el.btnLeaveLobby.addEventListener('click', () => send({ type: 'leaveRoom' }));
el.btnLeaveGame.addEventListener('click', () => send({ type: 'leaveRoom' }));

el.drawPile.addEventListener('click', () => {
  if (el.drawPile.disabled) return;
  send({ type: 'draw' });
  // G · rides the pile dropping 3px and the card flying into the hand.
  sound.play('card-snap');
});

el.btnPass.addEventListener('click', () => send({ type: 'pass' }));
el.btnZa.addEventListener('click', () => {
  if (el.btnZa.disabled) return;
  send({ type: 'za' });
  playShout();
});
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
  if (!popoverOpen()) return;
  if (event.target.closest('.popover, .card, .btn--callout, #btn-add-bot')) return;
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

  // Swap the emoji fallbacks in the static markup for the parlour icon set.
  for (const holder of document.querySelectorAll('[data-icon]')) {
    const drawn = icon(holder.dataset.icon);
    holder.classList.add('ico');
    holder.replaceChildren(...drawn.childNodes);
  }
  buildMuteToggle();

  const saved = localStorage.getItem('za.name');
  if (saved) el.inputName.value = saved;

  const code = new URLSearchParams(location.search).get('code');
  if (code) el.inputCode.value = code.toUpperCase();

  el.inputName.focus({ preventScroll: true });
  net.connect();
}

boot();
