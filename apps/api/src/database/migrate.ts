import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getDatabaseConnection } from '@track-me/database'

const { client } = getDatabaseConnection()

try {
  const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url))
  await client.execute(`CREATE TABLE IF NOT EXISTS _track_me_migrations (
    name TEXT PRIMARY KEY NOT NULL,
    applied_at TEXT NOT NULL
  )`)
  const applied = await client.execute('SELECT name FROM _track_me_migrations')
  const appliedNames = new Set(applied.rows.map((row) => String(row.name)))
  const files = (await readdir(migrationsFolder)).filter((file) => file.endsWith('.sql')).sort()
  for (const file of files) {
    if (appliedNames.has(file)) continue
    await client.executeMultiple(await readFile(join(migrationsFolder, file), 'utf8'))
    await client.execute({
      sql: 'INSERT INTO _track_me_migrations (name, applied_at) VALUES (?, ?)',
      args: [file, new Date().toISOString()],
    })
  }
  console.info('Database migrations completed')
} finally {
  client.close()
}
