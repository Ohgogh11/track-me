import type { ApiResponse, SyncRequest, SyncResponse } from '@track-me/contracts'

class SyncTransportError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message)
  }
}

function apiUrl(): string {
  return (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/$/, '')
}

export async function sendSyncRequest(request: SyncRequest, token: string): Promise<SyncResponse> {
  const retryDelays = [0, 1_000, 2_500, 5_000]
  let lastError: Error | null = null
  for (const delay of retryDelays) {
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay))
    try {
      const response = await fetch(`${apiUrl()}/v1/sync`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      })
      const body = (await response.json()) as ApiResponse<SyncResponse>
      if (response.ok && body.success) return body.result
      const message = body.success ? `Sync failed with status ${response.status}` : body.error
      const transportError = new SyncTransportError(message, [502, 503, 504].includes(response.status))
      lastError = transportError
      if (!transportError.retryable) throw transportError
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Sync request failed')
      if (lastError instanceof SyncTransportError && !lastError.retryable) throw lastError
      if (delay === retryDelays.at(-1)) throw lastError
    }
  }
  throw lastError ?? new Error('Sync request failed')
}
