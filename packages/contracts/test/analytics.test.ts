import { describe, expect, test } from 'bun:test'
import {
  type CalorieGoal,
  calculateActiveSeconds,
  calculateMuscleInsights,
  calculateProgressSummary,
  detectPersonalRecords,
  estimateOneRepMaxGrams,
  selectCalorieGoal,
  setTotalReps,
  setVolumeKg,
  type WorkoutSession,
} from '../src'

const range = { from: '2026-08-01T00:00:00.000Z', to: '2026-08-31T23:59:59.999Z' }

function workout(id: string, weightGrams: number, reps: number, completedAt: string): WorkoutSession {
  return {
    id,
    version: 1,
    updatedAt: completedAt,
    deletedAt: null,
    kind: 'workout',
    name: 'Push day',
    notes: '',
    status: 'completed',
    sourceTemplateId: null,
    activeDeviceId: 'device-1',
    startedAt: new Date(Date.parse(completedAt) - 3_600_000).toISOString(),
    completedAt,
    timerSegments: [
      {
        id: `${id}-timer`,
        startedAt: new Date(Date.parse(completedAt) - 3_600_000).toISOString(),
        endedAt: completedAt,
      },
    ],
    recoveryReason: null,
    exercises: [
      {
        id: `${id}-exercise`,
        exerciseId: 'bench',
        exerciseName: 'Bench press',
        order: 0,
        notes: '',
        primaryMuscleId: 'chest',
        secondaryMuscleIds: ['triceps'],
        loadType: 'external',
        sets: [
          {
            id: `${id}-set`,
            order: 0,
            type: 'work',
            targetReps: { min: 5, max: 8 },
            targetRpeTenths: 80,
            restSeconds: 120,
            status: 'completed',
            startedAt: new Date(Date.parse(completedAt) - 60_000).toISOString(),
            actualReps: reps,
            actualWeightGrams: weightGrams,
            actualRpeTenths: 85,
            actualRestSeconds: 118,
            completedAt,
          },
        ],
      },
    ],
  }
}

describe('analytics', () => {
  test('calculates active time across timer segments', () => {
    expect(
      calculateActiveSeconds([
        { id: '1', startedAt: '2026-08-01T10:00:00.000Z', endedAt: '2026-08-01T10:10:00.000Z' },
        { id: '2', startedAt: '2026-08-01T10:20:00.000Z', endedAt: '2026-08-01T10:25:30.000Z' },
      ]),
    ).toBe(930)
  })

  test('uses Epley only for loaded sets from one to twelve reps', () => {
    expect(estimateOneRepMaxGrams(100_000, 5)).toBe(116_667)
    expect(estimateOneRepMaxGrams(100_000, 13)).toBeNull()
    expect(estimateOneRepMaxGrams(null, 5)).toBeNull()
  })

  test('excludes warmups and weights primary and secondary muscles', () => {
    const insights = calculateMuscleInsights([workout('w1', 100_000, 5, '2026-08-10T12:00:00.000Z')], range)
    expect(insights.find((item) => item.muscleId === 'chest')?.heatScore).toBe(1)
    expect(insights.find((item) => item.muscleId === 'triceps')?.heatScore).toBe(0.5)
  })

  test('detects records against all earlier history', () => {
    const records = detectPersonalRecords([
      workout('w1', 90_000, 8, '2026-08-05T12:00:00.000Z'),
      workout('w2', 100_000, 5, '2026-08-10T12:00:00.000Z'),
    ])
    expect(records.some((record) => record.workoutId === 'w2' && record.type === 'heaviest_weight')).toBe(
      true,
    )
  })

  test('summarizes workouts in the selected range', () => {
    const summary = calculateProgressSummary(
      [workout('w1', 100_000, 5, '2026-08-10T12:00:00.000Z')],
      range,
      'Asia/Jerusalem',
    )
    expect(summary.workoutCount).toBe(1)
    expect(summary.activeSeconds).toBe(3_600)
    expect(summary.volumeKg).toBe(500)
  })

  test('sums both sides for unilateral reps and load volume', () => {
    const session = workout('w1', 0, 0, '2026-08-10T12:00:00.000Z')
    const set = session.exercises[0]?.sets[0]
    if (set === undefined) throw new Error('Expected fixture set')
    set.actualReps = null
    set.actualWeightGrams = null
    set.sideResults = {
      left: { actualReps: 8, actualWeightGrams: 20_000, actualRpeTenths: 80 },
      right: { actualReps: 10, actualWeightGrams: 20_000, actualRpeTenths: 85 },
    }
    expect(setTotalReps(set)).toBe(18)
    expect(setVolumeKg(set)).toBe(360)
  })
})

describe('calorie goals', () => {
  test('selects the latest goal effective on the requested day', () => {
    const makeGoal = (id: string, effectiveFrom: string, calories: number): CalorieGoal => ({
      id,
      version: 1,
      updatedAt: '2026-08-01T00:00:00.000Z',
      deletedAt: null,
      kind: 'calorie_goal',
      effectiveFrom,
      calories,
    })
    expect(
      selectCalorieGoal(
        [makeGoal('old', '2026-01-01', 2_500), makeGoal('new', '2026-08-10', 2_300)],
        '2026-08-20',
      )?.calories,
    ).toBe(2_300)
  })
})
