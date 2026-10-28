import type {
  CalorieGoal,
  EntityMap,
  EntityPayload,
  EntityType,
  SyncConflict,
  SyncMutation,
  SyncResponse,
  UserProfile,
} from '@track-me/contracts'
import { randomUUID } from 'expo-crypto'
import * as SecureStore from 'expo-secure-store'
import * as SQLite from 'expo-sqlite'

interface EntityRow {
  entity_type: EntityType
  entity_id: string
  remote_version: number
  payload_json: string | null
  updated_at: string
  deleted_at: string | null
}

interface OutboxRow {
  mutation_id: string
  entity_type: EntityType
  entity_id: string
  operation: 'upsert' | 'delete'
  base_version: number
  payload_json: string | null
}

export interface StoredConflict {
  mutationId: string
  entityType: EntityType
  entityId: string
  reason: SyncConflict['reason']
  serverVersion: number
  serverPayload: EntityPayload | null
  createdAt: string
}

const schema = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS local_entities (
  user_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  remote_version INTEGER NOT NULL DEFAULT 0,
  payload_json TEXT,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  PRIMARY KEY (user_id, entity_type, entity_id)
);
CREATE INDEX IF NOT EXISTS local_entities_user_type_idx
  ON local_entities (user_id, entity_type, deleted_at);
CREATE TABLE IF NOT EXISTS sync_outbox (
  user_id TEXT NOT NULL,
  mutation_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  base_version INTEGER NOT NULL,
  payload_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, mutation_id),
  UNIQUE (user_id, entity_type, entity_id)
);
CREATE TABLE IF NOT EXISTS sync_conflicts (
  user_id TEXT NOT NULL,
  mutation_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  server_version INTEGER NOT NULL,
  server_payload_json TEXT,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, mutation_id)
);
CREATE TABLE IF NOT EXISTS sync_state (
  user_id TEXT PRIMARY KEY NOT NULL,
  cursor TEXT,
  last_synced_at TEXT,
  last_error TEXT
);
`

function normalizePayload<T extends EntityPayload>(payload: T): T {
  if (payload.kind === 'profile') {
    return {
      ...payload,
      birthDate: payload.birthDate ?? null,
      heightCm: payload.heightCm ?? null,
      formulaSex: payload.formulaSex ?? null,
      activityLevel: payload.activityLevel ?? null,
      nutritionGoalType: payload.nutritionGoalType ?? null,
      targetPaceGramsPerWeek: payload.targetPaceGramsPerWeek ?? null,
    } as T
  }
  if (payload.kind === 'calorie_entry') {
    return {
      ...payload,
      brand: payload.brand ?? null,
      source: payload.source ?? 'manual',
      providerId: payload.providerId ?? null,
      barcode: payload.barcode ?? null,
      servingLabel: payload.servingLabel ?? null,
      servingGrams: payload.servingGrams ?? null,
      servingCountThousandths: payload.servingCountThousandths ?? null,
      proteinTenthsGrams: payload.proteinTenthsGrams ?? null,
      carbohydrateTenthsGrams: payload.carbohydrateTenthsGrams ?? null,
      fatTenthsGrams: payload.fatTenthsGrams ?? null,
    } as T
  }
  if (payload.kind === 'calorie_goal') {
    return {
      ...payload,
      proteinTenthsGrams: payload.proteinTenthsGrams ?? null,
      carbohydrateTenthsGrams: payload.carbohydrateTenthsGrams ?? null,
      fatTenthsGrams: payload.fatTenthsGrams ?? null,
    } as T
  }
  if (payload.kind === 'exercise') {
    return {
      ...payload,
      trackingMode: payload.trackingMode ?? 'bilateral',
      equipment: payload.equipment ?? null,
      category: payload.category ?? null,
      difficulty: payload.difficulty ?? null,
      instructions: payload.instructions ?? [],
      imageUrls: payload.imageUrls ?? [],
    } as T
  }
  if (payload.kind !== 'workout') return payload
  return {
    ...payload,
    exercises: payload.exercises.map((exercise) => ({
      ...exercise,
      trackingMode: exercise.trackingMode ?? 'bilateral',
      sets: exercise.sets.map((set) => ({
        ...set,
        startedAt: set.startedAt ?? null,
        sideResults: set.sideResults ?? null,
      })),
    })),
  } as T
}

function parsePayload<T extends EntityPayload>(json: string | null): T | null {
  return json === null ? null : normalizePayload(JSON.parse(json) as T)
}

export class LocalStore {
  private database: SQLite.SQLiteDatabase | null = null
  private initialization: Promise<void> | null = null
  private readonly listeners = new Set<() => void>()

  async initialize(): Promise<void> {
    if (this.database !== null) return
    if (this.initialization === null) {
      this.initialization = this.openAndInitialize().catch((error: unknown) => {
        // Allow a later foreground/login attempt to retry a failed open or migration.
        this.initialization = null
        throw error
      })
    }
    await this.initialization
  }

  private async openAndInitialize(): Promise<void> {
    const db = await SQLite.openDatabaseAsync('track-me.db')
    if (process.env.EXPO_PUBLIC_USE_SQLCIPHER === 'true') {
      const keyName = 'track-me-database-key'
      let key = await SecureStore.getItemAsync(keyName)
      if (key === null) {
        key = `${randomUUID()}${randomUUID()}`.replaceAll('-', '')
        await SecureStore.setItemAsync(keyName, key)
      }
      await db.execAsync(`PRAGMA key = '${key}';`)
    }
    await db.execAsync(schema)
    this.database = db
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private emit(): void {
    for (const listener of this.listeners) listener()
  }

  private db(): SQLite.SQLiteDatabase {
    if (this.database === null) throw new Error('Local database is not initialized')
    return this.database
  }

  async ensureUserDefaults(userId: string): Promise<void> {
    const profile = await this.get(userId, 'profile', 'profile')
    if (profile === null) {
      const now = new Date().toISOString()
      const newProfile: UserProfile = {
        id: 'profile',
        kind: 'profile',
        version: 0,
        updatedAt: now,
        deletedAt: null,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        weightUnit: 'kg',
        birthDate: null,
        heightCm: null,
        formulaSex: null,
        activityLevel: null,
        nutritionGoalType: null,
        targetPaceGramsPerWeek: null,
      }
      const initialGoal: CalorieGoal = {
        id: randomUUID(),
        kind: 'calorie_goal',
        version: 0,
        updatedAt: now,
        deletedAt: null,
        effectiveFrom: now.slice(0, 10),
        calories: 2_500,
        proteinTenthsGrams: null,
        carbohydrateTenthsGrams: null,
        fatTenthsGrams: null,
      }
      await this.save(userId, newProfile)
      await this.save(userId, initialGoal)
    }
  }

  async get<K extends EntityType>(userId: string, type: K, id: string): Promise<EntityMap[K] | null> {
    const row = await this.db().getFirstAsync<EntityRow>(
      `SELECT entity_type, entity_id, remote_version, payload_json, updated_at, deleted_at
       FROM local_entities WHERE user_id = ? AND entity_type = ? AND entity_id = ?`,
      userId,
      type,
      id,
    )
    if (row === null || row.deleted_at !== null) return null
    return parsePayload<EntityMap[K]>(row.payload_json)
  }

  async list<K extends EntityType>(userId: string, type: K, includeDeleted = false): Promise<EntityMap[K][]> {
    const rows = await this.db().getAllAsync<EntityRow>(
      `SELECT entity_type, entity_id, remote_version, payload_json, updated_at, deleted_at
       FROM local_entities
       WHERE user_id = ? AND entity_type = ? ${includeDeleted ? '' : 'AND deleted_at IS NULL'}
       ORDER BY updated_at DESC`,
      userId,
      type,
    )
    return rows
      .map((row) => parsePayload<EntityMap[K]>(row.payload_json))
      .filter((payload): payload is EntityMap[K] => payload !== null)
  }

  async save(userId: string, entity: EntityPayload, enqueue = true): Promise<void> {
    const db = this.db()
    const now = new Date().toISOString()
    await db.withTransactionAsync(async () => {
      const existing = await db.getFirstAsync<EntityRow>(
        `SELECT entity_type, entity_id, remote_version, payload_json, updated_at, deleted_at
         FROM local_entities WHERE user_id = ? AND entity_type = ? AND entity_id = ?`,
        userId,
        entity.kind,
        entity.id,
      )
      const remoteVersion = existing?.remote_version ?? entity.version
      const localEntity = {
        ...entity,
        version: remoteVersion,
        updatedAt: now,
        deletedAt: null,
      } as EntityPayload
      const payloadJson = JSON.stringify(localEntity)
      await db.runAsync(
        `INSERT INTO local_entities
          (user_id, entity_type, entity_id, remote_version, payload_json, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, NULL)
         ON CONFLICT(user_id, entity_type, entity_id) DO UPDATE SET
           payload_json = excluded.payload_json,
           updated_at = excluded.updated_at,
           deleted_at = NULL`,
        userId,
        entity.kind,
        entity.id,
        remoteVersion,
        payloadJson,
        now,
      )
      if (enqueue) {
        await db.runAsync(
          `INSERT INTO sync_outbox
            (user_id, mutation_id, entity_type, entity_id, operation, base_version, payload_json, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'upsert', ?, ?, ?, ?)
           ON CONFLICT(user_id, entity_type, entity_id) DO UPDATE SET
             operation = 'upsert', payload_json = excluded.payload_json, updated_at = excluded.updated_at`,
          userId,
          randomUUID(),
          entity.kind,
          entity.id,
          remoteVersion,
          payloadJson,
          now,
          now,
        )
      }
    })
    this.emit()
  }

  async remove(userId: string, type: EntityType, id: string): Promise<void> {
    const db = this.db()
    const now = new Date().toISOString()
    await db.withTransactionAsync(async () => {
      const existing = await db.getFirstAsync<EntityRow>(
        `SELECT entity_type, entity_id, remote_version, payload_json, updated_at, deleted_at
         FROM local_entities WHERE user_id = ? AND entity_type = ? AND entity_id = ?`,
        userId,
        type,
        id,
      )
      const baseVersion = existing?.remote_version ?? 0
      const existingPayload = parsePayload<EntityPayload>(existing?.payload_json ?? null)
      const deletedPayload =
        existingPayload === null
          ? null
          : ({ ...existingPayload, deletedAt: now, updatedAt: now } as EntityPayload)
      await db.runAsync(
        `INSERT INTO local_entities
          (user_id, entity_type, entity_id, remote_version, payload_json, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id, entity_type, entity_id) DO UPDATE SET
           payload_json = excluded.payload_json, updated_at = excluded.updated_at, deleted_at = excluded.deleted_at`,
        userId,
        type,
        id,
        baseVersion,
        deletedPayload === null ? null : JSON.stringify(deletedPayload),
        now,
        now,
      )
      await db.runAsync(
        `INSERT INTO sync_outbox
          (user_id, mutation_id, entity_type, entity_id, operation, base_version, payload_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'delete', ?, NULL, ?, ?)
         ON CONFLICT(user_id, entity_type, entity_id) DO UPDATE SET
           operation = 'delete', payload_json = NULL, updated_at = excluded.updated_at`,
        userId,
        randomUUID(),
        type,
        id,
        baseVersion,
        now,
        now,
      )
    })
    this.emit()
  }

  async pendingMutations(userId: string): Promise<SyncMutation[]> {
    const rows = await this.db().getAllAsync<OutboxRow>(
      `SELECT mutation_id, entity_type, entity_id, operation, base_version, payload_json
       FROM sync_outbox WHERE user_id = ? ORDER BY created_at ASC LIMIT 200`,
      userId,
    )
    return rows.map((row) => ({
      mutationId: row.mutation_id,
      entityType: row.entity_type,
      entityId: row.entity_id,
      operation: row.operation,
      baseVersion: row.base_version,
      payload: parsePayload<EntityPayload>(row.payload_json),
    }))
  }

  async cursor(userId: string): Promise<string | null> {
    const row = await this.db().getFirstAsync<{ cursor: string | null }>(
      'SELECT cursor FROM sync_state WHERE user_id = ?',
      userId,
    )
    return row?.cursor ?? null
  }

  async applySyncResponse(userId: string, response: SyncResponse): Promise<void> {
    const db = this.db()
    await db.withTransactionAsync(async () => {
      for (const acknowledgement of response.acknowledgements) {
        await db.runAsync(
          'DELETE FROM sync_outbox WHERE user_id = ? AND mutation_id = ?',
          userId,
          acknowledgement.mutationId,
        )
        const row = await db.getFirstAsync<EntityRow>(
          `SELECT entity_type, entity_id, remote_version, payload_json, updated_at, deleted_at
           FROM local_entities WHERE user_id = ? AND entity_type = ? AND entity_id = ?`,
          userId,
          acknowledgement.entityType,
          acknowledgement.entityId,
        )
        const payload = parsePayload<EntityPayload>(row?.payload_json ?? null)
        const updatedPayload =
          payload === null ? null : ({ ...payload, version: acknowledgement.version } as EntityPayload)
        await db.runAsync(
          `UPDATE local_entities SET remote_version = ?, payload_json = ?
           WHERE user_id = ? AND entity_type = ? AND entity_id = ?`,
          acknowledgement.version,
          updatedPayload === null ? null : JSON.stringify(updatedPayload),
          userId,
          acknowledgement.entityType,
          acknowledgement.entityId,
        )
      }

      for (const conflict of response.conflicts) {
        await db.runAsync(
          `INSERT INTO sync_conflicts
            (user_id, mutation_id, entity_type, entity_id, reason, server_version, server_payload_json, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(user_id, mutation_id) DO UPDATE SET
             reason = excluded.reason, server_version = excluded.server_version,
             server_payload_json = excluded.server_payload_json`,
          userId,
          conflict.mutationId,
          conflict.entityType,
          conflict.entityId,
          conflict.reason,
          conflict.serverVersion,
          conflict.serverPayload === null ? null : JSON.stringify(conflict.serverPayload),
          response.serverTime,
        )
      }

      for (const change of response.changes) {
        const pending = await db.getFirstAsync<{ mutation_id: string }>(
          `SELECT mutation_id FROM sync_outbox
           WHERE user_id = ? AND entity_type = ? AND entity_id = ?`,
          userId,
          change.entityType,
          change.entityId,
        )
        if (pending !== null) continue
        const payloadJson = change.payload === null ? null : JSON.stringify(change.payload)
        const deletedAt = change.operation === 'delete' ? change.changedAt : null
        await db.runAsync(
          `INSERT INTO local_entities
            (user_id, entity_type, entity_id, remote_version, payload_json, updated_at, deleted_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(user_id, entity_type, entity_id) DO UPDATE SET
             remote_version = excluded.remote_version,
             payload_json = excluded.payload_json,
             updated_at = excluded.updated_at,
             deleted_at = excluded.deleted_at
           WHERE excluded.remote_version >= local_entities.remote_version`,
          userId,
          change.entityType,
          change.entityId,
          change.version,
          payloadJson,
          change.changedAt,
          deletedAt,
        )
      }

      await db.runAsync(
        `INSERT INTO sync_state (user_id, cursor, last_synced_at, last_error)
         VALUES (?, ?, ?, NULL)
         ON CONFLICT(user_id) DO UPDATE SET
           cursor = excluded.cursor, last_synced_at = excluded.last_synced_at, last_error = NULL`,
        userId,
        response.nextCursor,
        response.serverTime,
      )
    })
    this.emit()
  }

  async recordSyncError(userId: string, error: string): Promise<void> {
    await this.db().runAsync(
      `INSERT INTO sync_state (user_id, cursor, last_synced_at, last_error)
       VALUES (?, NULL, NULL, ?)
       ON CONFLICT(user_id) DO UPDATE SET last_error = excluded.last_error`,
      userId,
      error,
    )
    this.emit()
  }

  async syncStatus(userId: string): Promise<{
    cursor: string | null
    lastSyncedAt: string | null
    lastError: string | null
    pending: number
    conflicts: number
  }> {
    const state = await this.db().getFirstAsync<{
      cursor: string | null
      last_synced_at: string | null
      last_error: string | null
    }>('SELECT cursor, last_synced_at, last_error FROM sync_state WHERE user_id = ?', userId)
    const pending = await this.db().getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) AS count FROM sync_outbox WHERE user_id = ?',
      userId,
    )
    const conflicts = await this.db().getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) AS count FROM sync_conflicts WHERE user_id = ?',
      userId,
    )
    return {
      cursor: state?.cursor ?? null,
      lastSyncedAt: state?.last_synced_at ?? null,
      lastError: state?.last_error ?? null,
      pending: pending?.count ?? 0,
      conflicts: conflicts?.count ?? 0,
    }
  }

  async conflicts(userId: string): Promise<StoredConflict[]> {
    const rows = await this.db().getAllAsync<{
      mutation_id: string
      entity_type: EntityType
      entity_id: string
      reason: SyncConflict['reason']
      server_version: number
      server_payload_json: string | null
      created_at: string
    }>('SELECT * FROM sync_conflicts WHERE user_id = ? ORDER BY created_at DESC', userId)
    return rows.map((row) => ({
      mutationId: row.mutation_id,
      entityType: row.entity_type,
      entityId: row.entity_id,
      reason: row.reason,
      serverVersion: row.server_version,
      serverPayload: parsePayload<EntityPayload>(row.server_payload_json),
      createdAt: row.created_at,
    }))
  }

  async deleteConflictedEntity(userId: string, mutationId: string): Promise<boolean> {
    const db = this.db()
    const conflict = await db.getFirstAsync<{
      entity_type: EntityType
      entity_id: string
      server_version: number
    }>(
      `SELECT entity_type, entity_id, server_version
       FROM sync_conflicts WHERE user_id = ? AND mutation_id = ?`,
      userId,
      mutationId,
    )
    if (conflict === null) return false

    const now = new Date().toISOString()
    await db.withTransactionAsync(async () => {
      const existing = await db.getFirstAsync<EntityRow>(
        `SELECT entity_type, entity_id, remote_version, payload_json, updated_at, deleted_at
         FROM local_entities WHERE user_id = ? AND entity_type = ? AND entity_id = ?`,
        userId,
        conflict.entity_type,
        conflict.entity_id,
      )
      const existingPayload = parsePayload<EntityPayload>(existing?.payload_json ?? null)
      const deletedPayload =
        existingPayload === null
          ? null
          : ({
              ...existingPayload,
              version: conflict.server_version,
              updatedAt: now,
              deletedAt: now,
            } as EntityPayload)

      await db.runAsync(
        `INSERT INTO local_entities
          (user_id, entity_type, entity_id, remote_version, payload_json, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id, entity_type, entity_id) DO UPDATE SET
           remote_version = excluded.remote_version,
           payload_json = excluded.payload_json,
           updated_at = excluded.updated_at,
           deleted_at = excluded.deleted_at`,
        userId,
        conflict.entity_type,
        conflict.entity_id,
        conflict.server_version,
        deletedPayload === null ? null : JSON.stringify(deletedPayload),
        now,
        now,
      )
      await db.runAsync(
        'DELETE FROM sync_outbox WHERE user_id = ? AND entity_type = ? AND entity_id = ?',
        userId,
        conflict.entity_type,
        conflict.entity_id,
      )
      await db.runAsync(
        `INSERT INTO sync_outbox
          (user_id, mutation_id, entity_type, entity_id, operation, base_version,
           payload_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'delete', ?, NULL, ?, ?)`,
        userId,
        randomUUID(),
        conflict.entity_type,
        conflict.entity_id,
        conflict.server_version,
        now,
        now,
      )
      await db.runAsync(
        'DELETE FROM sync_conflicts WHERE user_id = ? AND entity_type = ? AND entity_id = ?',
        userId,
        conflict.entity_type,
        conflict.entity_id,
      )
    })
    this.emit()
    return true
  }

  async resolveConflict(
    userId: string,
    mutationId: string,
    choice: 'mine' | 'cloud' | 'takeover',
  ): Promise<void> {
    const db = this.db()
    const conflict = await db.getFirstAsync<{
      entity_type: EntityType
      entity_id: string
      reason: SyncConflict['reason']
      server_version: number
      server_payload_json: string | null
    }>(
      `SELECT entity_type, entity_id, reason, server_version, server_payload_json
       FROM sync_conflicts WHERE user_id = ? AND mutation_id = ?`,
      userId,
      mutationId,
    )
    if (conflict === null) return
    await db.withTransactionAsync(async () => {
      const localRow = await db.getFirstAsync<EntityRow>(
        `SELECT entity_type, entity_id, remote_version, payload_json, updated_at, deleted_at
         FROM local_entities WHERE user_id = ? AND entity_type = ? AND entity_id = ?`,
        userId,
        conflict.entity_type,
        conflict.entity_id,
      )
      const localPayload = parsePayload<EntityPayload>(localRow?.payload_json ?? null)
      const now = new Date().toISOString()

      if (conflict.reason === 'active_workout_exists' && localPayload?.kind === 'workout') {
        const recovered = {
          ...localPayload,
          status: choice === 'takeover' ? 'active' : 'draft',
          recoveryReason:
            choice === 'takeover'
              ? 'takeover_requested'
              : 'Preserved after another device already had an active workout',
          version: conflict.server_version,
          updatedAt: now,
        } as EntityPayload
        await db.runAsync(
          `UPDATE local_entities SET remote_version = ?, payload_json = ?, updated_at = ?, deleted_at = NULL
           WHERE user_id = ? AND entity_type = ? AND entity_id = ?`,
          conflict.server_version,
          JSON.stringify(recovered),
          now,
          userId,
          conflict.entity_type,
          conflict.entity_id,
        )
        await db.runAsync(
          `UPDATE sync_outbox SET mutation_id = ?, operation = 'upsert', base_version = ?,
             payload_json = ?, updated_at = ?
           WHERE user_id = ? AND entity_type = ? AND entity_id = ?`,
          randomUUID(),
          conflict.server_version,
          JSON.stringify(recovered),
          now,
          userId,
          conflict.entity_type,
          conflict.entity_id,
        )
      } else if (choice === 'cloud') {
        if (
          localPayload !== null &&
          (conflict.entity_type === 'template' || conflict.entity_type === 'workout')
        ) {
          const recoveredId = randomUUID()
          const recovered = {
            ...localPayload,
            id: recoveredId,
            version: 0,
            updatedAt: now,
            ...(localPayload.kind === 'template'
              ? { name: `${localPayload.name} (recovered copy)` }
              : {
                  status: 'draft',
                  recoveryReason: 'Recovered before accepting a cloud conflict',
                }),
          } as EntityPayload
          await db.runAsync(
            `INSERT INTO local_entities
              (user_id, entity_type, entity_id, remote_version, payload_json, updated_at, deleted_at)
             VALUES (?, ?, ?, 0, ?, ?, NULL)`,
            userId,
            conflict.entity_type,
            recoveredId,
            JSON.stringify(recovered),
            now,
          )
          await db.runAsync(
            `INSERT INTO sync_outbox
              (user_id, mutation_id, entity_type, entity_id, operation, base_version,
               payload_json, created_at, updated_at)
             VALUES (?, ?, ?, ?, 'upsert', 0, ?, ?, ?)`,
            userId,
            randomUUID(),
            conflict.entity_type,
            recoveredId,
            JSON.stringify(recovered),
            now,
            now,
          )
        }
        const serverPayload = parsePayload<EntityPayload>(conflict.server_payload_json)
        await db.runAsync(
          `UPDATE local_entities SET remote_version = ?, payload_json = ?, updated_at = ?, deleted_at = ?
           WHERE user_id = ? AND entity_type = ? AND entity_id = ?`,
          conflict.server_version,
          serverPayload === null ? null : JSON.stringify(serverPayload),
          serverPayload?.updatedAt ?? now,
          serverPayload?.deletedAt ?? now,
          userId,
          conflict.entity_type,
          conflict.entity_id,
        )
        await db.runAsync(
          'DELETE FROM sync_outbox WHERE user_id = ? AND entity_type = ? AND entity_id = ?',
          userId,
          conflict.entity_type,
          conflict.entity_id,
        )
      } else {
        await db.runAsync(
          `UPDATE sync_outbox SET mutation_id = ?, base_version = ?, updated_at = ?
           WHERE user_id = ? AND entity_type = ? AND entity_id = ?`,
          randomUUID(),
          conflict.server_version,
          new Date().toISOString(),
          userId,
          conflict.entity_type,
          conflict.entity_id,
        )
        await db.runAsync(
          `UPDATE local_entities SET remote_version = ?
           WHERE user_id = ? AND entity_type = ? AND entity_id = ?`,
          conflict.server_version,
          userId,
          conflict.entity_type,
          conflict.entity_id,
        )
      }
      await db.runAsync(
        'DELETE FROM sync_conflicts WHERE user_id = ? AND mutation_id = ?',
        userId,
        mutationId,
      )
    })
    this.emit()
  }
}

export const localStore = new LocalStore()
