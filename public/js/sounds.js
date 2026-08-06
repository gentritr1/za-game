/**
 * Za cabinet sound.
 *
 * Every cue is synthesised at play time from square, triangle and noise
 * sources with hand-drawn gain envelopes. There are no audio files and no
 * dependencies: this is the whole sound department.
 *
 * Three rules the rest of the client relies on:
 *
 *   1. Nothing here ever throws. If the Web Audio API is missing, blocked or
 *      broken, every call degrades to silence and the game plays on.
 *   2. The context is built on the first real user gesture, never at import
 *      time, so the browser's autoplay policy is satisfied.
 *   3. Sound is seasoning. Peak gain per voice is capped at 0.25 and cues are
 *      short. Nothing in the game is ever communicated by sound alone — every
 *      cue rides along with something you can see.
 */

const MUTE_KEY = 'za.muted';

/** Hard ceiling on any single voice, per the handoff. */
const PEAK_CAP = 0.25;

/** The whole cabinet sits under one fader so mute is a single ramp. */
const MASTER_GAIN = 0.7;

/** More than this many voices in flight and new cues are dropped. */
const VOICE_BUDGET = 14;

const hasWindow = typeof window !== 'undefined';
const hasDocument = typeof document !== 'undefined';

let ctx = null;
let master = null;
let noiseBuffer = null;
let unavailable = false;
let armed = false;

let voices = 0;
/** When the last cue was scheduled, so the crowd can duck under an effect. */
let lastCueAt = -Infinity;

// ------------------------------------------------------------- preference --
function readMuted() {
  try {
    return hasWindow && window.localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeMuted(value) {
  try {
    if (!hasWindow) return;
    window.localStorage.setItem(MUTE_KEY, value ? '1' : '0');
  } catch {
    /* private mode, quota, blocked storage — the preference just won't stick. */
  }
}

let muted = readMuted();

// ----------------------------------------------------------------- engine --
/**
 * Builds the audio graph the first time it is genuinely needed. Returns null
 * whenever Web Audio is not usable, and remembers that so it is only tried
 * once.
 */
function context() {
  if (ctx || unavailable) return ctx;
  if (!hasWindow) {
    unavailable = true;
    return null;
  }
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) {
    unavailable = true;
    return null;
  }
  try {
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : MASTER_GAIN;
    master.connect(ctx.destination);
  } catch {
    unavailable = true;
    ctx = null;
    master = null;
  }
  return ctx;
}

/** A second of white noise, reused by every noise-based cue. */
function noise() {
  if (noiseBuffer || !ctx) return noiseBuffer;
  try {
    const frames = Math.floor(ctx.sampleRate);
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
    noiseBuffer = buffer;
  } catch {
    noiseBuffer = null;
  }
  return noiseBuffer;
}

/**
 * The autoplay policy only lets a context start inside a user gesture, so the
 * listeners below are the ignition. They run once, on the first interaction of
 * any kind, and then take themselves off.
 */
function arm() {
  if (armed || !hasWindow || !hasDocument) return;
  armed = true;
  const ignite = () => {
    const audio = context();
    if (audio && audio.state === 'suspended') {
      try {
        audio.resume();
      } catch {
        /* resume can reject; silence is an acceptable outcome. */
      }
    }
  };
  const events = ['pointerdown', 'keydown', 'touchstart'];
  const once = () => {
    ignite();
    for (const type of events) window.removeEventListener(type, once);
  };
  for (const type of events) {
    window.addEventListener(type, once, { passive: true });
  }
}

/** True when a cue may be scheduled right now. */
function open() {
  if (muted) return false;
  const audio = context();
  if (!audio) return false;
  if (audio.state === 'suspended') {
    // No gesture yet. Try to wake it, but do not queue anything up.
    try {
      audio.resume();
    } catch {
      /* ignore */
    }
    if (audio.state === 'suspended') return false;
  }
  return voices < VOICE_BUDGET;
}

function spend(seconds) {
  voices++;
  if (!hasWindow) return;
  window.setTimeout(() => {
    voices = Math.max(0, voices - 1);
  }, Math.max(30, seconds * 1000 + 40));
}

/**
 * One pitched voice: an oscillator through its own gain envelope.
 *
 * @param {object} spec
 * @param {'square'|'triangle'|'sine'|'sawtooth'} [spec.type]
 * @param {number} spec.freq      starting frequency in Hz
 * @param {number} [spec.to]      glide target, reached at the end of the note
 * @param {number} [spec.at]      offset from now, in seconds
 * @param {number} [spec.dur]     note length in seconds
 * @param {number} [spec.peak]    peak gain, clamped to PEAK_CAP
 * @param {number} [spec.attack]  attack time in seconds
 * @param {number} [spec.filter]  optional lowpass corner in Hz
 */
function tone(spec) {
  if (!ctx || !master) return;
  const {
    type = 'square',
    freq,
    to = 0,
    at = 0,
    dur = 0.1,
    peak = 0.12,
    attack = 0.005,
    filter = 0,
  } = spec;
  try {
    const t0 = ctx.currentTime + at;
    const level = Math.min(Math.abs(peak), PEAK_CAP);
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, freq), t0);
    if (to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + dur);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(level, t0 + Math.min(attack, dur * 0.5));
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    let tail = gain;
    if (filter) {
      const low = ctx.createBiquadFilter();
      low.type = 'lowpass';
      low.frequency.setValueAtTime(filter, t0);
      gain.connect(low);
      tail = low;
    }
    osc.connect(gain);
    tail.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
    spend(at + dur);
  } catch {
    /* a scheduling failure is not worth breaking a card game over. */
  }
}

/**
 * One noise voice through a band or high pass, with an optional filter sweep.
 *
 * @param {object} spec
 * @param {number} [spec.at]      offset from now, in seconds
 * @param {number} [spec.dur]     length in seconds
 * @param {number} [spec.peak]    peak gain, clamped to PEAK_CAP
 * @param {number} [spec.freq]    filter corner at the start
 * @param {number} [spec.to]      filter corner at the end
 * @param {'lowpass'|'highpass'|'bandpass'} [spec.type]
 * @param {number} [spec.q]       filter resonance
 * @param {number} [spec.attack]  attack time in seconds (a swell wants a long one)
 */
function hiss(spec) {
  if (!ctx || !master) return;
  const buffer = noise();
  if (!buffer) return;
  const {
    at = 0,
    dur = 0.1,
    peak = 0.1,
    freq = 1200,
    to = 0,
    type = 'bandpass',
    q = 1,
    attack = 0.004,
  } = spec;
  try {
    const t0 = ctx.currentTime + at;
    const level = Math.min(Math.abs(peak), PEAK_CAP);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;

    const band = ctx.createBiquadFilter();
    band.type = type;
    band.Q.setValueAtTime(q, t0);
    band.frequency.setValueAtTime(Math.max(30, freq), t0);
    if (to) band.frequency.exponentialRampToValueAtTime(Math.max(30, to), t0 + dur);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(level, t0 + Math.min(attack, dur * 0.6));
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    src.connect(band);
    band.connect(gain);
    gain.connect(master);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
    spend(at + dur);
  } catch {
    /* ignore */
  }
}

// -------------------------------------------------------------- the cues ---
/** Semitone above a base frequency, for the little runs and jingles. */
function step(base, semitones) {
  return base * Math.pow(2, semitones / 12);
}

const CUES = {
  /**
   * A · the chain. One coin per link, the whole blip transposed an octave up
   * per link so the escalation is heard before the combo stamp is read. The
   * transposition is capped at three octaves; past that it is only dog noise.
   */
  'coin-blip'(link = 1) {
    const mul = Math.pow(2, Math.min(Math.max(link, 1), 4) - 1);
    tone({ type: 'square', freq: 988 * mul, at: 0, dur: 0.05, peak: 0.14 });
    tone({ type: 'square', freq: 1319 * mul, at: 0.05, dur: 0.13, peak: 0.12 });
  },

  /** A · the resolve. Four notes down, the arcade way of saying "that's that". */
  'descend-run'() {
    const notes = [523, 440, 349, 262];
    notes.forEach((freq, i) => {
      tone({ type: 'square', freq, at: i * 0.09, dur: 0.085, peak: 0.13 });
    });
  },

  /** B · the shout. A four-note power-up scramble under the button slam. */
  'power-up'() {
    [523, 659, 784, 1047].forEach((freq, i) => {
      tone({ type: 'square', freq, at: i * 0.045, dur: 0.05, peak: 0.15 });
    });
    tone({ type: 'triangle', freq: 1047, to: 1568, at: 0.18, dur: 0.14, peak: 0.12 });
  },

  /** C · one rising beep per drained step of the call-out window. */
  'timer-beep'(index = 1) {
    const n = Math.min(Math.max(index, 1), 5);
    tone({ type: 'square', freq: step(520, (n - 1) * 2), dur: 0.07, peak: 0.11 });
  },

  /** C · caught. A flat, ugly two-tone buzz. */
  buzzer() {
    tone({ type: 'square', freq: 104, dur: 0.34, peak: 0.16, filter: 900 });
    tone({ type: 'square', freq: 98, dur: 0.34, peak: 0.14, filter: 900 });
  },

  /** C · the window closed and nobody noticed. Soft, private, upward. */
  'relieved-chime'() {
    tone({ type: 'triangle', freq: 880, dur: 0.16, peak: 0.1 });
    tone({ type: 'triangle', freq: 1175, at: 0.11, dur: 0.22, peak: 0.09 });
  },

  /** G · a dry click as the card comes off the dough. */
  'card-snap'() {
    hiss({ dur: 0.035, peak: 0.13, freq: 2600, to: 1100, type: 'highpass', q: 0.7 });
  },

  /** D · one blip per visible jump of a card in flight. */
  'flight-blip'(index = 0) {
    tone({ type: 'square', freq: step(660, Math.min(index, 5) * 2), dur: 0.03, peak: 0.07 });
  },

  /** E · burnt slice: a sizzle that collapses into a flat buzz. */
  'sizzle-buzz'() {
    hiss({ dur: 0.26, peak: 0.11, freq: 4200, to: 900, type: 'bandpass', q: 0.8, attack: 0.02 });
    tone({ type: 'square', freq: 92, at: 0.2, dur: 0.2, peak: 0.12, filter: 700 });
  },

  /** F · flip the pie: 200ms of tape dragged backwards. */
  'tape-scrub'() {
    hiss({ dur: 0.2, peak: 0.1, freq: 3000, to: 400, type: 'bandpass', q: 1.4 });
    tone({ type: 'triangle', freq: 1200, to: 180, dur: 0.2, peak: 0.1 });
  },

  /** H · the picker opens. */
  'menu-blip'() {
    tone({ type: 'square', freq: 880, dur: 0.03, peak: 0.1 });
  },

  /** H · a topping is chosen and the badge recolours. */
  'confirm-ding'() {
    tone({ type: 'triangle', freq: 659, dur: 0.09, peak: 0.12 });
    tone({ type: 'triangle', freq: 988, at: 0.07, dur: 0.18, peak: 0.11 });
  },

  /**
   * I · four bars, deliberately too long, because winning should overstay its
   * welcome by a beat. Square lead over a triangle bass.
   */
  'victory-jingle'() {
    const beat = 0.15;
    const lead = [
      [523, 1], [659, 1], [784, 1], [1047, 2],
      [784, 1], [1047, 1], [1319, 2],
      [1175, 1], [1047, 1], [880, 1], [1047, 2],
      [1319, 4],
    ];
    let at = 0;
    for (const [freq, beats] of lead) {
      tone({ type: 'square', freq, at, dur: beat * beats * 0.92, peak: 0.12 });
      at += beat * beats;
    }
    const bass = [[131, 0], [196, 0.6], [131, 1.2], [175, 1.8], [131, 2.4]];
    for (const [freq, when] of bass) {
      tone({ type: 'triangle', freq, at: when, dur: 0.5, peak: 0.1, filter: 600 });
    }
  },

  /**
   * 6C · the room disagrees. A filtered noise swell with a sagging low voice
   * under it: not a sample, but it reads as a crowd from across a pizzeria.
   * Intensity 1 is one polite voice, 3 is the whole room.
   */
  boo(intensity = 1) {
    const n = Math.min(Math.max(intensity, 1), 3);
    const dur = [0.4, 0.7, 0.9][n - 1];
    // Ducked when an effect cue is still ringing, so the boo never masks it.
    const duck = ctx && ctx.currentTime - lastCueAt < 0.22 ? 0.6 : 1;
    hiss({
      dur,
      peak: (0.06 + n * 0.03) * duck,
      freq: 520,
      to: 260,
      type: 'lowpass',
      q: 0.6,
      attack: dur * 0.3,
    });
    tone({
      type: 'triangle',
      freq: 300,
      to: 150,
      dur,
      peak: (0.05 + n * 0.025) * duck,
      attack: dur * 0.28,
      filter: 700,
    });
    if (n >= 2) {
      tone({
        type: 'triangle',
        freq: 226,
        to: 118,
        dur: dur * 0.92,
        peak: 0.05 * duck,
        attack: dur * 0.3,
        filter: 600,
      });
    }
  },

  /** 6C · third offence. Three claps, spaced far enough apart to hurt. */
  'slow-clap'() {
    [0, 0.45, 0.9].forEach((at) => {
      hiss({ at, dur: 0.05, peak: 0.12, freq: 1500, to: 900, type: 'bandpass', q: 0.9 });
    });
  },
};

// -------------------------------------------------------------- the module -
export const sound = {
  /**
   * Plays a named cue. Unknown names, a missing Web Audio API, a suspended
   * context and a muted cabinet are all silent no-ops.
   *
   * @param {string} name  one of the keys in CUES
   * @param {number} [arg] cue-specific: chain link, timer step, boo intensity…
   */
  play(name, arg) {
    const cue = CUES[name];
    if (!cue) return;
    if (!open()) return;
    try {
      cue(arg);
      if (name !== 'boo' && name !== 'slow-clap') lastCueAt = ctx.currentTime;
    } catch {
      /* a broken cue must never take the turn down with it. */
    }
  },

  /** Names of every cue this module knows, for tests and for the console. */
  get cues() {
    return Object.keys(CUES);
  },

  get muted() {
    return muted;
  },

  set muted(value) {
    muted = Boolean(value);
    writeMuted(muted);
    if (!master || !ctx) return;
    try {
      // A short ramp instead of a jump, so muting mid-cue does not click.
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setTargetAtTime(muted ? 0 : MASTER_GAIN, ctx.currentTime, 0.01);
    } catch {
      /* ignore */
    }
  },
};

arm();

export default sound;
