import { describe, expect, test } from 'bun:test'
import { normalizeOpenFoodFactsProduct, normalizeUsdaFood } from '../src/food/food.service'

describe('USDA normalization', () => {
  test('normalizes macros, serving size, brand, and attribution', () => {
    const result = normalizeUsdaFood({
      fdcId: 123,
      description: 'Greek yogurt',
      brandOwner: 'Example Dairy',
      servingSize: 170,
      servingSizeUnit: 'g',
      householdServingFullText: '1 container',
      foodNutrients: [
        { nutrientId: 1008, nutrientName: 'Energy', unitName: 'KCAL', value: 59 },
        { nutrientId: 1003, nutrientName: 'Protein', unitName: 'G', value: 10.3 },
        { nutrientId: 1005, nutrientName: 'Carbohydrate, by difference', unitName: 'G', value: 3.6 },
        { nutrientId: 1004, nutrientName: 'Total lipid (fat)', unitName: 'G', value: 0.4 },
      ],
    })
    expect(result).toMatchObject({
      provider: 'usda',
      providerId: '123',
      name: 'Greek yogurt',
      brand: 'Example Dairy',
      caloriesPer100Grams: 59,
      proteinTenthsPer100Grams: 103,
      carbohydrateTenthsPer100Grams: 36,
      fatTenthsPer100Grams: 4,
      complete: true,
    })
    expect(result?.servings[0]).toEqual({ id: 'provider-serving', label: '1 container', grams: 170 })
  })

  test('rejects foods without usable energy data', () => {
    expect(normalizeUsdaFood({ fdcId: 1, description: 'Incomplete', foodNutrients: [] })).toBeNull()
  })
})

describe('Open Food Facts normalization', () => {
  test('preserves Hebrew names and exposes incomplete community data', () => {
    const result = normalizeOpenFoodFactsProduct(
      {
        product: {
          code: '7290000000000',
          product_name_he: 'יוגורט',
          brands: 'מותג',
          serving_size: '150 g',
          nutriments: {
            'energy-kcal_100g': 80,
            proteins_100g: 8,
            carbohydrates_100g: 6,
          },
        },
      },
      '7290000000000',
    )
    expect(result).toMatchObject({
      provider: 'open_food_facts',
      name: 'יוגורט',
      barcode: '7290000000000',
      caloriesPer100Grams: 80,
      proteinTenthsPer100Grams: 80,
      fatTenthsPer100Grams: null,
      complete: false,
    })
    expect(result?.servings[0]?.grams).toBe(150)
  })
})
