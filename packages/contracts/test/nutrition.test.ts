import { describe, expect, test } from 'bun:test'
import type { CalorieEntry } from '../src'
import { scaleNutritionPer100Grams, suggestNutritionGoal, sumNutrition } from '../src'

describe('nutrition scaling', () => {
  test('scales provider values with deterministic integer rounding', () => {
    expect(
      scaleNutritionPer100Grams(
        {
          caloriesPer100Grams: 123,
          proteinTenthsPer100Grams: 87,
          carbohydrateTenthsPer100Grams: 145,
          fatTenthsPer100Grams: null,
        },
        35,
      ),
    ).toEqual({
      calories: 43,
      proteinTenthsGrams: 30,
      carbohydrateTenthsGrams: 51,
      fatTenthsGrams: null,
    })
  })

  test('does not report legacy calorie-only entries as zero-macro data', () => {
    const entries: CalorieEntry[] = [
      {
        id: 'legacy',
        kind: 'calorie_entry',
        version: 1,
        updatedAt: '2026-08-30T10:00:00.000Z',
        deletedAt: null,
        description: 'Legacy meal',
        calories: 500,
        eatenAt: '2026-08-30T10:00:00.000Z',
      },
      {
        id: 'complete',
        kind: 'calorie_entry',
        version: 1,
        updatedAt: '2026-08-30T12:00:00.000Z',
        deletedAt: null,
        description: 'Complete meal',
        calories: 400,
        eatenAt: '2026-08-30T12:00:00.000Z',
        proteinTenthsGrams: 300,
        carbohydrateTenthsGrams: 450,
        fatTenthsGrams: 100,
      },
    ]
    expect(sumNutrition(entries)).toEqual({
      calories: 900,
      proteinTenthsGrams: 300,
      carbohydrateTenthsGrams: 450,
      fatTenthsGrams: 100,
      entriesWithUnknownMacros: 1,
    })
  })
})

describe('nutrition goal suggestions', () => {
  test('uses Mifflin-St Jeor, caps the requested change, and leaves editable macro targets', () => {
    expect(
      suggestNutritionGoal({
        birthDate: '1990-01-01',
        heightCm: 180,
        formulaSex: 'male',
        activityLevel: 'moderate',
        weightGrams: 80_000,
        goalType: 'lose',
        targetPaceGramsPerWeek: 500,
        today: '2026-01-01',
      }),
    ).toEqual({
      restingCalories: 1750,
      maintenanceCalories: 2713,
      calories: 2170,
      proteinTenthsGrams: 1280,
      carbohydrateTenthsGrams: 2788,
      fatTenthsGrams: 603,
      warnings: ['The requested pace was capped at 20% of estimated maintenance calories.'],
    })
  })

  test('rejects profiles outside the supported adult range', () => {
    expect(() =>
      suggestNutritionGoal({
        birthDate: '2015-01-01',
        heightCm: 170,
        formulaSex: 'female',
        activityLevel: 'light',
        weightGrams: 60_000,
        goalType: 'maintain',
        targetPaceGramsPerWeek: 0,
        today: '2026-01-01',
      }),
    ).toThrow('age between 18 and 120')
  })
})
