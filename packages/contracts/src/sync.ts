import type { EntityPayload, EntityType, IsoDateTime } from './domain'

export type SyncOperation = 'upsert' | 'delete'

export interface SyncMutation {
  mutationId: string
  entityType: EntityType
  entityId: string
  operation: SyncOperation
  baseVersion: number
  payload: EntityPayload | null
}

export interface SyncRequest {
  deviceId: string
  cursor: string | null
  mutations: SyncMutation[]
}

export interface SyncAcknowledgement {
  mutationId: string
  entityType: EntityType
  entityId: string
  version: number
}

export interface SyncConflict {
  mutationId: string
  entityType: EntityType
  entityId: string
  reason: 'stale_version' | 'active_workout_exists' | 'invalid_payload'
  serverVersion: number
  serverPayload: EntityPayload | null
}

export interface SyncChange {
  sequence: number
  entityType: EntityType
  entityId: string
  version: number
  operation: SyncOperation
  payload: EntityPayload | null
  changedAt: IsoDateTime
}

export interface SyncResponse {
  acknowledgements: SyncAcknowledgement[]
  conflicts: SyncConflict[]
  changes: SyncChange[]
  nextCursor: string
  hasMore: boolean
  serverTime: IsoDateTime
}

export interface ApiSuccess<T> {
  success: true
  result: T
}

export interface ApiFailure {
  success: false
  error: string
  code: number
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure
