import type { CompletedSet, WorkoutExercise } from '@track-me/contracts'

export interface LocatedWorkoutSet {
  exerciseIndex: number
  setIndex: number
  set: CompletedSet
}

export function elapsedRestSeconds(completedAt: string, resolvedAt: string): number {
  const completedMs = Date.parse(completedAt)
  const resolvedMs = Date.parse(resolvedAt)
  if (!Number.isFinite(completedMs) || !Number.isFinite(resolvedMs)) return 0
  return Math.max(0, Math.floor((resolvedMs - completedMs) / 1_000))
}

export function findActiveSet(exercises: readonly WorkoutExercise[]): LocatedWorkoutSet | null {
  for (const [exerciseIndex, exercise] of exercises.entries()) {
    const setIndex = exercise.sets.findIndex(
      (set) => set.status === 'planned' && set.startedAt !== null && set.completedAt === null,
    )
    const set = exercise.sets[setIndex]
    if (setIndex >= 0 && set !== undefined) return { exerciseIndex, setIndex, set }
  }
  return null
}

export function findPendingRest(exercises: readonly WorkoutExercise[]): LocatedWorkoutSet | null {
  let pending: LocatedWorkoutSet | null = null
  for (const [exerciseIndex, exercise] of exercises.entries()) {
    for (const [setIndex, set] of exercise.sets.entries()) {
      if (set.status !== 'completed' || set.completedAt === null || set.actualRestSeconds !== null) {
        continue
      }
      if (pending === null || Date.parse(set.completedAt) > Date.parse(pending.set.completedAt ?? '')) {
        pending = { exerciseIndex, setIndex, set }
      }
    }
  }
  return pending
}
