import { afterAll, describe, expect, test } from 'bun:test'
import { createDatabaseConnection, normalizeDatabaseUrl } from '../src/client'

const connection = createDatabaseConnection('file::memory:', undefined)

afterAll(() => connection.client.close())

describe('sync database schema', () => {
  test('normalizes Turso dashboard URLs for the libSQL client', () => {
    expect(normalizeDatabaseUrl('turso://example.turso.io')).toBe('libsql://example.turso.io')
    expect(normalizeDatabaseUrl('file:local.db')).toBe('file:local.db')
  })

  test('applies the migration and isolates aggregate keys by user', async () => {
    const migration = await Bun.file(
      new URL('../../../apps/api/drizzle/0000_initial.sql', import.meta.url),
    ).text()
    await connection.client.executeMultiple(migration)
    const foodCacheMigration = await Bun.file(
      new URL('../../../apps/api/drizzle/0001_food_provider_cache.sql', import.meta.url),
    ).text()
    await connection.client.executeMultiple(foodCacheMigration)
    const now = new Date().toISOString()
    const statement = `INSERT INTO sync_entities
      (user_id, entity_type, entity_id, version, payload_json, updated_at, deleted_at)
      VALUES (?, 'profile', 'profile', 1, ?, ?, NULL)`
    await connection.client.execute({ sql: statement, args: ['user-a', '{}', now] })
    await connection.client.execute({ sql: statement, args: ['user-b', '{}', now] })
    const result = await connection.client.execute('SELECT COUNT(*) AS count FROM sync_entities')
    expect(Number(result.rows[0]?.count)).toBe(2)
    await connection.client.execute({
      sql: `INSERT INTO food_provider_cache
        (cache_key, payload_json, expires_at, updated_at) VALUES (?, ?, ?, ?)`,
      args: ['food:test', '{}', now, now],
    })
    const cache = await connection.client.execute('SELECT COUNT(*) AS count FROM food_provider_cache')
    expect(Number(cache.rows[0]?.count)).toBe(1)
    const dropFoodCacheMigration = await Bun.file(
      new URL('../../../apps/api/drizzle/0002_drop_food_provider_cache.sql', import.meta.url),
    ).text()
    await connection.client.executeMultiple(dropFoodCacheMigration)
    const cacheTable = await connection.client.execute(
      "SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'food_provider_cache'",
    )
    expect(Number(cacheTable.rows[0]?.count)).toBe(0)
  })
})
