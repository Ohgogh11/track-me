import type {
  Exercise,
  SetPrescription,
  TemplateExercise,
  WorkoutExercise,
  WorkoutSession,
  WorkoutTemplate,
} from '@track-me/contracts'
import { randomUUID } from 'expo-crypto'

export function createPrescription(order: number, type: 'warmup' | 'work' = 'work'): SetPrescription {
  return {
    id: randomUUID(),
    order,
    type,
    targetReps: { min: type === 'warmup' ? 8 : 6, max: type === 'warmup' ? 12 : 10 },
    targetRpeTenths: type === 'warmup' ? null : 80,
    restSeconds: type === 'warmup' ? 60 : 120,
  }
}

export function createTemplateExercise(exercise: Exercise, order: number): TemplateExercise {
  return {
    id: randomUUID(),
    exerciseId: exercise.id,
    exerciseName: exercise.name,
    order,
    notes: '',
    trackingMode: exercise.trackingMode,
    sets: [
      createPrescription(0, 'warmup'),
      createPrescription(1),
      createPrescription(2),
      createPrescription(3),
    ],
  }
}

export function createWorkoutTemplate(name = 'New workout plan'): WorkoutTemplate {
  const now = new Date().toISOString()
  return {
    id: randomUUID(),
    version: 0,
    updatedAt: now,
    deletedAt: null,
    kind: 'template',
    name,
    notes: '',
    exercises: [],
  }
}

function workoutExerciseFromTemplate(
  exercise: TemplateExercise,
  catalog: readonly Exercise[],
): WorkoutExercise {
  const current = catalog.find((item) => item.id === exercise.exerciseId)
  return {
    id: randomUUID(),
    exerciseId: exercise.exerciseId,
    exerciseName: exercise.exerciseName,
    order: exercise.order,
    notes: exercise.notes,
    primaryMuscleId: current?.primaryMuscleId ?? 'chest',
    secondaryMuscleIds: current?.secondaryMuscleIds ?? [],
    loadType: current?.loadType ?? 'external',
    trackingMode: exercise.trackingMode ?? current?.trackingMode ?? 'bilateral',
    sets: exercise.sets.map((set) => ({
      ...set,
      id: randomUUID(),
      status: 'planned',
      startedAt: null,
      actualReps: null,
      actualWeightGrams: null,
      actualRpeTenths: null,
      sideResults: null,
      actualRestSeconds: null,
      completedAt: null,
    })),
  }
}

export function createWorkoutExercise(exercise: Exercise, order: number): WorkoutExercise {
  const workoutExercise = workoutExerciseFromTemplate(createTemplateExercise(exercise, order), [exercise])
  return {
    ...workoutExercise,
    sets: workoutExercise.sets.map((set) => ({ ...set, restSeconds: 90 })),
  }
}

export function startWorkout(
  deviceId: string,
  catalog: readonly Exercise[],
  template: WorkoutTemplate | null,
): WorkoutSession {
  const now = new Date().toISOString()
  return {
    id: randomUUID(),
    version: 0,
    updatedAt: now,
    deletedAt: null,
    kind: 'workout',
    name: template?.name ?? 'Empty workout',
    notes: template?.notes ?? '',
    status: 'active',
    sourceTemplateId: template?.id ?? null,
    activeDeviceId: deviceId,
    startedAt: now,
    completedAt: null,
    timerSegments: [{ id: randomUUID(), startedAt: now, endedAt: null }],
    exercises: template?.exercises.map((exercise) => workoutExerciseFromTemplate(exercise, catalog)) ?? [],
    recoveryReason: null,
  }
}

export function templateFromWorkout(
  workout: WorkoutSession,
  existing: WorkoutTemplate | null,
): WorkoutTemplate {
  const now = new Date().toISOString()
  return {
    id: existing?.id ?? randomUUID(),
    version: existing?.version ?? 0,
    updatedAt: now,
    deletedAt: null,
    kind: 'template',
    name: existing?.name ?? `${workout.name} plan`,
    notes: workout.notes,
    exercises: workout.exercises.map((exercise) => ({
      id: randomUUID(),
      exerciseId: exercise.exerciseId,
      exerciseName: exercise.exerciseName,
      order: exercise.order,
      notes: exercise.notes,
      trackingMode: exercise.trackingMode ?? 'bilateral',
      sets: exercise.sets.map((set) => ({
        id: randomUUID(),
        order: set.order,
        type: set.type,
        targetReps: set.targetReps,
        targetRpeTenths: set.targetRpeTenths,
        restSeconds: set.restSeconds,
      })),
    })),
  }
}
