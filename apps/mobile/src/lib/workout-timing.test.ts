import { describe, expect, test } from 'bun:test'
import type { CompletedSet, WorkoutExercise } from '@track-me/contracts'
import { elapsedRestSeconds, findActiveSet, findPendingRest } from './workout-timing'

function makeSet(change: Partial<CompletedSet> = {}): CompletedSet {
  return {
    id: 'set-1',
    order: 0,
    type: 'work',
    targetReps: { min: 6, max: 10 },
    targetRpeTenths: 80,
    restSeconds: 90,
    status: 'planned',
    startedAt: null,
    actualReps: null,
    actualWeightGrams: null,
    actualRpeTenths: null,
    actualRestSeconds: null,
    completedAt: null,
    ...change,
  }
}

function exercise(sets: CompletedSet[]): WorkoutExercise {
  return {
    id: 'workout-exercise-1',
    exerciseId: 'exercise-1',
    exerciseName: 'Bench press',
    order: 0,
    notes: '',
    primaryMuscleId: 'chest',
    secondaryMuscleIds: ['triceps'],
    loadType: 'external',
    sets,
  }
}

describe('workout timing', () => {
  test('measures early and delayed rest from the completion timestamp', () => {
    const completedAt = '2026-08-29T10:00:00.000Z'
    expect(elapsedRestSeconds(completedAt, '2026-08-29T10:00:42.900Z')).toBe(42)
    expect(elapsedRestSeconds(completedAt, '2026-08-29T10:01:37.200Z')).toBe(97)
  })

  test('never records negative or invalid rest', () => {
    expect(elapsedRestSeconds('2026-08-29T10:00:10.000Z', '2026-08-29T10:00:00.000Z')).toBe(0)
    expect(elapsedRestSeconds('invalid', '2026-08-29T10:00:00.000Z')).toBe(0)
  })

  test('finds the single started set and latest unresolved rest', () => {
    const earlier = makeSet({
      id: 'earlier',
      status: 'completed',
      startedAt: '2026-08-29T09:59:00.000Z',
      completedAt: '2026-08-29T10:00:00.000Z',
      actualReps: 8,
    })
    const later = makeSet({
      id: 'later',
      status: 'completed',
      startedAt: '2026-08-29T10:01:00.000Z',
      completedAt: '2026-08-29T10:02:00.000Z',
      actualReps: 8,
    })
    const active = makeSet({ id: 'active', startedAt: '2026-08-29T10:03:00.000Z' })
    const exercises = [exercise([earlier, later, active])]

    expect(findActiveSet(exercises)?.set.id).toBe('active')
    expect(findPendingRest(exercises)?.set.id).toBe('later')
  })
})
