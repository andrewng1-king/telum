import type { ExerciseDef } from '../types';

const bb = { equipment: 'barbell' as const, incrementKg: 2.5, warmupRestSec: 45 };
const dbell = { equipment: 'dumbbell' as const, incrementKg: 2, warmupRestSec: 45 };
const mc = { equipment: 'machine' as const, incrementKg: 2.5, warmupRestSec: 45 };
const cb = { equipment: 'cable' as const, incrementKg: 2.5, warmupRestSec: 45 };
const bw = { equipment: 'bodyweight' as const, incrementKg: 2.5, warmupRestSec: 45 };
/** Two dumbbells — weight logged per hand, volume counts both. */
const each = { perHand: true };

const defs: ExerciseDef[] = [
  // ---- chest ----
  { id: 'bench', name: 'Barbell Bench Press', label: 'Chest', muscle: 'chest', family: 'bench-press', restSec: 150, ...bb },
  { id: 'db-bench', name: 'Dumbbell Bench Press', label: 'Chest', muscle: 'chest', family: 'bench-press', restSec: 120, ...dbell, ...each },
  { id: 'machine-chest-press', name: 'Machine Chest Press', label: 'Chest', muscle: 'chest', family: 'bench-press', restSec: 90, ...mc },
  { id: 'incline-bench', name: 'Incline Barbell Press', label: 'Chest · Upper', muscle: 'chest', family: 'incline-press', restSec: 120, ...bb },
  { id: 'incline-db-press', name: 'Incline Dumbbell Press', label: 'Chest · Upper', muscle: 'chest', family: 'incline-press', restSec: 90, ...dbell, ...each },
  { id: 'cable-fly', name: 'Cable Fly', label: 'Chest · Stretch', muscle: 'chest', family: 'fly', restSec: 60, ...cb },
  { id: 'pec-deck', name: 'Pec Deck Fly', label: 'Chest · Stretch', muscle: 'chest', family: 'fly', restSec: 60, ...mc },
  { id: 'dips', name: 'Weighted Dips', label: 'Chest · Triceps', muscle: 'chest', restSec: 90, ...bw },
  // ---- back ----
  { id: 'deadlift', name: 'Deadlift', label: 'Back · Posterior', muscle: 'back', restSec: 180, ...bb },
  { id: 'bb-row', name: 'Barbell Row', label: 'Back · Mid', muscle: 'back', family: 'row', restSec: 120, ...bb },
  { id: 'cs-row', name: 'Chest-Supported Row', label: 'Back · Mid', muscle: 'back', family: 'row', restSec: 90, ...mc },
  { id: 'cable-row', name: 'Seated Cable Row', label: 'Back · Mid', muscle: 'back', family: 'row', restSec: 90, ...cb },
  { id: 'db-row', name: 'One-Arm DB Row', label: 'Back · Mid', muscle: 'back', family: 'row', restSec: 90, ...dbell },
  { id: 'lat-pulldown', name: 'Lat Pulldown', label: 'Back · Lats', muscle: 'back', restSec: 90, ...cb },
  { id: 'face-pull', name: 'Face Pull', label: 'Rear Delts', muscle: 'shoulders', restSec: 60, ...cb },
  // ---- shoulders ----
  { id: 'ohp', name: 'Overhead Press', label: 'Shoulders', muscle: 'shoulders', family: 'shoulder-press', restSec: 120, ...bb },
  { id: 'db-shoulder-press', name: 'Seated DB Shoulder Press', label: 'Shoulders', muscle: 'shoulders', family: 'shoulder-press', restSec: 90, ...dbell, ...each },
  { id: 'machine-shoulder-press', name: 'Machine Shoulder Press', label: 'Shoulders', muscle: 'shoulders', family: 'shoulder-press', restSec: 90, ...mc },
  { id: 'lateral-raise', name: 'Lateral Raise', label: 'Delts · Side', muscle: 'shoulders', family: 'lateral-raise', restSec: 60, ...dbell, ...each },
  { id: 'cable-lateral-raise', name: 'Cable Lateral Raise', label: 'Delts · Side', muscle: 'shoulders', family: 'lateral-raise', restSec: 60, ...cb },
  { id: 'rear-delt-fly', name: 'Rear Delt Fly', label: 'Delts · Rear', muscle: 'shoulders', restSec: 60, ...mc },
  // ---- arms ----
  { id: 'bb-curl', name: 'Barbell Curl', label: 'Biceps', muscle: 'biceps', family: 'curl', restSec: 60, ...bb },
  { id: 'ez-curl', name: 'EZ-Bar Curl', label: 'Biceps', muscle: 'biceps', family: 'curl', restSec: 60, ...bb },
  { id: 'db-curl', name: 'Standing DB Curl', label: 'Biceps', muscle: 'biceps', family: 'curl', restSec: 60, ...dbell, ...each },
  { id: 'preacher-curl', name: 'Preacher Curl', label: 'Biceps', muscle: 'biceps', family: 'curl', restSec: 60, ...mc },
  { id: 'hammer-curl', name: 'Hammer Curl', label: 'Biceps · Brachialis', muscle: 'biceps', family: 'curl', restSec: 60, ...dbell, ...each },
  { id: 'incline-db-curl', name: 'Incline DB Curl', label: 'Biceps · Stretch', muscle: 'biceps', family: 'curl', restSec: 60, ...dbell, ...each },
  { id: 'pushdown', name: 'Triceps Rope Pushdown', label: 'Triceps', muscle: 'triceps', restSec: 60, ...cb },
  { id: 'oh-triceps-ext', name: 'Overhead Triceps Extension', label: 'Triceps · Long head', muscle: 'triceps', restSec: 60, ...cb },
  // ---- legs ----
  { id: 'squat', name: 'Barbell Back Squat', label: 'Quads', muscle: 'quads', family: 'squat', restSec: 180, ...bb },
  { id: 'hack-squat', name: 'Hack Squat', label: 'Quads', muscle: 'quads', family: 'squat', restSec: 120, ...mc },
  { id: 'leg-press', name: 'Leg Press', label: 'Quads · Glutes', muscle: 'quads', restSec: 120, ...mc },
  { id: 'bss', name: 'Bulgarian Split Squat', label: 'Quads · Glutes', muscle: 'quads', restSec: 90, ...dbell, ...each },
  { id: 'rdl', name: 'Romanian Deadlift', label: 'Hamstrings', muscle: 'hams', family: 'rdl', restSec: 120, ...bb },
  { id: 'db-rdl', name: 'Dumbbell RDL', label: 'Hamstrings', muscle: 'hams', family: 'rdl', restSec: 90, ...dbell, ...each },
  { id: 'leg-curl', name: 'Lying Leg Curl', label: 'Hamstrings', muscle: 'hams', restSec: 75, ...mc },
  { id: 'seated-leg-curl', name: 'Seated Leg Curl', label: 'Hamstrings', muscle: 'hams', restSec: 75, ...mc },
  { id: 'hip-thrust', name: 'Hip Thrust', label: 'Glutes', muscle: 'glutes', restSec: 120, ...bb },
  { id: 'calf-raise', name: 'Standing Calf Raise', label: 'Calves', muscle: 'calves', restSec: 60, ...mc },
  { id: 'seated-calf-raise', name: 'Seated Calf Raise', label: 'Calves · Soleus', muscle: 'calves', restSec: 60, ...mc },
  // ---- core ----
  { id: 'cable-crunch', name: 'Cable Crunch', label: 'Abs', muscle: 'abs', restSec: 60, ...cb },
  { id: 'leg-raise', name: 'Hanging Leg Raise', label: 'Abs · Lower', muscle: 'abs', restSec: 60, ...bw },
];

export const EXERCISES: Record<string, ExerciseDef> = Object.fromEntries(defs.map((d) => [d.id, d]));
export const ALL_EXERCISES = defs;

/** Display names for movement families (variant picker + Progress grouping). */
export const FAMILY_LABEL: Record<string, string> = {
  'bench-press': 'Bench Press',
  'incline-press': 'Incline Press',
  fly: 'Chest Fly',
  row: 'Row',
  'shoulder-press': 'Shoulder Press',
  'lateral-raise': 'Lateral Raise',
  curl: 'Curl',
  squat: 'Squat',
  rdl: 'Romanian Deadlift',
};

/** All catalog variants sharing this exercise's family (incl. itself), or [] if solo. */
export function familyVariants(exerciseId: string): ExerciseDef[] {
  const fam = EXERCISES[exerciseId]?.family;
  if (!fam) return [];
  return defs.filter((d) => d.family === fam);
}

export const EQUIP_LABEL: Record<ExerciseDef['equipment'], string> = {
  barbell: 'Barbell', dumbbell: 'Dumbbell', machine: 'Machine', cable: 'Cable', bodyweight: 'Bodyweight',
};
