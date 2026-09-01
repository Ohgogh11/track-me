import { type Client, createClient } from '@libsql/client'
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql'
import * as schema from './schema'

export interface DatabaseConnection {
  client: Client
  db: LibSQLDatabase<typeof schema>
}

export function normalizeDatabaseUrl(url: string): string {
  return url.startsWith('turso://') ? `libsql://${url.slice('turso://'.length)}` : url
}

export function createDatabaseConnection(url: string, authToken: string | undefined): DatabaseConnection {
  const client = createClient({
    url: normalizeDatabaseUrl(url),
    ...(authToken ? { authToken } : {}),
  })
  return { client, db: drizzle(client, { schema }) }
}

let singleton: DatabaseConnection | null = null

export function getDatabaseConnection(): DatabaseConnection {
  if (singleton !== null) return singleton
  singleton = createDatabaseConnection(
    process.env.TURSO_DATABASE_URL ?? 'file:track-me-local.db',
    process.env.TURSO_AUTH_TOKEN,
  )
  return singleton
}

export function resetDatabaseConnectionForTests(): void {
  singleton?.client.close()
  singleton = null
}
