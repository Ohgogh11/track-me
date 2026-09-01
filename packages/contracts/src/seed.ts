import type { Exercise, MuscleGroup } from './domain'
import importedExerciseData from './generated/exercises.json'

const SEEDED_AT = '2026-01-01T00:00:00.000Z'

export const MUSCLE_GROUPS: readonly MuscleGroup[] = [
  { id: 'chest', name: 'Chest', region: 'front', svgRegionIds: ['chest-left', 'chest-right'] },
  {
    id: 'front-delts',
    name: 'Front delts',
    region: 'front',
    svgRegionIds: ['front-delt-left', 'front-delt-right'],
  },
  {
    id: 'side-delts',
    name: 'Side delts',
    region: 'front',
    svgRegionIds: ['side-delt-left', 'side-delt-right'],
  },
  {
    id: 'rear-delts',
    name: 'Rear delts',
    region: 'back',
    svgRegionIds: ['rear-delt-left', 'rear-delt-right'],
  },
  {
    id: 'shoulders',
    name: 'Shoulders',
    region: 'front',
    svgRegionIds: ['front-delt-left', 'front-delt-right', 'rear-delt-left', 'rear-delt-right'],
  },
  { id: 'biceps', name: 'Biceps', region: 'front', svgRegionIds: ['biceps-left', 'biceps-right'] },
  { id: 'triceps', name: 'Triceps', region: 'back', svgRegionIds: ['triceps-left', 'triceps-right'] },
  { id: 'forearms', name: 'Forearms', region: 'front', svgRegionIds: ['forearm-left', 'forearm-right'] },
  { id: 'lats', name: 'Lats', region: 'back', svgRegionIds: ['lat-left', 'lat-right'] },
  { id: 'upper-back', name: 'Upper back', region: 'back', svgRegionIds: ['upper-back'] },
  { id: 'traps', name: 'Traps', region: 'back', svgRegionIds: ['traps'] },
  { id: 'lower-back', name: 'Lower back', region: 'back', svgRegionIds: ['lower-back'] },
  { id: 'abs', name: 'Abs', region: 'front', svgRegionIds: ['abs'] },
  { id: 'obliques', name: 'Obliques', region: 'front', svgRegionIds: ['oblique-left', 'oblique-right'] },
  { id: 'glutes', name: 'Glutes', region: 'back', svgRegionIds: ['glute-left', 'glute-right'] },
  { id: 'quadriceps', name: 'Quadriceps', region: 'front', svgRegionIds: ['quad-left', 'quad-right'] },
  {
    id: 'hamstrings',
    name: 'Hamstrings',
    region: 'back',
    svgRegionIds: ['hamstring-left', 'hamstring-right'],
  },
  { id: 'adductors', name: 'Adductors', region: 'front', svgRegionIds: ['adductor-left', 'adductor-right'] },
  { id: 'abductors', name: 'Abductors', region: 'back', svgRegionIds: ['glute-left', 'glute-right'] },
  { id: 'neck', name: 'Neck', region: 'front', svgRegionIds: ['neck'] },
  { id: 'calves', name: 'Calves', region: 'back', svgRegionIds: ['calf-left', 'calf-right'] },
]

type LegacyExerciseSeed = Pick<
  Exercise,
  'id' | 'name' | 'primaryMuscleId' | 'secondaryMuscleIds' | 'loadType'
>

type ExerciseSeed = Pick<
  Exercise,
  | 'id'
  | 'name'
  | 'primaryMuscleId'
  | 'secondaryMuscleIds'
  | 'loadType'
  | 'trackingMode'
  | 'equipment'
  | 'category'
  | 'difficulty'
  | 'instructions'
  | 'imageUrls'
>

const legacyExerciseSeeds: readonly LegacyExerciseSeed[] = [
  {
    id: 'builtin:barbell-bench-press',
    name: 'Barbell bench press',
    primaryMuscleId: 'chest',
    secondaryMuscleIds: ['front-delts', 'triceps'],
    loadType: 'external',
  },
  {
    id: 'builtin:incline-dumbbell-press',
    name: 'Incline dumbbell press',
    primaryMuscleId: 'chest',
    secondaryMuscleIds: ['front-delts', 'triceps'],
    loadType: 'external',
  },
  {
    id: 'builtin:push-up',
    name: 'Push-up',
    primaryMuscleId: 'chest',
    secondaryMuscleIds: ['front-delts', 'triceps', 'abs'],
    loadType: 'bodyweight',
  },
  {
    id: 'builtin:overhead-press',
    name: 'Overhead press',
    primaryMuscleId: 'front-delts',
    secondaryMuscleIds: ['side-delts', 'triceps'],
    loadType: 'external',
  },
  {
    id: 'builtin:lateral-raise',
    name: 'Lateral raise',
    primaryMuscleId: 'side-delts',
    secondaryMuscleIds: ['traps'],
    loadType: 'external',
  },
  {
    id: 'builtin:reverse-fly',
    name: 'Reverse fly',
    primaryMuscleId: 'rear-delts',
    secondaryMuscleIds: ['upper-back'],
    loadType: 'external',
  },
  {
    id: 'builtin:pull-up',
    name: 'Pull-up',
    primaryMuscleId: 'lats',
    secondaryMuscleIds: ['biceps', 'upper-back'],
    loadType: 'bodyweight',
  },
  {
    id: 'builtin:lat-pulldown',
    name: 'Lat pulldown',
    primaryMuscleId: 'lats',
    secondaryMuscleIds: ['biceps', 'upper-back'],
    loadType: 'external',
  },
  {
    id: 'builtin:barbell-row',
    name: 'Barbell row',
    primaryMuscleId: 'upper-back',
    secondaryMuscleIds: ['lats', 'biceps', 'rear-delts'],
    loadType: 'external',
  },
  {
    id: 'builtin:seated-cable-row',
    name: 'Seated cable row',
    primaryMuscleId: 'upper-back',
    secondaryMuscleIds: ['lats', 'biceps', 'rear-delts'],
    loadType: 'external',
  },
  {
    id: 'builtin:shrug',
    name: 'Shrug',
    primaryMuscleId: 'traps',
    secondaryMuscleIds: ['forearms'],
    loadType: 'external',
  },
  {
    id: 'builtin:biceps-curl',
    name: 'Biceps curl',
    primaryMuscleId: 'biceps',
    secondaryMuscleIds: ['forearms'],
    loadType: 'external',
  },
  {
    id: 'builtin:hammer-curl',
    name: 'Hammer curl',
    primaryMuscleId: 'biceps',
    secondaryMuscleIds: ['forearms'],
    loadType: 'external',
  },
  {
    id: 'builtin:triceps-pushdown',
    name: 'Triceps pushdown',
    primaryMuscleId: 'triceps',
    secondaryMuscleIds: [],
    loadType: 'external',
  },
  {
    id: 'builtin:skull-crusher',
    name: 'Skull crusher',
    primaryMuscleId: 'triceps',
    secondaryMuscleIds: [],
    loadType: 'external',
  },
  {
    id: 'builtin:back-squat',
    name: 'Back squat',
    primaryMuscleId: 'quadriceps',
    secondaryMuscleIds: ['glutes', 'adductors', 'lower-back'],
    loadType: 'external',
  },
  {
    id: 'builtin:front-squat',
    name: 'Front squat',
    primaryMuscleId: 'quadriceps',
    secondaryMuscleIds: ['glutes', 'abs'],
    loadType: 'external',
  },
  {
    id: 'builtin:leg-press',
    name: 'Leg press',
    primaryMuscleId: 'quadriceps',
    secondaryMuscleIds: ['glutes', 'adductors'],
    loadType: 'external',
  },
  {
    id: 'builtin:leg-extension',
    name: 'Leg extension',
    primaryMuscleId: 'quadriceps',
    secondaryMuscleIds: [],
    loadType: 'external',
  },
  {
    id: 'builtin:romanian-deadlift',
    name: 'Romanian deadlift',
    primaryMuscleId: 'hamstrings',
    secondaryMuscleIds: ['glutes', 'lower-back', 'forearms'],
    loadType: 'external',
  },
  {
    id: 'builtin:deadlift',
    name: 'Deadlift',
    primaryMuscleId: 'glutes',
    secondaryMuscleIds: ['hamstrings', 'lower-back', 'traps', 'forearms'],
    loadType: 'external',
  },
  {
    id: 'builtin:leg-curl',
    name: 'Leg curl',
    primaryMuscleId: 'hamstrings',
    secondaryMuscleIds: [],
    loadType: 'external',
  },
  {
    id: 'builtin:hip-thrust',
    name: 'Hip thrust',
    primaryMuscleId: 'glutes',
    secondaryMuscleIds: ['hamstrings'],
    loadType: 'external',
  },
  {
    id: 'builtin:calf-raise',
    name: 'Calf raise',
    primaryMuscleId: 'calves',
    secondaryMuscleIds: [],
    loadType: 'external',
  },
  {
    id: 'builtin:plank',
    name: 'Plank',
    primaryMuscleId: 'abs',
    secondaryMuscleIds: ['obliques', 'glutes'],
    loadType: 'bodyweight',
  },
  {
    id: 'builtin:crunch',
    name: 'Crunch',
    primaryMuscleId: 'abs',
    secondaryMuscleIds: ['obliques'],
    loadType: 'bodyweight',
  },
]

const importedExerciseSeeds = importedExerciseData as ExerciseSeed[]
const normalizedName = (name: string) => name.trim().toLocaleLowerCase()
const importedByName = new Map(
  importedExerciseSeeds.map((exercise) => [normalizedName(exercise.name), exercise]),
)
const legacyNames = new Set(legacyExerciseSeeds.map((exercise) => normalizedName(exercise.name)))

const enrichedLegacySeeds: ExerciseSeed[] = legacyExerciseSeeds.map((exercise) => {
  const details = importedByName.get(normalizedName(exercise.name))
  return {
    ...exercise,
    trackingMode: details?.trackingMode ?? 'bilateral',
    equipment: details?.equipment ?? (exercise.loadType === 'bodyweight' ? 'body only' : null),
    category: details?.category ?? 'strength',
    difficulty: details?.difficulty ?? null,
    instructions: details?.instructions ?? [],
    imageUrls: details?.imageUrls ?? [],
  }
})

const exerciseSeeds: readonly ExerciseSeed[] = [
  ...enrichedLegacySeeds,
  ...importedExerciseSeeds.filter((exercise) => !legacyNames.has(normalizedName(exercise.name))),
]

export const BUILT_IN_EXERCISES: readonly Exercise[] = exerciseSeeds.map((exercise) => ({
  ...exercise,
  kind: 'exercise',
  version: 1,
  updatedAt: SEEDED_AT,
  deletedAt: null,
  builtIn: true,
  archivedAt: null,
}))

export function getMuscleName(id: string): string {
  return MUSCLE_GROUPS.find((muscle) => muscle.id === id)?.name ?? id
}
