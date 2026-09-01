import { describe, expect, test } from 'bun:test'
import { ContractValidationError, validateEntityPayload, validateSyncRequest } from '../src'

describe('contract validation', () => {
  test('rejects an invalid calorie entry', () => {
    expect(() =>
      validateEntityPayload('calorie_entry', {
        id: 'entry-1',
        version: 0,
        updatedAt: new Date().toISOString(),
        deletedAt: null,
        kind: 'calorie_entry',
        description: '',
        calories: -10,
        eatenAt: new Date().toISOString(),
      }),
    ).toThrow(ContractValidationError)
  })

  test('accepts legacy calorie entries with unknown macros', () => {
    expect(() =>
      validateEntityPayload('calorie_entry', {
        id: 'legacy-entry',
        version: 1,
        updatedAt: '2026-08-30T10:00:00.000Z',
        deletedAt: null,
        kind: 'calorie_entry',
        description: 'Legacy meal',
        calories: 500,
        eatenAt: '2026-08-30T10:00:00.000Z',
      }),
    ).not.toThrow()
  })

  test('validates synchronized personal foods', () => {
    expect(() =>
      validateEntityPayload('food_item', {
        id: 'food-1',
        version: 0,
        updatedAt: '2026-08-30T10:00:00.000Z',
        deletedAt: null,
        kind: 'food_item',
        name: 'My yogurt',
        brand: null,
        source: 'custom',
        providerId: null,
        barcode: null,
        caloriesPer100Grams: 80,
        proteinTenthsPer100Grams: 80,
        carbohydrateTenthsPer100Grams: 60,
        fatTenthsPer100Grams: 20,
        defaultServingGrams: 150,
        defaultServingLabel: '1 cup',
        favorite: true,
      }),
    ).not.toThrow()
  })

  test('accepts an empty bootstrap sync request', () => {
    expect(validateSyncRequest({ deviceId: 'device-1', cursor: null, mutations: [] })).toEqual({
      deviceId: 'device-1',
      cursor: null,
      mutations: [],
    })
  })

  test('accepts legacy workout sets that predate startedAt', () => {
    expect(() =>
      validateEntityPayload('workout', {
        id: 'workout-1',
        version: 1,
        updatedAt: '2026-08-29T10:00:00.000Z',
        deletedAt: null,
        kind: 'workout',
        name: 'Legacy workout',
        status: 'completed',
        timerSegments: [],
        exercises: [
          {
            exerciseId: 'bench',
            sets: [
              {
                id: 'set-1',
                order: 0,
                type: 'work',
                targetReps: { min: 6, max: 10 },
                targetRpeTenths: 80,
                restSeconds: 90,
                status: 'completed',
                actualReps: 8,
                actualWeightGrams: 80_000,
                actualRpeTenths: 85,
                actualRestSeconds: 75,
                completedAt: '2026-08-29T09:59:00.000Z',
              },
            ],
          },
        ],
      }),
    ).not.toThrow()
  })

  test('requires completed unilateral sets to contain reps for both sides', () => {
    const payload = {
      id: 'workout-1',
      version: 1,
      updatedAt: '2026-08-29T10:00:00.000Z',
      deletedAt: null,
      kind: 'workout',
      name: 'Unilateral workout',
      status: 'completed',
      timerSegments: [],
      exercises: [
        {
          exerciseId: 'one-arm-row',
          trackingMode: 'unilateral',
          sets: [
            {
              id: 'set-1',
              order: 0,
              type: 'work',
              targetReps: { min: 8, max: 12 },
              targetRpeTenths: 80,
              restSeconds: 90,
              status: 'completed',
              actualReps: null,
              actualWeightGrams: null,
              actualRpeTenths: null,
              sideResults: {
                left: { actualReps: 8, actualWeightGrams: 20_000, actualRpeTenths: 80 },
                right: {
                  actualReps: null as number | null,
                  actualWeightGrams: 20_000,
                  actualRpeTenths: 80,
                },
              },
              actualRestSeconds: 75,
              completedAt: '2026-08-29T09:59:00.000Z',
            },
          ],
        },
      ],
    }
    expect(() => validateEntityPayload('workout', payload)).toThrow(ContractValidationError)
    const set = payload.exercises[0]?.sets[0]
    if (set === undefined) throw new Error('Expected unilateral fixture set')
    set.sideResults.right.actualReps = 8
    expect(() => validateEntityPayload('workout', payload)).not.toThrow()
  })
})
