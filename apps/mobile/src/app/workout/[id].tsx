import {
  type CompletedSet,
  calculateActiveSeconds,
  formatDuration,
  type WorkoutSession,
} from '@track-me/contracts'
import { randomUUID } from 'expo-crypto'
import { router, useLocalSearchParams } from 'expo-router'
import { useEffect, useMemo, useState } from 'react'
import { Alert, Pressable, StyleSheet, View } from 'react-native'
import { SectionTitle } from '@/components/controls'
import { AppText, Button, Card, EmptyState, Field, Screen } from '@/components/ui'
import {
  RestEditorModal,
  type RestEditTarget,
  WorkoutSetColumns,
  WorkoutSetRow,
} from '@/components/workout-set-row'
import { createPrescription, createWorkoutExercise } from '@/lib/factories'
import { cancelRestTimer, findScheduledRestTimer, scheduleRestTimer } from '@/lib/rest-timer'
import { elapsedRestSeconds, findActiveSet, findPendingRest } from '@/lib/workout-timing'
import { useData } from '@/providers/data-provider'
import { useAppTheme } from '@/theme/use-theme'

interface RestState {
  setId: string
  completedAt: string
  endsAt: number
  notificationId: string | null
}

function updateSet(
  workout: WorkoutSession,
  exerciseIndex: number,
  setIndex: number,
  change: Partial<CompletedSet>,
): WorkoutSession {
  return {
    ...workout,
    exercises: workout.exercises.map((exercise, currentExercise) =>
      currentExercise === exerciseIndex
        ? {
            ...exercise,
            sets: exercise.sets.map((set, currentSet) =>
              currentSet === setIndex ? { ...set, ...change } : set,
            ),
          }
        : exercise,
    ),
  }
}

function resolveRest(workout: WorkoutSession, rest: RestState, at: string): WorkoutSession {
  return {
    ...workout,
    exercises: workout.exercises.map((exercise) => ({
      ...exercise,
      sets: exercise.sets.map((set) =>
        set.id === rest.setId ? { ...set, actualRestSeconds: elapsedRestSeconds(rest.completedAt, at) } : set,
      ),
    })),
  }
}

function unfinishedExerciseId(workout: WorkoutSession, afterIndex = -1): string | null {
  const ordered = [
    ...workout.exercises.slice(afterIndex + 1),
    ...workout.exercises.slice(0, Math.max(0, afterIndex + 1)),
  ]
  const unfinished = ordered.find((exercise) => exercise.sets.some((set) => set.status !== 'completed'))
  return unfinished?.id ?? (afterIndex < 0 ? (workout.exercises[0]?.id ?? null) : null)
}

export default function ActiveWorkoutScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const data = useData()
  const { colors } = useAppTheme()
  const source = data.workouts.find((item) => item.id === id) ?? null
  const [draft, setDraft] = useState<WorkoutSession | null>(null)
  const [tick, setTick] = useState(Date.now())
  const [rest, setRest] = useState<RestState | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [restEditor, setRestEditor] = useState<RestEditTarget | null>(null)
  const [addingExercise, setAddingExercise] = useState(false)
  const [exerciseSearch, setExerciseSearch] = useState('')
  const unit = data.profile?.weightUnit ?? 'kg'

  useEffect(() => {
    if (source === null || draft !== null) return
    const next = JSON.parse(JSON.stringify(source)) as WorkoutSession
    next.exercises = next.exercises.map((exercise) => ({
      ...exercise,
      trackingMode: exercise.trackingMode ?? 'bilateral',
      sets: exercise.sets.map((set) => ({
        ...set,
        startedAt: set.startedAt ?? null,
        sideResults: set.sideResults ?? null,
      })),
    }))
    setDraft(next)
    const active = findActiveSet(next.exercises)
    setExpandedId(
      active === null ? unfinishedExerciseId(next) : (next.exercises[active.exerciseIndex]?.id ?? null),
    )
    const pending = findPendingRest(next.exercises)
    if (pending?.set.completedAt) {
      const state: RestState = {
        setId: pending.set.id,
        completedAt: pending.set.completedAt,
        endsAt: Date.parse(pending.set.completedAt) + pending.set.restSeconds * 1_000,
        notificationId: null,
      }
      setRest(state)
      void findScheduledRestTimer(pending.set.id)
        .then((notificationId) =>
          setRest((current) =>
            current?.setId === pending.set.id ? { ...current, notificationId } : current,
          ),
        )
        .catch(() => undefined)
    }
  }, [draft, source])

  useEffect(() => {
    const interval = setInterval(() => setTick(Date.now()), 1_000)
    return () => clearInterval(interval)
  }, [])

  const activeSet = useMemo(() => (draft === null ? null : findActiveSet(draft.exercises)), [draft])
  const paused = useMemo(() => draft?.timerSegments.at(-1)?.endedAt !== null, [draft])
  const remaining = rest === null ? 0 : Math.max(0, Math.ceil((rest.endsAt - tick) / 1_000))
  const elapsed = rest === null ? 0 : elapsedRestSeconds(rest.completedAt, new Date(tick).toISOString())
  const pickerExercises = useMemo(() => {
    const query = exerciseSearch.trim().toLocaleLowerCase()
    return data.exercises
      .filter(
        (exercise) =>
          query.length === 0 ||
          exercise.name.toLocaleLowerCase().includes(query) ||
          exercise.equipment?.toLocaleLowerCase().includes(query),
      )
      .slice(0, 50)
  }, [data.exercises, exerciseSearch])

  const persist = async (next: WorkoutSession) => {
    setDraft(next)
    await data.save(next)
  }

  if (draft === null) {
    return (
      <Screen>
        <EmptyState title="Workout not found" message="The workout may still be loading or was removed." />
      </Screen>
    )
  }
  if (draft.status === 'completed') {
    return (
      <Screen>
        <EmptyState
          title="Workout is complete"
          message="Open it from workout history to make corrections."
          action={
            <Button
              title="Open history"
              onPress={() => router.replace({ pathname: '/history/[id]', params: { id: draft.id } })}
            />
          }
        />
      </Screen>
    )
  }

  const saveSet = (exerciseIndex: number, setIndex: number, change: Partial<CompletedSet>) => {
    void persist(updateSet(draft, exerciseIndex, setIndex, change))
  }

  const togglePause = async () => {
    const now = new Date().toISOString()
    const segments = [...draft.timerSegments]
    const last = segments.at(-1)
    if (last?.endedAt === null) segments[segments.length - 1] = { ...last, endedAt: now }
    else segments.push({ id: randomUUID(), startedAt: now, endedAt: null })
    await persist({ ...draft, timerSegments: segments })
  }

  const acknowledgeRest = async () => {
    if (rest === null) return
    await cancelRestTimer(rest.notificationId)
    const next = resolveRest(draft, rest, new Date().toISOString())
    setRest(null)
    await persist(next)
  }

  const startSet = async (exerciseIndex: number, setIndex: number) => {
    const set = draft.exercises[exerciseIndex]?.sets[setIndex]
    if (set === undefined || set.status === 'completed') return
    const active = findActiveSet(draft.exercises)
    if (active !== null) {
      if (active.exerciseIndex === exerciseIndex && active.setIndex === setIndex) return
      const exercise = draft.exercises[active.exerciseIndex]
      setExpandedId(exercise?.id ?? expandedId)
      Alert.alert(
        'Another set is active',
        `Complete the active set in ${exercise?.exerciseName ?? 'this workout'} first.`,
      )
      return
    }
    const now = new Date().toISOString()
    let next = rest === null ? draft : resolveRest(draft, rest, now)
    if (rest !== null) {
      await cancelRestTimer(rest.notificationId)
      setRest(null)
    }
    next = updateSet(next, exerciseIndex, setIndex, {
      status: 'planned',
      startedAt: now,
      completedAt: null,
    })
    setExpandedId(next.exercises[exerciseIndex]?.id ?? expandedId)
    await persist(next)
  }

  const undoSet = async (exerciseIndex: number, setIndex: number) => {
    const set = draft.exercises[exerciseIndex]?.sets[setIndex]
    if (set === undefined) return
    if (rest?.setId === set.id) {
      await cancelRestTimer(rest.notificationId)
      setRest(null)
    }
    setExpandedId(draft.exercises[exerciseIndex]?.id ?? expandedId)
    await persist(
      updateSet(draft, exerciseIndex, setIndex, {
        status: 'planned',
        startedAt: null,
        completedAt: null,
        actualRestSeconds: null,
      }),
    )
  }

  const completeSet = async (exerciseIndex: number, setIndex: number) => {
    const set = draft.exercises[exerciseIndex]?.sets[setIndex]
    if (set === undefined) return
    if (set.status === 'completed') {
      await undoSet(exerciseIndex, setIndex)
      return
    }
    if (set.startedAt === null) {
      Alert.alert('Start the set first', 'Press Start before completing this set.')
      return
    }
    const workoutExercise = draft.exercises[exerciseIndex]
    const missingReps =
      workoutExercise?.trackingMode === 'unilateral'
        ? set.sideResults?.left.actualReps === null ||
          set.sideResults?.left.actualReps === undefined ||
          set.sideResults?.right.actualReps === null ||
          set.sideResults?.right.actualReps === undefined
        : set.actualReps === null
    if (missingReps) {
      Alert.alert(
        'Enter reps',
        workoutExercise?.trackingMode === 'unilateral'
          ? 'Record both left and right reps before finishing this set.'
          : 'Record the reps completed before finishing this set.',
      )
      return
    }
    const now = new Date().toISOString()
    const next = updateSet(draft, exerciseIndex, setIndex, {
      status: 'completed',
      completedAt: now,
      actualRestSeconds: null,
    })
    await persist(next)
    const notificationId = await scheduleRestTimer(set.restSeconds, set.id)
    setRest({
      setId: set.id,
      completedAt: now,
      endsAt: Date.parse(now) + set.restSeconds * 1_000,
      notificationId,
    })
    const exercise = next.exercises[exerciseIndex]
    if (exercise?.sets.length && exercise.sets.every((row) => row.status === 'completed')) {
      setExpandedId(unfinishedExerciseId(next, exerciseIndex) ?? exercise.id)
    }
  }

  const removeSet = async (exerciseIndex: number, setIndex: number) => {
    const set = draft.exercises[exerciseIndex]?.sets[setIndex]
    if (set === undefined) return
    const remove = async () => {
      if (rest?.setId === set.id) {
        await cancelRestTimer(rest.notificationId)
        setRest(null)
      }
      await persist({
        ...draft,
        exercises: draft.exercises.map((exercise, currentExercise) =>
          currentExercise === exerciseIndex
            ? {
                ...exercise,
                sets: exercise.sets
                  .filter((_, currentSet) => currentSet !== setIndex)
                  .map((row, order) => ({ ...row, order })),
              }
            : exercise,
        ),
      })
    }
    const hasData =
      set.startedAt !== null ||
      set.actualReps !== null ||
      set.actualWeightGrams !== null ||
      set.actualRpeTenths !== null ||
      (set.sideResults ?? null) !== null
    if (!hasData) return remove()
    Alert.alert('Remove this set?', 'Recorded values for this set will be discarded.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => void remove() },
    ])
  }

  const chooseType = (exerciseIndex: number, setIndex: number) => {
    Alert.alert('Set type', 'Warm-up sets are excluded from work-set analytics.', [
      { text: 'Warm-up', onPress: () => saveSet(exerciseIndex, setIndex, { type: 'warmup' }) },
      { text: 'Work', onPress: () => saveSet(exerciseIndex, setIndex, { type: 'work' }) },
      { text: 'Cancel', style: 'cancel' },
    ])
  }

  const removeExercise = (exerciseIndex: number) => {
    const exercise = draft.exercises[exerciseIndex]
    if (exercise === undefined) return
    Alert.alert('Remove exercise?', `Remove ${exercise.exerciseName} and all of its sets?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          if (exercise.sets.some((set) => set.id === rest?.setId)) {
            void cancelRestTimer(rest?.notificationId ?? null)
            setRest(null)
          }
          const next = {
            ...draft,
            exercises: draft.exercises
              .filter((_, index) => index !== exerciseIndex)
              .map((item, order) => ({ ...item, order })),
          }
          setExpandedId(unfinishedExerciseId(next))
          void persist(next)
        },
      },
    ])
  }

  const finish = async () => {
    const now = new Date().toISOString()
    const base = rest === null ? draft : resolveRest(draft, rest, now)
    const completed: WorkoutSession = {
      ...base,
      status: 'completed',
      completedAt: now,
      timerSegments: base.timerSegments.map((segment) =>
        segment.endedAt === null ? { ...segment, endedAt: now } : segment,
      ),
      exercises: base.exercises.map((exercise) => ({
        ...exercise,
        sets: exercise.sets.map((set) => (set.status === 'planned' ? { ...set, status: 'skipped' } : set)),
      })),
    }
    await cancelRestTimer(rest?.notificationId ?? null)
    setRest(null)
    await data.save(completed)
    router.replace({ pathname: '/history/[id]', params: { id: completed.id } })
  }

  return (
    <Screen>
      <Card style={{ borderColor: paused ? colors.warning : colors.primary }}>
        <View style={styles.row}>
          <View style={styles.grow}>
            <AppText style={styles.workoutName}>{draft.name}</AppText>
            <AppText style={[styles.timer, { color: paused ? colors.warning : colors.primary }]}>
              {formatDuration(calculateActiveSeconds(draft.timerSegments))}
            </AppText>
            <AppText style={{ color: colors.textMuted }}>
              {paused ? 'Paused — your elapsed time is safe' : 'Workout timer running'}
            </AppText>
          </View>
          <Button
            title={paused ? 'Resume' : 'Pause'}
            compact
            variant="secondary"
            onPress={() => void togglePause()}
          />
        </View>
      </Card>

      {rest !== null ? (
        <Card style={{ borderColor: remaining === 0 ? colors.primary : colors.warning }}>
          <View style={styles.row}>
            <View style={styles.grow}>
              <AppText style={[styles.restTitle, { color: remaining === 0 ? colors.primary : colors.text }]}>
                {remaining === 0 ? 'Rest complete' : `Rest ${formatDuration(remaining)}`}
              </AppText>
              <AppText style={{ color: colors.textMuted }}>
                Elapsed {formatDuration(elapsed)}
                {remaining > 0 ? ' · Start the next set whenever you are ready' : ''}
              </AppText>
            </View>
            {remaining === 0 ? <Button title="OK" compact onPress={() => void acknowledgeRest()} /> : null}
          </View>
        </Card>
      ) : null}

      <SectionTitle
        action={<Button title="Add exercise" compact onPress={() => setAddingExercise((value) => !value)} />}
      >
        Session exercises
      </SectionTitle>
      {addingExercise ? (
        <Card>
          <Field
            label="Search exercises"
            value={exerciseSearch}
            onChangeText={setExerciseSearch}
            placeholder="Name or equipment"
          />
          {pickerExercises.map((exercise) => (
            <View key={exercise.id} style={styles.row}>
              <AppText style={styles.grow}>{exercise.name}</AppText>
              <Button
                title="Add"
                compact
                variant="secondary"
                onPress={() => {
                  const added = createWorkoutExercise(exercise, draft.exercises.length)
                  void persist({ ...draft, exercises: [...draft.exercises, added] })
                  setExpandedId(added.id)
                  setAddingExercise(false)
                }}
              />
            </View>
          ))}
          {pickerExercises.length === 50 ? (
            <AppText style={{ color: colors.textMuted }}>
              Showing the first 50 matches. Refine your search.
            </AppText>
          ) : null}
        </Card>
      ) : null}
      {draft.exercises.length === 0 ? (
        <EmptyState
          title="Empty workout"
          message="Add any exercise from your catalog and record the sets you complete."
        />
      ) : null}

      {draft.exercises.map((exercise, exerciseIndex) => {
        const expanded = expandedId === exercise.id
        const completed = exercise.sets.filter((set) => set.status === 'completed').length
        const active = activeSet?.exerciseIndex === exerciseIndex
        return (
          <Card key={exercise.id} style={styles.exerciseCard}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded }}
              onPress={() => setExpandedId(expanded ? null : exercise.id)}
              style={({ pressed }) => [styles.accordionHeader, pressed && styles.pressed]}
            >
              <View style={styles.grow}>
                <View style={styles.titleRow}>
                  {active ? <View style={[styles.dot, { backgroundColor: colors.primary }]} /> : null}
                  <AppText style={styles.exerciseName}>
                    {exerciseIndex + 1}. {exercise.exerciseName}
                  </AppText>
                </View>
                <AppText style={{ color: active ? colors.primary : colors.textMuted }}>
                  {completed}/{exercise.sets.length} sets complete{active ? ' · active set' : ''}
                </AppText>
              </View>
              <AppText style={[styles.chevron, { color: colors.primary }]}>{expanded ? '⌃' : '⌄'}</AppText>
            </Pressable>

            {expanded ? (
              <View style={[styles.body, { borderTopColor: colors.border }]}>
                <View style={styles.row}>
                  <AppText style={[styles.note, { color: colors.textMuted }]}>
                    Start one set at a time. Rest targets are read-only here.
                  </AppText>
                  <Button
                    title="Exercise info"
                    compact
                    variant="ghost"
                    onPress={() =>
                      router.push({ pathname: '/exercise/[id]', params: { id: exercise.exerciseId } })
                    }
                  />
                  <Button
                    title="Remove exercise"
                    compact
                    variant="ghost"
                    onPress={() => removeExercise(exerciseIndex)}
                  />
                </View>
                {exercise.sets.length > 0 ? (
                  <WorkoutSetColumns unilateral={exercise.trackingMode === 'unilateral'} />
                ) : null}
                {exercise.sets.map((set, setIndex) => (
                  <WorkoutSetRow
                    key={set.id}
                    set={set}
                    setIndex={setIndex}
                    unit={unit}
                    trackingMode={exercise.trackingMode ?? 'bilateral'}
                    onUpdate={(change) => saveSet(exerciseIndex, setIndex, change)}
                    onStart={() => void startSet(exerciseIndex, setIndex)}
                    onComplete={() => void completeSet(exerciseIndex, setIndex)}
                    onRemove={() => void removeSet(exerciseIndex, setIndex)}
                    onChooseType={() => chooseType(exerciseIndex, setIndex)}
                    onEditRest={() =>
                      setRestEditor({
                        exerciseIndex,
                        setIndex,
                        value: set.actualRestSeconds ?? 0,
                      })
                    }
                  />
                ))}
                <Button
                  title="Add set"
                  compact
                  variant="secondary"
                  onPress={() => {
                    const set: CompletedSet = {
                      ...createPrescription(exercise.sets.length),
                      restSeconds: 90,
                      status: 'planned',
                      startedAt: null,
                      actualReps: null,
                      actualWeightGrams: null,
                      actualRpeTenths: null,
                      sideResults: null,
                      actualRestSeconds: null,
                      completedAt: null,
                    }
                    void persist({
                      ...draft,
                      exercises: draft.exercises.map((item, index) =>
                        index === exerciseIndex ? { ...item, sets: [...item.sets, set] } : item,
                      ),
                    })
                  }}
                />
              </View>
            ) : null}
          </Card>
        )
      })}

      <Button title="Finish workout" onPress={() => void finish()} />
      <Button
        title="Discard workout"
        variant="danger"
        onPress={() =>
          Alert.alert('Discard workout?', 'This removes the local session and syncs a tombstone.', [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Discard',
              style: 'destructive',
              onPress: () => {
                void cancelRestTimer(rest?.notificationId ?? null)
                void data.remove(draft).then(() => router.replace('/(tabs)/workouts'))
              },
            },
          ])
        }
      />
      <RestEditorModal
        target={restEditor}
        onClose={() => setRestEditor(null)}
        onSave={(seconds) => {
          if (restEditor !== null) {
            saveSet(restEditor.exerciseIndex, restEditor.setIndex, { actualRestSeconds: seconds })
          }
          setRestEditor(null)
        }}
      />
    </Screen>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  grow: { flex: 1, minWidth: 0 },
  pressed: { opacity: 0.72 },
  workoutName: { fontSize: 21, fontWeight: '800' },
  timer: { fontSize: 36, fontWeight: '900', fontVariant: ['tabular-nums'] },
  restTitle: { fontSize: 25, fontWeight: '900', fontVariant: ['tabular-nums'] },
  exerciseCard: { padding: 0, gap: 0, overflow: 'hidden' },
  accordionHeader: {
    minHeight: 66,
    paddingHorizontal: 15,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  exerciseName: { flexShrink: 1, fontSize: 18, fontWeight: '800' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  chevron: { fontSize: 24, fontWeight: '900' },
  body: { padding: 12, paddingTop: 10, gap: 10, borderTopWidth: 1 },
  note: { flex: 1, fontSize: 11, lineHeight: 15 },
})
