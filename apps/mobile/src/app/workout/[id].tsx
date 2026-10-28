import {
  type CompletedSet,
  calculateActiveSeconds,
  formatDuration,
  getMuscleName,
  type WorkoutSession,
} from '@track-me/contracts'
import { randomUUID } from 'expo-crypto'
import { router, Stack, useLocalSearchParams } from 'expo-router'
import { useEffect, useMemo, useState } from 'react'
import { Alert, Modal, Pressable, StyleSheet, View } from 'react-native'
import { ProgressBar } from '@/components/controls'
import { AppIcon, IconButton } from '@/components/design'
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

  const completedSetCount = draft.exercises.reduce(
    (total, exercise) => total + exercise.sets.filter((set) => set.status === 'completed').length,
    0,
  )
  const totalSetCount = draft.exercises.reduce((total, exercise) => total + exercise.sets.length, 0)

  const discard = () =>
    Alert.alert('Discard workout?', 'This removes the session from your devices after synchronization.', [
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

  return (
    <Screen safeTop contentStyle={styles.screen}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.subtop, { borderBottomColor: colors.border }]}>
        <IconButton icon="chevron-left" label="Back to training" onPress={() => router.back()} />
        <View style={styles.headerTitle}>
          <AppText style={[styles.eyebrow, { color: colors.textMuted }]}>ACTIVE WORKOUT</AppText>
          <AppText numberOfLines={1} style={styles.workoutName}>
            {draft.name}
          </AppText>
        </View>
        <Pressable accessibilityRole="button" onPress={discard} style={styles.headerAction}>
          <AppText style={{ color: colors.danger }}>Discard</AppText>
        </Pressable>
      </View>
      <View style={styles.clock}>
        <View style={styles.row}>
          <View style={styles.grow}>
            <AppText style={[styles.timer, { color: paused ? colors.warning : colors.text }]}>
              {formatDuration(calculateActiveSeconds(draft.timerSegments))}
            </AppText>
            <AppText style={[styles.eyebrow, { color: colors.textMuted }]}>
              {paused ? 'PAUSED' : 'ACTIVE TIME'}
            </AppText>
          </View>
          <Button
            title={paused ? 'Resume' : 'Pause'}
            icon={paused ? 'play' : 'pause'}
            compact
            variant="outline"
            onPress={() => void togglePause()}
          />
        </View>
      </View>

      {rest !== null ? (
        <Card
          style={[
            styles.restCard,
            {
              backgroundColor: colors.surfaceRaised,
              borderLeftColor: remaining === 0 ? colors.primary : colors.warning,
            },
          ]}
        >
          <View style={styles.row}>
            <AppIcon name="timer-sand" color={remaining === 0 ? colors.primary : colors.warning} />
            <View style={styles.grow}>
              <AppText style={[styles.eyebrow, { color: colors.textMuted }]}>
                {remaining === 0 ? 'REST COMPLETE' : 'RESTING BETWEEN SETS'}
              </AppText>
              <AppText style={[styles.restTitle, { color: colors.primary }]}>
                {formatDuration(remaining === 0 ? elapsed : remaining)}
              </AppText>
            </View>
            {remaining === 0 ? <Button title="OK" compact onPress={() => void acknowledgeRest()} /> : null}
          </View>
        </Card>
      ) : null}

      <View style={styles.progress}>
        <View style={styles.progressLabel}>
          <AppText style={{ color: colors.textMuted }}>
            {completedSetCount} of {totalSetCount} sets
          </AppText>
          <AppText style={{ color: colors.primary }}>
            {totalSetCount === 0 ? 0 : Math.round((completedSetCount / totalSetCount) * 100)}%
          </AppText>
        </View>
        <ProgressBar value={completedSetCount} max={totalSetCount} />
      </View>
      <Modal visible={addingExercise} animationType="slide" onRequestClose={() => setAddingExercise(false)}>
        <Screen safeTop>
          <View style={styles.row}>
            <AppText style={[styles.exerciseName, styles.grow]}>Add exercise</AppText>
            <IconButton
              icon="close"
              label="Close exercise library"
              onPress={() => setAddingExercise(false)}
            />
          </View>
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
        </Screen>
      </Modal>
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
            <View style={styles.headerRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded }}
                onPress={() => setExpandedId(expanded ? null : exercise.id)}
                style={({ pressed }) => [styles.accordionHeader, pressed && styles.pressed]}
              >
                <AppText style={[styles.exerciseNumber, { color: colors.primary }]}>
                  {String(exerciseIndex + 1).padStart(2, '0')}
                </AppText>
                <View style={styles.grow}>
                  <View style={styles.titleRow}>
                    {active ? <View style={[styles.dot, { backgroundColor: colors.primary }]} /> : null}
                    <AppText style={styles.exerciseName}>{exercise.exerciseName}</AppText>
                  </View>
                  <AppText
                    style={[styles.exerciseMeta, { color: active ? colors.primary : colors.textMuted }]}
                  >
                    {completed} / {exercise.sets.length} sets ·{' '}
                    {exercise.trackingMode === 'unilateral'
                      ? 'Left / right'
                      : getMuscleName(exercise.primaryMuscleId)}
                    {active ? ' · Active' : ''}
                  </AppText>
                </View>
                <AppIcon name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
              </Pressable>
              <IconButton
                icon="dots-vertical"
                label={`Options for ${exercise.exerciseName}`}
                onPress={() =>
                  Alert.alert(exercise.exerciseName, 'Exercise options', [
                    {
                      text: 'Exercise details',
                      onPress: () =>
                        router.push({ pathname: '/exercise/[id]', params: { id: exercise.exerciseId } }),
                    },
                    {
                      text: 'Remove exercise',
                      style: 'destructive',
                      onPress: () => removeExercise(exerciseIndex),
                    },
                    { text: 'Cancel', style: 'cancel' },
                  ])
                }
              />
            </View>

            {expanded ? (
              <View style={[styles.body, { borderTopColor: colors.border }]}>
                {exercise.sets.length > 0 ? (
                  <WorkoutSetColumns unilateral={exercise.trackingMode === 'unilateral'} unit={unit} />
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
                  icon="plus"
                  compact
                  variant="dashed"
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

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add exercise"
        onPress={() => setAddingExercise(true)}
        style={[styles.addExercise, { borderColor: colors.border }]}
      >
        <AppIcon name="plus" color={colors.primary} />
        <View>
          <AppText style={{ color: colors.primary }}>Add exercise</AppText>
          <AppText style={[styles.exerciseMeta, { color: colors.textMuted }]}>
            Search the full library
          </AppText>
        </View>
      </Pressable>
      <View style={styles.finish}>
        <Button title="Finish workout" icon="flag-outline" onPress={() => void finish()} />
      </View>
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
  screen: { padding: 12, paddingTop: 0, gap: 8 },
  subtop: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginHorizontal: -12,
    paddingHorizontal: 8,
  },
  headerTitle: { flex: 1, minWidth: 0, alignItems: 'center', gap: 2 },
  headerAction: { minWidth: 64, minHeight: 44, justifyContent: 'center', alignItems: 'center' },
  eyebrow: { fontSize: 10, letterSpacing: 0.7 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  grow: { flex: 1, minWidth: 0 },
  pressed: { opacity: 0.72 },
  workoutName: { fontSize: 15, fontWeight: '600' },
  timer: { fontSize: 24, fontWeight: '600', fontVariant: ['tabular-nums'] },
  restTitle: { fontSize: 20, fontWeight: '600', fontVariant: ['tabular-nums'] },
  clock: { paddingHorizontal: 6, paddingVertical: 8 },
  restCard: { borderLeftWidth: 3, padding: 12, borderRadius: 12 },
  progress: { gap: 7, paddingHorizontal: 2, paddingBottom: 8 },
  progressLabel: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  exerciseCard: { padding: 0, gap: 0, overflow: 'hidden' },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  accordionHeader: {
    flex: 1,
    minWidth: 0,
    minHeight: 60,
    paddingLeft: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  exerciseName: { flexShrink: 1, fontSize: 14, fontWeight: '600' },
  exerciseNumber: { width: 26, fontSize: 13, fontWeight: '600' },
  exerciseMeta: { fontSize: 11, marginTop: 2 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  body: { padding: 10, gap: 6, borderTopWidth: 1 },
  addExercise: {
    minHeight: 56,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    marginTop: 4,
  },
  finish: { marginTop: 4 },
})
