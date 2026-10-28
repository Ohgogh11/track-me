import NetInfo from '@react-native-community/netinfo'
import {
  type BodyWeightEntry,
  BUILT_IN_EXERCISES,
  type CalorieEntry,
  type CalorieGoal,
  type EntityPayload,
  type Exercise,
  type ExerciseVisibility,
  type PersonalFood,
  type UserProfile,
  type WorkoutSession,
  type WorkoutTemplate,
} from '@track-me/contracts'
import { randomUUID } from 'expo-crypto'
import * as SecureStore from 'expo-secure-store'
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { AppState, type AppStateStatus } from 'react-native'
import { localStore, type StoredConflict } from '@/data/local-store'
import { sendSyncRequest } from '@/data/sync-client'
import { useAppAuth } from './auth-provider'

export interface SyncStatus {
  cursor: string | null
  lastSyncedAt: string | null
  lastError: string | null
  pending: number
  conflicts: number
  syncing: boolean
}

export interface SyncResult {
  ok: boolean
  message: string
}

interface DataSnapshot {
  profile: UserProfile | null
  exercises: Exercise[]
  customExercises: Exercise[]
  exerciseVisibilities: ExerciseVisibility[]
  templates: WorkoutTemplate[]
  workouts: WorkoutSession[]
  calorieEntries: CalorieEntry[]
  calorieGoals: CalorieGoal[]
  bodyWeights: BodyWeightEntry[]
  personalFoods: PersonalFood[]
  conflicts: StoredConflict[]
}

interface DataContextValue extends DataSnapshot {
  ready: boolean
  error: string | null
  syncStatus: SyncStatus
  save: (entity: EntityPayload) => Promise<void>
  remove: (entity: EntityPayload) => Promise<void>
  synchronize: () => Promise<SyncResult>
  deleteConflictedData: (mutationId: string) => Promise<SyncResult>
  resolveConflict: (mutationId: string, choice: 'mine' | 'cloud' | 'takeover') => Promise<void>
  refresh: () => Promise<void>
}

const emptySnapshot: DataSnapshot = {
  profile: null,
  exercises: [...BUILT_IN_EXERCISES],
  customExercises: [],
  exerciseVisibilities: [],
  templates: [],
  workouts: [],
  calorieEntries: [],
  calorieGoals: [],
  bodyWeights: [],
  personalFoods: [],
  conflicts: [],
}

const emptySyncStatus: SyncStatus = {
  cursor: null,
  lastSyncedAt: null,
  lastError: null,
  pending: 0,
  conflicts: 0,
  syncing: false,
}

const DataContext = createContext<DataContextValue | null>(null)

export async function getDeviceId(): Promise<string> {
  const key = 'track-me-device-id'
  const existing = await SecureStore.getItemAsync(key)
  if (existing !== null) return existing
  const created = randomUUID()
  await SecureStore.setItemAsync(key, created)
  return created
}

export function DataProvider({ children }: PropsWithChildren) {
  const auth = useAppAuth()
  const [snapshot, setSnapshot] = useState<DataSnapshot>(emptySnapshot)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(emptySyncStatus)
  const syncing = useRef(false)
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const refresh = useCallback(async () => {
    if (auth.userId === null) return
    const userId = auth.userId
    await localStore.initialize()
    const [
      profiles,
      customExercises,
      visibilities,
      templates,
      workouts,
      calorieEntries,
      calorieGoals,
      bodyWeights,
      personalFoods,
      conflicts,
      status,
    ] = await Promise.all([
      localStore.list(userId, 'profile'),
      localStore.list(userId, 'exercise'),
      localStore.list(userId, 'exercise_visibility'),
      localStore.list(userId, 'template'),
      localStore.list(userId, 'workout'),
      localStore.list(userId, 'calorie_entry'),
      localStore.list(userId, 'calorie_goal'),
      localStore.list(userId, 'body_weight'),
      localStore.list(userId, 'food_item'),
      localStore.conflicts(userId),
      localStore.syncStatus(userId),
    ])
    const hiddenIds = new Set(
      (visibilities as ExerciseVisibility[])
        .filter((visibility) => visibility.hidden)
        .map((item) => item.exerciseId),
    )
    const exercises = [...BUILT_IN_EXERCISES, ...customExercises]
      .filter((exercise) => !hiddenIds.has(exercise.id) && exercise.archivedAt === null)
      .sort((left, right) => left.name.localeCompare(right.name))
    setSnapshot({
      profile: profiles[0] ?? null,
      exercises,
      customExercises,
      exerciseVisibilities: visibilities,
      templates: templates.sort((left, right) => left.name.localeCompare(right.name)),
      workouts: workouts.sort((left, right) => Date.parse(right.startedAt) - Date.parse(left.startedAt)),
      calorieEntries,
      calorieGoals,
      bodyWeights,
      personalFoods: personalFoods.sort((left, right) => {
        if (left.favorite !== right.favorite) return left.favorite ? -1 : 1
        return left.name.localeCompare(right.name)
      }),
      conflicts,
    })
    setSyncStatus((current) => ({ ...current, ...status }))
  }, [auth.userId])

  const requestRefresh = useCallback(() => {
    void refresh().catch((refreshError: unknown) => {
      setError(refreshError instanceof Error ? refreshError.message : 'Refreshing local data failed')
    })
  }, [refresh])

  const synchronize = useCallback(async (): Promise<SyncResult> => {
    if (auth.userId === null) return { ok: false, message: 'Sign in before synchronizing.' }
    if (syncing.current) return { ok: false, message: 'Synchronization is already in progress.' }
    syncing.current = true
    setSyncStatus((current) => ({ ...current, syncing: true }))
    let result: SyncResult
    let databaseReady = false
    try {
      await localStore.initialize()
      databaseReady = true
      const token = await auth.getToken()
      const id = await getDeviceId()
      let shouldContinue = true
      let attempts = 0
      while (shouldContinue && attempts < 10) {
        attempts += 1
        const [cursor, mutations] = await Promise.all([
          localStore.cursor(auth.userId),
          localStore.pendingMutations(auth.userId),
        ])
        const response = await sendSyncRequest({ deviceId: id, cursor, mutations }, token)
        await localStore.applySyncResponse(auth.userId, response)
        shouldContinue = response.hasMore || (response.conflicts.length === 0 && mutations.length === 200)
      }
      setError(null)
      result = { ok: true, message: 'Your local data and cloud data are up to date.' }
    } catch (syncError) {
      const message = syncError instanceof Error ? syncError.message : 'Synchronization failed'
      if (databaseReady) {
        try {
          await localStore.recordSyncError(auth.userId, message)
        } catch {
          // A sync failure must still resolve cleanly if recording its diagnostics fails.
        }
      }
      setError(message)
      result = { ok: false, message }
    } finally {
      syncing.current = false
      setSyncStatus((current) => ({ ...current, syncing: false }))
      if (databaseReady) {
        try {
          await refresh()
        } catch (refreshError) {
          setError(refreshError instanceof Error ? refreshError.message : 'Refreshing local data failed')
        }
      }
    }
    return result
  }, [auth, refresh])

  const scheduleSync = useCallback(() => {
    if (debounceTimer.current !== null) clearTimeout(debounceTimer.current)
    debounceTimer.current = setTimeout(() => void synchronize(), 900)
  }, [synchronize])

  useEffect(() => {
    if (!auth.isSignedIn || auth.userId === null) {
      setReady(auth.isLoaded)
      setSnapshot(emptySnapshot)
      return
    }
    let active = true
    const userId = auth.userId
    setReady(false)
    setError(null)
    void (async () => {
      try {
        await localStore.initialize()
        if (!active) return
        await localStore.ensureUserDefaults(userId)
        if (!active) return
        await refresh()
        if (!active) return
        setReady(true)
        await synchronize()
      } catch (initializationError: unknown) {
        if (active) {
          setError(
            initializationError instanceof Error
              ? initializationError.message
              : 'Database initialization failed',
          )
          setReady(true)
        }
      }
    })()
    const unsubscribe = localStore.subscribe(requestRefresh)
    return () => {
      active = false
      unsubscribe()
    }
  }, [auth.isLoaded, auth.isSignedIn, auth.userId, refresh, requestRefresh, synchronize])

  useEffect(() => {
    if (!ready || !auth.isSignedIn) return
    const unsubscribeNetwork = NetInfo.addEventListener((state) => {
      if (state.isConnected) void synchronize()
    })
    const onAppState = (state: AppStateStatus) => {
      if (state === 'active') void synchronize()
    }
    const subscription = AppState.addEventListener('change', onAppState)
    return () => {
      unsubscribeNetwork()
      subscription.remove()
    }
  }, [auth.isSignedIn, ready, synchronize])

  const save = useCallback(
    async (entity: EntityPayload) => {
      if (auth.userId === null) throw new Error('Sign in before saving data')
      await localStore.save(auth.userId, entity)
      scheduleSync()
    },
    [auth.userId, scheduleSync],
  )
  const remove = useCallback(
    async (entity: EntityPayload) => {
      if (auth.userId === null) throw new Error('Sign in before deleting data')
      await localStore.remove(auth.userId, entity.kind, entity.id)
      scheduleSync()
    },
    [auth.userId, scheduleSync],
  )
  const resolveConflict = useCallback(
    async (mutationId: string, choice: 'mine' | 'cloud' | 'takeover') => {
      if (auth.userId === null) return
      await localStore.resolveConflict(auth.userId, mutationId, choice)
      await synchronize()
    },
    [auth.userId, synchronize],
  )
  const deleteConflictedData = useCallback(
    async (mutationId: string): Promise<SyncResult> => {
      if (!__DEV__) return { ok: false, message: 'This tool is only available in development builds.' }
      if (auth.userId === null) return { ok: false, message: 'Sign in before deleting conflict data.' }
      try {
        const deleted = await localStore.deleteConflictedEntity(auth.userId, mutationId)
        if (!deleted) return { ok: false, message: 'This conflict no longer exists.' }
        await refresh()
        const result = await synchronize()
        return result.ok
          ? { ok: true, message: 'The conflicted item was deleted locally and synchronized.' }
          : {
              ok: false,
              message: `The item was deleted locally and its cloud deletion is queued. ${result.message}`,
            }
      } catch (deleteError) {
        return {
          ok: false,
          message: deleteError instanceof Error ? deleteError.message : 'Conflict deletion failed.',
        }
      }
    },
    [auth.userId, refresh, synchronize],
  )

  const value = useMemo<DataContextValue>(
    () => ({
      ...snapshot,
      ready,
      error,
      syncStatus,
      save,
      remove,
      synchronize,
      deleteConflictedData,
      resolveConflict,
      refresh,
    }),
    [
      deleteConflictedData,
      error,
      ready,
      refresh,
      remove,
      resolveConflict,
      save,
      snapshot,
      syncStatus,
      synchronize,
    ],
  )
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export function useData(): DataContextValue {
  const value = useContext(DataContext)
  if (value === null) throw new Error('useData must be used inside DataProvider')
  return value
}
