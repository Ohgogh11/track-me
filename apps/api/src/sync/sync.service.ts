import { BaseService, Service } from '@onebun/core'
import {
  ContractValidationError,
  type EntityPayload,
  type EntityType,
  type SyncAcknowledgement,
  type SyncChange,
  type SyncConflict,
  type SyncRequest,
  type SyncResponse,
  validateEntityPayload,
  type WorkoutSession,
} from '@track-me/contracts'
import {
  getDatabaseConnection,
  processedMutations,
  syncChanges,
  syncEntities,
  userDevices,
} from '@track-me/database'
import { and, asc, eq, gt } from 'drizzle-orm'

const PAGE_SIZE = 500

function parseEntity(entityType: EntityType, payloadJson: string | null): EntityPayload | null {
  if (payloadJson === null) return null
  return validateEntityPayload(entityType, JSON.parse(payloadJson) as unknown)
}

function parseCursor(cursor: string | null): number {
  if (cursor === null || cursor === '') return 0
  const value = Number.parseInt(cursor, 10)
  if (!Number.isSafeInteger(value) || value < 0) throw new ContractValidationError(['cursor is invalid'])
  return value
}

@Service()
export class SyncService extends BaseService {
  async synchronize(userId: string, request: SyncRequest): Promise<SyncResponse> {
    const { db } = getDatabaseConnection()
    const acknowledgements: SyncAcknowledgement[] = []
    const conflicts: SyncConflict[] = []
    const cursor = parseCursor(request.cursor)

    await db.transaction(async (transaction) => {
      const now = new Date().toISOString()
      await transaction
        .insert(userDevices)
        .values({ userId, deviceId: request.deviceId, lastSeenAt: now })
        .onConflictDoUpdate({
          target: [userDevices.userId, userDevices.deviceId],
          set: { lastSeenAt: now },
        })

      for (const mutation of request.mutations) {
        const [alreadyProcessed] = await transaction
          .select()
          .from(processedMutations)
          .where(
            and(
              eq(processedMutations.userId, userId),
              eq(processedMutations.mutationId, mutation.mutationId),
            ),
          )
          .limit(1)

        if (alreadyProcessed !== undefined) {
          acknowledgements.push({
            mutationId: mutation.mutationId,
            entityType: alreadyProcessed.entityType as EntityType,
            entityId: alreadyProcessed.entityId,
            version: alreadyProcessed.version,
          })
          continue
        }

        const [existing] = await transaction
          .select()
          .from(syncEntities)
          .where(
            and(
              eq(syncEntities.userId, userId),
              eq(syncEntities.entityType, mutation.entityType),
              eq(syncEntities.entityId, mutation.entityId),
            ),
          )
          .limit(1)
        const currentVersion = existing?.version ?? 0

        if (mutation.baseVersion !== currentVersion) {
          conflicts.push({
            mutationId: mutation.mutationId,
            entityType: mutation.entityType,
            entityId: mutation.entityId,
            reason: 'stale_version',
            serverVersion: currentVersion,
            serverPayload: existing ? parseEntity(mutation.entityType, existing.payloadJson) : null,
          })
          continue
        }

        let payload: EntityPayload | null = null
        if (mutation.operation === 'upsert') {
          try {
            payload = validateEntityPayload(mutation.entityType, mutation.payload)
          } catch (error) {
            if (!(error instanceof ContractValidationError)) throw error
            conflicts.push({
              mutationId: mutation.mutationId,
              entityType: mutation.entityType,
              entityId: mutation.entityId,
              reason: 'invalid_payload',
              serverVersion: currentVersion,
              serverPayload: existing ? parseEntity(mutation.entityType, existing.payloadJson) : null,
            })
            continue
          }
          if (payload.id !== mutation.entityId) {
            conflicts.push({
              mutationId: mutation.mutationId,
              entityType: mutation.entityType,
              entityId: mutation.entityId,
              reason: 'invalid_payload',
              serverVersion: currentVersion,
              serverPayload: existing ? parseEntity(mutation.entityType, existing.payloadJson) : null,
            })
            continue
          }

          if (
            mutation.entityType === 'workout' &&
            payload.kind === 'workout' &&
            payload.status === 'active'
          ) {
            const otherWorkoutRows = await transaction
              .select()
              .from(syncEntities)
              .where(and(eq(syncEntities.userId, userId), eq(syncEntities.entityType, 'workout')))
            const otherActive = otherWorkoutRows
              .filter((row) => row.entityId !== mutation.entityId && row.deletedAt === null)
              .map((row) => ({ row, workout: parseEntity('workout', row.payloadJson) }))
              .find(({ workout }) => workout?.kind === 'workout' && workout.status === 'active')
            if (otherActive !== undefined) {
              if (payload.recoveryReason !== 'takeover_requested') {
                conflicts.push({
                  mutationId: mutation.mutationId,
                  entityType: mutation.entityType,
                  entityId: mutation.entityId,
                  reason: 'active_workout_exists',
                  serverVersion: currentVersion,
                  serverPayload: otherActive.workout,
                })
                continue
              }
              const otherVersion = otherActive.row.version + 1
              const recoveredWorkout = {
                ...(otherActive.workout as WorkoutSession),
                version: otherVersion,
                updatedAt: now,
                status: 'draft',
                recoveryReason: `Taken over by workout ${mutation.entityId}`,
                timerSegments: (otherActive.workout as WorkoutSession).timerSegments.map((segment) =>
                  segment.endedAt === null ? { ...segment, endedAt: now } : segment,
                ),
              } satisfies WorkoutSession
              await transaction
                .update(syncEntities)
                .set({ version: otherVersion, payloadJson: JSON.stringify(recoveredWorkout), updatedAt: now })
                .where(
                  and(
                    eq(syncEntities.userId, userId),
                    eq(syncEntities.entityType, 'workout'),
                    eq(syncEntities.entityId, otherActive.row.entityId),
                  ),
                )
              await transaction.insert(syncChanges).values({
                userId,
                entityType: 'workout',
                entityId: otherActive.row.entityId,
                version: otherVersion,
                operation: 'upsert',
                payloadJson: JSON.stringify(recoveredWorkout),
                changedAt: now,
              })
              payload = { ...payload, recoveryReason: null }
            }
          }
        }

        const version = currentVersion + 1
        const serverPayload =
          payload === null
            ? null
            : ({ ...payload, version, updatedAt: now, deletedAt: null } as EntityPayload)
        const deletedAt = mutation.operation === 'delete' ? now : null
        const payloadJson = serverPayload === null ? null : JSON.stringify(serverPayload)

        await transaction
          .insert(syncEntities)
          .values({
            userId,
            entityType: mutation.entityType,
            entityId: mutation.entityId,
            version,
            payloadJson,
            updatedAt: now,
            deletedAt,
          })
          .onConflictDoUpdate({
            target: [syncEntities.userId, syncEntities.entityType, syncEntities.entityId],
            set: { version, payloadJson, updatedAt: now, deletedAt },
          })

        await transaction.insert(syncChanges).values({
          userId,
          entityType: mutation.entityType,
          entityId: mutation.entityId,
          version,
          operation: mutation.operation,
          payloadJson,
          changedAt: now,
        })
        await transaction.insert(processedMutations).values({
          userId,
          mutationId: mutation.mutationId,
          entityType: mutation.entityType,
          entityId: mutation.entityId,
          version,
          processedAt: now,
        })
        acknowledgements.push({
          mutationId: mutation.mutationId,
          entityType: mutation.entityType,
          entityId: mutation.entityId,
          version,
        })
      }
    })

    const changeRows = await db
      .select()
      .from(syncChanges)
      .where(and(eq(syncChanges.userId, userId), gt(syncChanges.sequence, cursor)))
      .orderBy(asc(syncChanges.sequence))
      .limit(PAGE_SIZE + 1)
    const hasMore = changeRows.length > PAGE_SIZE
    const pageRows = changeRows.slice(0, PAGE_SIZE)
    const changes: SyncChange[] = pageRows.map((row) => ({
      sequence: row.sequence,
      entityType: row.entityType as EntityType,
      entityId: row.entityId,
      version: row.version,
      operation: row.operation === 'delete' ? 'delete' : 'upsert',
      payload: parseEntity(row.entityType as EntityType, row.payloadJson),
      changedAt: row.changedAt,
    }))
    return {
      acknowledgements,
      conflicts,
      changes,
      nextCursor: String(pageRows.at(-1)?.sequence ?? cursor),
      hasMore,
      serverTime: new Date().toISOString(),
    }
  }
}
