import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const syncEntities = sqliteTable(
  'sync_entities',
  {
    userId: text('user_id').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    version: integer('version').notNull(),
    payloadJson: text('payload_json'),
    updatedAt: text('updated_at').notNull(),
    deletedAt: text('deleted_at'),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.entityType, table.entityId] }),
    index('sync_entities_user_type_idx').on(table.userId, table.entityType),
  ],
)

export const syncChanges = sqliteTable(
  'sync_changes',
  {
    sequence: integer('sequence').primaryKey({ autoIncrement: true }),
    userId: text('user_id').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    version: integer('version').notNull(),
    operation: text('operation').notNull(),
    payloadJson: text('payload_json'),
    changedAt: text('changed_at').notNull(),
  },
  (table) => [index('sync_changes_user_sequence_idx').on(table.userId, table.sequence)],
)

export const processedMutations = sqliteTable(
  'processed_mutations',
  {
    userId: text('user_id').notNull(),
    mutationId: text('mutation_id').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    version: integer('version').notNull(),
    processedAt: text('processed_at').notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.mutationId] })],
)

export const userDevices = sqliteTable(
  'user_devices',
  {
    userId: text('user_id').notNull(),
    deviceId: text('device_id').notNull(),
    lastSeenAt: text('last_seen_at').notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.deviceId] })],
)
