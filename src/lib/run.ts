import { db, latestBodyweight } from '../db/db';
import type { Run, RunPoint } from '../types';
import { restChime } from './ui';

/**
 * GPS run tracker — a module singleton so tracking survives screen switches
 * inside the app. The hard iOS-PWA constraint: geolocation only delivers while
 * the app is foreground with the screen on (the Run screen holds a wake lock).
 */

const MAX_ACCURACY_M = 30;   // reject fixes worse than this
const MAX_SPEED_MS = 7.5;    // reject GPS teleports (sustained running tops ~6 m/s)
const PAUSE_BELOW_MS = 0.6;  // auto-pause under this speed…
const RESUME_ABOVE_MS = 0.9; // …resume above this (hysteresis)
const MAX_GAP_SEC = 30;      // signal lost — re-anchor without bridging the gap
const PERSIST_EVERY_MS = 10_000;

export interface RunTrackerState {
  status: 'idle' | 'acquiring' | 'live';
  runId: number | null;
  startedAt: number;
  distanceM: number;
  movingSec: number;
  /** Auto-pause engaged (standing still / traffic light). */
  paused: boolean;
  /** Latest reported fix accuracy in meters, null before the first fix. */
  accuracy: number | null;
  /** Wall-clock ms of the last accepted moving fix — the UI extrapolates the clock from it. */
  lastMovingAt: number | null;
  splits: number[];
  points: RunPoint[];
  error: string | null;
}

const IDLE: RunTrackerState = {
  status: 'idle', runId: null, startedAt: 0, distanceM: 0, movingSec: 0,
  paused: false, accuracy: null, lastMovingAt: null, splits: [], points: [], error: null,
};

let state: RunTrackerState = IDLE;
let watchId: number | null = null;
let anchor: RunPoint | null = null;
let lastPersist = 0;
const listeners = new Set<() => void>();

function emit(next: Partial<RunTrackerState>) {
  state = { ...state, ...next };
  for (const l of listeners) l();
}

export function subscribeRun(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}
export function runTrackerState(): RunTrackerState {
  return state;
}

function haversineM(a: RunPoint, b: RunPoint): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function onFix(pos: GeolocationPosition) {
  const { latitude, longitude, accuracy } = pos.coords;
  const p: RunPoint = { t: pos.timestamp || Date.now(), lat: latitude, lng: longitude };

  if (accuracy > MAX_ACCURACY_M) {
    emit({ accuracy });
    return;
  }
  if (state.status === 'acquiring') {
    anchor = p;
    emit({ status: 'live', accuracy, points: [...state.points, p] });
    return;
  }
  if (!anchor) { anchor = p; emit({ accuracy }); return; }

  const dt = (p.t - anchor.t) / 1000;
  if (dt <= 0) return;
  if (dt > MAX_GAP_SEC) {
    // signal dropped — new anchor, the gap is neither distance nor time
    anchor = p;
    emit({ accuracy, paused: false });
    return;
  }
  const d = haversineM(anchor, p);
  const speed = d / dt;
  if (speed > MAX_SPEED_MS) return; // teleport — keep old anchor, wait for a sane fix

  anchor = p;
  const threshold = state.paused ? RESUME_ABOVE_MS : PAUSE_BELOW_MS;
  if (speed < threshold) {
    emit({ accuracy, paused: true });
    return;
  }

  const distanceM = state.distanceM + d;
  const movingSec = state.movingSec + dt;
  const splits = [...state.splits];
  if (Math.floor(distanceM / 1000) > Math.floor(state.distanceM / 1000)) {
    splits.push(Math.round(movingSec - splits.reduce((a, b) => a + b, 0)));
    restChime();
  }
  const points = [...state.points, p];
  emit({ accuracy, paused: false, distanceM, movingSec, splits, points, lastMovingAt: Date.now() });

  const now = Date.now();
  if (state.runId != null && now - lastPersist > PERSIST_EVERY_MS) {
    lastPersist = now;
    void db.runs.update(state.runId, { distanceM, movingSec, splits, points });
  }
}

function onErr(err: GeolocationPositionError) {
  emit({
    error: err.code === err.PERMISSION_DENIED
      ? 'Location denied — allow it in iOS Settings → Privacy → Location'
      : 'GPS unavailable — open sky helps',
  });
}

function watch() {
  watchId = navigator.geolocation.watchPosition(onFix, onErr, {
    enableHighAccuracy: true, maximumAge: 0, timeout: 20_000,
  });
}

/** Start a fresh run (must be called from a user gesture for the permission prompt). */
export async function startRun(): Promise<void> {
  if (state.status !== 'idle') return;
  const startedAt = Date.now();
  const runId = await db.runs.add({
    startedAt, finishedAt: null, movingSec: 0, distanceM: 0, avgPaceSec: 0, splits: [], points: [], kcal: 0,
  });
  anchor = null;
  lastPersist = Date.now();
  emit({ ...IDLE, status: 'acquiring', runId, startedAt });
  watch();
}

/** Pick an interrupted run back up after a reload/crash. */
export function resumeRun(run: Run): void {
  if (state.status !== 'idle' || run.id == null) return;
  anchor = null; // never bridge the gap
  lastPersist = Date.now();
  emit({
    ...IDLE, status: 'acquiring', runId: run.id, startedAt: run.startedAt,
    distanceM: run.distanceM, movingSec: run.movingSec, splits: run.splits, points: run.points,
  });
  watch();
}

/** Finalize (or discard) and return to idle. Returns the run id when kept. */
export async function stopRun(discard: boolean): Promise<number | null> {
  if (watchId != null) { navigator.geolocation.clearWatch(watchId); watchId = null; }
  const { runId, distanceM, movingSec, splits, points } = state;
  anchor = null;
  emit({ ...IDLE });
  if (runId == null) return null;
  if (discard || distanceM < 50) {
    await db.runs.delete(runId);
    return null;
  }
  const bw = (await latestBodyweight())?.kg ?? 0;
  await db.runs.update(runId, {
    finishedAt: Date.now(),
    distanceM, movingSec, splits, points,
    avgPaceSec: distanceM >= 100 ? (movingSec / distanceM) * 1000 : 0,
    kcal: bw > 0 ? Math.round(1.04 * bw * (distanceM / 1000)) : 0,
  });
  return runId;
}

/** Rolling pace over roughly the last minute of accepted fixes, sec/km. */
export function currentPaceSec(): number {
  const pts = state.points;
  if (state.paused || pts.length < 2) return 0;
  const end = pts[pts.length - 1];
  let i = pts.length - 2;
  let dist = 0;
  while (i >= 0 && end.t - pts[i].t < 60_000) {
    dist += haversineM(pts[i], pts[i + 1]);
    i--;
  }
  const span = (end.t - pts[Math.max(0, i + 1)].t) / 1000;
  if (dist < 20 || span < 10) return 0;
  return (span / dist) * 1000;
}
