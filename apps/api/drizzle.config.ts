import { defineConfig } from 'drizzle-kit'

const databaseUrl = process.env.TURSO_DATABASE_URL ?? 'file:track-me-local.db'

export default defineConfig({
  schema: '../../packages/database/src/schema.ts',
  out: './drizzle',
  dialect: 'turso',
  dbCredentials: {
    url: databaseUrl.startsWith('turso://')
      ? `libsql://${databaseUrl.slice('turso://'.length)}`
      : databaseUrl,
    authToken: process.env.TURSO_AUTH_TOKEN ?? '',
  },
  strict: true,
  verbose: true,
})
