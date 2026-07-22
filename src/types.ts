export type Muscle =
  | 'chest' | 'back' | 'shoulders' | 'biceps' | 'triceps'
  | 'quads' | 'hams' | 'glutes' | 'calves' | 'abs';

export type Equipment = 'barbell' | 'dumbbell' | 'machine' | 'cable' | 'bodyweight';

export interface ExerciseDef {
  id: string;
  name: string;
  /** Pill label on the Lift screen, e.g. "Chest · Upper" */
  label: string;
  muscle: Muscle;
  equipment: Equipment;
  /** Movement family for variant swapping + grouped Progress, e.g. "bench-press". */
  family?: string;
  /** Weight is logged per hand (two dumbbells) — volume counts both. */
  perHand?: boolean;
  restSec: number;
  warmupRestSec: number;
  incrementKg: number;
}

export interface TemplateExercise {
  exerciseId: string;
  warmupSets: number;
  workingSets: number;
  repMin: number;
  repMax: number;
  supersetGroup?: string;
}

export interface ProgramDay {
  id: string;
  name: string;      // "Push A"
  subtitle: string;  // "Chest · Shoulders · Triceps"
  exercises: TemplateExercise[];
}

export interface Program {
  id: string;
  name: string;        // "Push / Pull / Legs"
  splitLabel: string;  // "Push / Pull / Legs"
  days: ProgramDay[];
}

/** Exercise plan snapshotted into a workout (template changes never rewrite history). */
export interface WorkoutExercise extends ExerciseDef {
  exerciseId: string;
  warmupSets: number;
  workingSets: number;
  repMin: number;
  repMax: number;
  supersetGroup?: string;
}

export interface Workout {
  id?: number;
  dayId: string;
  dayName: string;
  subtitle: string;
  startedAt: number;
  finishedAt: number | null;
  curExIdx: number;
  restEndsAt: number | null;
  restTotalSec: number;
  restLabel: string;
  exercises: WorkoutExercise[];
  // cached at finish for History rows
  prCount: number;
  volumeKg: number;
  setCount: number;
  durationSec: number;
  /** MET-based estimate cached at finish; 0 when no bodyweight was logged. */
  kcal?: number;
}

export type SetType = 'warmup' | 'working';
export type PRKind = 'weight' | 'e1rm' | 'rep';

export interface SetRow {
  id?: number;
  workoutId: number;
  exerciseId: string;
  exerciseName: string;
  muscle: Muscle;
  type: SetType;
  setIndex: number;
  weightKg: number;
  reps: number;
  e1rm: number;
  prs: PRKind[];
  loggedAt: number;
  /** Weight was per dumbbell — volume counts ×2. Snapshotted at log time. */
  perHand?: boolean;
  /** Bodyweight at log time for bodyweight-equipment moves — added into volume. */
  bodyKg?: number;
}

export interface BodyLog {
  id?: number;
  at: number;
  kg: number;
}

/** One accepted GPS fix on a run. */
export interface RunPoint {
  t: number;
  lat: number;
  lng: number;
}

export interface Run {
  id?: number;
  startedAt: number;
  finishedAt: number | null;
  /** Moving time only — auto-pause stops the clock. */
  movingSec: number;
  distanceM: number;
  /** Seconds per km over moving time; 0 until distance is meaningful. */
  avgPaceSec: number;
  /** Seconds per completed km. */
  splits: number[];
  points: RunPoint[];
  /** ~1.04 kcal/kg/km at finish; 0 without a bodyweight log. */
  kcal: number;
}

/** Both themes are OLED dark — this picks the accent world. */
export type ThemeMode = 'ember' | 'teal';

export interface Settings {
  id: 1;
  name: string;
  weeklyTarget: number;
  gymName: string;
  barKg: number;
  activeProgramId: string;
  /** Manual override for which day is suggested today (cleared on finish). */
  nextDayId: string | null;
  /** UI theme; absent on pre-v3 rows — treat as 'ember'. */
  theme?: ThemeMode;
  /** Last successful JSON export — drives the backup nudge. */
  lastBackupAt?: number;
}
