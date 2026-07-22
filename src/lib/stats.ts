import { db } from '../db/db';
import type { Muscle, PRKind, SetRow, TemplateExercise, WorkoutExercise } from '../types';
import { DAY_MS, fmtW, startOfWeek } from './format';

/** Epley estimated 1RM, 0.1 kg resolution. */
export function e1rm(weightKg: number, reps: number): number {
  if (reps <= 0 || weightKg <= 0) return 0;
  const v = reps === 1 ? weightKg : weightKg * (1 + reps / 30);
  return Math.round(v * 10) / 10;
}

/**
 * Tonnage for one set: per-hand dumbbell weight counts both hands, and
 * bodyweight-equipment moves (dips, leg raises) add the lifter's bodyweight.
 */
export function setVolume(s: Pick<SetRow, 'weightKg' | 'reps' | 'perHand' | 'bodyKg'>): number {
  return (s.weightKg + (s.bodyKg ?? 0)) * s.reps * (s.perHand ? 2 : 1);
}

/**
 * MET-based session calorie estimate (what every lifting app does — this is an
 * estimate, not a measurement). Hypertrophy training ≈ 5.0 MET.
 */
export function estimateKcal(bodyweightKg: number, durationSec: number): number {
  if (bodyweightKg <= 0 || durationSec <= 0) return 0;
  return Math.round(5.0 * bodyweightKg * (durationSec / 3600));
}

export interface ExerciseHistory {
  /** Working sets of the most recent *finished* session, ordered by setIndex. */
  lastSessionSets: SetRow[];
  bestWeight: number;
  bestE1rm: number;
  /** weight -> best reps at that weight */
  repsAtWeight: Map<number, number>;
  bestSessionVolume: number;
  sessionCount: number;
  /** best single set by e1RM */
  bestSet: SetRow | null;
}

/** All-time working-set history for an exercise across finished workouts. */
export async function getExerciseHistory(exerciseId: string, excludeWorkoutId?: number): Promise<ExerciseHistory> {
  const finished = new Map<number, number>(); // workoutId -> finishedAt
  await db.workouts.each((w) => { if (w.id != null && w.finishedAt) finished.set(w.id, w.finishedAt); });

  const sets = (await db.sets.where('exerciseId').equals(exerciseId).toArray())
    .filter((s) => s.type === 'working' && s.workoutId !== excludeWorkoutId && finished.has(s.workoutId));

  const h: ExerciseHistory = {
    lastSessionSets: [], bestWeight: 0, bestE1rm: 0,
    repsAtWeight: new Map(), bestSessionVolume: 0, sessionCount: 0, bestSet: null,
  };
  if (sets.length === 0) return h;

  const byWorkout = new Map<number, SetRow[]>();
  for (const s of sets) {
    (byWorkout.get(s.workoutId) ?? byWorkout.set(s.workoutId, []).get(s.workoutId)!).push(s);
    if (s.weightKg > h.bestWeight) h.bestWeight = s.weightKg;
    if (s.e1rm > h.bestE1rm) { h.bestE1rm = s.e1rm; }
    if (!h.bestSet || s.e1rm > h.bestSet.e1rm) h.bestSet = s;
    const prev = h.repsAtWeight.get(s.weightKg) ?? 0;
    if (s.reps > prev) h.repsAtWeight.set(s.weightKg, s.reps);
  }
  h.sessionCount = byWorkout.size;

  let lastId = -1; let lastAt = -1;
  for (const [wid, rows] of byWorkout) {
    const vol = rows.reduce((a, s) => a + setVolume(s), 0);
    if (vol > h.bestSessionVolume) h.bestSessionVolume = vol;
    const at = finished.get(wid)!;
    if (at > lastAt) { lastAt = at; lastId = wid; }
  }
  h.lastSessionSets = (byWorkout.get(lastId) ?? []).slice().sort((a, b) => a.setIndex - b.setIndex);
  return h;
}

export interface SetTarget {
  w: number | null;
  r: number;
  note: string;
}

/** Double progression: beat last time's reps; at the top of the range, add load and reset. */
export function targetFor(
  hist: ExerciseHistory,
  setIdx: number,
  tmpl: Pick<TemplateExercise, 'repMin' | 'repMax'>,
  incrementKg: number,
): SetTarget {
  const last = hist.lastSessionSets;
  if (last.length === 0) return { w: null, r: tmpl.repMin, note: 'First time · find your weight' };
  const s = last[Math.min(setIdx, last.length - 1)];
  if (s.reps >= tmpl.repMax) {
    return { w: s.weightKg + incrementKg, r: tmpl.repMin, note: `Weight up · last ${fmtW(s.weightKg)}×${s.reps}` };
  }
  return { w: s.weightKg, r: s.reps + 1, note: `Beat last ${s.reps}` };
}

const PR_LABEL: Record<PRKind, string> = { weight: 'Weight PR', e1rm: 'e1RM PR', rep: 'Rep PR' };

/**
 * Live PR detection for a working set. First-ever session for an exercise sets
 * the baseline silently (everything would be a "PR" otherwise).
 */
export function detectPRs(hist: ExerciseHistory, earlierToday: SetRow[], w: number, reps: number): PRKind[] {
  if (hist.sessionCount === 0 || w <= 0 || reps <= 0) return [];
  let bestWeight = hist.bestWeight;
  let bestE1 = hist.bestE1rm;
  let bestRepsHere = hist.repsAtWeight.get(w) ?? 0;
  let seenWeight = hist.repsAtWeight.has(w);
  for (const s of earlierToday) {
    if (s.type !== 'working') continue;
    if (s.weightKg > bestWeight) bestWeight = s.weightKg;
    if (s.e1rm > bestE1) bestE1 = s.e1rm;
    if (s.weightKg === w) { seenWeight = true; if (s.reps > bestRepsHere) bestRepsHere = s.reps; }
  }
  const prs: PRKind[] = [];
  if (w > bestWeight) prs.push('weight');
  if (e1rm(w, reps) > bestE1) prs.push('e1rm');
  if (seenWeight && reps > bestRepsHere) prs.push('rep');
  return prs;
}

/** Toast copy for the highest-priority PR. */
export function prToastText(prs: PRKind[], w: number, reps: number): string {
  const kind: PRKind = prs.includes('weight') ? 'weight' : prs.includes('e1rm') ? 'e1rm' : 'rep';
  return `⚡ ${PR_LABEL[kind]} · ${fmtW(w)} kg × ${reps}`;
}

export function prLabel(kind: PRKind): string {
  return PR_LABEL[kind];
}

// ---------- weekly hard sets ----------

export type MuscleBarGroup = 'Chest' | 'Back' | 'Legs' | 'Shoulders' | 'Arms';
export const BAR_GROUPS: MuscleBarGroup[] = ['Chest', 'Back', 'Legs', 'Shoulders', 'Arms'];

const GROUP_OF: Partial<Record<Muscle, MuscleBarGroup>> = {
  chest: 'Chest', back: 'Back', shoulders: 'Shoulders',
  biceps: 'Arms', triceps: 'Arms',
  quads: 'Legs', hams: 'Legs', glutes: 'Legs', calves: 'Legs',
};

/** Working sets logged since Monday, bucketed for the 10–20 zone bars. */
export async function weeklyHardSets(): Promise<Record<MuscleBarGroup, number>> {
  const since = startOfWeek();
  const rows = await db.sets.where('loggedAt').aboveOrEqual(since).toArray();
  const out: Record<MuscleBarGroup, number> = { Chest: 0, Back: 0, Legs: 0, Shoulders: 0, Arms: 0 };
  for (const s of rows) {
    if (s.type !== 'working') continue;
    const g = GROUP_OF[s.muscle];
    if (g) out[g]++;
  }
  return out;
}

// ---------- readiness ----------

export type Readiness = 'fresh' | 'ready' | 'cooked';
export interface ReadinessChip { label: string; state: Readiness; }

const READY_MUSCLES: { label: string; muscles: Muscle[] }[] = [
  { label: 'Chest', muscles: ['chest'] },
  { label: 'Delts', muscles: ['shoulders'] },
  { label: 'Triceps', muscles: ['triceps'] },
  { label: 'Back', muscles: ['back'] },
  { label: 'Biceps', muscles: ['biceps'] },
  { label: 'Quads', muscles: ['quads'] },
  { label: 'Hams', muscles: ['hams', 'glutes'] },
  { label: 'Calves', muscles: ['calves'] },
];

/** <36h since last hard set = cooked, 36–72h = ready, else fresh. */
export async function muscleReadiness(): Promise<ReadinessChip[]> {
  const since = Date.now() - 14 * DAY_MS;
  const rows = await db.sets.where('loggedAt').aboveOrEqual(since).toArray();
  const lastAt = new Map<Muscle, number>();
  for (const s of rows) {
    if (s.type !== 'working') continue;
    if (s.loggedAt > (lastAt.get(s.muscle) ?? 0)) lastAt.set(s.muscle, s.loggedAt);
  }
  return READY_MUSCLES.map(({ label, muscles }) => {
    const at = Math.max(...muscles.map((m) => lastAt.get(m) ?? 0));
    if (!at) return { label, state: 'fresh' as const };
    const h = (Date.now() - at) / 3_600_000;
    return { label, state: h < 36 ? 'cooked' : h < 72 ? 'ready' : 'fresh' };
  });
}

// ---------- milestone clubs ----------

/** Plate clubs — top working-set weight on the barbell staples. */
export const CLUBS: { exerciseId: string; label: string; steps: number[] }[] = [
  { exerciseId: 'bench', label: 'Bench', steps: [60, 80, 100, 120, 140] },
  { exerciseId: 'squat', label: 'Squat', steps: [60, 100, 140, 180, 220] },
  { exerciseId: 'deadlift', label: 'Deadlift', steps: [100, 140, 180, 220, 260] },
  { exerciseId: 'ohp', label: 'OHP', steps: [40, 60, 80, 100] },
  { exerciseId: 'bb-row', label: 'Row', steps: [60, 80, 100, 120] },
];

export interface ClubState {
  label: string;
  /** Highest threshold reached, or null while still chasing the first. */
  reached: number | null;
  /** Next threshold, or null when the ladder is topped out. */
  next: number | null;
}

/** Club standing per staple lift — lifts never trained are omitted. */
export async function clubStates(): Promise<ClubState[]> {
  const out: ClubState[] = [];
  for (const c of CLUBS) {
    const rows = await db.sets.where('exerciseId').equals(c.exerciseId).toArray();
    let best = 0;
    for (const s of rows) if (s.type === 'working' && s.weightKg > best) best = s.weightKg;
    if (best <= 0) continue;
    const reached = [...c.steps].reverse().find((t) => best >= t) ?? null;
    const next = c.steps.find((t) => best < t) ?? null;
    out.push({ label: c.label, reached, next });
  }
  return out;
}

/** Highest club threshold newly crossed by a working set at weight w, or null. */
export function clubCrossed(exerciseId: string, prevBestW: number, w: number): { label: string; step: number } | null {
  const c = CLUBS.find((x) => x.exerciseId === exerciseId);
  if (!c) return null;
  const step = [...c.steps].reverse().find((t) => w >= t && prevBestW < t);
  return step !== undefined ? { label: c.label, step } : null;
}

// ---------- monthly recap ----------

export interface MonthRecap {
  year: number;
  month: number; // 0-based
  sessions: number;
  volumeKg: number;
  prCount: number;
  durationSec: number;
  /** Best e1RM gains within the month vs the all-time best before it. */
  topGains: { name: string; deltaKg: number }[];
  /** Lifts logged for the first time this month. */
  newLifts: number;
  bwStart: number | null;
  bwEnd: number | null;
  /** Sessions per week row (Mon-anchored), spanning the month. */
  weeks: number[];
}

/** Aggregate one calendar month of training, or null when nothing finished. */
export async function monthRecap(year: number, month: number): Promise<MonthRecap | null> {
  const from = new Date(year, month, 1).getTime();
  const to = new Date(year, month + 1, 1).getTime();
  const workouts = (await db.workouts.where('finishedAt').between(from, to).toArray());
  if (workouts.length === 0) return null;
  const ids = new Set(workouts.map((w) => w.id!));

  const sessions = workouts.length;
  const volumeKg = workouts.reduce((a, w) => a + w.volumeKg, 0);
  const prCount = workouts.reduce((a, w) => a + w.prCount, 0);
  const durationSec = workouts.reduce((a, w) => a + w.durationSec, 0);

  // e1RM gains: best inside the month vs best any time before it
  const inMonth = new Map<string, { name: string; best: number }>();
  const before = new Map<string, number>();
  await db.sets.each((s) => {
    if (s.type !== 'working' || s.e1rm <= 0) return;
    if (ids.has(s.workoutId)) {
      const m = inMonth.get(s.exerciseId);
      if (!m || s.e1rm > m.best) inMonth.set(s.exerciseId, { name: s.exerciseName, best: s.e1rm });
    } else if (s.loggedAt < from) {
      if (s.e1rm > (before.get(s.exerciseId) ?? 0)) before.set(s.exerciseId, s.e1rm);
    }
  });
  const topGains: { name: string; deltaKg: number }[] = [];
  let newLifts = 0;
  for (const [id, m] of inMonth) {
    const prior = before.get(id);
    if (prior === undefined) { newLifts++; continue; }
    const delta = Math.round((m.best - prior) * 10) / 10;
    if (delta > 0) topGains.push({ name: m.name, deltaKg: delta });
  }
  topGains.sort((a, b) => b.deltaKg - a.deltaKg).splice(3);

  // bodyweight drift across the month
  const bw = (await db.bodylog.where('at').between(from, to).toArray()).sort((a, b) => a.at - b.at);

  // sessions per Mon-anchored week
  const firstWeek = startOfWeek(from);
  const weekCount = Math.ceil((to - firstWeek) / (7 * DAY_MS));
  const weeks = Array.from({ length: weekCount }, () => 0);
  for (const w of workouts) weeks[Math.floor((startOfWeek(w.finishedAt!) - firstWeek) / (7 * DAY_MS))]++;

  return {
    year, month, sessions, volumeKg, prCount, durationSec, topGains, newLifts,
    bwStart: bw[0]?.kg ?? null, bwEnd: bw[bw.length - 1]?.kg ?? null, weeks,
  };
}

// ---------- streak ----------

/** Consecutive weeks (incl. this week if it has a session) with >=1 finished workout. */
export function weekStreak(finishedTimes: number[]): number {
  if (finishedTimes.length === 0) return 0;
  const weeks = new Set(finishedTimes.map((t) => startOfWeek(t)));
  let cursor = startOfWeek();
  if (!weeks.has(cursor)) cursor -= 7 * DAY_MS; // mid-week grace
  let n = 0;
  while (weeks.has(cursor)) { n++; cursor -= 7 * DAY_MS; }
  return n;
}

/** Rough session length estimate for a template day, in minutes. */
export function estimateMinutes(exs: Pick<WorkoutExercise, 'workingSets' | 'warmupSets' | 'restSec'>[]): number {
  let sec = 0;
  for (const e of exs) {
    sec += e.workingSets * (40 + e.restSec) + e.warmupSets * (30 + 45);
  }
  return Math.round(sec / 60 / 5) * 5;
}
