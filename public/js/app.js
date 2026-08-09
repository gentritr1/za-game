/**
 * Za client.
 *
 * The server owns the game. This file only draws the state it receives and
 * sends the player's intent back. It never decides if a move is legal.
 */

import { Connection } from './net.js';
import {
  renderCard,
  isWild,
  describeCard,
  suitToken,
  cardIndex,
  TOPPING_META,
  TOPPING_ORDER,
  SPRITE_DIR,
} from './cards.js';
import { icon, suitIcon } from './icons.js';
import { sound } from './sounds.js';

// ---------------------------------------------------------------- elements --
const $ = (id) => document.getElementById(id);

const el = {
  app: $('app'),
  shell: document.querySelector('.shell'),
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
  turnCount: $('turn-count'),
  turnWarn: $('turn-warn'),
  dirChase: $('dir-chase'),
  dirAnnounce: $('dir-announce'),
  btnLeaveGame: $('btn-leave-game'),
  btnLeaveGameLabel: $('btn-leave-game-label'),
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
  handPit: $('hand-pit'),
  handNear: $('hand-near'),
  handPeek: $('hand-peek'),
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
  // house rules
  rulesOverlay: $('overlay-rules'),
  rulesDialog: $('rules-dialog'),
  rulesBody: $('rules-body'),
  btnRulesClose: $('btn-rules-close'),
  btnRulesHome: $('btn-rules-home'),
  btnRulesLobby: $('btn-rules-lobby'),
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
  handSlots: new Map(), // cardId -> slot element, moved between rails, never rebuilt
  handCards: new Map(), // cardId -> card data, so the peek can draw one full size
  handOrder: [], // the sorted hand as card ids, so a promotion lands in its place
  nearRow: [], // the near rail as last laid out, for a resize to re-space it
  peekPointer: -1, // the pointer id currently scrubbing the pit, or -1
  peekCardId: null, // which rib the peek is showing
  pitGeom: null,    // the strip's geometry, measured once per scrub session
  seatNodes: new Map(), // playerId -> seat element
  belt: null, // 2B · the conveyor under the queue, built once
  token: null, // 2A · the chevron that walks the counter, built once
  tokenTurnTimer: 0,
  queuePlaced: false, // 2B · true once the strip has laid out at least once
  queueSlideTimer: 0,
  gameId: null,
  lastLogId: -1,
  // The connected-idle turn clock, held locally so the digits keep moving
  // between snapshots. A deadline in this tab's own time, never the server's.
  idleDeadline: 0,
  idleWarnMs: 0,
  idleTimer: 0,
  // 03 · the leave screw, waiting for the second press.
  leaveArmed: false,
  leaveTimer: 0,
  pendingWild: null, // { cardId, sourceEl }
  toastTimer: 0,
  copyTimers: new WeakMap(),
  dealing: false, // true for the first hand render of a round
  roundFocusReturn: null,
  // Focus, and where it has to go back to. `popoverReturn` is whatever opened
  // the picker, the call-out list or the hire roster; `focusIntent` is the
  // action whose landing place is only built when the next snapshot arrives.
  announcer: null, // the shared visually-hidden live region
  popoverReturn: null,
  focusIntent: null, // { kind: 'play' | 'draw', cardId }
  keyboardActive: false, // the last input was a key, not a pointer
  roster: null, // the hire panel, built once on first use
  // THE HOUSE RULES: the body is static, so it is built on the first open and
  // kept; the screw is built at boot like the sound one.
  rulesBuilt: false,
  rulesFocusReturn: null,
  btnRules: null,
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
  prevTopping: null, // 11 · the topping the oven last rang for
  chain: 0, // consecutive +2/+4 tops, the visual ladder of README 4A
  anchovyCount: 0, // anchovies this round, for the 6C escalation
  callouts: new Map(), // playerId -> { node, mine }
  calloutBeeps: [],
  shoutArmedAt: 0, // when the shout became legal, for the timing score
  dirJustFlipped: false,
  btnMute: null,
  muteLabel: null,
  // ---- juice & retention (tiles 01-14). All client-side, none of it a rule.
  booted: false, // 14 · the first paint never gets a shutter
  shutter: null, // 14 · the corrugated screen-change cover
  shutterSwap: null,
  shutterRunning: false,
  shutterSwapped: false,
  shutterGen: 0,      // which roll owns the node; older callbacks no-op
  shutterTimers: [],  // that roll's own timers, cleared when it is superseded
  breatheTimer: 0, // 01 · re-arms the idle hand once entries have landed
  entrySettleAt: 0, // when the newest wave of cards finishes arriving
  nudgeTimer: 0, // 04 · the 5s inactivity clock
  nudgeOffTimer: 0,
  nudgeArmed: false,
  nicknames: new Map(), // 13 · name -> { title, tone }, session-scoped
  wall: null, // 12 · the polaroid wall, kept between lobby renders
  wallCards: new Map(), // seatId -> polaroid
  // ---- 1A · the literal cabinet. Panels are built and dropped by width, so
  // the last snapshot is kept to redraw them from on a resize.
  cabSnapshot: null,
  cabPanels: null, // { left, right, fame, special } while they exist
  cabPlaque: null, // the win plaque, while a round is over
  chainTotal: 0, // cards the current run has forced, for the running total
  chainNode: null,
  chainTotalNode: null,
  turnMoment: null, // which of the marquee's three moments is showing
  prevDeclared: new Map(), // playerId -> declaredZa last snapshot
  shoutNode: null,
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

const D_FLY = cssTime('--d-mid', 220); // matches .fly-card
const D_ENTER = cssTime('--d-mid', 220); // matches .card
const EASE_OUT =
  getComputedStyle(document.documentElement).getPropertyValue('--ease-out').trim() ||
  'cubic-bezier(0.23, 1, 0.32, 1)';

/**
 * Restarts a class-driven keyframe animation.
 *
 * The old idiom for this was `classList.remove(x); void el.offsetWidth;
 * classList.add(x)`, which restarts the animation by forcing a synchronous
 * layout of the whole document. Nothing here needs layout: if the class is
 * already on, rewinding the running animation to zero is the same restart for
 * the price of a style flush, and if it is not on yet the class alone starts
 * it and there is nothing to flush at all.
 *
 * `name` narrows the rewind to one animation, because `getAnimations()` also
 * returns anything running on the element's pseudo-elements.
 */
function restartAnimation(node, className, name) {
  if (!node.classList.contains(className)) {
    node.classList.add(className);
    return;
  }
  if (typeof node.getAnimations !== 'function') return;
  for (const running of node.getAnimations()) {
    if (!name || running.animationName === name) running.currentTime = 0;
  }
}

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

/**
 * Every outgoing message goes through here. `net.send` returns false when it
 * dropped the message — the socket is down, or the seat is not synchronized
 * yet — and a dropped click has to be visible or the player just presses
 * harder. The board is inert in that state, so in practice this only fires for
 * the home screen's own buttons and for a keyboard shortcut that slipped past.
 */
function send(payload) {
  if (net.send(payload)) return true;
  toast(
    net.state === 'joining'
      ? 'Still taking your seat back. One second.'
      : 'No line to the kitchen yet. Hold on.'
  );
  return false;
}

const CONN_FIRST = 'Knocking on the kitchen door…';
const CONN_BACK = 'Lost the kitchen. Getting you back to your seat…';

/**
 * The banner and the inert board are one signal, driven by the connection's
 * own state machine. An open socket used to hide the banner on its own, while
 * the rejoin was still in flight and the board below it was a memory of a
 * round that may already be over. Now only `synchronized` clears it.
 *
 * The line splits on whether there is a seat to get back to, not on which
 * state we are in: a drop walks disconnected → connecting → joining, and
 * three different sentences over one reconnect would read as three faults.
 */
function handleStatus(status) {
  if (status === 'closed') return; // the player left on purpose
  if (status === 'synchronized') {
    hide(el.connBanner);
  } else {
    el.connBannerText.textContent = net.credentials ? CONN_BACK : CONN_FIRST;
    show(el.connBanner);
  }
  syncDesynced();
}

/**
 * Freezes the table while this client is not synchronized. One class does it:
 * the CSS blanks pointer input across the play column, and the action buttons
 * are disabled outright so the keyboard cannot reach them either. The banner
 * is outside the screen, so it keeps saying why.
 */
function syncDesynced() {
  const stale = !net.synchronized;
  for (const screen of el.screens) {
    if (screen.dataset.screen === 'home') continue;
    screen.classList.toggle('is-desynced', stale);
  }
  // The round-over dialog is a sibling of the screens, not a child, so the
  // frozen screen does not cover it. Nothing else owns `disabled` on these two,
  // so this sets it both ways rather than waiting for a snapshot to undo it.
  for (const button of [el.btnNextRound, el.btnToLobby]) {
    if (button) button.disabled = stale;
  }
  if (!stale) return; // the `state` that unfroze us re-enables the rest
  for (const button of [el.btnPass, el.btnZa, el.btnCallout, el.drawPile]) {
    if (button) button.disabled = true;
  }
  // A turn clock counted off a snapshot we no longer trust is a lie. The next
  // snapshot brings the real remaining time with it.
  clearInterval(ui.idleTimer);
  ui.idleTimer = 0;
  ui.idleDeadline = 0;
  paintIdleCountdown();
  // An armed screw across a dropped line would forfeit the round on the press
  // that was only meant to ask. It starts again from Leave.
  disarmLeave();
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

/**
 * There are two modals now, and only one `#app` to hide behind them. A modal
 * lives outside `#app` and makes it inert; whoever closes last is the one that
 * gives the app back, so the flag is derived from what is open rather than
 * written by each dialog in turn.
 */
function syncAppInert() {
  el.app.inert =
    el.overlay.classList.contains('is-open') || el.rulesOverlay.classList.contains('is-open');
}

/** The dialog that owns the tab order right now. Null when neither is open. */
function openModal() {
  if (el.rulesOverlay.classList.contains('is-open')) return el.rulesDialog;
  if (el.overlay.classList.contains('is-open')) return el.dialog;
  return null;
}

function openRoundOverlay() {
  if (el.overlay.classList.contains('is-open')) return;
  // The round is the news; the rules can wait. Its focus is not returned,
  // because this dialog is about to claim focus for itself.
  closeRules(false);
  ui.roundFocusReturn = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  show(el.overlay);
  syncAppInert();
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
  syncAppInert();
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

// ------------------------------------------------------- the announcer ----
/**
 * One visually-hidden live region, for the things this cabinet says in
 * pictures.
 *
 * Every live region already on the page is spoken for. The toast is
 * `assertive` and visible, so it cannot carry a quiet confirmation without
 * putting a banner on the screen for it. The marquee is the turn state and
 * nothing else may write there. And the kitchen chatter log is `display: none`
 * below 620px of window — a live region that is not displayed announces
 * nothing at all, which is exactly the height where a player most needs it.
 * So: one node, built once, shared by everything that has to be heard rather
 * than seen.
 */
function announcerNode() {
  if (ui.announcer) return ui.announcer;
  const node = document.createElement('p');
  node.className = 'sr-only';
  node.setAttribute('role', 'status');
  node.setAttribute('aria-live', 'polite');
  document.body.append(node);
  ui.announcer = node;
  return node;
}

/**
 * Says one line to a screen reader.
 *
 * The same string written twice running is not re-read by every reader, so a
 * repeat goes in with a trailing space. It is the same sentence to a listener
 * and a different string to the live region.
 */
function announce(text) {
  if (!text) return;
  const node = announcerNode();
  node.textContent = node.textContent === text ? `${text} ` : text;
}

function paintScreen(name) {
  ui.screen = name;
  for (const screen of el.screens) {
    const active = screen.dataset.screen === name;
    screen.classList.toggle('is-active', active);
    screen.inert = !active;
  }
  // 1A · the cabinet only exists around the play column. Home and lobby float
  // in the void on a transparent screen, so panels left standing would show
  // straight through them.
  syncCabinet();
  landOnScreen(name);
}

/**
 * A room change has to take focus with it.
 *
 * Without this, walking lobby -> game leaves focus on the button that started
 * the game — inside a screen that is `inert` a frame later — and the next Tab
 * begins again at the top of the document, four rooms away from the table.
 *
 * The landing place is the screen section itself. It already carries the room's
 * name as its `aria-label` ("Start", "Lobby", "Game table"), so a screen reader
 * is told where it now is before it is told what is on the table, and no
 * heading has to be invented to hold the focus. The first paint is left alone:
 * `boot` puts the player in the name field, which is a better landing than the
 * room's name for the one room they did not walk into.
 */
function landOnScreen(name) {
  if (!ui.booted) return;
  // The round-over dialog owns focus for as long as it is up, and hands it back
  // itself. A screen repaint underneath it must not reach in and take it.
  if (el.overlay.classList.contains('is-open')) return;
  const screen = el.screens.find((node) => node.dataset.screen === name);
  if (screen) screen.focus({ preventScroll: true });
}

/**
 * 14 · the shutter wipe. A screen change is the parlour pulling its roller
 * shutter down, swapping the room behind it, and rolling it back up. The swap
 * happens while the shutter covers the frame, so the existing 170ms cross-fade
 * is never seen half-done.
 *
 * `ui.screen` is claimed immediately, not when the swap lands: a second screen
 * change arriving mid-roll retargets the covered swap rather than queueing a
 * second shutter on top of the first.
 */
function showScreen(name) {
  if (ui.screen === name) return;
  // The first paint has no previous room to hide, and reduced motion keeps the
  // plain cross-fade the stylesheet already draws.
  if (!ui.booted || !wantsMotion()) {
    paintScreen(name);
    return;
  }
  ui.screen = name;
  rollShutter(() => paintScreen(name));
}

const SHUTTER_MS = 420;

/** Built here, not in index.html, so the markup keeps exactly the ids it has. */
function shutterNode() {
  if (ui.shutter) return ui.shutter;
  const node = document.createElement('div');
  node.className = 'shutter';
  // Out of the accessibility tree, out of the tab order, out of the way: it
  // holds no focusable child, so it can never trap focus behind itself.
  node.setAttribute('aria-hidden', 'true');
  const word = document.createElement('span');
  word.className = 'shutter__word';
  word.textContent = 'PROOFING THE DOUGH…';
  node.append(word);
  document.body.append(node);
  ui.shutter = node;
  return node;
}

/**
 * One roll, one generation.
 *
 * Both timers used to be anonymous, so they outlived the roll that booked
 * them. Replayed on the probe: roll 1 covers and swaps, a second screen change
 * starts roll 2, and then roll 1's leftover cleanup timer fires — it stripped
 * `is-rolling` off the shared node, so roll 2's shutter vanished mid-roll, and
 * its `coveredSwap()` ran roll 2's swap with nothing covering the frame. The
 * wrong shutter was removed and the swap it existed to hide was shown.
 *
 * Every roll now claims a generation. A callback from an older one is not the
 * owner of the node any more and does nothing; its timers are cleared outright
 * so the stale work never even runs.
 */
function rollShutter(swap) {
  const node = shutterNode();
  // A roll that has not covered yet can still carry a newer swap. One that
  // already swapped is on its way back up, so a new screen needs its own roll.
  if (ui.shutterRunning && !ui.shutterSwapped) {
    ui.shutterSwap = swap;
    return;
  }
  // Taking the node over: whatever the previous roll still had queued for it
  // is now somebody else's business.
  for (const timer of ui.shutterTimers) clearTimeout(timer);
  ui.shutterTimers.length = 0;
  const gen = ++ui.shutterGen;

  ui.shutterSwap = swap;
  ui.shutterSwapped = false;
  ui.shutterRunning = true;
  restartAnimation(node, 'is-rolling', 'shutter');
  sound.play('tape-scrub'); // rides the shutter itself, nothing else
  // 42% of the roll: the shutter is fully down and the room can change.
  ui.shutterTimers.push(setTimeout(() => {
    if (ui.shutterGen !== gen) return;
    coveredSwap();
  }, Math.round(SHUTTER_MS * 0.42)));
  ui.shutterTimers.push(setTimeout(() => {
    if (ui.shutterGen !== gen) return;
    node.classList.remove('is-rolling');
    ui.shutterRunning = false;
    coveredSwap(); // belt to the braces: a throttled tab must still land it
  }, SHUTTER_MS + 60));
}

function coveredSwap() {
  const swap = ui.shutterSwap;
  ui.shutterSwap = null;
  if (swap) {
    ui.shutterSwapped = true;
    swap();
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
    // The chip flashing "Copied" is the whole confirmation, and it is a
    // picture. Say it as well as show it.
    announce(`Table code ${code} copied.`);
  } catch {
    toast(`Table code: ${code}`);
  }
}

// ------------------------------------------------------- press feedback ----
/**
 * Pressable things answer on pointer-down, not on release.
 *
 * This used to book a fresh pair of `{ once: true }` window listeners per
 * press. `once` only retires the listener that actually fires, so every
 * completed press left its unfired `pointercancel` twin on the window for the
 * rest of the session — measured on the probe: twenty-five press/release
 * cycles left exactly twenty-five live handlers, and one stray cancel ran all
 * of them. The pair also carried no pointer identity, so on a two-finger table
 * lifting one finger released the button the OTHER finger was still holding.
 *
 * Now it is one session per pointer id. At most three window listeners exist
 * at any moment, they are removed the instant the last finger lifts, and a
 * release only ever touches the target that pointer put down.
 */
const PRESS_END = ['pointerup', 'pointercancel', 'lostpointercapture'];
const pressedBy = new Map(); // pointerId -> the element that pointer pressed
let pressWatching = false;

function endPress(event) {
  const target = pressedBy.get(event.pointerId);
  if (!target) return;
  pressedBy.delete(event.pointerId);
  // Two fingers can rest on the same control. It stays pressed until the last
  // of them leaves, which is what the player's hand is actually doing.
  let stillHeld = false;
  for (const other of pressedBy.values()) if (other === target) stillHeld = true;
  if (!stillHeld) target.classList.remove('is-pressed');
  if (pressedBy.size === 0) {
    pressWatching = false;
    for (const type of PRESS_END) window.removeEventListener(type, endPress);
  }
}

document.addEventListener('pointerdown', (event) => {
  const target = event.target.closest(
    '.btn, .screw, .card.is-playable, .code-chip, .topping-btn, .callout-btn, .pile--draw, .seat-row__kick'
  );
  if (!target || target.disabled) return;
  // A repeated down on a live id would strand whatever it was holding.
  if (pressedBy.has(event.pointerId)) endPress(event);
  target.classList.add('is-pressed');
  pressedBy.set(event.pointerId, target);
  if (!pressWatching) {
    pressWatching = true;
    for (const type of PRESS_END) window.addEventListener(type, endPress);
  }
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
    // No restore: the room itself is changing, and `landOnScreen` has a better
    // answer than a card on a screen that is about to go inert.
    closePopovers({ restoreFocus: false });
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
  toppingConfetti();
}

/**
 * 07 · topping confetti. Not generic confetti — the pizza coming apart over
 * the dialog: four pepperoni discs, four cheese shreds, four basil flecks,
 * one pass each and then the nodes are gone. Silent on purpose; the victory
 * jingle is already playing under it.
 */
const FLECK_KINDS = ['is-pepperoni', 'is-cheese', 'is-basil'];

function toppingConfetti() {
  if (!wantsMotion()) return;
  const rect = el.dialog.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  // The tile falls 148px in 1.2s. A receipts dialog can be 740px tall, and
  // falling all of it in the same 1.2s would be 650px/s — five times the
  // board's own speed, which strobes rather than reads. The travel is capped
  // so the pieces stay legible as pepperoni, cheese and basil; they fade out
  // where they stop, so a short dialog and a tall one both look deliberate.
  const fall = Math.max(180, Math.min(Math.round(rect.height + 44), 460));
  const pieces = new DocumentFragment();
  for (let i = 0; i < 12; i++) {
    const fleck = document.createElement('span');
    fleck.className = `topping-fleck ${FLECK_KINDS[i % FLECK_KINDS.length]}`;
    fleck.setAttribute('aria-hidden', 'true');
    fleck.style.left = `${(rect.left + 14 + Math.random() * Math.max(1, rect.width - 28)).toFixed(1)}px`;
    fleck.style.top = `${(rect.top - 18).toFixed(1)}px`;
    fleck.style.setProperty('--fall', `${fall}px`);
    fleck.style.animationDuration = `${Math.round(1080 + Math.random() * 260)}ms`;
    fleck.style.animationDelay = `${Math.round(i * 24 + Math.random() * 70)}ms`;
    pieces.append(fleck);
  }
  el.overlay.append(pieces);
  setTimeout(() => {
    for (const fleck of el.overlay.querySelectorAll('.topping-fleck')) fleck.remove();
  }, 1900);
}

/** Drops every per-round effect counter and cancels anything still running. */
function resetRoundEffects() {
  ui.chain = 0;
  ui.chainTotal = 0;
  // A new round re-deals, so nobody has shouted in it yet. Seeding rather than
  // clearing would make the first snapshot of the round look like a shout.
  ui.prevDeclared.clear();
  ui.prevTopKind = null;
  // The first card of a round IS a topping change — there was no topping
  // before it — so the oven rings once as the round opens.
  ui.prevTopping = null;
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
  clearNudge();
  ui.entrySettleAt = 0;
  setHandBreathing(false);
  clearInterval(ui.idleTimer);
  ui.idleTimer = 0;
  ui.idleDeadline = 0;
  paintIdleCountdown();
  disarmLeave();
  ui.handSlots.clear();
  ui.handCards.clear();
  ui.handOrder = [];
  ui.nearRow = [];
  ui.peekPointer = -1;
  clearPeek();
  ui.seatNodes.clear();
  ui.gameId = null;
  ui.lastLogId = -1;
  ui.dealing = true;
  el.flyLayer.replaceChildren();
  el.hand.dataset.mode = 'review';
  el.handPit.replaceChildren();
  el.handNear.replaceChildren();
  labelPit(0, false);
  el.opponents.replaceChildren();
  el.logList.replaceChildren();
  el.discardSlot.replaceChildren();
}

/** A regular's portrait when the bot is one of the six, by name. */
function regularPortrait(name) {
  const regular = REGULARS.find((r) => r.name === name);
  return regular ? `assets/regulars/${regular.id}.png` : null;
}

/**
 * 02 · the bots blink. Their portraits are baked PNG busts, so there are no
 * eyes to close: the blink is an eyelid overlay that dips over the whole face
 * for one frame. Each regular gets their own interval and their own offset, so
 * a table of six never blinks in chorus. Carmela is on the longest one — she
 * is watching. Humans never blink; a real player's tell is their own business.
 */
const BLINKS = {
  vito: [5, 0.6],
  carmela: [9, 2.2],
  paulie: [7, 1.4],
  pina: [5, 3.1],
  dominic: [9, 0.4],
  ray: [7, 2.7],
};
const PLAIN_BLINK = [7, 1.9];

function armBlink(node, person) {
  if (!person.isBot) {
    node.classList.remove('is-bot');
    return;
  }
  const regular = REGULARS.find((r) => r.name === person.name);
  const [seconds, offset] = (regular && BLINKS[regular.id]) || PLAIN_BLINK;
  node.classList.add('is-bot');
  node.style.setProperty('--blink-dur', `${seconds}s`);
  // A negative delay starts the loop mid-cycle, so seats desync on their first
  // frame instead of drifting apart over the first minute.
  node.style.setProperty('--blink-delay', `-${offset}s`);
}

function renderAvatar(node, person) {
  node.replaceChildren();
  armBlink(node, person);
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
    if (seat.id === snapshot.youId) row.classList.add('is-you');

    const avatar = document.createElement('span');
    avatar.className = 'seat-row__avatar';
    renderAvatar(avatar, seat);
    row.append(avatar);

    const name = document.createElement('span');
    name.className = 'seat-row__name';
    name.textContent = seat.name;
    row.append(name);

    // 13 · whatever they earned last round rides in with them.
    const nick = nicknameChip(seat.name);
    if (nick) row.append(nick);

    // One Press Start word per seat, like a player-select screen.
    const status = document.createElement('span');
    status.className = 'seat-row__word';
    status.textContent =
      !seat.connected && !seat.isBot ? 'AWAY'
        : seat.id === snapshot.hostId ? 'HOST'
          : seat.isBot ? 'CPU'
            : 'READY';
    row.append(status);

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

  // Empty seats blink PRESS START until somebody sits down.
  const openSeats = Math.max(0, snapshot.maxPlayers - snapshot.seats.length);
  for (let i = 0; i < Math.min(openSeats, 8); i++) {
    const empty = document.createElement('li');
    empty.className = 'seat-row seat-row--empty';
    empty.setAttribute('aria-hidden', 'true');
    const word = document.createElement('span');
    word.className = 'seat-row__press';
    word.textContent = 'PRESS START';
    empty.append(word);
    rows.append(empty);
  }
  el.seatList.replaceChildren(rows);
  renderWall(snapshot);

  const count = snapshot.seats.length;
  const enough = count >= snapshot.minPlayers;
  el.lobbyEmpty.hidden = true;
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

// ------------------------------------------------- 12 · the wall of fame ----
/**
 * Polaroids taped up under the seat grid, one per player who has won a round
 * at this table. Social proof, not a leaderboard: no ranking, no order, no
 * score — a face and the number of times they cleaned their plate.
 *
 * Nodes are kept between renders and reused, so a player joining the lobby
 * does not restart every sway in the row. Nothing at all is drawn until
 * somebody has actually won; an empty wall is clutter.
 */
function renderWall(snapshot) {
  const winners = snapshot.seats.filter((s) => Number(s.wins) >= 1).slice(0, 8);
  if (!winners.length) {
    if (ui.wall) {
      ui.wall.remove();
      // The row is reused when the wall refills, so it cannot keep the
      // polaroids whose handles are about to be dropped.
      const row = ui.wall.querySelector('.wall__row');
      if (row) row.replaceChildren();
    }
    ui.wallCards.clear();
    return;
  }

  if (!ui.wall) {
    const wall = document.createElement('div');
    wall.className = 'wall';
    const title = document.createElement('p');
    title.className = 'wall__title';
    title.textContent = 'Wall of fame';
    const row = document.createElement('div');
    row.className = 'wall__row';
    wall.append(title, row);
    ui.wall = wall;
  }
  if (!ui.wall.isConnected) el.seatList.after(ui.wall);

  const row = ui.wall.querySelector('.wall__row');
  const seen = new Set();
  const order = [];
  winners.forEach((seat, index) => {
    seen.add(seat.id);
    let card = ui.wallCards.get(seat.id);
    if (!card) {
      card = buildPolaroid(seat);
      ui.wallCards.set(seat.id, card);
      // Each polaroid hangs on its own nail: distinct period, and a negative
      // delay so no two are ever at the same point of the swing.
      card.style.setProperty('--sway-dur', `${(5.6 + (index % 5) * 0.45).toFixed(2)}s`);
      card.style.setProperty('--sway-off', `-${(index * 0.9).toFixed(1)}s`);
    }
    card._parts.name.textContent = seat.name;
    card._parts.wins.textContent = `×${seat.wins}`;
    order.push(card);
  });

  for (const [id, card] of ui.wallCards) {
    if (seen.has(id)) continue;
    card.remove();
    ui.wallCards.delete(id);
  }
  order.forEach((card, index) => {
    if (row.children[index] !== card) row.insertBefore(card, row.children[index] || null);
  });
}

function buildPolaroid(seat) {
  const card = document.createElement('figure');
  card.className = 'polaroid';

  const photo = document.createElement('span');
  photo.className = 'polaroid__photo';
  const image = document.createElement('img');
  image.className = 'polaroid__face';
  image.src = regularPortrait(seat.name)
    || (seat.isBot ? 'assets/avatar-chef-bot.png' : 'assets/avatar-patron.png');
  image.alt = '';
  image.decoding = 'async';
  image.draggable = false;
  photo.append(image);

  const caption = document.createElement('figcaption');
  caption.className = 'polaroid__cap';
  const name = document.createElement('span');
  name.className = 'polaroid__name';
  const wins = document.createElement('b');
  wins.className = 'polaroid__wins';
  caption.append(name, wins);

  card.append(photo, caption);
  card._parts = { name, wins };
  return card;
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
  openedPopover(el.btnAddBot);
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
  syncCabinet(snapshot);
  syncShout(view);

  // 08 · your turn, loudly. One class drives the ping ring on the rail and
  // both borders warming from bezel to cheese, so the whole signal starts and
  // stops on the same frame the turn does.
  el.handZone.classList.toggle('is-your-turn', yourTurn);
  // 04 · the nudge only exists while you actually have a legal move.
  armNudge(yourTurn, view.playableCardIds.length > 0);
}

/**
 * The marquee has three moments and they are mutually exclusive.
 *
 * The third one — the call-out window — is read off `calloutTargets`, the same
 * field that governs the CALL OUT button, so the strip goes to sauce exactly
 * while calling out is legal and never on a state the server did not send. It
 * outranks "your turn" on purpose: the window closes on its own, your turn
 * does not, and the rail's ping still says whose turn it is underneath.
 */
function renderTurnBanner(snapshot, view, yourTurn) {
  const callout = view.status === 'playing' && (view.calloutTargets || []).length > 0;
  el.turnBanner.classList.toggle('is-callout', callout);
  el.turnBanner.classList.toggle('is-you', yourTurn && !callout);
  // Which of the strip's three moments is on. A change of MOMENT is news; a
  // change of name inside the waiting moment is the roll-call.
  const moment = callout ? 'callout' : yourTurn ? 'you' : 'waiting';
  const changed = ui.turnMoment !== null && ui.turnMoment !== moment;
  ui.turnMoment = moment;
  setTurnText(turnLabel(view, yourTurn, callout), changed);
  armIdleCountdown(snapshot, view, yourTurn);
}

// --------------------------------------------------- the turn running out --
/**
 * The server gives a connected player 45 seconds on their turn and then plays
 * the same draw-and-pass it plays for somebody who is away. The last stretch of
 * that is on the marquee, next to the line that already says it is your turn.
 *
 * The wire carries a REMAINING DURATION, never a deadline stamp: the two ends
 * do not agree on what time it is. The client turns it into a local deadline
 * the moment the snapshot lands and counts down from there, so the digits keep
 * moving between snapshots without asking the server every second.
 *
 * Only your own turn gets a clock. Watching somebody else's run out is not
 * information you can act on, and four countdowns at one table is a casino.
 */
function paintIdleCountdown() {
  const warn = ui.idleWarnMs || 0;
  const left = ui.idleDeadline ? ui.idleDeadline - Date.now() : Infinity;
  if (!ui.idleDeadline || left > warn) {
    if (el.turnCount.textContent) el.turnCount.textContent = '';
    if (el.turnWarn.textContent) el.turnWarn.textContent = '';
    return;
  }
  const seconds = Math.max(0, Math.ceil(left / 1000));
  const text = ` — 0:${String(seconds).padStart(2, '0')}`;
  if (el.turnCount.textContent !== text) el.turnCount.textContent = text;
  // One sentence, once, when the window opens. The digits themselves are
  // aria-hidden: the marquee is a polite live region, and a live region that
  // changes every second stops being read as a warning.
  if (!el.turnWarn.textContent) {
    el.turnWarn.textContent = `${Math.ceil(warn / 1000)} seconds left, chef.`;
  }
}

function armIdleCountdown(snapshot, view, yourTurn) {
  clearInterval(ui.idleTimer);
  ui.idleTimer = 0;

  const live = yourTurn && view.status === 'playing' && snapshot.turnIdleMsLeft != null;
  if (!live) {
    ui.idleDeadline = 0;
    ui.idleWarnMs = 0;
    paintIdleCountdown();
    return;
  }
  ui.idleDeadline = Date.now() + snapshot.turnIdleMsLeft;
  ui.idleWarnMs = snapshot.turnIdleWarnMs || 10000;
  paintIdleCountdown();
  // Four beats a second: fast enough that the digit never looks stuck on a
  // throttled tab coming back, cheap enough to be nothing.
  ui.idleTimer = setInterval(() => {
    if (!ui.idleDeadline || ui.idleDeadline - Date.now() < -1000) {
      clearInterval(ui.idleTimer);
      ui.idleTimer = 0;
    }
    paintIdleCountdown();
  }, 250);
}

function turnLabel(view, yourTurn, callout) {
  if (view.status !== 'playing') return 'Round over';
  // The alarm colour needs a line that earns it. Whose turn it is is still on
  // screen either way — the rail is ringed and the hint under the hand says so.
  if (callout) return 'Somebody forgot to shout!';
  if (yourTurn) return view.mustPlayDrawnCard ? 'Your turn — play it or pass' : 'Your turn, chef';
  const current = view.players.find((p) => p.id === view.turnPlayerId);
  return current ? `${current.name} is eyeing the pile…` : 'Waiting…';
}

/**
 * Swaps the turn label.
 *
 * It used to drop the new text in over 180ms on EVERY turn. Most turns only
 * change a name — "Vito is eyeing the pile…" for "Carmela is eyeing the pile…"
 * — which is the roll-call, not news, and it was riding along on the same
 * frame as the marquee's fill, the rail's ping and the seat inverting. One
 * dominant signal per handoff: the roll-call snaps, and the swap animates only
 * when the strip actually changes moment (waiting / yours / call-out).
 *
 * Opacity only, no rise. The handoff prompt has the three moments differing in
 * "fill, border and text colour" with the row never reflowing, and warns that
 * the call-out moment "must not also be the only moment that moves" — so all
 * three punctuate the same way or none of them do.
 */
function setTurnText(text, punctuate) {
  if (el.turnText.textContent === text) return;
  el.turnText.textContent = text;
  if (!punctuate || !wantsMotion() || typeof el.turnText.animate !== 'function') return;
  // A second moment change cancels the first rather than stacking on it.
  for (const running of el.turnText.getAnimations()) running.cancel();
  el.turnText.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 140, easing: EASE_OUT });
}

/**
 * Direction now lives inside the marquee. `.is-reversed` on the banner flips
 * the chase's delay order — the glyphs never turn around, the wave does — and
 * the same class mirrors the static arrow that replaces the chase under
 * reduced motion. The words are kept in a visually-hidden node so a screen
 * reader still hears the direction change on the banner's own live region.
 */
function renderDirection(view) {
  const reversed = view.direction === -1;
  el.turnBanner.classList.toggle('is-reversed', reversed);
  const words = reversed ? 'to the right' : 'to the left';
  if (el.dirAnnounce.textContent !== words) el.dirAnnounce.textContent = words;

  // F · Flip the Pie. The chevron rail flashes cyan/cheese twice on the flip.
  // The seats no longer hear about it — they hold their places for the whole
  // round — but the token does: it turns around, and that is the reverse.
  const flipped = Boolean(ui.prevDir && ui.prevDir !== view.direction);
  ui.dirJustFlipped = flipped;
  if (flipped) {
    restartAnimation(el.dirChase, 'is-flipping', 'dir-flash');
    setTimeout(() => el.dirChase.classList.remove('is-flipping'), 520);
    sound.play('tape-scrub');
  }
  ui.prevDir = view.direction;
}

/**
 * Opponents around the counter, starting from whoever sits after you.
 *
 * This is the seating, not the running order: it is dealt once and it holds
 * for the whole round. The reversal that used to turn the row around on a
 * Flip the Pie is gone — a real table does not re-seat itself when play turns
 * around, you simply read it the other way, and the token walking back the
 * other way (step 7) is the whole event.
 */
function orderedOpponents(snapshot, view) {
  const players = view.players.filter((p) => !p.left);
  const mine = players.findIndex((p) => p.id === snapshot.youId);
  if (mine === -1) return players;
  return [...players.slice(mine + 1), ...players.slice(0, mine)];
}

/* --- 2A/6 · the arrangement -----------------------------------------------
   Hand-authored, one short array per opponent count, as percentages inside the
   felt with an anchor of top, left or right. A formula stacks chefs on top of
   one another at the ends of the arc; a map does not, so every count is placed
   to look deliberate rather than computed.

   One opponent sits at top centre, opposite you across the oven. That is the
   table a game of two actually is, and it is deliberate, not broken.

   [leftPct, topPct, anchor] */
const COUNTER_MAP = {
  1: [[50, 3, 't']],
  2: [[26, 4, 't'], [74, 4, 't']],
  3: [[19, 9, 't'], [50, 1, 't'], [81, 9, 't']],
  4: [[6, 30, 'l'], [31, 3, 't'], [69, 3, 't'], [94, 30, 'r']],
  5: [[5, 34, 'l'], [25, 6, 't'], [50, 0, 't'], [75, 6, 't'], [95, 34, 'r']],
  // The two counts that put chefs on the side walls sit them lower than the
  // rendered comp does. The comp's felt is 16:9; this one is capped at 1280
  // wide while the height keeps growing, so at the third notch a wall seat is
  // 250px of portrait-plus-cards and the old 14/15% put its shoulder through
  // the outermost chef along the top. Measured, not guessed: see the pairwise
  // rect assertion at 1280 and 2400.
  6: [[5, 50, 'l'], [11, 20, 'l'], [37, 1, 't'], [63, 1, 't'], [89, 20, 'r'], [95, 50, 'r']],
  7: [[5, 54, 'l'], [11, 26, 'l'], [32, 2, 't'], [50, 0, 't'], [68, 2, 't'], [89, 26, 'r'], [95, 54, 'r']],
};

/* The one breakpoint. Below it the counter hands over to the queue — said
   once here and once in the stylesheet, and nowhere else. Both are read
   through the same media engine, so they cannot silently disagree. */
const QUEUE_BELOW = window.matchMedia('(max-width: 519.98px)');

function seatingMode() {
  return QUEUE_BELOW.matches ? 'queue' : 'counter';
}

/**
 * Crossing the breakpoint is a discrete event, not a continuous one, so it
 * gets its own listener rather than riding the resize handler's
 * requestAnimationFrame — a backgrounded tab throttles rAF away entirely, and
 * a phone that came back from the background showing a counter it cannot fit
 * would be the arrangement lying about which mode it is in.
 */
QUEUE_BELOW.addEventListener('change', () => relayoutSeating());

/**
 * 2A/6 · place the seats.
 *
 * The counter reads the map; the queue sorts by rank and lets flex do the
 * rest. Either way the seat nodes themselves are the ones already cached in
 * `ui.seatNodes` — an arrangement moves chefs, it never rebuilds them.
 */
/**
 * Dragging across the breakpoint has to hand the counter over to the queue
 * right there, without waiting for the next snapshot — a table that only
 * re-arranges when somebody plays a card is a table that is wrong for as long
 * as it takes them to think. The seat nodes are the ones already cached, and
 * the rank is already on each node, so this moves chefs and builds nothing.
 */
function relayoutSeating() {
  const snapshot = ui.snapshot;
  const view = snapshot && snapshot.game;
  if (!view) return;
  const order = orderedOpponents(snapshot, view)
    .map((player) => ui.seatNodes.get(player.id))
    .filter(Boolean);
  if (order.length === 0) return;
  placeSeats(order, seatRanks(view), view);
}

/**
 * The two pieces of furniture that belong to the table rather than to a chef:
 * the belt under the queue and (step 7) the token that walks the counter.
 * Built once and kept on `ui`, next to the seat cache, so nothing rebuilds a
 * node another part of the client is holding a reference to.
 */
function seatingFurniture() {
  if (!ui.belt) {
    const belt = document.createElement('div');
    belt.className = 'counter-belt';
    belt.setAttribute('aria-hidden', 'true');
    const tread = document.createElement('span');
    tread.className = 'counter-belt__tread';
    belt.append(tread);
    el.opponents.after(belt);
    ui.belt = belt;
  }
  if (!ui.token) {
    const token = document.createElement('span');
    token.className = 'counter-token';
    token.setAttribute('aria-hidden', 'true');
    el.opponents.append(token);
    ui.token = token;
  }
  return { belt: ui.belt, token: ui.token };
}

/**
 * 2A/7 · the token that walks the counter.
 *
 * Direction is not a word and not a colour: it is a chevron sitting on the
 * counter halfway between the chef playing and the chef next, and on the
 * handoff it walks one gap in four visible steps. A reverse is the token
 * turning around and walking the other way, and that is the whole event —
 * a real table does not re-seat itself when play turns around.
 *
 * It is placed in pixels rather than percentages because a transform is the
 * only thing allowed to move, and a percentage translate would be a percentage
 * of the token rather than of the felt.
 */
function placeToken(token, order, ranks, view) {
  const seats = order.length;
  // A token needs two different places to stand between. At a table of two
  // there is one opponent and one of you, so the walk has nowhere to go.
  if (seats < 2 || seatingMode() !== 'counter') {
    token.hidden = true;
    return;
  }

  const map = COUNTER_MAP[Math.min(7, seats)] || COUNTER_MAP[7];
  // Where you sit: the near edge, dead centre, which is the one place on the
  // counter that is not in the map because it is not a seat.
  const YOURS = [50, 78];
  const spotOf = (node) => {
    if (!node) return YOURS;
    const index = order.indexOf(node);
    const spot = map[Math.min(index, map.length - 1)];
    return [spot[0], spot[1]];
  };

  // The chef playing and the chef next, read off the same ranks the weights
  // are read off. `null` is you — you are at the counter too.
  let from = null;
  let to = null;
  let known = false;
  for (const node of order) {
    // The ranks map is the authority; the dataset copy is display plumbing
    // and could lag it on a relayout path.
    const rank = ranks.get(node.dataset.id);
    if (rank === 0) { from = node; known = true; }
    if (rank === 1) { to = node; known = true; }
  }
  // Ranks 0 and 1 are always somebody at the table; whichever of the two is
  // missing from the opponents is you.
  if (!known) {
    token.hidden = true;
    return;
  }
  const a = spotOf(from);
  const b = spotOf(to);

  const width = el.opponents.offsetWidth;
  const height = el.opponents.offsetHeight;
  if (width === 0 || height === 0) {
    token.hidden = true;
    return;
  }
  const port = parseFloat(getComputedStyle(el.opponents).getPropertyValue('--port')) || 54;
  const x = ((a[0] + b[0]) / 2 / 100) * width;
  const y = ((a[1] + b[1]) / 2 / 100) * height + port * 0.5;

  token.hidden = false;
  // The glyph is drawn with borders, not set as a character: neither VT323 nor
  // Press Start 2P carries U+25B8, and a tofu box walking the counter would be
  // worse than no marker at all. The same reason the turn triangle is drawn.
  token.dataset.dir = view.direction === -1 ? '-1' : '1';
  // The turn-around is the whole reverse, so it says so for one beat.
  if (ui.dirJustFlipped) {
    restartAnimation(token, 'is-turning', 'token-turn');
    clearTimeout(ui.tokenTurnTimer);
    ui.tokenTurnTimer = setTimeout(() => token.classList.remove('is-turning'), 260);
  }
  token.style.setProperty('--tx', `${x.toFixed(1)}px`);
  token.style.setProperty('--ty', `${y.toFixed(1)}px`);
}

function placeSeats(order, ranks, view) {
  const mode = seatingMode();
  el.opponents.dataset.mode = mode;
  const count = order.length;
  const { belt, token } = seatingFurniture();
  belt.dataset.dir = view.direction === -1 ? '-1' : '1';
  placeToken(token, order, ranks, view);

  if (mode === 'queue') {
    // A queue is only a queue if left-to-right IS the order of play, so the
    // slots sort by rank every render and the head is a fixed place on screen.
    const sorted = order
      .map((node) => ({ node, rank: Number(node.dataset.rank) }))
      .sort((a, b) => (a.rank < 0 ? 99 : a.rank) - (b.rank < 0 ? 99 : b.rank));

    // Where every chef stood before the sort. `offsetLeft` rather than a rect:
    // a rect read mid-transition returns the transformed position, and the
    // whole point of this measurement is where the seat BELONGS.
    const slid = ui.queuePlaced;
    const before = new Map(order.map((node) => [node, node.offsetLeft]));

    sorted.forEach(({ node, rank }, index) => {
      node.style.removeProperty('left');
      node.style.removeProperty('right');
      node.style.removeProperty('top');
      node.dataset.anchor = 't';
      // The head of the queue is worth three times the room of a seat five
      // places away; the tail only has to say who and how many.
      const port = rank === 0 ? 58 : rank === 1 ? 46 : 34;
      node.style.setProperty('--port', `${port}px`);
      node.dataset.box = port >= 40 ? '1' : '0';
      node.style.order = String(index);
    });
    ui.queuePlaced = true;

    // `order` re-sorts on the frame it is set — there is nothing to tween. So
    // the slide is handed back: each seat is put where it just was and then
    // walks to where it now belongs, one slot, in three visible steps. The
    // chips have already renumbered, which is the point: an ordinal that
    // counts down while the seat travels is a lie about what happened.
    el.opponents.classList.toggle('is-reforming', Boolean(ui.dirJustFlipped));
    if (!slid || !wantsMotion()) return;
    let moved = false;
    for (const node of order) {
      const dx = before.get(node) - node.offsetLeft;   // forces the reflow
      const body = node._parts.body;
      if (Math.abs(dx) < 1) continue;
      moved = true;
      body.style.transition = 'none';
      body.style.transform = `translateX(${dx.toFixed(1)}px)`;
    }
    if (!moved) return;
    // Each loop pass's offsetLeft read commits the PREVIOUS node's write, so
    // without one more read the final seat's inverse transform is still
    // uncommitted when release runs — it snaps while everyone else slides.
    void el.opponents.offsetLeft;
    const release = () => {
      for (const node of order) {
        node._parts.body.style.removeProperty('transition');
        node._parts.body.style.removeProperty('transform');
      }
    };
    requestAnimationFrame(release);
    // A backgrounded tab throttles rAF away entirely, and a strip left holding
    // its inverse offsets would come back from the background with every chef
    // one slot to the left of where they belong. The timer is the belt.
    clearTimeout(ui.queueSlideTimer);
    ui.queueSlideTimer = setTimeout(release, 300);
    return;
  }

  // Leaving the queue: forget where the strip stood, and clear anything a
  // slide left behind, or the first counter frame starts from a stale offset.
  ui.queuePlaced = false;
  el.opponents.classList.remove('is-reforming');

  const map = COUNTER_MAP[Math.min(7, Math.max(1, count))] || COUNTER_MAP[7];
  order.forEach((node, index) => {
    node._parts.body.style.removeProperty('transition');
    node._parts.body.style.removeProperty('transform');
    const spot = map[Math.min(index, map.length - 1)];
    // A chef along the top is centred on their percentage; one down a wall is
    // hung off that wall, so the outer seats stay on the felt instead of half
    // over its edge. The anchor already says which way they face; letting it
    // pick the box edge as well is the same fact used twice.
    if (spot[2] === 'r') {
      node.style.removeProperty('left');
      node.style.right = `${(100 - spot[0]).toFixed(1)}%`;
    } else {
      node.style.removeProperty('right');
      node.style.left = `${spot[0]}%`;
    }
    node.style.top = `${spot[1]}%`;
    node.dataset.anchor = spot[2];
    node.dataset.box = '1';
    node.style.removeProperty('--port');
    node.style.removeProperty('order');
  });

  // The counter only reaches as far down the walls as somebody is actually
  // sitting: at four players a shallow lip along the top, at eight most of the
  // way down both sides.
  const deepest = map.reduce((low, spot) => Math.max(low, spot[1]), 0);
  el.opponents.style.setProperty('--rail-bottom', `${Math.max(16, 100 - deepest - 30)}%`);
}

/**
 * 2A/5 · one number drives every weight on the table.
 *
 * `rank` is how far a seat is from the chef playing, counted along the
 * direction of play: 0 is NOW, 1 is NEXT, everything else is idle, and in the
 * queue the same number prints as the ordinal chip. It is computed once per
 * render, here, and handed to the seats — nothing downstream works out "who is
 * next" a second time.
 *
 * `-1` means there is nobody at the oven (the round is over, or the snapshot
 * arrived between turns), and every seat reads as idle.
 */
function seatRanks(view) {
  const players = view.players.filter((p) => !p.left);
  const n = players.length;
  const active = players.findIndex((p) => p.id === view.turnPlayerId);
  const ranks = new Map();
  if (n === 0) return ranks;
  const live = active !== -1 && view.status === 'playing';
  const dir = view.direction === -1 ? -1 : 1;
  for (let i = 0; i < n; i++) {
    ranks.set(players[i].id, live ? ((i - active) * dir + n * 4) % n : -1);
  }
  return ranks;
}

function renderOpponents(snapshot, view) {
  const list = orderedOpponents(snapshot, view);
  const ranks = seatRanks(view);
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
    updateSeat(node, player, view, exposed, ranks.get(player.id) ?? -1);
    order.push(node);
  }

  for (const [id, node] of ui.seatNodes) {
    if (!seen.has(id)) {
      node.remove();
      ui.seatNodes.delete(id);
    }
  }

  // The DOM order is the seating order and it never changes inside a round.
  // The counter places by percentage and the queue reorders with `order`, so
  // neither arrangement has to move a node to move a chef — which is what
  // makes "the seats do not re-sort on a reverse" true rather than merely
  // intended.
  order.forEach((node, index) => {
    if (el.opponents.children[index] !== node) {
      el.opponents.insertBefore(node, el.opponents.children[index] || null);
    }
  });

  // "CHEFS · n" counts everyone still at the table, you included. Seven and
  // eight seats is the crowded board: the portrait steps down so the counter
  // still has room for a hand of cards in front of every chef.
  const atTable = view.players.filter((p) => !p.left).length;
  el.opponents.dataset.chefs = String(atTable);
  el.opponents.dataset.crowd = atTable >= 7 ? '1' : '0';
  placeSeats(order, ranks, view);
  renderChefStats(snapshot);
  // The flip is spent once the seating has consumed it. Without this, a
  // resize between the flip snapshot and the next one re-runs placeSeats via
  // relayoutSeating and replays the reverse animation on a board that did
  // not reverse.
  ui.dirJustFlipped = false;
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

/**
 * 2A/1 · a seat is a chef, not a panel.
 *
 * The bordered card is gone. What is left is the three things a person at a
 * table actually is from across the room: a face, a name plate, and their
 * cards in front of them. Nothing draws a box around the group — the counter
 * (step 6) is the only furniture, and it belongs to the table rather than to
 * any one chef.
 *
 * `.seat__ring` and `.seat__edge` are the two overlays step 3 uses for the
 * NOW/NEXT weights; they are built here so the cache and the builder stay in
 * one place, and they draw nothing until a class turns them on.
 */
function buildSeat(player) {
  const node = document.createElement('div');
  node.className = 'seat';
  node.dataset.id = player.id;
  // The tray is on until an arrangement says the portrait is too small for it.
  node.dataset.box = '1';
  // Which way the seat faces across the counter. The arrangement overwrites
  // it; a chef along the top edge is the default.
  node.dataset.anchor = 't';

  const body = document.createElement('div');
  body.className = 'seat__body';

  // The chef: face over name plate, as one column whichever way the seat faces.
  const idcol = document.createElement('div');
  idcol.className = 'seat__id';

  const avatar = document.createElement('div');
  avatar.className = 'seat__avatar';

  const name = document.createElement('span');
  name.className = 'seat__name';
  idcol.append(avatar, name);

  // The cards in front of them. Filled in by step 2; the tray is built now so
  // the node structure never changes after the seat is cached.
  const cards = document.createElement('div');
  cards.className = 'seat__cards';
  cards.setAttribute('aria-hidden', 'true');

  // 06 · the box lid. The count is also a pizza box: the lid stands wide open
  // on a full hand and shuts as it empties, so the table reads closeness
  // without anyone reading a number.
  const box = document.createElement('span');
  box.className = 'pizza-box';
  const boxLid = document.createElement('span');
  boxLid.className = 'pizza-box__lid';
  const boxBase = document.createElement('span');
  boxBase.className = 'pizza-box__base';
  box.append(boxLid, boxBase);

  const fan = document.createElement('span');
  fan.className = 'seat__fan';
  const deck = document.createElement('span');
  deck.className = 'seat__deck';

  const count = document.createElement('span');
  count.className = 'seat__count';
  const countNum = document.createElement('b');
  countNum.className = 'seat__count-num';
  countNum.setAttribute('aria-hidden', 'true');
  count.append(countNum);
  cards.append(box, fan, deck, count);

  body.append(idcol, cards);
  node.append(body);

  // Two readings of the same number: the printed plate above, and "5 cards"
  // for a screen reader, which stays out of the picture entirely.
  const countLong = document.createElement('span');
  countLong.className = 'seat__count-long';
  node.append(countLong);

  // 13 · the title they carried out of the last round. Hidden until there is
  // one, so a seat that earned nothing looks exactly as it did.
  const nick = document.createElement('span');
  nick.className = 'seat__nick';
  nick.hidden = true;
  node.append(nick);

  const status = document.createElement('span');
  status.className = 'seat__status';
  node.append(status);

  const badge = document.createElement('span');
  badge.className = 'seat__badge';
  node.append(badge);

  // The two weights, and the ordinal the queue prints. All three are inert
  // until a class turns them on.
  const edge = document.createElement('span');
  edge.className = 'seat__edge';
  edge.setAttribute('aria-hidden', 'true');
  const ring = document.createElement('span');
  ring.className = 'seat__ring';
  ring.setAttribute('aria-hidden', 'true');
  const rank = document.createElement('span');
  rank.className = 'seat__rank';
  rank.setAttribute('aria-hidden', 'true');
  node.append(edge, ring, rank);

  node._parts = {
    avatar, name, body, idcol, cards, count, countLong, countNum,
    badge, status, nick, box, boxLid, boxBase, fan, deck, edge, ring, rank,
  };
  return node;
}

/**
 * 06 · how far the lid stands open, from the hand behind it. Seven cards or
 * more is wide open at -62deg; one card is all but shut at -6deg; an empty
 * box is closed. The map is absolute, not a multiplier, so the same count
 * always draws the same angle.
 */
function lidAngle(cardCount) {
  if (cardCount <= 0) return 0;
  const capped = Math.min(cardCount, 7);
  return -(6 + ((capped - 1) / 6) * 56);
}

/**
 * 2A/2 · the card object — the piece that makes a count physical.
 *
 * One to seven cards is a literal fan: one sliver per card, so the number is
 * something you count without meaning to. Eight and over a fan at opponent
 * scale is mush, so it becomes a deck — one card back with two hard offset
 * shadows behind it — and the numeral printed on the box says how many.
 *
 * The slivers are seat furniture, not cards: they carry no rank, no suit and
 * no id, and `renderCard()` stays the single source of real card markup.
 */
const FAN_MAX = 7;

function renderCardObject(parts, cardCount) {
  const count = Math.max(0, cardCount);
  const deckMode = count >= 8;
  const shown = Math.min(count, FAN_MAX);
  // Symmetric about centre, and it stops widening at 64 degrees — past that
  // the outermost sliver lies flat and the fan stops reading as a hand.
  const spread = Math.min(count * 11, 64);

  parts.deck.hidden = !deckMode;
  const wanted = deckMode ? 0 : shown;
  const fan = parts.fan;
  while (fan.childElementCount > wanted) fan.lastElementChild.remove();
  while (fan.childElementCount < wanted) {
    const sliver = document.createElement('i');
    sliver.className = 'seat__sliver';
    fan.append(sliver);
  }
  for (let i = 0; i < wanted; i++) {
    const angle = shown === 1 ? 0 : -spread / 2 + spread * (i / (shown - 1));
    fan.children[i].style.setProperty('--a', `${angle.toFixed(1)}deg`);
  }
}

/**
 * One status word for a chef bot, from state the snapshot already carries.
 * A human opponent gets nothing: their tell is their own business.
 */
function seatStatus(player, view, exposed, rank) {
  if (!player.isBot || player.left || view.status !== 'playing') return '';
  if (exposed) return 'watching you';
  // Reads the same rank the weights do, rather than asking who is at the oven
  // a second time.
  if (rank === 0) return 'thinking';
  return '';
}

function updateSeat(node, player, view, exposed, rank) {
  const parts = node._parts;
  const avatarState = `${player.isBot}:${player.connected}`;
  if (node.dataset.avatarState !== avatarState) {
    node.dataset.avatarState = avatarState;
    renderAvatar(parts.avatar, player);
  }
  parts.name.textContent = player.name;
  // Spoken only. The picture of the hand is the fan and the printed plate.
  parts.countLong.textContent =
    `${player.name}, ${player.cardCount} card${player.cardCount === 1 ? '' : 's'}`;
  parts.countNum.textContent = String(player.cardCount).padStart(2, '0');

  // 13 · the chip beside the name.
  const nick = ui.nicknames.get(player.name) || null;
  parts.nick.textContent = nick ? nick.title : '';
  parts.nick.className = nick ? `seat__nick nickname nickname--${nick.tone}` : 'seat__nick';
  parts.nick.hidden = !nick;

  // 06 · the lid follows the count, and takes two or more cards at once as a
  // reason to fly open before settling back.
  const previous = node.dataset.count === undefined ? null : Number(node.dataset.count);
  node.dataset.count = String(player.cardCount);
  // 2A/2 · the fan, the deck and the one-card state. `data-hand` is what the
  // stylesheet switches on, so the three readings can never be on at once.
  node.dataset.hand = player.cardCount >= 8 ? 'deck' : player.cardCount === 1 ? 'one' : 'fan';
  renderCardObject(parts, player.cardCount);
  parts.boxLid.style.setProperty('--lid', `${lidAngle(player.cardCount).toFixed(1)}deg`);
  if (previous !== null && player.cardCount - previous >= 2 && wantsMotion()) {
    restartAnimation(parts.boxLid, 'is-slam', 'lid-slam');
    setTimeout(() => parts.boxLid.classList.remove('is-slam'), 460);
  }

  // 2A/3 · the three weights, all three read off the one rank. NOW is
  // enclosed, NEXT is one edge, everything else is idle — three shapes, not
  // one shape at three brightnesses.
  node.dataset.rank = String(rank);
  // 2A/5 · the same number, printed. The queue shows it as an ordinal chip;
  // the counter keeps it in the markup and simply does not draw it, so the two
  // arrangements are one component reading one value rather than two.
  parts.rank.textContent =
    rank === 0 ? 'NOW' : rank === 1 ? 'NEXT' : rank < 0 ? '' : String(rank + 1).padStart(2, '0');
  const isTurn = rank === 0;
  node.classList.toggle('is-turn', isTurn);
  node.classList.toggle('is-next', rank === 1);
  node.classList.toggle('is-away', !player.connected);
  // 2A/1 · three states of presence, and only three. Live is full colour;
  // idle is dimmed and desaturated; a chef who dropped is a ghost. NEXT is
  // deliberately NOT a fourth brightness — its whole distinction is the edge
  // bar step 3 draws, so a player never compares two dimnesses.
  node.classList.toggle('is-live', isTurn);
  // Their call-out window is open: the chef column dashes the panel in sauce.
  node.classList.toggle('is-vulnerable', Boolean(player.vulnerable) && player.cardCount === 1);

  const word = seatStatus(player, view, exposed, rank);
  parts.status.textContent = word;
  parts.status.classList.toggle('is-shown', Boolean(word));
  parts.status.classList.toggle('is-watching', word === 'watching you');

  // 2A/4 · the seat IS the call-out button.
  //
  // Read off `calloutTargets`, the same field that governs the CALL OUT button
  // in the hand zone — that button is untouched, so the action is reached two
  // ways and keyboard and screen-reader users lose nothing. The seat is a
  // second door on the same handler, never a second rule.
  const target = (view.calloutTargets || []).includes(player.id);
  node.classList.toggle('is-target', target);
  if (target) {
    node.setAttribute('role', 'button');
    node.setAttribute('tabindex', '0');
    node.setAttribute('aria-label', `Call out ${player.name}`);
  } else {
    node.removeAttribute('role');
    node.removeAttribute('tabindex');
    node.removeAttribute('aria-label');
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
    // The window is a dashed sauce box and a bar draining over three seconds:
    // entirely a picture, and the one moment where not knowing costs you cards.
    // `syncCalloutWindows` only opens a window that is not already open, so
    // this is once per arising rather than once per snapshot.
    announce("You're on one card — shout ZA!");
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
    // the buzzer is the noise, and GOTCHA is the stamp. The server does not
    // name the catcher machine-readably, so the stamp names nobody.
    sound.play('buzzer');
    if (seat) {
      const stamp = document.createElement('span');
      stamp.className = 'seat__stamp seat__stamp--gotcha';
      stamp.setAttribute('aria-hidden', 'true');
      stamp.textContent = 'GOTCHA!';
      seat.append(stamp);
      requestAnimationFrame(() => stamp.classList.add('is-on'));
      setTimeout(() => stamp.classList.remove('is-on'), 900);
      setTimeout(() => stamp.remove(), 1140);
    }
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
      // 1A · what the run has actually cost, for the cabinet's running total.
      // Derived from the same landing, so it can never disagree with the ladder.
      const forced = top.kind === 'wild4' ? 4 : top.kind === 'draw2' ? 2 : 0;
      ui.chainTotal = ui.chain === 0 ? 0 : ui.chain === 1 ? forced : ui.chainTotal + forced;
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
    // 11 · the oven only rings when the ring's colour is the news — a wild
    // being named, or a suit change. A card landing on its own kind already
    // has its landing, and a second 500ms cue on top of it said nothing.
    if (landed && view.currentTopping && view.currentTopping !== ui.prevTopping) {
      holder.classList.add('is-recolour');
    }
    if (landed) ui.prevTopping = view.currentTopping || null;
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
    el.toppingNow.querySelector('.topping-now__name').textContent = `IN PLAY · ${meta.label.toUpperCase()}`;
  }
}

const SUIT_SORT = { pepperoni: 0, basil: 1, cheese: 2, anchovy: 3 };
const KIND_SORT = { number: 0, skip: 1, reverse: 2, draw2: 3, wild: 4, wild4: 5 };

/** Suits together, numbers ascending, actions behind them, wilds last. */
function handSortKey(card) {
  const suit = isWild(card) ? 9 : SUIT_SORT[card.suit] ?? 8;
  const kind = KIND_SORT[card.kind] ?? 7;
  const value = card.kind === 'number' ? card.value : 10 + kind;
  return suit * 100 + value;
}

/**
 * THE PIT.
 *
 * The hand is partitioned, not fanned. Everything you cannot play drops into
 * the rib strip; the cards you can play stand up at full size in the near rail
 * underneath it. The sort is unchanged and still runs first — it is what makes
 * the partition read as one movement when your turn starts.
 *
 * A card owns one slot for its whole life, keyed by id. The slot moves between
 * the rails; it is never rebuilt, so the entry transition, the flight from the
 * dough pile and the focus a player is holding all survive a promotion.
 */
/**
 * Whether the whole hand fits the rail full size, gap and all. Measured, not
 * configured: the card width comes from a probe slot the stylesheet sizes, so
 * a notch change or a resize moves the answer without anybody keeping a copy
 * of the numbers. (Runtime truth — the chamber-size lesson.)
 */
function handFitsOpen(count) {
  if (!count) return true;
  let probe = ui.nearProbe;
  if (!probe) {
    probe = document.createElement('div');
    probe.className = 'hand-slot';
    probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;';
    probe.append(renderCard(null, { size: 'hand' }));
    ui.nearProbe = probe;
  }
  el.handNear.append(probe);
  const cardW = probe.firstElementChild.offsetWidth || 84;
  probe.remove();
  // The same 8px gap and 16px of side padding `layoutNear` works with.
  return count * cardW + (count - 1) * 8 + 16 <= el.hand.clientWidth;
}

function renderHand(snapshot, view, yourTurn) {
  const playable = new Set(view.playableCardIds);
  const seen = new Set();
  const fresh = [];
  const pit = [];
  const near = [];

  // THE OPEN KITCHEN. The pit exists to compress a hand that does not fit;
  // when the whole hand stands full size with room to spare, compressing it
  // anyway is just hiding cards. So the pit only engages under pressure:
  // while everything fits, dead cards stand in the row dimmed — the way they
  // did before the pit existed — and the strip stays empty and collapsed.
  const open = handFitsOpen(view.hand.length);
  el.hand.dataset.open = open ? '1' : '0';

  const sortedHand = [...view.hand].sort((a, b) => handSortKey(a) - handSortKey(b) || (a.id < b.id ? -1 : 1));
  ui.handOrder = sortedHand.map((c) => c.id);
  for (const card of sortedHand) {
    seen.add(card.id);
    ui.handCards.set(card.id, card);
    const isPlayable = yourTurn && playable.has(card.id);
    let slot = ui.handSlots.get(card.id);
    const isFresh = !slot;

    // A drawn card lands in the pit as a rib whatever it is; if it is playable
    // it promotes a beat later, and that promotion is the news rather than the
    // draw. A dealt hand is not a draw — it arrives already sorted, so it goes
    // straight to the rail it belongs in instead of promoting seven cards at
    // once over the deal stagger. An open kitchen has no pit to land in: the
    // drawn card takes its place in the row directly.
    const landsInPit = isFresh && !ui.dealing && !open;
    const wantsNear = open || (isPlayable && !landsInPit);

    if (isFresh) {
      slot = document.createElement('div');
      slot.className = 'hand-slot';
      slot.dataset.cardId = card.id;
      // Press Start 2P is fixed pitch, so a two-glyph index needs a wider rib.
      slot.dataset.glyphs = String(cardIndex(card).length);
      const node = renderCard(card, { size: wantsNear ? 'hand' : 'rib', interactive: true });
      // Only a card that is genuinely arriving takes the entry style. A
      // promotion moves this same node between rails, and a moved node
      // re-resolves its style — without the marker it would fade in from
      // nothing every time it was promoted instead of rising out of the pit.
      node.classList.add('is-entering');
      node.addEventListener('click', () => onCardActivate(card, slot));
      // The entry delay has to be written before the card is ever laid out.
      // The layout pass below reads offsetWidth, and that forced flush
      // resolves `@starting-style` and starts every fresh card's entry
      // transition on the spot — a transition-delay written after it is never
      // seen, the stagger collapses to nothing, and the real card sits visible
      // under its own flying clone for the whole flight.
      const arrival = fresh.length;
      const delay = ui.dealing
        ? Math.min(arrival * 55, 275)
        : arrival * 70 + D_FLY - 80;
      if (wantsMotion() && delay > 0) node.style.transitionDelay = `${delay}ms`;
      slot.append(node);
      ui.handSlots.set(card.id, slot);
      fresh.push({ slot, delay, promotes: isPlayable && landsInPit });
    }

    dressCard(slot.firstElementChild, card, isPlayable);
    (wantsNear ? near : pit).push({ card, slot });
  }

  for (const [id, slot] of ui.handSlots) {
    if (!seen.has(id)) {
      slot.remove();
      ui.handSlots.delete(id);
      ui.handCards.delete(id);
      if (ui.peekCardId === id) clearPeek();
    }
  }

  // Not your turn: nothing is live, so nothing stands up. The near rail keeps
  // no room at all and the whole hand sits in the pit at review width.
  el.hand.dataset.mode = yourTurn ? 'turn' : 'review';

  // The pit is filled first: a card demoting out of the near rail has to be
  // out of it before the near rail is spaced, or the gap would close twice.
  fillRail(el.handPit, pit.map((e) => e.slot), 'rib');
  // The ribs just moved, so any cached scrub geometry describes the old strip.
  invalidatePit();
  const raised = fillRail(el.handNear, near.map((e) => e.slot), 'hand');
  layoutNear(near);
  labelPit(pit.length, yourTurn);

  // The promotion is the one thing in the hand that animates on its own. It
  // can only happen on a snapshot where the top card changed or the turn did,
  // because that is the only thing that can change what is playable — the near
  // rail therefore holds still for the whole of your turn by construction.
  if (raised.length && wantsMotion()) {
    for (const slot of raised) restartAnimation(slot.firstElementChild, 'is-promoting', 'promote');
    setTimeout(() => {
      for (const slot of raised) slot.firstElementChild?.classList.remove('is-promoting');
    }, 340);
    // The one new cue in the whole redesign: the promotion snaps, the scrub is
    // silent. Not on the deal, which already has its own wave of arrivals.
    if (!ui.dealing) sound.play('card-snap');
  }

  // Cards that just arrived. At the start of a round the whole hand is dealt
  // in with a stagger. During play a card can only come off the dough pile, so
  // it travels from the pile and shrinks into its rib as it lands. The delays
  // themselves were set above, before the layout read; all that is left here is
  // the flight and letting each delay go once its card has arrived.
  let settle = 0;
  if (fresh.length) {
    const dealing = ui.dealing;
    fresh.forEach(({ slot, delay, promotes }, index) => {
      releaseEntry(slot, delay);
      if (dealing) {
        settle = Math.max(settle, delay);
        return;
      }
      const start = index * 70;
      settle = Math.max(settle, start + D_FLY);
      flyFromDrawPile(slot, start);
      flashRib(slot, start + D_FLY);
      if (promotes) promoteLater(slot, start + D_FLY + 120);
    });
    settle += D_ENTER + 140;
    // An absolute deadline, not a per-render duration. The snapshot right
    // after a deal usually brings no fresh cards of its own, and a duration
    // computed from that render would be zero — arming the breath on top of a
    // wave that is still arriving and snapping the late cards into place.
    ui.entrySettleAt = Date.now() + settle;
  }
  // Only a hand that actually has cards in it counts as dealt.
  if (pit.length || near.length) ui.dealing = false;

  // 01 · the hand breathes while it is not your turn, and stops dead the
  // instant it is — the stop itself is the signal. It is held off until the
  // deal-in stagger and any flight from the dough pile have landed, because a
  // keyframe would otherwise swallow the entry transition.
  setHandBreathing(!yourTurn && view.status === 'playing' && (pit.length + near.length) > 0);

  // The rails are laid; the card a play or a draw should hand focus to now
  // exists. Last, so it cannot be moved out from under itself.
  spendFocusIntent(fresh, near);
}

/**
 * The playable state of one card: the ring, the dim, and what it answers to.
 *
 * A dead card is not `disabled`. The scrub is pointer-only, so a keyboard has
 * to be able to reach the half of the hand it cannot drag across; a rib stays
 * in the tab order, says it is disabled, and takes no pointer (the stylesheet
 * puts `pointer-events: none` on it, because the strip around it is the
 * control). The click handler refuses anything that is not playable anyway.
 */
function dressCard(node, card, isPlayable) {
  if (!node) return;
  node.classList.toggle('is-playable', isPlayable);
  node.classList.toggle('is-dimmed', !isPlayable);
  node.disabled = false;
  if (isPlayable) {
    node.removeAttribute('aria-disabled');
    node.setAttribute('aria-label', `Play ${describeCard(card)}`);
  } else {
    node.setAttribute('aria-disabled', 'true');
    node.setAttribute('aria-label', describeCard(card));
  }
}

/**
 * Puts a rail's slots in order and swaps every card into the mode that rail
 * draws in. Returns the slots that arrived from the other rail, so a promotion
 * can be told apart from a card that was already standing there.
 */
function fillRail(host, slots, size) {
  const arrived = [];
  slots.forEach((slot, index) => {
    const node = slot.firstElementChild;
    if (slot.parentElement && slot.parentElement !== host) {
      arrived.push(slot);
      // A node that is about to move must not be carrying the entry marker, or
      // the move would re-trigger the entry fade on top of its promotion.
      if (node) node.classList.remove('is-entering');
    }
    if (node) setCardSize(node, size);
    if (host.children[index] !== slot) host.insertBefore(slot, host.children[index] || null);
  });
  return arrived;
}

/** Swaps a card between the modes `renderCard` built it able to wear. */
function setCardSize(node, size) {
  const want = `card--${size}`;
  if (node.classList.contains(want)) return;
  node.classList.remove('card--hand', 'card--rib');
  node.classList.add(want);
}

/**
 * A drawn card lands in the pit with two frames of cheese on its keyline. It
 * is the only thing that says "that one is new" once the flight has gone.
 */
function flashRib(slot, delay) {
  if (!wantsMotion()) return;
  setTimeout(() => {
    const node = slot.firstElementChild;
    if (!node || !node.isConnected) return;
    restartAnimation(node, 'is-flashing', 'rib-flash');
    setTimeout(() => node.classList.remove('is-flashing'), 240);
  }, Math.max(delay, 0));
}

/**
 * A playable card that just arrived promotes out of the pit once its flight
 * has landed, rather than never having been in the pit at all: the rib is what
 * you drew, the promotion is what it means.
 */
function promoteLater(slot, delay) {
  setTimeout(() => {
    if (!slot.isConnected || slot.parentElement !== el.handPit) return;
    const node = slot.firstElementChild;
    if (!node || !node.classList.contains('is-playable')) return;
    node.classList.remove('is-entering');
    setCardSize(node, 'hand');
    // Into its sorted place, never onto the end: the sort is the point of the
    // near rail, and a promotion between two snapshots must not break it.
    const rank = ui.handOrder.indexOf(slot.dataset.cardId);
    const after = [...el.handNear.children].find(
      (s) => ui.handOrder.indexOf(s.dataset.cardId) > rank
    );
    el.handNear.insertBefore(slot, after || null);
    layoutNear([...el.handNear.children].map((s) => ({ slot: s, card: ui.handCards.get(s.dataset.cardId) })));
    labelPit(el.handPit.children.length, el.hand.dataset.mode === 'turn');
    if (!wantsMotion()) return;
    restartAnimation(node, 'is-promoting', 'promote');
    setTimeout(() => node.classList.remove('is-promoting'), 340);
    sound.play('card-snap');
  }, Math.max(delay, 0));
}

/** The pit is one control, so it says what it holds and how to read it. */
function labelPit(count, yourTurn) {
  const cards = `${count} ${count === 1 ? 'card' : 'cards'}`;
  el.handPit.setAttribute(
    'aria-label',
    count === 0
      ? 'No cards in the pit'
      : yourTurn
        ? `${cards} you cannot play, drag across to review them`
        : `${cards}, drag across to review them`
  );
}

/**
 * 01 · arms or disarms the idle breath.
 *
 * The class lives on the hand, not on each card, so stopping it is one class
 * removal on the frame the turn arrives — no timer to outrun, nothing to
 * cancel per card.
 */
function setHandBreathing(on) {
  clearTimeout(ui.breatheTimer);
  ui.breatheTimer = 0;
  if (!on || !wantsMotion()) {
    el.hand.classList.remove('is-breathing');
    return;
  }
  // Whatever is still arriving finishes arriving first, whichever render
  // started it. The class comes off for the duration rather than merely
  // failing to go on: a penalty landing mid-breath would otherwise enter
  // against a keyframe that already owns the card's transform, and the new
  // card would fade in without ever rising into the fan.
  const wait = ui.entrySettleAt - Date.now();
  if (wait > 0) {
    el.hand.classList.remove('is-breathing');
    ui.breatheTimer = setTimeout(() => el.hand.classList.add('is-breathing'), wait);
    return;
  }
  el.hand.classList.add('is-breathing');
}

// ------------------------------------------------------------ 04 · nudge ----
/**
 * After five seconds of nothing at all on your own turn, the cards you could
 * legally play wobble once. It never points at a card, never counts anything
 * down, and never makes a sound — it is the table clearing its throat.
 *
 * The clock is a single chained timeout, re-armed after each wobble; a hidden
 * tab skips the wobble and simply re-arms, so nothing piles up behind a
 * backgrounded window.
 */
const NUDGE_IDLE_MS = 5000;
const NUDGE_LIFE_MS = 480;

function clearNudge() {
  clearTimeout(ui.nudgeTimer);
  clearTimeout(ui.nudgeOffTimer);
  ui.nudgeTimer = 0;
  ui.nudgeOffTimer = 0;
  ui.nudgeArmed = false;
  stopWobble();
}

function stopWobble() {
  for (const slot of ui.handSlots.values()) {
    const node = slot.firstElementChild;
    if (node) node.classList.remove('is-nudging');
  }
}

function armNudge(yourTurn, hasLegal) {
  if (!yourTurn || !hasLegal || !wantsMotion()) {
    clearNudge();
    return;
  }
  if (ui.nudgeArmed) return; // already counting; only activity restarts it
  ui.nudgeArmed = true;
  scheduleNudge();
}

function scheduleNudge() {
  clearTimeout(ui.nudgeTimer);
  ui.nudgeTimer = setTimeout(fireNudge, NUDGE_IDLE_MS);
}

function fireNudge() {
  ui.nudgeTimer = 0;
  if (!ui.nudgeArmed) return;
  // A hidden tab or an open popover is not somebody who needs prompting.
  if (document.hidden || popoverOpen()) {
    scheduleNudge();
    return;
  }
  let any = false;
  for (const slot of ui.handSlots.values()) {
    const node = slot.firstElementChild;
    if (!node || !node.classList.contains('is-playable')) continue;
    restartAnimation(node, 'is-nudging', 'wobble');
    any = true;
  }
  if (!any) {
    clearNudge();
    return;
  }
  ui.nudgeOffTimer = setTimeout(stopWobble, NUDGE_LIFE_MS);
  scheduleNudge();
}

let lastActivityBump = 0;
/** Any sign of life restarts the five seconds. Throttled: pointermove is cheap
 *  but it is not free, and a 400ms floor cannot lose more than 400ms. */
function bumpNudge() {
  if (!ui.nudgeArmed) return;
  const now = Date.now();
  if (now - lastActivityBump < 400) return;
  lastActivityBump = now;
  stopWobble();
  scheduleNudge();
}

/**
 * Drops the entry delay once the card has finished arriving, and with it the
 * marker that says this card is arriving at all. The delay itself is written
 * where the slot is built, because by the time anything has read layout it is
 * already too late to stagger. The marker has to come off on every card, delay
 * or no delay: from here on, moving this node between rails is a promotion and
 * must never be mistaken for an entry.
 */
function releaseEntry(slot, delay) {
  setTimeout(() => {
    const node = slot.firstElementChild;
    if (!node) return;
    node.style.transitionDelay = '';
    node.classList.remove('is-entering');
  }, Math.max(delay, 0) + D_ENTER + 120);
}

// ---------------------------------------------------------------- the pit ---
/**
 * The scrub. The pit is one continuous control, not a row of targets — a 20px
 * rib is far under the touch minimum. Press anywhere in the strip and drag:
 * the peek follows, so accuracy never matters and the worst a miss can do is
 * show the neighbouring card. Nothing in here can play a card; play happens
 * only in the near rail, which is exactly what the peek lands on top of.
 */
/**
 * The scrub's geometry, measured once per session rather than per move.
 *
 * A scrub is a drag: the pointer moves dozens of times a second and NOTHING it
 * reads can change while it is down. The old path read every rib's rect, the
 * hand's rect and the pit's offsets on every single `pointermove` — 8 rect
 * reads and 2 offset reads per move with six ribs, each one a forced layout
 * because `showPeek` had just written to the peek's style. Measured on the
 * probe: 30 moves inside one frame cost 300 layout reads.
 *
 * So the strip is measured once, at pointerdown, and every move after that is
 * arithmetic. The cache is dropped whenever the thing it describes could have
 * moved: a resize, a re-render of the rails, or the end of the session.
 *
 * Deliberately NOT rAF-batched. The writes left in the move path are two
 * custom properties on one element and no read follows them, so they cannot
 * force a reflow and the browser already coalesces them to the next frame. An
 * rAF hop would add a way for the peek to never land at all — rAF is starved
 * whenever the document is hidden, and a queued write is a bug waiting for a
 * throttled tab.
 */
function measurePit() {
  const ribs = [];
  for (const slot of el.handPit.children) {
    const r = slot.getBoundingClientRect();
    ribs.push({ slot, left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width });
  }
  const box = el.hand.getBoundingClientRect();
  ui.pitGeom = {
    ribs,
    boxLeft: box.left,
    boxWidth: box.width,
    peekTop: el.handPit.offsetTop + el.handPit.offsetHeight + 8,
  };
  return ui.pitGeom;
}

/** The strip moved or was rebuilt: the next read has to measure again. */
function invalidatePit() {
  ui.pitGeom = null;
}

function pitGeom() {
  return ui.pitGeom || measurePit();
}

function ribUnder(clientX, clientY) {
  const geom = pitGeom();
  let best = null;
  let bestD = Infinity;
  for (const r of geom.ribs) {
    const dx = clientX < r.left ? r.left - clientX : clientX > r.right ? clientX - r.right : 0;
    // The pit wraps to two rows at review width, so the row counts too.
    const dy = clientY < r.top ? r.top - clientY : clientY > r.bottom ? clientY - r.bottom : 0;
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = r.slot;
    }
  }
  return best;
}

function showPeek(slot) {
  const cardId = slot.dataset.cardId;
  const card = ui.handCards.get(cardId);
  if (!card) return;
  if (ui.peekCardId !== cardId) {
    ui.peekCardId = cardId;
    // The peek duplicates a rib that is already in the accessibility tree with
    // its own label, so it is scenery: hidden from the reader, never a button.
    const face = renderCard(card, { size: 'hand' });
    face.setAttribute('aria-hidden', 'true');
    face.removeAttribute('role');
    el.handPeek.replaceChildren(face);
  }
  // Every number below comes off the cached measurement — no layout read on
  // the move path at all. A rib that is not in the cache (the strip was
  // rebuilt under a held pointer) forces one re-measure and no more.
  let geom = pitGeom();
  let rib = geom.ribs.find((r) => r.slot === slot);
  if (!rib) {
    geom = measurePit();
    rib = geom.ribs.find((r) => r.slot === slot);
    if (!rib) return;
  }
  const x = rib.left - geom.boxLeft + rib.width / 2 - 42;
  // It lands over the near rail: at 375px there is only 15px of room above the
  // pit, and covering the place you play from is one more way of saying a peek
  // is not a play.
  const top = `${geom.peekTop}px`;
  const left = `${Math.round(Math.max(0, Math.min(x, geom.boxWidth - 84)))}px`;
  // The pointer crosses many pixels per rib, so most moves resolve to numbers
  // that are already on the element. Writing them again is churn.
  const style = el.handPeek.style;
  if (style.getPropertyValue('--peek-top') !== top) style.setProperty('--peek-top', top);
  if (style.getPropertyValue('--peek-x') !== left) style.setProperty('--peek-x', left);
  el.handPeek.hidden = false;
  el.hand.classList.add('has-peek');
}

function clearPeek() {
  ui.peekCardId = null;
  el.handPeek.hidden = true;
  el.handPeek.replaceChildren();
  el.hand.classList.remove('has-peek');
}

function bindPit() {
  el.handPit.addEventListener('pointerdown', (event) => {
    // One measurement opens the session; every move inside it is arithmetic.
    invalidatePit();
    const slot = ribUnder(event.clientX, event.clientY);
    if (!slot) return;
    ui.peekPointer = event.pointerId;
    try {
      el.handPit.setPointerCapture(event.pointerId);
    } catch { /* no capture, the listeners below still fire */ }
    showPeek(slot);
    event.preventDefault();
  });

  el.handPit.addEventListener('pointermove', (event) => {
    if (ui.peekPointer !== event.pointerId) return;
    const slot = ribUnder(event.clientX, event.clientY);
    if (slot) showPeek(slot);
  });

  const end = (event) => {
    if (ui.peekPointer !== event.pointerId) return;
    ui.peekPointer = -1;
    invalidatePit();
    clearPeek();
  };
  el.handPit.addEventListener('pointerup', end);
  el.handPit.addEventListener('pointercancel', end);
  el.handPit.addEventListener('lostpointercapture', end);

  // The scrub is pointer-only, so focus is how a keyboard reads the pit:
  // landing on a rib shows the same peek, leaving it clears it.
  el.handPit.addEventListener('focusin', (event) => {
    const slot = event.target.closest('.hand-slot');
    if (!slot) return;
    // Tabbing is not a drag — there is no session to hold a measurement open,
    // and a focus move is rare enough that measuring each time costs nothing.
    invalidatePit();
    showPeek(slot);
  });
  el.handPit.addEventListener('focusout', (event) => {
    if (ui.peekPointer >= 0) return;
    if (event.relatedTarget && el.handPit.contains(event.relatedTarget)) return;
    clearPeek();
  });

  // A rail wide enough to scroll (see `layoutNear`) can hold a card that is
  // off the right edge when Tab reaches it. Pointer scrolling is the browser's
  // job; bringing the focused card with the focus is ours. `inline: 'nearest'`
  // moves it the least distance that makes it whole, so tabbing along a full
  // rail walks the strip rather than jumping it card by card.
  el.handNear.addEventListener('focusin', (event) => {
    if (!el.handNear.classList.contains('is-scrolling')) return;
    const slot = event.target.closest('.hand-slot');
    if (slot) slot.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  });
}

/**
 * How far one card may hide behind the next. It is the floor, not the resting
 * value: the near rail overlaps 24% past four cards and only ever goes past
 * that to keep a very live hand on the screen. Nothing shrinks either way.
 */
const MAX_OVERLAP = 0.55;

/** VT323 at 13px runs 5.3px a character; 8px is the 6px inset and a pixel of air. */
const BANNER_CH = 5.3;
const BANNER_PAD = 8;

/**
 * Spaces the near rail and decides what each banner can finish saying.
 *
 * Full 84px cards with 8px gaps and no overlap at all up to four. Past four
 * they overlap 24%. They never shrink, and there is no density step to fall
 * back to — the pit is what makes the room.
 */
function layoutNear(entries) {
  ui.nearRow = entries;
  const total = entries.length;
  if (!total) {
    el.handNear.classList.remove('is-scrolling');
    return;
  }

  // The live width, not the configured one: the rail forces 84px on every
  // screen and this is the only place that can tell whether it got it.
  const cardWidth = entries[0].slot.offsetWidth || 84;
  // `.hand` carries 8px of side padding, so this is the room the cards get.
  const available = Math.max(el.hand.clientWidth - 16, cardWidth);

  // Cards overlap only under pressure. Every card that CAN stand clear does —
  // a five-card hand on a monitor spreads at full 8px gaps; the same hand on
  // a phone overlaps exactly as much as the width demands and no more. This
  // is not a density step: the cards never shrink, they only hide further.
  let gap = 8;
  const needed = total * cardWidth + (total - 1) * gap;
  if (needed > available && total > 1) {
    gap = Math.floor((available - total * cardWidth) / (total - 1));
    gap = Math.max(gap, -Math.round(cardWidth * MAX_OVERLAP));
  }

  // MAX_OVERLAP is a floor, and a floor can be too high. Twelve live cards want
  // 502px of rail at full overlap and a 375px phone has 335 — the far cards
  // used to sit off the edge of a screen that clips, unreachable by thumb and
  // by Tab. Nothing shrinks and nothing hides further than the floor, so the
  // rail scrolls instead: every card stays 84px, and every card stays gettable.
  const rides = total * cardWidth + (total - 1) * gap;
  el.handNear.classList.toggle('is-scrolling', total > 1 && rides > available);

  entries.forEach(({ slot }, index) => {
    slot.style.setProperty('--overlap', `${gap}px`);
    slot.style.zIndex = String(index + 1);
  });

  labelNear(entries, cardWidth, gap);
}

/**
 * 04 · a banner is centred across 84px, but a card the next card covers only
 * exposes its leftmost strip, and a centred label in it is always cut
 * mid-word. A covered card prints the three-letter suit token, left-aligned
 * into the strip it actually has. The full label is kept for the card nothing
 * covers — the last one in the rail. Nothing is placed in a strip it cannot
 * finish in, so a strip too narrow even for the token prints nothing.
 */
function labelNear(entries, cardWidth, gap) {
  entries.forEach(({ slot, card }, index) => {
    const node = slot.firstElementChild;
    if (!node) return;
    const last = index === entries.length - 1;
    const exposed = last ? cardWidth : Math.min(cardWidth, cardWidth + gap);
    const fits = (text) => exposed >= text.length * BANNER_CH + BANNER_PAD;
    const full = node.querySelector('.card__banner-full');
    const covered = !last && gap < 0;
    const token = suitToken(card);

    const printsFull = !covered && fits(full ? full.textContent : '');
    const printsToken = !printsFull && fits(token);
    node.classList.toggle('is-tokened', printsToken);
    node.classList.toggle('is-unlabelled', !printsFull && !printsToken);
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

  // The cabinet remembers its best chef.
  if (winner) {
    const winnerSeat = snapshot.seats.find((s) => s.id === view.winnerId);
    const wins = winnerSeat ? winnerSeat.wins : 1;
    let best = null;
    try { best = JSON.parse(localStorage.getItem('za.hiscore') || 'null'); } catch { /* fine */ }
    if (!best || wins > best.wins) {
      try { localStorage.setItem('za.hiscore', JSON.stringify({ name: winner.name, wins })); } catch { /* fine */ }
    }
  }
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

  // 13 · the titles are settled before the bills print, so the one you just
  // earned is on your own receipt and not only on next round's seat panel.
  if (staged) computeNicknames(snapshot);

  renderReceipts(snapshot, staged);

  el.btnNextRound.hidden = !snapshot.isHost;
  el.btnToLobby.hidden = !snapshot.isHost;

  // 09 · nothing starts by itself. The receipts are the point of this screen
  // and a five-second bar draining under them turned reading your own round
  // into a race. The host presses ANOTHER PIE? when the table has finished
  // looking; everybody else is told, by name, who they are waiting on.
  if (snapshot.isHost) {
    el.roundWait.textContent = '';
  } else if (hostPresent(snapshot)) {
    const host = snapshot.seats.find((s) => s.id === snapshot.hostId);
    el.roundWait.textContent = host
      ? `Waiting for ${host.name} to fire up the next pie.`
      : 'Waiting for the host to fire up the next pie.';
  } else {
    el.roundWait.textContent = 'The host stepped out. Nothing starts by itself now.';
  }
}

// --------------------------------------------------- 13 · earned nicknames --
/**
 * One title per player, computed from the receipt tracker at the end of every
 * round and carried into the next one. Nothing here is on the wire and nothing
 * here is a rule: it is the same per-player counts the bills are printed from,
 * read once more for a nickname.
 *
 * A category is only awarded on a unique maximum above zero. Three players
 * tied on two anchovies each says nothing about any of them, which is exactly
 * how the ANCHOVY LOVER badge on the receipts already reasons.
 */
const NICK_CATEGORIES = [
  { key: 'anchovy', title: 'THE ANCHOVY GUY', tone: 'anchovy' },
  { key: 'caught', title: 'FORGOT SOMETHING', tone: 'sauce' },
  { key: 'penalty', title: 'BUTTERFINGERS', tone: 'cheese' },
  { key: 'dead', title: 'SLOW HANDS', tone: 'cyan' },
];

function nickStat(seatId, key) {
  const bill = (ui.tab && ui.tab.bills.get(seatId)) || freshBill();
  if (key === 'anchovy') return bill.anchovy;
  if (key === 'caught') return bill.caught;
  if (key === 'penalty') return bill.extraCost + bill.wholeCost;
  return bill.dead;
}

function computeNicknames(snapshot) {
  const view = snapshot.game;
  if (!view) return;
  const seats = snapshot.seats.filter((s) => view.players.some((p) => p.id === s.id));

  const holders = new Map(); // category key -> seat id, or nothing on a tie
  for (const category of NICK_CATEGORIES) {
    let best = 0;
    let who = null;
    let tied = false;
    for (const seat of seats) {
      const value = nickStat(seat.id, category.key);
      if (value > best) {
        best = value;
        who = seat.id;
        tied = false;
      } else if (value === best && value > 0) {
        tied = true;
      }
    }
    if (best > 0 && who && !tied) holders.set(category.key, who);
  }

  for (const seat of seats) {
    let earned = null;
    if (view.winnerId === seat.id) {
      earned = { title: 'CLEAN PLATE', tone: 'basil' };
    } else {
      for (const category of NICK_CATEGORIES) {
        if (holders.get(category.key) !== seat.id) continue;
        earned = { title: category.title, tone: category.tone };
        break;
      }
    }
    if (earned) ui.nicknames.set(seat.name, earned);
    else ui.nicknames.delete(seat.name);
  }
}

function nicknameChip(name) {
  const nick = ui.nicknames.get(name);
  if (!nick) return null;
  const chip = document.createElement('span');
  chip.className = `nickname nickname--${nick.tone}`;
  chip.textContent = nick.title;
  return chip;
}

/**
 * Who is holding the oven. The round-over screen and its buttons both need to
 * know, and after the acting-host election on the server this is simply the
 * seat the snapshot names as host, present and connected.
 */
function hostPresent(snapshot) {
  const host = snapshot.seats.find((s) => s.id === snapshot.hostId);
  return Boolean(host && host.connected !== false);
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

  // 13 · the title is printed on the bill, under the name, like a job.
  const nick = ui.nicknames.get(seat.name);
  if (nick) {
    const stamp = document.createElement('span');
    stamp.className = 'receipt__nick';
    stamp.textContent = nick.title;
    paper.append(stamp);
  }

  const items = document.createElement('div');
  items.className = 'receipt__items';

  if (bill.played) items.append(receiptLine(`CARDS PLAYED ×${bill.played}`, '—'));
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
  if (seat.wins) items.append(receiptLine(`ROUNDS WON ×${seat.wins}`, '—'));
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

// ================================================================= FOCUS ===
/**
 * Books where focus should land once the next snapshot has rebuilt the hand.
 *
 * Only for a keyboard-driven action, and that restriction is the point. A
 * pointer player already has their attention where their hand is, and moving
 * focus for them would open the pit's peek over a card they never asked about.
 * A keyboard player has nowhere at all: playing a card disables it, drawing
 * disables the dough pile, and either way the browser drops focus on <body>
 * with the whole document between them and the rest of their turn.
 */
function bookFocus(intent) {
  ui.focusIntent = ui.keyboardActive ? intent : null;
}

/** Focus the card in a slot, if there is still a card in it. */
function focusSlot(slot) {
  const node = slot && slot.firstElementChild;
  if (!node || !node.isConnected || node.disabled) return false;
  node.focus({ preventScroll: true });
  return document.activeElement === node;
}

/**
 * Spends a booked intent, once the rails have been re-laid and the landing
 * place actually exists. Called at the end of `renderHand`.
 */
function spendFocusIntent(fresh, near) {
  const intent = ui.focusIntent;
  if (!intent) return;
  ui.focusIntent = null;

  // A draw lands exactly one card, wherever the rails put it — a rib in the
  // pit, or the row itself when the kitchen is open. That card is the news.
  if (intent.kind === 'draw') {
    const landed = fresh.length ? fresh[fresh.length - 1].slot : null;
    if (focusSlot(landed)) return;
  }

  // A play leaves the rail one card shorter, so the same position now holds
  // the card that took its place. Playing the last one carries on at the new
  // last one rather than dropping out of the hand.
  if (near.length) {
    const at = Math.min(Math.max(intent.at || 0, 0), near.length - 1);
    if (focusSlot(near[at].slot)) return;
  }

  // Nothing playable left. The dough pile is the only move there is; if even
  // that is closed, the action rail is where the turn is decided.
  const fallbacks = [el.drawPile, el.btnZa, el.btnPass, el.btnCallout, el.btnLeaveGame];
  for (const node of fallbacks) {
    if (!node || node.disabled || node.hidden || node.offsetParent === null) continue;
    node.focus({ preventScroll: true });
    return;
  }
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
  closePopovers({ restoreFocus: false });
  const node = slot.firstElementChild;
  // `node.disabled = true` two lines down blurs this card on the spot, and the
  // card focus should move to does not exist yet — the rails are only re-laid
  // when the server's next snapshot lands. So the landing place is booked here
  // by position in the rail and spent at the end of `renderHand`.
  const at = ui.nearRow.findIndex((entry) => entry.card && entry.card.id === card.id);
  bookFocus({ kind: 'play', at: at < 0 ? 0 : at });
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
  if (!wantsMotion() || document.hidden) return;
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
  // 1A · the cabinet's own glow lift and the running total ride the same
  // funnel, so they can never be left standing on a chain that has ended.
  syncChain();
}

/**
 * A · four pixels, two frames, and out. The three rows of the game screen move
 * together; `.fly-layer` is left alone on purpose, because it is `position:
 * fixed` and a transform on its ancestor would re-anchor cards in flight.
 */
function shakeFrame() {
  const host = document.querySelector('.screen--game');
  if (!host) return;
  // The class sits on the screen but the animation runs on its three rows,
  // so the rewind has to reach them by name — a subtree sweep here would also
  // rewind every breathing card in the hand.
  const shaking = host.classList.contains('is-shaking');
  host.classList.add('is-shaking');
  if (shaking) {
    for (const row of host.querySelectorAll(':scope > .hud, :scope > .table, :scope > .hand-zone')) {
      if (typeof row.getAnimations !== 'function') continue;
      for (const running of row.getAnimations()) {
        if (running.animationName === 'frame-shake') running.currentTime = 0;
      }
    }
  }
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
  pullCheese(sourceNode);
  for (let i = 0; i < 5; i++) {
    setTimeout(() => sound.play('flight-blip', i), (i * D_FLY) / 5);
  }
}

/**
 * 05 · the cheese pull. One 4px strand, anchored at the card you just let go
 * of and pointing at the oven, stretching along with the flight and snapping
 * a little before it lands.
 *
 * One div, rotated once at birth and never touched again: the whole thing is
 * a scaleX on a fixed-width element, so nothing is measured mid-flight. Only
 * ever your own play — a bot's card flying in already carries its own weight,
 * and eight strands crossing the table at once would be spaghetti.
 */
function pullCheese(sourceNode) {
  if (document.hidden) return;
  const from = cardMetrics(sourceNode);
  const to = cardMetrics(el.discardSlot);
  if (!from.w || !to.w) return;
  const dx = to.cx - from.cx;
  const dy = to.cy - from.cy;
  const span = Math.hypot(dx, dy);
  if (span < 24) return; // the card was already in the oven's lap

  const strand = document.createElement('span');
  strand.className = 'cheese-pull';
  strand.setAttribute('aria-hidden', 'true');
  strand.style.left = `${from.cx.toFixed(1)}px`;
  strand.style.top = `${(from.cy - 2).toFixed(1)}px`;
  strand.style.width = `${span.toFixed(1)}px`;
  strand.style.setProperty('--pull-angle', `${((Math.atan2(dy, dx) * 180) / Math.PI).toFixed(2)}deg`);
  strand.style.animationDuration = `${D_FLY}ms`;
  el.flyLayer.append(strand);
  setTimeout(() => strand.remove(), D_FLY + 120);
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
  if (document.hidden) return;
  if (!from || !to || !from.w || !to.w) return;

  const wrap = document.createElement('div');
  wrap.className = 'fly-card fly-card--flip';
  wrap.setAttribute('aria-hidden', 'true');

  const back = cardBack().cloneNode(true);
  back.classList.add('flip-side', 'flip-side--back');

  const face = faceNode.cloneNode(true);
  face.classList.remove('is-playable', 'is-dimmed', 'is-pressed', 'is-leaving', 'is-entering');
  face.removeAttribute('disabled');
  // A drawn card now lands in the pit as a 20px rib, but it must not travel as
  // one: the reveal in mid-air is a whole card, and the flight scales it down
  // to the rib it is landing on (`to.w` is the rib slot's real width below).
  face.classList.remove('card--rib');
  face.classList.add('card--hand');
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
/** Every popover on the client, whether or not it has been built yet. */
function popoverPanels() {
  const panels = [el.picker, el.calloutPop];
  if (ui.roster) panels.push(ui.roster.panel);
  return panels;
}

/**
 * Remembers what opened a popover, so closing it can hand focus straight back.
 * One helper for all three — the picker, the call-out list and the hire roster
 * — because "Escape put my focus inside a panel that is no longer there" is
 * the same bug three times over.
 */
function openedPopover(invoker) {
  ui.popoverReturn = invoker instanceof HTMLElement
    ? invoker
    : (document.activeElement instanceof HTMLElement ? document.activeElement : null);
}

/**
 * Closes every popover and gives focus back to whatever opened one.
 *
 * The restore is conditional on focus actually being *inside* the panel that
 * is going away. A click somewhere else already moved focus on purpose, and
 * yanking it back to the trigger would undo the player's own choice — so only
 * a close that would otherwise strand focus (Escape, Cancel, picking a
 * topping) hands it back.
 *
 * `restoreFocus: false` is for the callers that have somewhere better to put
 * it: committing a play focuses the next playable card, and a screen change
 * focuses the screen.
 */
function closePopovers(options = {}) {
  // `true` is the Escape key's shorthand for { instant: true }. Escape is a
  // retraction, not a decision — riding the 130ms exit for it is the popover
  // arguing. A pointer close keeps the animation: there the movement ties the
  // choice to the thing that closed. The snap is a class and a forced reflow
  // rather than a frame hop, because rAF does not run in a hidden document.
  if (options === true) options = { instant: true };
  const { restoreFocus = true, instant = false } = options;
  const panels = popoverPanels();
  const active = document.activeElement;
  const stranded = active instanceof HTMLElement && panels.some((panel) => panel && panel.contains(active));

  for (const panel of panels) {
    if (!panel) continue;
    if (instant) {
      panel.classList.add('is-snapping');
      hide(panel);
      panel.classList.remove('is-open');
      void panel.offsetWidth;   // commit the closed state with no transition
      panel.classList.remove('is-snapping');
    } else {
      hide(panel);
    }
  }
  ui.pendingWild = null;

  const target = ui.popoverReturn;
  ui.popoverReturn = null;
  if (!restoreFocus || !stranded) return;
  if (target && target.isConnected && !target.closest('[inert]') && target.offsetParent !== null) {
    target.focus({ preventScroll: true });
  }
}

/** True while any popover, including the hire roster, is on screen. */
function popoverOpen() {
  return popoverPanels().some((panel) => panel.classList.contains('is-open'));
}

/**
 * Where the popover should grow from, in the popover's own coordinates.
 *
 * The obvious way to get this is `getBoundingClientRect()` after `.is-open`,
 * and it is wrong: the popover is mid-transition at that moment, still sitting
 * at `scale(.97)`, so the rect is about 3% narrow and the origin lands off the
 * trigger by a few pixels. `offsetWidth` and `offsetLeft` are layout geometry
 * and ignore transforms entirely. The popover is `left: 50%` with a
 * `translateX(-50%)`, so its untransformed left edge is half its own width
 * back from that point.
 */
function popoverOriginX(popover, triggerRect) {
  const width = popover.offsetWidth;
  const host = popover.offsetParent || popover.parentElement;
  if (!width || !host) return null;
  const left = host.getBoundingClientRect().left + popover.offsetLeft - width / 2;
  const centre = triggerRect.left + triggerRect.width / 2;
  return Math.max(8, Math.min(width - 8, centre - left));
}

function openPicker(card, slot) {
  ui.pendingWild = { card, slot };
  // The card that opened it is where focus goes back to on Cancel or Escape.
  openedPopover(slot.firstElementChild);
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
      // No restore: the card this would hand focus back to is the one about to
      // leave for the oven. `commitPlay` books the landing place instead.
      closePopovers({ restoreFocus: false });
      // H · the ding rides the IN PLAY badge recolouring.
      sound.play('confirm-ding');
      if (pending) commitPlay(pending.card, key, pending.slot);
    });
    buttons.append(button);
  }
  el.pickerGrid.replaceChildren(buttons);

  // The popover grows out of the card that opened it. The origin is set
  // before `.is-open`, so the transform-origin is already right on the first
  // frame of the entry rather than one frame late.
  const originX = popoverOriginX(el.picker, slot.getBoundingClientRect());
  if (originX !== null) el.picker.style.setProperty('--origin-x', `${originX.toFixed(0)}px`);
  show(el.picker);
  sound.play('menu-blip'); // H · rides the 2x2 grid entering at 0.97
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
  openedPopover(el.btnCallout);
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
  const originX = popoverOriginX(el.calloutPop, el.btnCallout.getBoundingClientRect());
  if (originX !== null) el.calloutPop.style.setProperty('--origin-x', `${originX.toFixed(0)}px`);
  show(el.calloutPop);
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

  restartAnimation(el.btnZa, 'is-shouting', 'za-slam');
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

// =============================================================== CABINET ===
/**
 * 1A · the literal cabinet. Past the play column's cap the leftover width stops
 * being void and becomes pizzeria. Everything here is additive: it reads the
 * same snapshot the board already renders and never changes a rule, a state
 * shape or the wire protocol.
 *
 * The one number that matters is `--panel-w`, and it is CSS's to own. It is
 * registered as a `<length>`, so the shell's computed value is a real `250px`
 * rather than the unevaluated `max(...)` an unregistered property hands back —
 * which means the client reads the live cap instead of restating `1900` as a
 * second copy that can silently drift.
 */
function panelWidth() {
  if (!el.shell) return 0;
  const raw = getComputedStyle(el.shell).getPropertyValue('--panel-w').trim();
  const px = parseFloat(raw);
  if (raw.endsWith('px') && Number.isFinite(px)) return px;
  // Belt and braces for an engine without `@property`: same arithmetic, over
  // the live viewport and the cap CSS still states as a plain length.
  const cap = parseFloat(getComputedStyle(el.shell).getPropertyValue('--play-max'));
  if (!Number.isFinite(cap)) return 0;
  return Math.max(0, (window.innerWidth - Math.min(window.innerWidth, cap)) / 2);
}

/** Below this the leftovers are a margin, not a room; the panels stay unbuilt. */
const PANEL_MIN = 200;

/**
 * The single place that decides what the cabinet is showing. Called from the
 * render path (so the panels move with the snapshot), from resize (so they
 * appear and vanish with the width) and from the screen swap (so a cabinet-wide
 * window does not leave the pizzeria standing behind the home screen).
 */
function syncCabinet(snapshot) {
  if (!el.shell) return;
  if (snapshot) ui.cabSnapshot = snapshot;

  const width = panelWidth();
  el.shell.classList.toggle('is-capped', width > 0);

  // The chain's glow and total are a width concern too: dragging past the cap
  // mid-run has to light the room, and dragging back under it has to stop.
  syncChain();

  const wanted = width > PANEL_MIN && ui.screen === 'game';
  el.shell.classList.toggle('has-panels', wanted);
  if (!wanted) {
    dropPanels();
    return;
  }
  if (!ui.cabPanels) ui.cabPanels = buildPanels();
  paintPanels(ui.cabSnapshot);
}

/** Absent, not hidden: below the threshold the room is not in the document. */
function dropPanels() {
  if (!ui.cabPanels) return;
  ui.cabPanels.left.remove();
  ui.cabPanels.right.remove();
  ui.cabPanels = null;
  // The plaque lived on the right panel and went with it.
  ui.cabPlaque = null;
}

/**
 * Built here rather than in index.html for the same reason the sound screw is:
 * the markup keeps exactly the ids it has, and nothing that only exists above a
 * width belongs in the document that ships to a phone.
 *
 * The whole cabinet is `aria-hidden`. Every value on it is already announced by
 * the board it decorates — the topping badge is a live region, the scores are
 * read from the round dialog — so exposing it again would only double up.
 */
function buildPanels() {
  const left = panelShell('left');
  const wordmark = document.createElement('span');
  wordmark.className = 'cab-wordmark';
  wordmark.textContent = 'ZA! ARCADE';
  const fame = document.createElement('div');
  fame.className = 'cab-fame';
  left.append(wordmark, fame, artWindow('cabinet-left'));

  const right = panelShell('right');
  const special = document.createElement('div');
  special.className = 'cab-special';
  right.append(special, artWindow('cabinet-right'));

  el.shell.append(left, right);
  return { left, right, fame, special };
}

function panelShell(side) {
  const node = document.createElement('aside');
  node.className = `cab-panel cab-panel--${side}`;
  node.setAttribute('aria-hidden', 'true');
  return node;
}

/**
 * The mural in its frame, as a two-frame arcade loop: frame A under, frame B
 * over, B flipping on and off in whole frames. The vinyl is transparent, so the
 * panel's checker reads through both.
 *
 * The dashed window IS the frame in every state, so a mural that fails to load
 * leaves the handoff's placeholder rather than a broken-image box — the panels
 * were designed to read correctly either way, and a missing frame B just leaves
 * frame A holding still.
 */
function artWindow(stem) {
  const frame = document.createElement('div');
  frame.className = 'cab-art';
  const note = document.createElement('span');
  note.className = 'cab-art__note';
  note.textContent = 'SIDE ART';
  frame.append(note, muralFrame(frame, `${stem}.png`, 'a'), muralFrame(frame, `${stem}-b.png`, 'b'));
  return frame;
}

function muralFrame(frame, file, which) {
  const img = document.createElement('img');
  img.className = `cab-art__img cab-art__img--${which}`;
  img.alt = '';
  img.decoding = 'async';
  img.addEventListener('error', () => {
    img.remove();
    // A two-frame loop with one frame left is not a loop, it is a blink: the
    // survivor stops flipping and simply holds. Both frames animate now (A
    // counter-phases B because the vinyl is transparent), so the survivor
    // sheds whichever phase class it was carrying.
    const rest = frame.querySelectorAll('.cab-art__img');
    if (rest.length === 1) rest[0].classList.remove('cab-art__img--a', 'cab-art__img--b');
  }, { once: true });
  img.src = `assets/${file}`;
  return img;
}

/** Live data, not wallpaper. Both panels read the snapshot the board just drew. */
function paintPanels(snapshot) {
  if (!ui.cabPanels || !snapshot) return;
  paintFame(ui.cabPanels.fame, snapshot);
  paintSpecial(ui.cabPanels.special, snapshot);
  paintPlaque(snapshot);
}

/**
 * The wall of fame is the score list the lobby polaroids already draw from —
 * `seats[].wins` — sorted, top four. Nobody has won yet is a real state, and it
 * renders as nothing at all rather than as a heading over an empty box.
 */
function paintFame(host, snapshot) {
  const winners = (snapshot.seats || [])
    .filter((seat) => Number(seat.wins) >= 1)
    .sort((a, b) => Number(b.wins) - Number(a.wins))
    .slice(0, 4);
  if (!winners.length) {
    host.replaceChildren();
    return;
  }

  const label = document.createElement('span');
  label.className = 'cab-panel__label';
  label.textContent = 'WALL OF FAME';
  const list = document.createElement('div');
  list.className = 'cab-fame__list';
  winners.forEach((seat, index) => {
    const row = document.createElement('div');
    row.className = 'cab-fame__row';
    const who = document.createElement('span');
    who.className = 'cab-fame__who';
    who.textContent = `${index + 1} ${seat.name.toUpperCase()}`;
    const wins = document.createElement('span');
    wins.className = 'cab-fame__wins';
    wins.textContent = String(seat.wins).padStart(2, '0');
    row.append(who, wins);
    list.append(row);
  });
  host.replaceChildren(label, list);
}

/**
 * The chalkboard carries the topping in play — the same live value as the badge
 * under the oven, repainted the moment a wild changes it. Before the deal there
 * is no topping and the board is blank, which is what a real one would be.
 *
 * A real chalkboard also knows what time it is: the parlour sells TODAY'S
 * special while the sun is up and TONIGHT'S once it goes down. Local clock,
 * read at paint time — snapshots arrive constantly, so an evening that starts
 * mid-round flips the board without anyone touching it.
 */
function specialWord() {
  const hour = new Date().getHours();
  return hour >= 5 && hour < 18 ? "TODAY'S" : "TONIGHT'S";
}

function paintSpecial(host, snapshot) {
  const view = snapshot.game;
  const meta = view && view.currentTopping ? TOPPING_META[view.currentTopping] : null;
  if (!meta) {
    host.replaceChildren();
    return;
  }

  const label = document.createElement('span');
  label.className = 'cab-panel__label cab-panel__label--special';
  label.textContent = `${specialWord()} SPECIAL`;
  // The dish gets its plate: the same sprite the card windows use, so the
  // chalkboard advertises the exact topping on the table.
  const art = document.createElement('img');
  art.className = 'cab-special__art';
  art.src = `${SPRITE_DIR}/${meta.slug}.png`;
  art.alt = '';
  art.decoding = 'async';
  art.draggable = false;
  const dish = document.createElement('span');
  dish.className = 'cab-special__dish';
  dish.textContent = meta.label;
  const note = document.createElement('span');
  note.className = 'cab-special__note';
  note.textContent = 'MATCH IT OR DRAW';
  host.replaceChildren(label, art, dish, note);
}

// ---------------------------------------- what the cabinet does on an event --
/**
 * THE WIN. The cabinet prints the winner on the right panel — in addition to
 * the round dialog, never instead of it. Below the cap there is no panel to
 * print on and the dialog is the whole story, which is the fallback the spec
 * asks for and costs nothing to implement: no panel, no plaque.
 */
function paintPlaque(snapshot) {
  const panel = ui.cabPanels && ui.cabPanels.right;
  if (!panel) return;
  const view = snapshot.game;
  const winner = snapshot.phase === 'roundOver' && view && view.winnerId
    ? view.players.find((p) => p.id === view.winnerId)
    : null;

  if (!winner) {
    if (ui.cabPlaque) {
      ui.cabPlaque.remove();
      ui.cabPlaque = null;
    }
    return;
  }

  const line = `${winner.name.toUpperCase()} TAKES THE PIE`;
  if (ui.cabPlaque && ui.cabPlaque.isConnected) {
    // Restaging the same win would replay the print for no reason.
    if (ui.cabPlaque.textContent !== line) ui.cabPlaque.textContent = line;
    return;
  }
  const plaque = document.createElement('div');
  plaque.className = 'cab-plaque';
  plaque.textContent = line;
  panel.append(plaque);
  ui.cabPlaque = plaque;
}

/**
 * THE CHAIN. The glow lift and the running total both hang off the ladder the
 * juice pass already counts (`ui.chain`) — no second signal, no new state.
 * `ui.chainTotal` is the cards the run has forced, which is what "running
 * total" means at the table: two links of +2 is +4, not "2".
 */
function syncChain() {
  const table = document.querySelector('.table');
  if (!table) return;
  const live = ui.chain >= 1 && panelWidth() > 0;
  table.classList.toggle('is-chaining', live);

  if (!live) {
    if (ui.chainNode) {
      const going = ui.chainNode;
      ui.chainNode = null;
      going.classList.remove('is-on');
      setTimeout(() => going.remove(), cssTime('--d-fast', 160));
    }
    return;
  }

  if (!ui.chainNode) {
    const host = el.discardSlot.closest('.pile');
    if (!host) return;
    const node = document.createElement('span');
    node.className = 'cab-chain';
    node.setAttribute('aria-hidden', 'true');
    const total = document.createElement('b');
    total.className = 'cab-chain__n';
    const label = document.createElement('i');
    label.className = 'cab-chain__label';
    label.textContent = 'CHAIN';
    node.append(total, label);
    host.append(node);
    ui.chainNode = node;
    ui.chainTotalNode = total;
    requestAnimationFrame(() => node.classList.add('is-on'));
  }
  ui.chainTotalNode.textContent = `+${ui.chainTotal}`;
}

/**
 * THE SHOUT. `declaredZa` going false -> true on any player is the shout, read
 * off the snapshot the client already receives. The first snapshot of a session
 * or a round seeds the map instead of firing, so joining a table mid-shout does
 * not throw ZA! across a board you just arrived at.
 */
function syncShout(view) {
  const seen = ui.prevDeclared;
  let shouted = false;
  for (const player of view.players) {
    const now = Boolean(player.declaredZa);
    if (seen.has(player.id) && now && !seen.get(player.id)) shouted = true;
    seen.set(player.id, now);
  }
  if (shouted) showShout();
}

/** ZA! across the glass. Absolutely positioned, so the board does not move. */
function showShout() {
  const host = document.querySelector('.screen--game');
  if (!host) return;
  if (ui.shoutNode) ui.shoutNode.remove();
  const node = document.createElement('div');
  node.className = 'za-shout';
  node.setAttribute('aria-hidden', 'true');
  node.textContent = 'ZA!';
  host.append(node);
  ui.shoutNode = node;
  // The slam holds its last frame; the exit is a plain opacity fade, which is
  // the one thing reduced motion keeps because it aids comprehension.
  setTimeout(() => node.classList.add('is-out'), 820);
  setTimeout(() => {
    node.remove();
    if (ui.shoutNode === node) ui.shoutNode = null;
  }, 1120);
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
  button.className = 'screw screw--sound';
  const head = document.createElement('span');
  head.className = 'screw__head';
  head.setAttribute('aria-hidden', 'true');
  const label = document.createElement('span');
  label.className = 'screw__label';
  button.append(head, label);
  ui.muteLabel = label;

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
  // The label is a child now (the head is the other one), so the text goes
  // into it rather than onto the button — writing the button would wipe the
  // screw head out of the DOM.
  ui.muteLabel.textContent = on ? 'SND ON' : 'SND OFF';
  button.setAttribute('aria-pressed', String(on));
}

// ============================================================ HOUSE RULES ===
/**
 * The rules the server actually enforces, written out once.
 *
 * Every line here was read off `server/game.js` and `server/rooms.js` rather
 * than off the README, and the citation is kept beside it: if a rule moves,
 * the line that describes it is one grep away. Nothing in this overlay asks
 * the server anything — it is the same text for everybody, at every phase.
 */
const RULES = [
  {
    h: 'Empty your box',
    p: 'Put down your last card and the round is yours. The win is counted <b>before</b> the card takes effect, so a +4 that empties your box still wins and the chef beside you keeps a clean hand.',
    // game.js:398-401 — the length-0 check returns before applyCardEffect().
  },
  {
    h: 'Shout ZA!',
    p: 'The <b>ZA!</b> button is legal the moment you are down to <b>two cards or fewer</b>, and you may hit it on anybody\'s turn, not only your own.',
    // game.js:540-556 declareZa (hand.length > 2 refused) · viewFor 633-635.
  },
  {
    h: 'Caught quiet',
    p: 'Lay down your second-to-last card without shouting and any other chef can call you out: <b>2 cards</b> back in your hand. The window closes when the turn really leaves your seat and comes back — at a table of two a Burnt Slice brings it straight back, so you are still catchable — and picking up cards for any reason cancels a shout you already made.',
    // game.js:403-406 vulnerable · 47 + 559-578 callOut/CALLOUT_PENALTY
    // · 311-322 advanceTurn clears it only on a real change of seat
    // · 291-295 dealTo cancels declaredZa and vulnerable above one card.
  },
  {
    h: 'Matching',
    p: 'Play a card that shares the <b>topping in play</b>, or the <b>same number</b> as the card in the oven, or the <b>same symbol</b> — a Burnt Slice goes on any Burnt Slice, whatever the topping. While a wild sits on top there is no symbol to match: only the topping the chef named, or another wild, will do.',
    // game.js:208-222 canPlay — suit, number-on-number, kind-on-kind, and the
    // `!isWild(top)` guard that switches symbol matching off over a wild.
  },
  {
    h: 'The card you just drew',
    p: 'Nothing fits? Take one card off the dough pile. If it can be played you may play <b>that card and nothing else</b>, or keep it and pass; if it cannot be played your turn ends by itself.',
    // game.js:484-511 drawCard · 225-235 playableCardIds under drawnCard
    // · 379-381 playCard refuses any other card · 514-523 passTurn.
  },
  {
    h: 'Two at the table',
    p: 'With two chefs left there is no direction to reverse, so <b>Flip the Pie works like a Burnt Slice</b>: you play again.',
    // game.js:446 twoPlayerGame · 458-467 the reverse branch.
  },
];

/** The five action cards, each drawn by renderCard at rib size. */
const RULE_CARDS = [
  {
    card: { id: 'rules-skip', suit: 'pepperoni', kind: 'skip', value: null },
    name: 'Burnt Slice',
    what: 'The next chef gets the burnt bit and misses a turn.',
    // game.js:449-457 — advanceTurn(2).
  },
  {
    card: { id: 'rules-reverse', suit: 'basil', kind: 'reverse', value: null },
    name: 'Flip the Pie',
    what: 'Play turns around and runs the other way.',
    // game.js:458-467 — direction *= -1.
  },
  {
    card: { id: 'rules-draw2', suit: 'cheese', kind: 'draw2', value: null },
    name: 'Extra Toppings +2',
    what: 'The next chef takes two cards and misses a turn.',
    // game.js:469-477 — dealTo(victim, 2) then advanceTurn(2).
  },
  {
    card: { id: 'rules-wild', suit: null, kind: 'wild', value: null },
    name: "Chef's Choice",
    what: 'Goes on anything. You name the topping in play.',
    // game.js:211 canPlay · 385-387 a topping is required · 391.
  },
  {
    card: { id: 'rules-wild4', suit: null, kind: 'wild4', value: null },
    name: 'The Whole Pie +4',
    what: 'The next chef takes four and misses a turn, and you name the topping.',
    // game.js:469-477 — same branch as +2, count 4.
  },
];

const RULES_TAIL = [
  {
    h: 'No stacking',
    p: 'A +2 or a +4 is dealt the moment it lands and the turn skips straight past the chef who took it, so there is no answering one with your own.',
    // game.js:469-477 — the cards are dealt inside the effect and
    // advanceTurn(2) follows; the state carries no pending draw to pass on.
  },
  {
    h: 'The kitchen clock',
    p: 'Your turn carries <b>45 seconds</b> — the marquee counts the last ten down, then the oven gives you one card and moves on. Drop off and the table only waits about <b>12 seconds</b>; your seat is held for <b>2 minutes</b>.',
    // rooms.js:21 AWAY_TURN_TIMEOUT_MS = 12000 · 189 armed only for a seat
    // that is not a bot and not connected · 438-449 the tick that fires it
    // · game.js:529-537 forceSkip deals one card · rooms.js:22 + 394-399
    // RECONNECT_GRACE_MS = 120000.
  },
];

/**
 * Built once, on the first open. Nothing here changes with the snapshot, so a
 * rebuild would only throw away the scroll position the player was reading at.
 */
function buildRulesBody() {
  if (ui.rulesBuilt) return;
  ui.rulesBuilt = true;

  const frag = new DocumentFragment();
  const section = (rule) => {
    const sec = document.createElement('section');
    sec.className = 'rules__sec';
    const head = document.createElement('h3');
    head.className = 'rules__h';
    head.textContent = rule.h;
    const body = document.createElement('p');
    body.className = 'rules__p';
    body.innerHTML = rule.p; // fixed strings from this file, no player text
    sec.append(head, body);
    return sec;
  };

  for (const rule of RULES) frag.append(section(rule));

  const cards = section({
    h: 'The action cards',
    p: 'The first three come in all four toppings; the two wilds have none.',
  });
  const list = document.createElement('div');
  list.className = 'rules__cards';
  for (const entry of RULE_CARDS) {
    const row = document.createElement('div');
    row.className = 'rules__card';
    const face = renderCard(entry.card, { size: 'rib' });
    // The frame is the illustration of the line beside it. Read out, it would
    // say the card's name a second time.
    face.setAttribute('aria-hidden', 'true');
    face.removeAttribute('role');
    face.removeAttribute('aria-label');
    const text = document.createElement('p');
    text.className = 'rules__p';
    const name = document.createElement('b');
    name.className = 'rules__card-name';
    name.textContent = `${entry.name} — `;
    const what = document.createElement('span');
    what.className = 'rules__card-what';
    what.textContent = entry.what;
    text.append(name, what);
    row.append(face, text);
    list.append(row);
  }
  cards.append(list);
  frag.append(cards);

  for (const rule of RULES_TAIL) frag.append(section(rule));

  const foot = document.createElement('p');
  foot.className = 'rules__p rules__foot';
  foot.append(document.createTextNode('How all of this was built, and what broke on the way: '));
  const zine = document.createElement('a');
  zine.className = 'quiet-link';
  zine.href = 'blog/index.html';
  // A new tab, because the game is a live socket and this dialog opens over it.
  zine.target = '_blank';
  zine.rel = 'noopener';
  zine.textContent = 'THE ZINE';
  foot.append(zine, document.createTextNode('.'));
  frag.append(foot);

  el.rulesBody.replaceChildren(frag);
}

/** The opener to hand focus back to when the one that opened it is gone. */
function visibleRulesOpener() {
  const openers = [ui.btnRules, el.btnRulesLobby, el.btnRulesHome];
  return openers.find((node) => node && node.isConnected && node.offsetParent !== null) || null;
}

function openRules() {
  if (el.rulesOverlay.classList.contains('is-open')) return;
  buildRulesBody();
  // The body is built once and kept, so it also keeps wherever it was last
  // scrolled to — and a rules dialog that opens halfway down the action cards
  // reads as broken. Every open starts at the goal.
  el.rulesBody.scrollTop = 0;
  ui.rulesFocusReturn = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  // A popover left standing under the overlay would keep its own click-outside
  // and Escape behaviour behind an inert app.
  closePopovers();
  show(el.rulesOverlay);
  syncAppInert();
  sound.play('menu-blip');
  // The dialog itself, not the first control: it carries the accessible name,
  // so the title is what gets announced before the rules are read.
  requestAnimationFrame(() => el.rulesDialog.focus({ preventScroll: true }));
}

function closeRules(restoreFocus = true) {
  const wasOpen = el.rulesOverlay.classList.contains('is-open');
  hide(el.rulesOverlay);
  syncAppInert();
  if (!wasOpen) return;
  const target = ui.rulesFocusReturn;
  ui.rulesFocusReturn = null;
  if (!restoreFocus) return;
  // One frame late: `#app` is inert until the class change has been applied,
  // and focus() on anything inside an inert subtree is dropped on the floor.
  requestAnimationFrame(() => {
    const back =
      target && target.isConnected && !target.closest('[inert]') && target.offsetParent !== null
        ? target
        : visibleRulesOpener();
    if (back) back.focus({ preventScroll: true });
  });
}

/**
 * The fourth screw. Built here rather than in index.html for the same reason
 * the sound screw is: the markup keeps exactly the ids it has. Same 19px head
 * and VT323 label as its neighbours; only the slot angle is its own.
 */
function buildRulesScrew() {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'screw screw--rules';
  const head = document.createElement('span');
  head.className = 'screw__head';
  head.setAttribute('aria-hidden', 'true');
  const label = document.createElement('span');
  label.className = 'screw__label';
  label.textContent = 'RULES';
  button.append(head, label);
  button.addEventListener('click', openRules);
  ui.btnRules = button;
  el.btnLeaveGame.parentNode.insertBefore(button, el.btnLeaveGame);
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

// ------------------------------------------------- 03 · the armed screw ----
/**
 * Leaving a round in progress is a forfeit — the seat goes, the hand goes, and
 * the round can end on the way out — and it used to happen on one press of a
 * 44px screw sitting next to the code chip. The mis-tap and the deliberate
 * exit were the same gesture.
 *
 * So the screw arms first. One press flips the label to SURE? in sauce; a
 * second press inside four seconds leaves; silence disarms it. No modal: this
 * is the cabinet idiom, and a dialog over a live table would hide the very
 * thing somebody is deciding whether to walk away from. The lobby screw is
 * untouched — leaving a lobby costs nothing and asking twice would be rude.
 *
 * For a screen reader the accessible name is the whole signal, so it changes
 * with the state: "Leave" → "Confirm leave". Nothing depends on the colour.
 */
const LEAVE_ARM_MS = 4000;

function disarmLeave() {
  clearTimeout(ui.leaveTimer);
  ui.leaveTimer = 0;
  if (!ui.leaveArmed) return;
  ui.leaveArmed = false;
  el.btnLeaveGameLabel.textContent = 'Leave';
  el.btnLeaveGame.classList.remove('is-armed');
  el.btnLeaveGame.removeAttribute('aria-label');
}

function armLeave() {
  ui.leaveArmed = true;
  el.btnLeaveGameLabel.textContent = 'SURE?';
  el.btnLeaveGame.classList.add('is-armed');
  el.btnLeaveGame.setAttribute('aria-label', 'Confirm leave');
  clearTimeout(ui.leaveTimer);
  ui.leaveTimer = setTimeout(disarmLeave, LEAVE_ARM_MS);
}

el.btnLeaveGame.addEventListener('click', () => {
  if (!ui.leaveArmed) {
    armLeave();
    return;
  }
  disarmLeave();
  send({ type: 'leaveRoom' });
});

el.drawPile.addEventListener('click', () => {
  if (el.drawPile.disabled) return;
  // A drawn card usually has to be played, which disables this very button on
  // the next snapshot. Follow the card instead of being dropped on <body>.
  bookFocus({ kind: 'draw' });
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

/**
 * 2A/4 · pressing a chef calls them out.
 *
 * One delegated listener on the counter rather than one per seat: seats are
 * cached in `ui.seatNodes` and re-used for the whole round, and a handler
 * re-bound per render is the shape that silently dies. The seat only fires
 * while the live snapshot still lists it, so a stale press cannot send a
 * call-out the server would reject.
 */
function calloutFromSeat(node) {
  const id = node && node.dataset.id;
  const view = ui.snapshot && ui.snapshot.game;
  if (!id || !view || !(view.calloutTargets || []).includes(id)) return;
  closePopovers();
  send({ type: 'callout', targetId: id });
}

el.opponents.addEventListener('click', (event) => {
  const seat = event.target.closest('.seat[role="button"]');
  if (seat) calloutFromSeat(seat);
});

el.opponents.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  const seat = event.target.closest('.seat[role="button"]');
  if (!seat) return;
  event.preventDefault();
  calloutFromSeat(seat);
});

el.btnRulesHome.addEventListener('click', openRules);
el.btnRulesLobby.addEventListener('click', openRules);
el.btnRulesClose.addEventListener('click', () => closeRules());
el.pickerCancel.addEventListener('click', closePopovers);
el.calloutCancel.addEventListener('click', closePopovers);
// 09 · the host decides. Nothing here is on a clock.
el.btnNextRound.addEventListener('click', () => send({ type: 'newRound' }));
el.btnToLobby.addEventListener('click', () => send({ type: 'backToLobby' }));

// Which modality the player is on right now. Focus is only moved for them
// after a play or a draw when they are on the keyboard — see `bookFocus`.
// Capture phase and pointer-down first, so the flag is already right by the
// time a click handler that books an intent runs.
document.addEventListener('keydown', () => { ui.keyboardActive = true; }, { passive: true, capture: true });
document.addEventListener('pointerdown', () => { ui.keyboardActive = false; }, { passive: true, capture: true });

// 04 · any sign of life resets the nudge clock. Passive listeners: none of
// these ever calls preventDefault, and the move handler is on the hot path.
for (const kind of ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart']) {
  document.addEventListener(kind, bumpNudge, { passive: true });
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    // A hidden tab suspends rAF and clamps setTimeout, but snapshots keep
    // arriving: without this every flight launched while away would still be
    // on the layer, mid-transition, when the player came back. Nothing in
    // flight is information — the seats and the oven already hold the state.
    el.flyLayer.replaceChildren();
    return;
  }
  lastActivityBump = 0;
  bumpNudge();
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    // The rules sit over everything, so they answer Escape first. The
    // popovers under them are already closed and behind an inert app.
    if (el.rulesOverlay.classList.contains('is-open')) {
      closeRules();
      return;
    }
    // Escape is a retraction: the popover goes instantly, no exit animation.
    closePopovers(true);
  }

  // One trap, whichever modal is open. The round-over dialog holds nothing but
  // buttons, so widening the selector to links and the rules' scroll region
  // leaves its tab order exactly as it was.
  const modal = openModal();
  if (event.key !== 'Tab' || !modal) return;

  const controls = Array.from(
    modal.querySelectorAll('button:not([disabled]):not([hidden]), a[href], [tabindex="0"]')
  ).filter((control) => control.offsetParent !== null);
  if (controls.length === 0) {
    event.preventDefault();
    modal.focus({ preventScroll: true });
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
  resizeFrame = requestAnimationFrame(() => {
    // A width change can open or close the kitchen — the pit engages only
    // under pressure, and pressure is a function of width. The full render
    // moves the cards between rails; a plain relayout covers the rest.
    const view = ui.snapshot && ui.snapshot.game;
    if (view && view.hand && el.hand.dataset.open !== (handFitsOpen(view.hand.length) ? '1' : '0')) {
      const yourTurn = view.turnPlayerId === ui.snapshot.youId && view.status === 'playing';
      renderHand(ui.snapshot, view, yourTurn);
    } else {
      layoutNear(ui.nearRow);
    }
    // The pit's height moves when it re-wraps, and the peek hangs off it.
    invalidatePit();
    if (ui.peekCardId) {
      const slot = ui.handSlots.get(ui.peekCardId);
      if (slot && slot.parentElement === el.handPit) showPeek(slot);
    }
    // 1A · the cabinet is a width, so it is a resize concern before it is a
    // snapshot one: dragging past the cap has to build the room right there.
    syncCabinet();
    // 2A/8 · and so is the seating: the counter hands over to the queue at the
    // breakpoint, not at the next snapshot.
    relayoutSeating();
  });
});

// ================================================================== BOOT ===
function boot() {
  // The `hidden` attributes are only a no-JS fallback. Classes drive it now.
  for (const screen of el.screens) {
    screen.hidden = false;
    screen.inert = screen.dataset.screen !== 'home';
    // Not a control — a landing place. A room change focuses the section so the
    // room announces itself; see `landOnScreen`.
    screen.tabIndex = -1;
  }

  // Swap the emoji fallbacks in the static markup for the parlour icon set.
  for (const holder of document.querySelectorAll('[data-icon]')) {
    const drawn = icon(holder.dataset.icon);
    holder.classList.add('ico');
    holder.replaceChildren(...drawn.childNodes);
  }

  // The attract line at the foot of the home screen. The hi-score is real:
  // the most rounds anyone has won on this cabinet.
  const attract = document.createElement('p');
  attract.className = 'attract-line';
  attract.setAttribute('aria-hidden', 'true');
  let best = null;
  try { best = JSON.parse(localStorage.getItem('za.hiscore') || 'null'); } catch { /* fine */ }
  attract.textContent = best && best.wins
    ? `INSERT 25¢ — HI-SCORE ${String(best.wins).padStart(2, '0')} ${best.name.toUpperCase()}`
    : 'INSERT 25¢ — FREE PLAY';
  document.querySelector('.screen--home').append(attract);
  buildSpecialBoard();
  buildMuteToggle();
  // The live region exists from boot: a region inserted in the same tick as
  // its first sentence is the one announcement some readers swallow.
  announcerNode();
  buildRulesScrew();
  bindPit();

  const saved = localStorage.getItem('za.name');
  if (saved) el.inputName.value = saved;

  const code = new URLSearchParams(location.search).get('code');
  if (code) el.inputCode.value = code.toUpperCase();

  el.inputName.focus({ preventScroll: true });
  // 14 · from here on a screen change is worth covering. The first paint is
  // not: there is no previous room to hide.
  ui.booted = true;
  net.connect();
}

// ------------------------------------------------ 11 · special of the day ----
/**
 * The chalkboard by the door. Seven gags on a weekday rotation, entirely
 * cosmetic: nothing here touches the deck, the rules, the odds or the price of
 * anything, because there is no price of anything.
 */
const SPECIALS = [
  ['Sunday Gravy', 'Nonna’s recipe. Nobody knows what is in it. Nobody asks.'],
  ['Margherita Monday', 'Three toppings. One of them is optimism.'],
  ['Double Anchovy Tuesday', 'Twice the fish. Half the friends.'],
  ['White Pie Wednesday', 'No sauce. Enormous personality.'],
  ['The Works Thursday', 'Everything on it, including regret.'],
  ['Friday Deep Dish', 'Order at noon. Eat at eight. Worth it.'],
  ['Saturday Calzone', 'A pizza that went into witness protection.'],
];

function buildSpecialBoard() {
  const [name, joke] = SPECIALS[new Date().getDay() % SPECIALS.length];

  const board = document.createElement('aside');
  board.className = 'chalkboard';

  const head = document.createElement('p');
  head.className = 'chalkboard__head';
  head.textContent = 'Today’s Special';

  const dish = document.createElement('p');
  dish.className = 'chalkboard__dish';
  dish.textContent = name.toUpperCase();

  const line = document.createElement('p');
  line.className = 'chalkboard__line';
  line.textContent = joke;

  board.append(head, dish, line);
  el.formJoin.after(board);
}

boot();
