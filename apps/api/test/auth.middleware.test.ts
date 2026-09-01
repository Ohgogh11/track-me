import { afterEach, describe, expect, test } from 'bun:test'
import type { OneBunRequest, OneBunResponse } from '@onebun/core'
import { ClerkAuthMiddleware, normalizeClerkJwtKey } from '../src/auth/auth.middleware'
import { getRequestAuth } from '../src/auth/auth-context'

const middleware = new ClerkAuthMiddleware()

afterEach(() => {
  delete process.env.ALLOW_DEMO_AUTH
  delete process.env.NODE_ENV
})

describe('Clerk authentication middleware', () => {
  test('normalizes a compact Clerk public key into valid PEM lines', () => {
    const body = 'A'.repeat(70)
    expect(normalizeClerkJwtKey(`-----BEGIN PUBLIC KEY-----${body}-----END PUBLIC KEY-----`)).toBe(
      `-----BEGIN PUBLIC KEY-----\n${'A'.repeat(64)}\n${'A'.repeat(6)}\n-----END PUBLIC KEY-----`,
    )
  })

  test('normalizes escaped newlines in a Clerk public key', () => {
    expect(normalizeClerkJwtKey('-----BEGIN PUBLIC KEY-----\\nQUJD\\n-----END PUBLIC KEY-----')).toBe(
      '-----BEGIN PUBLIC KEY-----\nQUJD\n-----END PUBLIC KEY-----',
    )
  })

  test('rejects requests without a bearer token', async () => {
    const response = await middleware.use(
      new Request('http://localhost/v1/sync') as OneBunRequest,
      async () => new Response() as OneBunResponse,
    )
    expect(response.status).toBe(401)
  })

  test('allows explicitly enabled non-production demo tokens', async () => {
    process.env.ALLOW_DEMO_AUTH = 'true'
    process.env.NODE_ENV = 'test'
    const request = new Request('http://localhost/v1/sync', {
      headers: { authorization: 'Bearer demo:iphone' },
    }) as OneBunRequest
    const response = await middleware.use(request, async () => Response.json({ ok: true }) as OneBunResponse)
    expect(response.status).toBe(200)
    expect(getRequestAuth(request).userId).toBe('demo:iphone')
  })
})
