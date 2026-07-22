import { db } from './db';
import type { Program, Settings } from '../types';

/** Hypertrophy PPL — double progression on every slot, warm-ups on the heavy openers. */
const PPL: Program = {
  id: 'ppl',
  name: 'Push / Pull / Legs',
  splitLabel: 'Push / Pull / Legs',
  days: [
    {
      id: 'push-a', name: 'Push A', subtitle: 'Chest · Shoulders · Triceps',
      exercises: [
        { exerciseId: 'bench', warmupSets: 2, workingSets: 4, repMin: 6, repMax: 8 },
        { exerciseId: 'db-shoulder-press', warmupSets: 1, workingSets: 3, repMin: 8, repMax: 10 },
        { exerciseId: 'incline-db-press', warmupSets: 1, workingSets: 4, repMin: 8, repMax: 10, supersetGroup: 'A' },
        { exerciseId: 'cable-fly', warmupSets: 0, workingSets: 3, repMin: 12, repMax: 15, supersetGroup: 'A' },
        { exerciseId: 'lateral-raise', warmupSets: 0, workingSets: 3, repMin: 12, repMax: 15 },
        { exerciseId: 'pushdown', warmupSets: 0, workingSets: 3, repMin: 10, repMax: 12 },
      ],
    },
    {
      id: 'pull-a', name: 'Pull A', subtitle: 'Back · Rear delts · Biceps',
      exercises: [
        { exerciseId: 'bb-row', warmupSets: 2, workingSets: 4, repMin: 6, repMax: 8 },
        { exerciseId: 'lat-pulldown', warmupSets: 1, workingSets: 3, repMin: 8, repMax: 10 },
        { exerciseId: 'cable-row', warmupSets: 0, workingSets: 3, repMin: 8, repMax: 10 },
        { exerciseId: 'face-pull', warmupSets: 0, workingSets: 3, repMin: 12, repMax: 15 },
        { exerciseId: 'bb-curl', warmupSets: 0, workingSets: 3, repMin: 8, repMax: 10 },
        { exerciseId: 'hammer-curl', warmupSets: 0, workingSets: 3, repMin: 10, repMax: 12 },
      ],
    },
    {
      id: 'legs-a', name: 'Legs A', subtitle: 'Quads · Hams · Calves',
      exercises: [
        { exerciseId: 'squat', warmupSets: 2, workingSets: 4, repMin: 6, repMax: 8 },
        { exerciseId: 'rdl', warmupSets: 1, workingSets: 3, repMin: 8, repMax: 10 },
        { exerciseId: 'leg-press', warmupSets: 0, workingSets: 3, repMin: 10, repMax: 12 },
        { exerciseId: 'leg-curl', warmupSets: 0, workingSets: 3, repMin: 10, repMax: 12 },
        { exerciseId: 'calf-raise', warmupSets: 0, workingSets: 4, repMin: 10, repMax: 12 },
        { exerciseId: 'cable-crunch', warmupSets: 0, workingSets: 3, repMin: 12, repMax: 15 },
      ],
    },
    {
      id: 'push-b', name: 'Push B', subtitle: 'Shoulder-focused',
      exercises: [
        { exerciseId: 'ohp', warmupSets: 2, workingSets: 4, repMin: 6, repMax: 8 },
        { exerciseId: 'incline-bench', warmupSets: 1, workingSets: 3, repMin: 8, repMax: 10 },
        { exerciseId: 'machine-chest-press', warmupSets: 0, workingSets: 3, repMin: 8, repMax: 10 },
        { exerciseId: 'lateral-raise', warmupSets: 0, workingSets: 4, repMin: 12, repMax: 15 },
        { exerciseId: 'dips', warmupSets: 0, workingSets: 3, repMin: 8, repMax: 12 },
        { exerciseId: 'oh-triceps-ext', warmupSets: 0, workingSets: 3, repMin: 10, repMax: 12 },
      ],
    },
    {
      id: 'pull-b', name: 'Pull B', subtitle: 'Back thickness · Biceps',
      exercises: [
        { exerciseId: 'deadlift', warmupSets: 2, workingSets: 3, repMin: 5, repMax: 8 },
        { exerciseId: 'cs-row', warmupSets: 1, workingSets: 3, repMin: 8, repMax: 10 },
        { exerciseId: 'lat-pulldown', warmupSets: 0, workingSets: 3, repMin: 10, repMax: 12 },
        { exerciseId: 'rear-delt-fly', warmupSets: 0, workingSets: 3, repMin: 12, repMax: 15 },
        { exerciseId: 'preacher-curl', warmupSets: 0, workingSets: 3, repMin: 10, repMax: 12 },
        { exerciseId: 'incline-db-curl', warmupSets: 0, workingSets: 3, repMin: 10, repMax: 12 },
      ],
    },
    {
      id: 'legs-b', name: 'Legs B', subtitle: 'Ham-focused · Glutes',
      exercises: [
        { exerciseId: 'hack-squat', warmupSets: 2, workingSets: 3, repMin: 8, repMax: 10 },
        { exerciseId: 'hip-thrust', warmupSets: 1, workingSets: 3, repMin: 8, repMax: 10 },
        { exerciseId: 'bss', warmupSets: 0, workingSets: 3, repMin: 10, repMax: 12 },
        { exerciseId: 'seated-leg-curl', warmupSets: 0, workingSets: 3, repMin: 10, repMax: 12 },
        { exerciseId: 'seated-calf-raise', warmupSets: 0, workingSets: 4, repMin: 12, repMax: 15 },
        { exerciseId: 'leg-raise', warmupSets: 0, workingSets: 3, repMin: 10, repMax: 15 },
      ],
    },
  ],
};

const UPPER_LOWER: Program = {
  id: 'ul',
  name: 'Upper / Lower',
  splitLabel: 'Upper / Lower',
  days: [
    {
      id: 'upper-a', name: 'Upper A', subtitle: 'Chest · Back · Arms',
      exercises: [
        { exerciseId: 'bench', warmupSets: 2, workingSets: 4, repMin: 6, repMax: 8 },
        { exerciseId: 'bb-row', warmupSets: 1, workingSets: 4, repMin: 6, repMax: 8 },
        { exerciseId: 'db-shoulder-press', warmupSets: 1, workingSets: 3, repMin: 8, repMax: 10 },
        { exerciseId: 'lat-pulldown', warmupSets: 0, workingSets: 3, repMin: 8, repMax: 10 },
        { exerciseId: 'bb-curl', warmupSets: 0, workingSets: 3, repMin: 8, repMax: 10 },
        { exerciseId: 'pushdown', warmupSets: 0, workingSets: 3, repMin: 10, repMax: 12 },
      ],
    },
    {
      id: 'lower-a', name: 'Lower A', subtitle: 'Quads · Hams · Calves',
      exercises: [
        { exerciseId: 'squat', warmupSets: 2, workingSets: 4, repMin: 6, repMax: 8 },
        { exerciseId: 'rdl', warmupSets: 1, workingSets: 3, repMin: 8, repMax: 10 },
        { exerciseId: 'leg-press', warmupSets: 0, workingSets: 3, repMin: 10, repMax: 12 },
        { exerciseId: 'leg-curl', warmupSets: 0, workingSets: 3, repMin: 10, repMax: 12 },
        { exerciseId: 'calf-raise', warmupSets: 0, workingSets: 4, repMin: 10, repMax: 12 },
      ],
    },
    {
      id: 'upper-b', name: 'Upper B', subtitle: 'Shoulders · Back width',
      exercises: [
        { exerciseId: 'ohp', warmupSets: 2, workingSets: 4, repMin: 6, repMax: 8 },
        { exerciseId: 'incline-db-press', warmupSets: 1, workingSets: 3, repMin: 8, repMax: 10 },
        { exerciseId: 'cs-row', warmupSets: 0, workingSets: 3, repMin: 8, repMax: 10 },
        { exerciseId: 'lateral-raise', warmupSets: 0, workingSets: 3, repMin: 12, repMax: 15 },
        { exerciseId: 'face-pull', warmupSets: 0, workingSets: 3, repMin: 12, repMax: 15 },
        { exerciseId: 'incline-db-curl', warmupSets: 0, workingSets: 3, repMin: 10, repMax: 12 },
      ],
    },
    {
      id: 'lower-b', name: 'Lower B', subtitle: 'Hams · Glutes · Calves',
      exercises: [
        { exerciseId: 'deadlift', warmupSets: 2, workingSets: 3, repMin: 5, repMax: 8 },
        { exerciseId: 'hack-squat', warmupSets: 1, workingSets: 3, repMin: 8, repMax: 10 },
        { exerciseId: 'hip-thrust', warmupSets: 0, workingSets: 3, repMin: 8, repMax: 10 },
        { exerciseId: 'seated-leg-curl', warmupSets: 0, workingSets: 3, repMin: 10, repMax: 12 },
        { exerciseId: 'seated-calf-raise', warmupSets: 0, workingSets: 4, repMin: 12, repMax: 15 },
      ],
    },
  ],
};

const DEFAULT_SETTINGS: Settings = {
  id: 1,
  name: 'Andrew',
  weeklyTarget: 5,
  gymName: '',
  barKg: 20,
  activeProgramId: 'ppl',
  nextDayId: null,
  theme: 'ember',
};

export async function initDB(): Promise<void> {
  await db.open();
  if ((await db.programs.count()) === 0) {
    await db.programs.bulkPut([PPL, UPPER_LOWER]);
  }
  if ((await db.settings.count()) === 0) {
    await db.settings.put(DEFAULT_SETTINGS);
  }
  // iOS can evict IndexedDB for uninstalled-feeling sites — ask to persist.
  try { await navigator.storage?.persist?.(); } catch { /* best effort */ }
}
