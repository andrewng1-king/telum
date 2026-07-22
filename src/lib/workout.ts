import { db, getActiveWorkout, latestBodyweight } from '../db/db';
import { EXERCISES } from '../db/exercises';
import type { ProgramDay, SetRow, SetType, Workout, WorkoutExercise } from '../types';
import { clubCrossed, detectPRs, e1rm, estimateKcal, getExerciseHistory, setVolume } from './stats';

export function dayToWorkoutExercises(day: ProgramDay): WorkoutExercise[] {
  return day.exercises.map((te) => ({ ...EXERCISES[te.exerciseId], ...te }));
}

/** Create a live workout from a program day (or return the existing live one). */
export async function startWorkout(day: ProgramDay): Promise<number> {
  const active = await getActiveWorkout();
  if (active) return active.id!;
  const id = await db.workouts.add({
    dayId: day.id,
    dayName: day.name,
    subtitle: day.subtitle,
    startedAt: Date.now(),
    finishedAt: null,
    curExIdx: 0,
    restEndsAt: null,
    restTotalSec: 0,
    restLabel: '',
    exercises: dayToWorkoutExercises(day),
    prCount: 0, volumeKg: 0, setCount: 0, durationSec: 0,
  });
  return id!;
}

export interface LogResult {
  prs: SetRow['prs'];
  type: SetType;
  /** Plate-club threshold newly crossed by this set, if any. */
  club: { label: string; step: number } | null;
}

/**
 * Log the next set of the current exercise: PR-check, persist, start the rest
 * timer, and auto-advance the playlist when the exercise is complete.
 */
export async function logSet(workout: Workout, weightKg: number, reps: number): Promise<LogResult> {
  const ex = workout.exercises[workout.curExIdx];
  const done = await db.sets.where('workoutId').equals(workout.id!).toArray();
  const doneForEx = done.filter((s) => s.exerciseId === ex.exerciseId);
  const warmDone = doneForEx.filter((s) => s.type === 'warmup').length;
  const workDone = doneForEx.filter((s) => s.type === 'working').length;
  const isWarm = warmDone < ex.warmupSets;
  const type: SetType = isWarm ? 'warmup' : 'working';

  let prs: SetRow['prs'] = [];
  let club: LogResult['club'] = null;
  if (!isWarm) {
    const hist = await getExerciseHistory(ex.exerciseId, workout.id);
    prs = detectPRs(hist, doneForEx, weightKg, reps);
    const todayBest = Math.max(0, ...doneForEx.filter((s) => s.type === 'working').map((s) => s.weightKg));
    club = clubCrossed(ex.exerciseId, Math.max(hist.bestWeight, todayBest), weightKg);
  }

  // bodyweight-equipment moves fold the lifter's weight into volume
  const bodyKg = ex.equipment === 'bodyweight' ? (await latestBodyweight())?.kg : undefined;

  await db.sets.add({
    workoutId: workout.id!,
    exerciseId: ex.exerciseId,
    exerciseName: ex.name,
    muscle: ex.muscle,
    type,
    setIndex: isWarm ? warmDone : workDone,
    weightKg,
    reps,
    e1rm: isWarm ? 0 : e1rm(weightKg, reps),
    prs,
    loggedAt: Date.now(),
    ...(ex.perHand ? { perHand: true } : {}),
    ...(bodyKg ? { bodyKg } : {}),
  });

  const restSec = isWarm ? ex.warmupRestSec : ex.restSec;
  const patch: Partial<Workout> = {
    restEndsAt: Date.now() + restSec * 1000,
    restTotalSec: restSec,
    restLabel: isWarm ? 'Rest · warm-up' : 'Rest · working set',
  };

  // playlist auto-advance once this exercise's plan is complete
  if (!isWarm && workDone + 1 >= ex.workingSets) {
    const next = nextIncompleteIdx(workout, done, weightKg, reps);
    if (next !== null) patch.curExIdx = next;
  }
  await db.workouts.update(workout.id!, patch);
  return { prs, type, club };
}

/** Index of the next exercise with unlogged sets after cur (wrapping), or null. */
function nextIncompleteIdx(workout: Workout, done: SetRow[], _w: number, _r: number): number | null {
  const counts = new Map<string, { warm: number; work: number }>();
  for (const s of done) {
    const c = counts.get(s.exerciseId) ?? { warm: 0, work: 0 };
    if (s.type === 'warmup') c.warm++; else c.work++;
    counts.set(s.exerciseId, c);
  }
  // the set that triggered this call isn't in `done` yet
  const cur = workout.exercises[workout.curExIdx];
  const curC = counts.get(cur.exerciseId) ?? { warm: 0, work: 0 };
  curC.work++;
  counts.set(cur.exerciseId, curC);

  const n = workout.exercises.length;
  for (let step = 1; step <= n; step++) {
    const i = (workout.curExIdx + step) % n;
    const ex = workout.exercises[i];
    const c = counts.get(ex.exerciseId) ?? { warm: 0, work: 0 };
    if (c.warm < ex.warmupSets || c.work < ex.workingSets) return i;
  }
  return null;
}

/** Manual "Next": jump to the next exercise with unlogged sets. */
export async function skipToNext(workout: Workout): Promise<void> {
  const done = await db.sets.where('workoutId').equals(workout.id!).toArray();
  const counts = new Map<string, { warm: number; work: number }>();
  for (const s of done) {
    const c = counts.get(s.exerciseId) ?? { warm: 0, work: 0 };
    if (s.type === 'warmup') c.warm++; else c.work++;
    counts.set(s.exerciseId, c);
  }
  const n = workout.exercises.length;
  for (let step = 1; step <= n; step++) {
    const i = (workout.curExIdx + step) % n;
    if (i === workout.curExIdx) break;
    const ex = workout.exercises[i];
    const c = counts.get(ex.exerciseId) ?? { warm: 0, work: 0 };
    if (c.warm < ex.warmupSets || c.work < ex.workingSets) {
      await db.workouts.update(workout.id!, { curExIdx: i });
      return;
    }
  }
  // everything complete — just advance one (wrapping) so Next never feels dead
  await db.workouts.update(workout.id!, { curExIdx: (workout.curExIdx + 1) % n });
}

/** Add one working set to the current exercise (FAB). */
export async function addSet(workout: Workout): Promise<void> {
  const exercises = workout.exercises.map((e, i) =>
    i === workout.curExIdx ? { ...e, workingSets: e.workingSets + 1 } : e,
  );
  await db.workouts.update(workout.id!, { exercises });
}

/**
 * Swap the current exercise for an equipment variant from the same family.
 * The slot's plan (sets × reps, superset) carries over; history, targets and
 * PRs come from the variant's own log. Sets already logged stay with the
 * variant they were done on.
 */
export async function swapVariant(workout: Workout, variantId: string): Promise<void> {
  const def = EXERCISES[variantId];
  if (!def) return;
  const exercises = workout.exercises.map((e, i) =>
    i === workout.curExIdx
      ? {
          ...def,
          exerciseId: def.id,
          warmupSets: e.warmupSets,
          workingSets: e.workingSets,
          repMin: e.repMin,
          repMax: e.repMax,
          supersetGroup: e.supersetGroup,
        }
      : e,
  );
  await db.workouts.update(workout.id!, { exercises });
}

/** Close out the session and cache summary stats for History. */
export async function finishWorkout(workout: Workout): Promise<number> {
  const sets = await db.sets.where('workoutId').equals(workout.id!).toArray();
  const working = sets.filter((s) => s.type === 'working');
  const volumeKg = working.reduce((a, s) => a + setVolume(s), 0);
  const prCount = working.filter((s) => s.prs.length > 0).length;
  const now = Date.now();
  const durationSec = Math.round((now - workout.startedAt) / 1000);
  const bw = (await latestBodyweight())?.kg ?? 0;
  await db.workouts.update(workout.id!, {
    finishedAt: now,
    durationSec,
    volumeKg,
    setCount: sets.length,
    prCount,
    kcal: estimateKcal(bw, durationSec),
    restEndsAt: null,
  });
  // finishing a day clears any manual "do this day next" override
  await db.settings.update(1, { nextDayId: null });
  return workout.id!;
}

export async function discardWorkout(workout: Workout): Promise<void> {
  await db.transaction('rw', db.workouts, db.sets, async () => {
    await db.sets.where('workoutId').equals(workout.id!).delete();
    await db.workouts.delete(workout.id!);
  });
}

/** Plates per side for a barbell load. */
export function platesFor(totalKg: number, barKg: number): number[] {
  const PLATES = [25, 20, 15, 10, 5, 2.5, 1.25];
  let side = (totalKg - barKg) / 2;
  const out: number[] = [];
  for (const p of PLATES) {
    while (side >= p - 1e-9) { out.push(p); side -= p; }
  }
  return out;
}
