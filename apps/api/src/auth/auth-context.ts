import type { OneBunRequest } from '@onebun/core'

export interface RequestAuth {
  userId: string
}

const requestAuth = new WeakMap<OneBunRequest, RequestAuth>()

export function setRequestAuth(request: OneBunRequest, auth: RequestAuth): void {
  requestAuth.set(request, auth)
}

export function getRequestAuth(request: OneBunRequest): RequestAuth {
  const auth = requestAuth.get(request)
  if (auth === undefined) throw new Error('Authenticated request context is missing')
  return auth
}
