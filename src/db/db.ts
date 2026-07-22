import Dexie, { type EntityTable } from 'dexie';
import type { BodyLog, Program, Run, SetRow, Settings, Workout } from '../types';
import { EXERCISES } from './exercises';

export const db = new Dexie('telum') as Dexie & {
  workouts: EntityTable<Workout, 'id'>;
  sets: EntityTable<SetRow, 'id'>;
  settings: EntityTable<Settings, 'id'>;
  programs: EntityTable<Program, 'id'>;
  bodylog: EntityTable<BodyLog, 'id'>;
  runs: EntityTable<Run, 'id'>;
};

db.version(1).stores({
  workouts: '++id, startedAt, finishedAt',
  sets: '++id, workoutId, exerciseId, loggedAt',
  settings: 'id',
  programs: 'id',
});

db.version(2).stores({
  workouts: '++id, startedAt, finishedAt',
  sets: '++id, workoutId, exerciseId, loggedAt',
  settings: 'id',
  programs: 'id',
  bodylog: '++id, at',
}).upgrade(async (tx) => {
  // One-time fixes for installs created before v2:
  // the old seeded default name was wrong — only rewrite if untouched.
  const s = await tx.table('settings').get(1);
  if (s && s.name === 'Dean') await tx.table('settings').update(1, { name: 'Andrew' });
  if (s && s.theme === undefined) await tx.table('settings').update(1, { theme: 'dark' });
  // Backfill per-hand flag on dumbbell sets logged before the flag existed,
  // so their volume counts both hands going forward.
  await tx.table('sets').toCollection().modify((row: SetRow) => {
    if (row.perHand === undefined && EXERCISES[row.exerciseId]?.perHand) row.perHand = true;
  });
});

db.version(3).stores({
  workouts: '++id, startedAt, finishedAt',
  sets: '++id, workoutId, exerciseId, loggedAt',
  settings: 'id',
  programs: 'id',
  bodylog: '++id, at',
}).upgrade(async (tx) => {
  // Light mode retired — both themes are dark now. Anyone who had picked
  // light gets its replacement (teal); everyone else stays on ember.
  const s = await tx.table('settings').get(1);
  if (s) await tx.table('settings').update(1, { theme: s.theme === 'light' ? 'teal' : 'ember' });
});

db.version(4).stores({
  workouts: '++id, startedAt, finishedAt',
  sets: '++id, workoutId, exerciseId, loggedAt',
  settings: 'id',
  programs: 'id',
  bodylog: '++id, at',
  runs: '++id, startedAt, finishedAt',
});

/** The one run with no finishedAt, if any (crash/reload recovery). */
export async function getActiveRun(): Promise<Run | undefined> {
  const recent = await db.runs.orderBy('startedAt').reverse().limit(3).toArray();
  return recent.find((r) => r.finishedAt === null);
}

/** The one workout with no finishedAt, if any. */
export async function getActiveWorkout(): Promise<Workout | undefined> {
  const recent = await db.workouts.orderBy('startedAt').reverse().limit(5).toArray();
  return recent.find((w) => w.finishedAt === null);
}

/** Most recent bodyweight entry, if any. */
export async function latestBodyweight(): Promise<BodyLog | undefined> {
  return db.bodylog.orderBy('at').last();
}
