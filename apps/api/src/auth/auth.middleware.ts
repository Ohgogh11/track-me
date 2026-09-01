import { verifyToken } from '@clerk/backend'
import { BaseMiddleware, Middleware, type OneBunRequest, type OneBunResponse } from '@onebun/core'
import { setRequestAuth } from './auth-context'

export function normalizeClerkJwtKey(value: string): string {
  const normalized = value.trim().replaceAll('\\n', '\n')
  for (const label of ['PUBLIC KEY', 'RSA PUBLIC KEY']) {
    const header = `-----BEGIN ${label}-----`
    const footer = `-----END ${label}-----`
    if (!normalized.startsWith(header) || !normalized.endsWith(footer)) continue

    const body = normalized.slice(header.length, -footer.length).replaceAll(/\s/g, '')
    if (body.length === 0) return normalized
    const lines = body.match(/.{1,64}/g) ?? []
    return [header, ...lines, footer].join('\n')
  }
  return normalized
}

function unauthorized(message: string): Response {
  return Response.json({ success: false, error: message, code: 401 }, { status: 401 })
}

function subjectFromVerifiedToken(value: unknown): string | null {
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>
  if (typeof record.sub === 'string') return record.sub
  const data = record.data
  if (typeof data === 'object' && data !== null) {
    const subject = (data as Record<string, unknown>).sub
    if (typeof subject === 'string') return subject
  }
  return null
}

@Middleware()
export class ClerkAuthMiddleware extends BaseMiddleware {
  async use(request: OneBunRequest, next: () => Promise<OneBunResponse>): Promise<OneBunResponse> {
    const authorization = request.headers.get('authorization')
    if (!authorization?.startsWith('Bearer ')) return unauthorized('Authentication is required')

    const token = authorization.slice('Bearer '.length).trim()
    const demoAllowed =
      process.env.ALLOW_DEMO_AUTH === 'true' && (process.env.NODE_ENV ?? 'development') !== 'production'

    if (demoAllowed && token.startsWith('demo:')) {
      const userId = token.slice('demo:'.length).trim()
      if (userId.length === 0) return unauthorized('Invalid demo token')
      setRequestAuth(request, { userId: `demo:${userId}` })
      return next()
    }

    const jwtKey = process.env.CLERK_JWT_KEY
    if (!jwtKey) return unauthorized('Clerk is not configured on this server')

    try {
      const verified: unknown = await verifyToken(token, {
        jwtKey: normalizeClerkJwtKey(jwtKey),
      })
      const userId = subjectFromVerifiedToken(verified)
      if (userId === null) return unauthorized('Session token has no user subject')
      setRequestAuth(request, { userId })
      return next()
    } catch {
      return unauthorized('Session token is invalid or expired')
    }
  }
}
