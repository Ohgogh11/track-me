import { BaseService, Service } from '@onebun/core'
import type { FoodSearchResponse, FoodSearchResult, FoodServing } from '@track-me/contracts'
import { foodProviderCache, getDatabaseConnection } from '@track-me/database'
import { eq } from 'drizzle-orm'

const CACHE_MILLISECONDS = 30 * 24 * 60 * 60 * 1_000
const PAGE_SIZE = 25

type UnknownRecord = Record<string, unknown>

function asRecord(value: unknown): UnknownRecord | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null
}

function textValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

function numberValue(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) ? number : null
}

function macroTenths(value: unknown): number | null {
  const number = numberValue(value)
  return number === null || number < 0 ? null : Math.round(number * 10)
}

function servingOptions(grams: number | null, label: string | null): FoodServing[] {
  const servings: FoodServing[] = [{ id: '100g', label: '100 g', grams: 100 }]
  if (grams !== null && grams > 0 && Math.round(grams) !== 100) {
    servings.unshift({
      id: 'provider-serving',
      label: label ?? `1 serving (${Math.round(grams)} g)`,
      grams: Math.round(grams),
    })
  }
  return servings
}

function usdaNutrient(food: UnknownRecord, nutrientId: number, names: readonly string[]): number | null {
  const nutrients = Array.isArray(food.foodNutrients) ? food.foodNutrients : []
  for (const candidate of nutrients) {
    const nutrient = asRecord(candidate)
    if (nutrient === null) continue
    const id = numberValue(nutrient.nutrientId)
    const name = textValue(nutrient.nutrientName)?.toLowerCase() ?? ''
    const unit = textValue(nutrient.unitName)?.toLowerCase() ?? ''
    if (id === nutrientId || (names.some((item) => name === item) && unit !== 'kj')) {
      return numberValue(nutrient.value)
    }
  }
  return null
}

export function normalizeUsdaFood(value: unknown): FoodSearchResult | null {
  const food = asRecord(value)
  if (food === null) return null
  const providerId = String(food.fdcId ?? '').trim()
  const name = textValue(food.description)
  if (providerId === '' || name === null) return null
  const calories = usdaNutrient(food, 1008, ['energy'])
  const protein = usdaNutrient(food, 1003, ['protein'])
  const carbohydrate = usdaNutrient(food, 1005, ['carbohydrate, by difference', 'carbohydrate'])
  const fat = usdaNutrient(food, 1004, ['total lipid (fat)', 'total fat'])
  if (calories === null || calories < 0) return null
  const servingSize = numberValue(food.servingSize)
  const servingUnit = textValue(food.servingSizeUnit)?.toLowerCase()
  const servingGrams = servingUnit === 'g' || servingUnit === 'gram' ? servingSize : null
  return {
    provider: 'usda',
    providerId,
    name,
    brand: textValue(food.brandOwner) ?? textValue(food.brandName),
    barcode: textValue(food.gtinUpc),
    caloriesPer100Grams: Math.round(calories),
    proteinTenthsPer100Grams: macroTenths(protein),
    carbohydrateTenthsPer100Grams: macroTenths(carbohydrate),
    fatTenthsPer100Grams: macroTenths(fat),
    servings: servingOptions(servingGrams, textValue(food.householdServingFullText)),
    attribution: 'USDA FoodData Central',
    complete: protein !== null && carbohydrate !== null && fat !== null,
  }
}

export function normalizeOpenFoodFactsProduct(value: unknown, barcode: string): FoodSearchResult | null {
  const body = asRecord(value)
  const product = asRecord(body?.product)
  if (product === null) return null
  const name =
    textValue(product.product_name_en) ??
    textValue(product.product_name) ??
    textValue(product.product_name_he)
  if (name === null) return null
  const nutrients = asRecord(product.nutriments) ?? {}
  const energyKcal =
    numberValue(nutrients['energy-kcal_100g']) ??
    numberValue(nutrients.energy_kcal_100g) ??
    (() => {
      const kilojoules = numberValue(nutrients.energy_100g)
      return kilojoules === null ? null : kilojoules / 4.184
    })()
  if (energyKcal === null || energyKcal < 0) return null
  const protein = numberValue(nutrients.proteins_100g)
  const carbohydrate = numberValue(nutrients.carbohydrates_100g)
  const fat = numberValue(nutrients.fat_100g)
  const servingGrams =
    numberValue(product.serving_quantity) ??
    numberValue(textValue(product.serving_size)?.match(/[0-9]+(?:\.[0-9]+)?/)?.[0])
  return {
    provider: 'open_food_facts',
    providerId: textValue(product.code) ?? barcode,
    name,
    brand: textValue(product.brands),
    barcode,
    caloriesPer100Grams: Math.round(energyKcal),
    proteinTenthsPer100Grams: macroTenths(protein),
    carbohydrateTenthsPer100Grams: macroTenths(carbohydrate),
    fatTenthsPer100Grams: macroTenths(fat),
    servings: servingOptions(servingGrams, textValue(product.serving_size)),
    attribution: 'Open Food Facts · ODbL',
    complete: protein !== null && carbohydrate !== null && fat !== null,
  }
}

export class FoodLookupError extends Error {
  constructor(
    message: string,
    readonly status = 502,
  ) {
    super(message)
    this.name = 'FoodLookupError'
  }
}

async function fetchJson(url: URL, headers: HeadersInit = {}): Promise<unknown> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8_000)
  try {
    const response = await fetch(url, { headers, signal: controller.signal })
    if (!response.ok) {
      const status = response.status === 429 ? 503 : 502
      throw new FoodLookupError(`Food provider returned ${response.status}`, status)
    }
    return (await response.json()) as unknown
  } catch (error) {
    if (error instanceof FoodLookupError) throw error
    throw new FoodLookupError('Food provider is temporarily unavailable', 503)
  } finally {
    clearTimeout(timeout)
  }
}

@Service()
export class FoodService extends BaseService {
  private async cached(
    cacheKey: string,
    loader: () => Promise<FoodSearchResponse>,
  ): Promise<FoodSearchResponse> {
    const { db } = getDatabaseConnection()
    const [cached] = await db
      .select()
      .from(foodProviderCache)
      .where(eq(foodProviderCache.cacheKey, cacheKey))
      .limit(1)
    if (cached !== undefined && Date.parse(cached.expiresAt) > Date.now()) {
      return { ...(JSON.parse(cached.payloadJson) as FoodSearchResponse), stale: false }
    }
    try {
      const loaded = await loader()
      const now = new Date()
      await db
        .insert(foodProviderCache)
        .values({
          cacheKey,
          payloadJson: JSON.stringify({ ...loaded, stale: false }),
          updatedAt: now.toISOString(),
          expiresAt: new Date(now.getTime() + CACHE_MILLISECONDS).toISOString(),
        })
        .onConflictDoUpdate({
          target: foodProviderCache.cacheKey,
          set: {
            payloadJson: JSON.stringify({ ...loaded, stale: false }),
            updatedAt: now.toISOString(),
            expiresAt: new Date(now.getTime() + CACHE_MILLISECONDS).toISOString(),
          },
        })
      return loaded
    } catch (error) {
      if (cached !== undefined) {
        return { ...(JSON.parse(cached.payloadJson) as FoodSearchResponse), stale: true }
      }
      throw error
    }
  }

  async search(query: string, page: number): Promise<FoodSearchResponse> {
    const apiKey = process.env.USDA_FDC_API_KEY?.trim()
    if (!apiKey) {
      throw new FoodLookupError('USDA food search is not configured. You can still add a custom food.', 503)
    }
    const normalizedQuery = query.trim().replaceAll(/\s+/g, ' ')
    const cacheKey = `usda:search:${normalizedQuery.toLocaleLowerCase('en-US')}:${page}`
    return this.cached(cacheKey, async () => {
      const url = new URL('https://api.nal.usda.gov/fdc/v1/foods/search')
      url.searchParams.set('api_key', apiKey)
      url.searchParams.set('query', normalizedQuery)
      url.searchParams.set('pageSize', String(PAGE_SIZE))
      url.searchParams.set('pageNumber', String(page))
      const body = asRecord(await fetchJson(url))
      const foods = Array.isArray(body?.foods) ? body.foods : []
      const results = foods.flatMap((food) => {
        const result = normalizeUsdaFood(food)
        return result === null ? [] : [result]
      })
      const totalHits = numberValue(body?.totalHits) ?? results.length
      return { results, page, hasMore: page * PAGE_SIZE < totalHits, stale: false }
    })
  }

  async barcode(barcode: string): Promise<FoodSearchResponse> {
    const cacheKey = `open-food-facts:barcode:${barcode}`
    return this.cached(cacheKey, async () => {
      const url = new URL(`https://world.openfoodfacts.org/api/v3/product/${barcode}.json`)
      url.searchParams.set(
        'fields',
        'code,product_name,product_name_en,product_name_he,brands,serving_size,serving_quantity,nutriments',
      )
      const userAgent =
        process.env.OPEN_FOOD_FACTS_USER_AGENT?.trim() || 'TrackMe/0.1 (personal fitness tracker)'
      const result = normalizeOpenFoodFactsProduct(
        await fetchJson(url, { Accept: 'application/json', 'User-Agent': userAgent }),
        barcode,
      )
      return {
        results: result === null ? [] : [result],
        page: 1,
        hasMore: false,
        stale: false,
      }
    })
  }
}
