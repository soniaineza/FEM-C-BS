/**
 * A small on-device performance recorder.
 *
 * It exists because "the app feels laggy on my phone" cannot be measured from
 * a laptop: emulators and web previews have different CPUs, different GPUs and
 * no thermal throttling. This records what actually happens on the real
 * handset — frame rate, dropped frames, and how long individual screens and
 * the map take — so a complaint about lag becomes a number.
 *
 * It is off unless explicitly switched on, so a release build pays nothing:
 * every call becomes a cheap `if (!enabled) return`.
 */

/** Longer than this and the user sees a stutter rather than smooth motion. */
const JANK_MS = 32;
/** Frames worse than this are a visible freeze, not a stutter. */
const FREEZE_MS = 250;
const MAX_EVENTS = 60;

export interface PerfEvent {
  name: string;
  ms: number;
  at: number;
}

export interface PerfSnapshot {
  fps: number;
  worstFrameMs: number;
  jankCount: number;
  freezeCount: number;
  frames: number;
  events: PerfEvent[];
}

// Strictly opt-in, through a build flag, so a profiling APK is something you
// make deliberately. Deliberately NOT on in development as well: it would
// then appear in every screenshot and every demo, and nobody would trust that
// it is absent from a release.
export const perfEnabled: boolean = process.env.EXPO_PUBLIC_PERF_OVERLAY === '1';

const marks = new Map<string, number>();
let events: PerfEvent[] = [];
let frames = 0;
let jank = 0;
let freezes = 0;
let worstFrame = 0;
let lastFrameAt = 0;
let windowStart = 0;
let fps = 0;
let running = false;
const listeners = new Set<(snapshot: PerfSnapshot) => void>();

function snapshot(): PerfSnapshot {
  return {
    fps,
    worstFrameMs: Math.round(worstFrame),
    jankCount: jank,
    freezeCount: freezes,
    frames,
    events: events.slice(-MAX_EVENTS),
  };
}

function emit() {
  const s = snapshot();
  for (const listener of listeners) listener(s);
}

function tick() {
  if (!running) return;
  const now = Date.now();
  if (lastFrameAt) {
    const delta = now - lastFrameAt;
    // The first frame after a navigation or a cold screen is always long;
    // it is still a real stutter, so it counts.
    if (delta > worstFrame) worstFrame = delta;
    if (delta >= FREEZE_MS) freezes += 1;
    else if (delta >= JANK_MS) jank += 1;
  }
  lastFrameAt = now;
  frames += 1;

  if (now - windowStart >= 1000) {
    fps = Math.round((frames * 1000) / (now - windowStart));
    frames = 0;
    windowStart = now;
    emit();
  }
  requestAnimationFrame(tick);
}

export const perf = {
  enabled: perfEnabled,

  /** Starts the frame counter. Safe to call more than once. */
  start() {
    if (!perfEnabled || running) return;
    running = true;
    windowStart = Date.now();
    lastFrameAt = 0;
    requestAnimationFrame(tick);
  },

  stop() {
    running = false;
  },

  /** Opens a timing window; close it with `measure` under the same name. */
  mark(name: string) {
    if (!perfEnabled) return;
    marks.set(name, Date.now());
  },

  /** Closes a window opened by `mark` and records how long it took. */
  measure(name: string) {
    if (!perfEnabled) return;
    const started = marks.get(name);
    if (started == null) return;
    marks.delete(name);
    const ms = Date.now() - started;
    events = [...events.slice(-(MAX_EVENTS - 1)), { name, ms, at: Date.now() }];
    emit();
  },

  /** Records a duration measured elsewhere. */
  record(name: string, ms: number) {
    if (!perfEnabled) return;
    events = [...events.slice(-(MAX_EVENTS - 1)), { name, ms: Math.round(ms), at: Date.now() }];
    emit();
  },

  reset() {
    events = [];
    jank = 0;
    freezes = 0;
    worstFrame = 0;
    frames = 0;
    windowStart = Date.now();
    emit();
  },

  subscribe(listener: (snapshot: PerfSnapshot) => void): () => void {
    listeners.add(listener);
    listener(snapshot());
    return () => {
      listeners.delete(listener);
    };
  },

  snapshot,
};
