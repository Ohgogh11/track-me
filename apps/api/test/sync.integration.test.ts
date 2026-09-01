import { afterAll, beforeAll, beforeEach, describe, expect, setDefaultTimeout, test } from 'bun:test'
import { rm } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import type { CalorieEntry, SyncMutation, WorkoutSession } from '@track-me/contracts'
import { getDatabaseConnection, resetDatabaseConnectionForTests } from '@track-me/database'
import { SyncService } from '../src/sync/sync.service'

const service = new SyncService()
const now = '2026-08-29T12:00:00.000Z'
const databasePath = fileURLToPath(new URL('./sync-test.db', import.meta.url)).replaceAll('\\', '/')

setDefaultTimeout(30_000)

function calorie(id: string, calories = 500): CalorieEntry {
  return {
    id,
    kind: 'calorie_entry',
    version: 0,
    updatedAt: now,
    deletedAt: null,
    description: 'Test meal',
    calories,
    eatenAt: now,
  }
}

function activeWorkout(id: string, deviceId: string): WorkoutSession {
  return {
    id,
    kind: 'workout',
    version: 0,
    updatedAt: now,
    deletedAt: null,
    name: 'Active session',
    notes: '',
    status: 'active',
    sourceTemplateId: null,
    activeDeviceId: deviceId,
    startedAt: now,
    completedAt: null,
    timerSegments: [{ id: `${id}-timer`, startedAt: now, endedAt: null }],
    exercises: [],
    recoveryReason: null,
  }
}

function upsert(payload: CalorieEntry | WorkoutSession, mutationId: string): SyncMutation {
  return {
    mutationId,
    entityType: payload.kind,
    entityId: payload.id,
    operation: 'upsert',
    baseVersion: payload.version,
    payload,
  }
}

beforeAll(async () => {
  await Promise.all([
    rm(databasePath, { force: true }),
    rm(`${databasePath}-shm`, { force: true }),
    rm(`${databasePath}-wal`, { force: true }),
  ])
  process.env.TURSO_DATABASE_URL = `file:${databasePath}`
  resetDatabaseConnectionForTests()
  const migration = await Bun.file(new URL('../drizzle/0000_initial.sql', import.meta.url)).text()
  await getDatabaseConnection().client.executeMultiple(migration)
})

beforeEach(async () => {
  await getDatabaseConnection().client.executeMultiple(`
    DELETE FROM processed_mutations;
    DELETE FROM sync_changes;
    DELETE FROM sync_entities;
    DELETE FROM user_devices;
  `)
})

afterAll(() => resetDatabaseConnectionForTests())

describe('cursor synchronization', () => {
  test('acknowledges idempotent retries only once', async () => {
    const mutation = upsert(calorie('meal-1'), 'mutation-1')
    const first = await service.synchronize('user-a', {
      deviceId: 'phone',
      cursor: null,
      mutations: [mutation],
    })
    const retry = await service.synchronize('user-a', {
      deviceId: 'phone',
      cursor: first.nextCursor,
      mutations: [mutation],
    })
    expect(first.acknowledgements[0]?.version).toBe(1)
    expect(first.changes).toHaveLength(1)
    expect(retry.acknowledgements[0]?.version).toBe(1)
    expect(retry.changes).toHaveLength(0)
  })

  test('returns stale-version conflicts without overwriting cloud data', async () => {
    await service.synchronize('user-a', {
      deviceId: 'phone',
      cursor: null,
      mutations: [upsert(calorie('meal-1'), 'm1')],
    })
    const stale = await service.synchronize('user-a', {
      deviceId: 'tablet',
      cursor: null,
      mutations: [upsert(calorie('meal-1', 900), 'm2')],
    })
    expect(stale.conflicts[0]?.reason).toBe('stale_version')
    const serverPayload = stale.conflicts[0]?.serverPayload
    expect(serverPayload?.kind === 'calorie_entry' ? serverPayload.calories : null).toBe(500)
  })

  test('scopes bootstrap changes to the authenticated user', async () => {
    await service.synchronize('user-a', {
      deviceId: 'phone',
      cursor: null,
      mutations: [upsert(calorie('private-meal'), 'm1')],
    })
    const otherUser = await service.synchronize('user-b', { deviceId: 'phone', cursor: null, mutations: [] })
    expect(otherUser.changes).toHaveLength(0)
  })

  test('synchronizes tombstones with a new version', async () => {
    await service.synchronize('user-a', {
      deviceId: 'phone',
      cursor: null,
      mutations: [upsert(calorie('meal-1'), 'm1')],
    })
    const deleted = await service.synchronize('user-a', {
      deviceId: 'phone',
      cursor: '0',
      mutations: [
        {
          mutationId: 'm2',
          entityType: 'calorie_entry',
          entityId: 'meal-1',
          operation: 'delete',
          baseVersion: 1,
          payload: null,
        },
      ],
    })
    expect(deleted.acknowledgements[0]?.version).toBe(2)
    expect(deleted.changes.at(-1)?.operation).toBe('delete')
    expect(deleted.changes.at(-1)?.payload).toBeNull()
  })

  test('rejects a second active workout while preserving it as a conflict', async () => {
    await service.synchronize('user-a', {
      deviceId: 'phone',
      cursor: null,
      mutations: [upsert(activeWorkout('workout-1', 'phone'), 'm1')],
    })
    const second = await service.synchronize('user-a', {
      deviceId: 'tablet',
      cursor: null,
      mutations: [upsert(activeWorkout('workout-2', 'tablet'), 'm2')],
    })
    expect(second.conflicts[0]?.reason).toBe('active_workout_exists')
    expect(second.conflicts[0]?.serverPayload?.id).toBe('workout-1')
  })

  test('explicit takeover demotes the prior session to a recoverable draft', async () => {
    await service.synchronize('user-a', {
      deviceId: 'phone',
      cursor: null,
      mutations: [upsert(activeWorkout('workout-1', 'phone'), 'm1')],
    })
    const requested = { ...activeWorkout('workout-2', 'tablet'), recoveryReason: 'takeover_requested' }
    const takeover = await service.synchronize('user-a', {
      deviceId: 'tablet',
      cursor: null,
      mutations: [upsert(requested, 'm2')],
    })
    const previous = takeover.changes.filter((change) => change.entityId === 'workout-1').at(-1)
    const current = takeover.changes.find((change) => change.entityId === 'workout-2')
    expect(takeover.acknowledgements[0]?.entityId).toBe('workout-2')
    expect(previous?.payload?.kind === 'workout' && previous.payload.status).toBe('draft')
    expect(current?.payload?.kind === 'workout' && current.payload.status).toBe('active')
  })
})
