import type { ApiResponse, FoodSearchResponse } from '@track-me/contracts'

function apiUrl(): string {
  return (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/$/, '')
}

async function requestFood(path: string, token: string): Promise<FoodSearchResponse> {
  let response: Response
  try {
    response = await fetch(`${apiUrl()}${path}`, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
    })
  } catch {
    throw new Error('Food search is unavailable. Favorites and custom foods still work offline.')
  }
  const body = (await response.json()) as ApiResponse<FoodSearchResponse>
  if (response.ok && body.success) return body.result
  throw new Error(body.success ? `Food lookup failed with status ${response.status}` : body.error)
}

export async function searchFoods(query: string, page: number, token: string): Promise<FoodSearchResponse> {
  return requestFood(
    `/v1/foods/search?q=${encodeURIComponent(query.trim())}&page=${encodeURIComponent(String(page))}`,
    token,
  )
}

export async function lookupFoodBarcode(barcode: string, token: string): Promise<FoodSearchResponse> {
  return requestFood(`/v1/foods/barcode/${encodeURIComponent(barcode)}`, token)
}
