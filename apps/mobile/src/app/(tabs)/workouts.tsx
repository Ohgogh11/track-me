import {
  BUILT_IN_EXERCISES,
  calculateActiveSeconds,
  detectPersonalRecords,
  type Exercise,
  type ExerciseVisibility,
  formatDuration,
  isEligibleWorkSet,
  MUSCLE_GROUPS,
  setVolumeKg,
  type WorkoutSession,
} from '@track-me/contracts'
import { randomUUID } from 'expo-crypto'
import { router } from 'expo-router'
import { useMemo, useState } from 'react'
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'
import { ChipRow, ChoiceChip, SectionTitle, SegmentedControl } from '@/components/controls'
import { AppIcon, IconButton, PageTitle, SectionHeader } from '@/components/design'
import { AppText, Button, Card, EmptyState, Field, Screen } from '@/components/ui'
import { createWorkoutTemplate, startWorkout } from '@/lib/factories'
import { getDeviceId, useData } from '@/providers/data-provider'
import { useAppTheme } from '@/theme/use-theme'

type Mode = 'plans' | 'history' | 'exercises'

function workoutSetStats(workout: WorkoutSession): { workSets: number; volumeKg: number } {
  const sets = workout.exercises.flatMap((exercise) => exercise.sets.filter(isEligibleWorkSet))
  return {
    workSets: sets.length,
    volumeKg: sets.reduce((total, set) => total + setVolumeKg(set), 0),
  }
}

export default function WorkoutsScreen() {
  const data = useData()
  const { colors } = useAppTheme()
  const [mode, setMode] = useState<Mode>('plans')
  const [editing, setEditing] = useState<Exercise | null>(null)
  const [name, setName] = useState('')
  const [primary, setPrimary] = useState('chest')
  const [secondary, setSecondary] = useState<string[]>([])
  const [loadType, setLoadType] = useState<'external' | 'bodyweight'>('external')
  const [trackingMode, setTrackingMode] = useState<'bilateral' | 'unilateral'>('bilateral')
  const [showForm, setShowForm] = useState(false)
  const [exerciseSearch, setExerciseSearch] = useState('')
  const [primaryFilter, setPrimaryFilter] = useState<string | null>(null)
  const [secondaryFilter, setSecondaryFilter] = useState<string | null>(null)
  const [visibleExercises, setVisibleExercises] = useState(50)
  const [showFilters, setShowFilters] = useState(false)
  const active = data.workouts.find((workout) => workout.status === 'active') ?? null
  const history = useMemo(
    () =>
      data.workouts
        .filter((workout) => workout.status === 'completed')
        .slice()
        .sort(
          (left, right) =>
            Date.parse(right.completedAt ?? right.startedAt) -
            Date.parse(left.completedAt ?? left.startedAt),
        ),
    [data.workouts],
  )
  const recordsByWorkout = useMemo(() => {
    const counts = new Map<string, number>()
    for (const record of detectPersonalRecords(data.workouts)) {
      counts.set(record.workoutId, (counts.get(record.workoutId) ?? 0) + 1)
    }
    return counts
  }, [data.workouts])
  const historyActiveSeconds = history.reduce(
    (total, workout) =>
      total +
      calculateActiveSeconds(
        workout.timerSegments,
        new Date(workout.completedAt ?? workout.startedAt),
      ),
    0,
  )
  const historyRecordCount = [...recordsByWorkout.values()].reduce((total, count) => total + count, 0)
  const hiddenBuiltIns = useMemo(() => {
    const hidden = new Set(
      data.exerciseVisibilities.filter((item) => item.hidden).map((item) => item.exerciseId),
    )
    return BUILT_IN_EXERCISES.filter((exercise) => hidden.has(exercise.id))
  }, [data.exerciseVisibilities])
  const filteredExercises = useMemo(() => {
    const query = exerciseSearch.trim().toLocaleLowerCase()
    return data.exercises.filter(
      (exercise) =>
        (query.length === 0 ||
          exercise.name.toLocaleLowerCase().includes(query) ||
          exercise.equipment?.toLocaleLowerCase().includes(query)) &&
        (primaryFilter === null || exercise.primaryMuscleId === primaryFilter) &&
        (secondaryFilter === null || exercise.secondaryMuscleIds.includes(secondaryFilter)),
    )
  }, [data.exercises, exerciseSearch, primaryFilter, secondaryFilter])

  const openExerciseForm = (exercise: Exercise | null) => {
    setEditing(exercise)
    setName(exercise?.name ?? '')
    setPrimary(exercise?.primaryMuscleId ?? 'chest')
    setSecondary(exercise?.secondaryMuscleIds ?? [])
    setLoadType(exercise?.loadType ?? 'external')
    setTrackingMode(exercise?.trackingMode ?? 'bilateral')
    setShowForm(true)
  }

  const saveExercise = async () => {
    if (name.trim().length < 2) return
    const now = new Date().toISOString()
    const exercise: Exercise = {
      id: editing?.id ?? randomUUID(),
      kind: 'exercise',
      version: editing?.version ?? 0,
      updatedAt: now,
      deletedAt: null,
      name: name.trim(),
      primaryMuscleId: primary,
      secondaryMuscleIds: secondary.filter((id) => id !== primary),
      loadType,
      trackingMode,
      equipment: editing?.equipment ?? null,
      category: editing?.category ?? null,
      difficulty: editing?.difficulty ?? null,
      instructions: editing?.instructions ?? [],
      imageUrls: editing?.imageUrls ?? [],
      builtIn: false,
      archivedAt: null,
    }
    await data.save(exercise)
    setShowForm(false)
    setEditing(null)
  }

  const setHidden = async (exerciseId: string, hidden: boolean) => {
    const existing = data.exerciseVisibilities.find((item) => item.exerciseId === exerciseId)
    const now = new Date().toISOString()
    const visibility: ExerciseVisibility = {
      id: existing?.id ?? randomUUID(),
      kind: 'exercise_visibility',
      version: existing?.version ?? 0,
      updatedAt: now,
      deletedAt: null,
      exerciseId,
      hidden,
    }
    await data.save(visibility)
  }

  const createPlan = async () => {
    const plan = createWorkoutTemplate()
    await data.save(plan)
    router.push({ pathname: '/template/[id]', params: { id: plan.id } })
  }

  const beginPlan = async (templateId: string | null) => {
    if (active !== null) {
      Alert.alert('Workout already active', 'Resume or finish your active workout before starting another.')
      return
    }
    const template = templateId === null ? null : data.templates.find((item) => item.id === templateId)
    if (template === undefined) return
    const workout = startWorkout(await getDeviceId(), data.exercises, template)
    await data.save(workout)
    router.push({ pathname: '/workout/[id]', params: { id: workout.id } })
  }

  return (
    <Screen safeBottom={false}>
      <PageTitle
        eyebrow="Training"
        title="Build. Lift. Repeat."
        accessory={
          <IconButton icon="plus" label="Create workout plan" selected onPress={() => void createPlan()} />
        }
      />
      <SegmentedControl
        value={mode}
        onChange={setMode}
        options={[
          { label: 'Plans', value: 'plans' },
          { label: 'History', value: 'history' },
          { label: 'Exercises', value: 'exercises' },
        ]}
      />

      {active !== null && mode === 'plans' ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/workout/[id]', params: { id: active.id } })}
          style={({ pressed }) => [
            styles.resume,
            { backgroundColor: colors.surfaceRaised, borderLeftColor: colors.primary },
            pressed && styles.pressed,
          ]}
        >
          <AppIcon name="timer-outline" color={colors.primary} />
          <View style={styles.grow}>
            <AppText style={styles.eyebrow}>ACTIVE WORKOUT</AppText>
            <AppText style={styles.resumeName}>
              {active.name} · {formatDuration(calculateActiveSeconds(active.timerSegments))}
            </AppText>
          </View>
          <AppText style={[styles.resumeAction, { color: colors.primary }]}>Resume</AppText>
        </Pressable>
      ) : null}

      {mode === 'plans' ? (
        <>
          <SectionHeader
            title="Your plans"
            action={<AppText style={{ color: colors.textMuted }}>{data.templates.length} plans</AppText>}
          />
          {data.templates.length === 0 ? (
            <EmptyState
              title="No plans yet"
              message="Create a plan with ordered exercises and a prescription for every set."
              action={<Button title="Create first plan" onPress={() => void createPlan()} />}
            />
          ) : (
            data.templates.map((template) => {
              const setCount = template.exercises.reduce((total, exercise) => total + exercise.sets.length, 0)
              return (
                <Card
                  key={template.id}
                  style={[styles.planCard, { borderLeftColor: colors.primary }]}
                >
                  <AppText style={[styles.eyebrow, { color: colors.primary }]}>
                    WORKOUT PLAN
                  </AppText>
                  <AppText style={styles.planTitle}>{template.name}</AppText>
                  <AppText style={{ color: colors.textMuted }}>
                    {template.notes || 'A reusable workout snapshot'}
                  </AppText>
                  <View style={styles.planStats}>
                    <View>
                      <AppText style={styles.planStatValue}>{template.exercises.length}</AppText>
                      <AppText style={styles.planStatLabel}>exercises</AppText>
                    </View>
                    <View>
                      <AppText style={styles.planStatValue}>{setCount}</AppText>
                      <AppText style={styles.planStatLabel}>sets</AppText>
                    </View>
                  </View>
                  <View style={styles.row}>
                    <View style={styles.grow}>
                      <Button icon="play" title="Start" onPress={() => void beginPlan(template.id)} />
                    </View>
                    <Button
                      title="Edit plan"
                      variant="outline"
                      onPress={() => router.push({ pathname: '/template/[id]', params: { id: template.id } })}
                    />
                  </View>
                </Card>
              )
            })
          )}
          <Pressable
            accessibilityRole="button"
            onPress={() => void beginPlan(null)}
            style={({ pressed }) => [
              styles.dashedAction,
              { borderColor: colors.border },
              pressed && styles.pressed,
            ]}
          >
            <AppIcon name="plus" color={colors.primary} />
            <View>
              <AppText style={styles.actionTitle}>Start empty workout</AppText>
              <AppText style={{ color: colors.textMuted }}>Build it as you train</AppText>
            </View>
          </Pressable>
        </>
      ) : null}

      {mode === 'history' ? (
        <>
          <View style={[styles.historySummary, { backgroundColor: colors.surface }]}>
            <View style={[styles.summaryCell, { borderRightColor: colors.border }]}>
              <AppText style={styles.summaryValue}>{history.length}</AppText>
              <AppText style={styles.summaryLabel}>WORKOUTS</AppText>
            </View>
            <View style={[styles.summaryCell, { borderRightColor: colors.border }]}>
              <AppText numberOfLines={1} adjustsFontSizeToFit style={styles.summaryValue}>
                {formatDuration(historyActiveSeconds)}
              </AppText>
              <AppText style={styles.summaryLabel}>TRAINING</AppText>
            </View>
            <View style={styles.summaryCell}>
              <AppText style={styles.summaryValue}>{historyRecordCount}</AppText>
              <AppText style={styles.summaryLabel}>PRs</AppText>
            </View>
          </View>
          <SectionHeader title="Completed workouts" />
          {history.length === 0 ? (
            <EmptyState
              title="Nothing here yet"
              message="Completed workouts are editable and can be recovered from sync conflicts."
            />
          ) : (
            history.map((workout) => {
              const stats = workoutSetStats(workout)
              const prCount = recordsByWorkout.get(workout.id) ?? 0
              const duration = calculateActiveSeconds(
                workout.timerSegments,
                new Date(workout.completedAt ?? workout.startedAt),
              )
              return (
                <Pressable
                key={workout.id}
                accessibilityRole="button"
                onPress={() => router.push({ pathname: '/history/[id]', params: { id: workout.id } })}
                style={({ pressed }) => [
                  styles.historyRow,
                  { borderBottomColor: colors.border },
                  pressed && styles.pressed,
                ]}
              >
                <View style={styles.dateTile}>
                  <AppText style={[styles.dateDay, { color: colors.primary }]}>
                    {new Date(workout.completedAt ?? workout.startedAt).getDate()}
                  </AppText>
                  <AppText style={styles.dateMonth}>
                    {new Date(workout.completedAt ?? workout.startedAt)
                      .toLocaleDateString(undefined, { month: 'short' })
                      .toUpperCase()}
                  </AppText>
                </View>
                <View style={styles.grow}>
                  <AppText style={styles.itemTitle}>{workout.name}</AppText>
                  <AppText numberOfLines={1} style={{ color: colors.textMuted }}>
                    {[
                      formatDuration(duration),
                      `${stats.workSets} work sets`,
                      stats.volumeKg > 0 ? `${Math.round(stats.volumeKg).toLocaleString()} kg` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </AppText>
                </View>
                {prCount > 0 ? (
                  <AppText style={[styles.prBadge, { color: colors.primary }]}>
                    {prCount} PR
                  </AppText>
                ) : null}
                <AppIcon name="chevron-right" color={colors.textMuted} />
              </Pressable>
              )
            })
          )}
        </>
      ) : null}

      {mode === 'exercises' ? (
        <>
          <SectionTitle
            action={<Button title="New exercise" compact onPress={() => openExerciseForm(null)} />}
          >
            Exercise catalog
          </SectionTitle>
          {showForm ? (
            <Modal
              visible
              animationType="slide"
              presentationStyle="pageSheet"
              onRequestClose={() => setShowForm(false)}
            >
              <SafeAreaProvider>
                <SafeAreaView
                  edges={['top', 'right', 'bottom', 'left']}
                  style={[styles.modalSafe, { backgroundColor: colors.background }]}
                >
                  <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                    style={styles.modalSafe}
                  >
                    <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
                      <View style={styles.grow}>
                        <AppText style={[styles.eyebrow, { color: colors.primary }]}>
                          PERSONAL EXERCISE
                        </AppText>
                        <AppText style={styles.modalTitle}>
                          {editing === null ? 'Create exercise' : 'Edit exercise'}
                        </AppText>
                      </View>
                      <Button title="Close" compact variant="ghost" onPress={() => setShowForm(false)} />
                    </View>
                    <ScrollView
                      automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
                      contentContainerStyle={styles.modalContent}
                      keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
                      keyboardShouldPersistTaps="handled"
                    >
              <Field label="Name" value={name} onChangeText={setName} placeholder="Cable fly" />
              <AppText style={styles.label}>Primary muscle</AppText>
              <ChipRow>
                {MUSCLE_GROUPS.map((muscle) => (
                  <ChoiceChip
                    key={muscle.id}
                    label={muscle.name}
                    selected={primary === muscle.id}
                    onPress={() => {
                      setPrimary(muscle.id)
                      setSecondary((items) => items.filter((id) => id !== muscle.id))
                    }}
                  />
                ))}
              </ChipRow>
              <AppText style={styles.label}>Secondary muscles (optional)</AppText>
              <ChipRow>
                {MUSCLE_GROUPS.filter((muscle) => muscle.id !== primary).map((muscle) => (
                  <ChoiceChip
                    key={muscle.id}
                    label={muscle.name}
                    selected={secondary.includes(muscle.id)}
                    onPress={() =>
                      setSecondary((items) =>
                        items.includes(muscle.id)
                          ? items.filter((id) => id !== muscle.id)
                          : [...items, muscle.id],
                      )
                    }
                  />
                ))}
              </ChipRow>
              <View style={styles.row}>
                <ChoiceChip
                  label="External load"
                  selected={loadType === 'external'}
                  onPress={() => setLoadType('external')}
                />
                <ChoiceChip
                  label="Bodyweight"
                  selected={loadType === 'bodyweight'}
                  onPress={() => setLoadType('bodyweight')}
                />
              </View>
              <AppText style={styles.label}>Tracking</AppText>
              <View style={styles.row}>
                <ChoiceChip
                  label="Together"
                  selected={trackingMode === 'bilateral'}
                  onPress={() => setTrackingMode('bilateral')}
                />
                <ChoiceChip
                  label="Left and right separately"
                  selected={trackingMode === 'unilateral'}
                  onPress={() => setTrackingMode('unilateral')}
                />
              </View>
              <Button
                icon="content-save-outline"
                title="Save exercise"
                disabled={name.trim().length < 2}
                onPress={() => void saveExercise()}
              />
              <Button title="Cancel" variant="ghost" onPress={() => setShowForm(false)} />
                    </ScrollView>
                  </KeyboardAvoidingView>
                </SafeAreaView>
              </SafeAreaProvider>
            </Modal>
          ) : null}
          <Card>
            <Field
              label="Search exercises"
              value={exerciseSearch}
              onChangeText={(value) => {
                setExerciseSearch(value)
                setVisibleExercises(50)
              }}
              placeholder="Name or equipment"
            />
            <AppText style={styles.label}>Primary muscle</AppText>
            <ChipRow>
              <ChoiceChip
                label="All"
                selected={primaryFilter === null}
                onPress={() => {
                  setPrimaryFilter(null)
                  setVisibleExercises(50)
                }}
              />
              {MUSCLE_GROUPS.map((muscle) => (
                <ChoiceChip
                  key={muscle.id}
                  label={muscle.name}
                  selected={primaryFilter === muscle.id}
                  onPress={() => {
                    setPrimaryFilter(muscle.id)
                    setVisibleExercises(50)
                  }}
                />
              ))}
            </ChipRow>
            <AppText style={styles.label}>Secondary muscle</AppText>
            <ChipRow>
              <ChoiceChip
                label="All"
                selected={secondaryFilter === null}
                onPress={() => {
                  setSecondaryFilter(null)
                  setVisibleExercises(50)
                }}
              />
              {MUSCLE_GROUPS.map((muscle) => (
                <ChoiceChip
                  key={muscle.id}
                  label={muscle.name}
                  selected={secondaryFilter === muscle.id}
                  onPress={() => {
                    setSecondaryFilter(muscle.id)
                    setVisibleExercises(50)
                  }}
                />
              ))}
            </ChipRow>
            <AppText style={{ color: colors.textMuted }}>
              {filteredExercises.length} exercise{filteredExercises.length === 1 ? '' : 's'}
            </AppText>
          </Card>
          {filteredExercises.slice(0, visibleExercises).map((exercise) => (
            <Card key={exercise.id} style={styles.exerciseRow}>
              <View style={styles.row}>
                <View style={[styles.exerciseIcon, { backgroundColor: colors.surfaceRaised }]}>
                  <AppIcon
                    name={exercise.trackingMode === 'unilateral' ? 'human-handsup' : 'dumbbell'}
                    color={colors.primary}
                  />
                </View>
                <View style={styles.grow}>
                  <AppText style={styles.itemTitle}>{exercise.name}</AppText>
                  <AppText style={{ color: colors.textMuted }}>
                    {MUSCLE_GROUPS.find((muscle) => muscle.id === exercise.primaryMuscleId)?.name ??
                      exercise.primaryMuscleId}{' '}
                    · {exercise.loadType === 'external' ? 'weighted' : 'bodyweight'}
                    {exercise.trackingMode === 'unilateral' ? ' · left/right' : ''}
                  </AppText>
                </View>
                <Button
                  title="Details"
                  compact
                  variant="secondary"
                  onPress={() => router.push({ pathname: '/exercise/[id]', params: { id: exercise.id } })}
                />
                {exercise.builtIn ? (
                  <>
                    <Button
                      title="Copy"
                      compact
                      variant="ghost"
                      onPress={() =>
                        openExerciseForm({
                          ...exercise,
                          id: randomUUID(),
                          name: `${exercise.name} copy`,
                          builtIn: false,
                          version: 0,
                        })
                      }
                    />
                    <Button
                      title="Hide"
                      compact
                      variant="ghost"
                      onPress={() => void setHidden(exercise.id, true)}
                    />
                  </>
                ) : (
                  <>
                    <Button title="Edit" compact variant="ghost" onPress={() => openExerciseForm(exercise)} />
                    <Button
                      title="Archive"
                      compact
                      variant="ghost"
                      onPress={() => void data.save({ ...exercise, archivedAt: new Date().toISOString() })}
                    />
                  </>
                )}
              </View>
            </Card>
          ))}
          {visibleExercises < filteredExercises.length ? (
            <Button
              title={`Show more (${filteredExercises.length - visibleExercises} remaining)`}
              variant="secondary"
              onPress={() => setVisibleExercises((count) => count + 50)}
            />
          ) : null}
          {hiddenBuiltIns.length > 0 ? (
            <Card>
              <SectionTitle>Hidden built-ins</SectionTitle>
              {hiddenBuiltIns.map((exercise) => (
                <View key={exercise.id} style={styles.row}>
                  <AppText style={styles.grow}>{exercise.name}</AppText>
                  <Button
                    title="Restore"
                    compact
                    variant="secondary"
                    onPress={() => void setHidden(exercise.id, false)}
                  />
                </View>
              ))}
            </Card>
          ) : null}
          {data.customExercises.filter((exercise) => exercise.archivedAt !== null).length > 0 ? (
            <Card>
              <SectionTitle>Archived personal exercises</SectionTitle>
              {data.customExercises
                .filter((exercise) => exercise.archivedAt !== null)
                .map((exercise) => (
                  <View key={exercise.id} style={styles.row}>
                    <AppText style={styles.grow}>{exercise.name}</AppText>
                    <Button
                      title="Restore"
                      compact
                      variant="secondary"
                      onPress={() => void data.save({ ...exercise, archivedAt: null })}
                    />
                  </View>
                ))}
            </Card>
          ) : null}
        </>
      ) : null}
    </Screen>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  grow: { flex: 1, minWidth: 120 },
  itemTitle: { fontSize: 18, fontWeight: '800' },
  label: { fontSize: 14, fontWeight: '700' },
  pressed: { opacity: 0.72 },
  resume: {
    minHeight: 62,
    borderLeftWidth: 3,
    borderRadius: 13,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  eyebrow: { fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  resumeName: { fontWeight: '800' },
  resumeAction: { fontWeight: '800' },
  planCard: { borderLeftWidth: 3 },
  planTitle: { fontSize: 22, fontWeight: '900', letterSpacing: -0.4 },
  planStats: { flexDirection: 'row', gap: 28, marginTop: 2 },
  planStatValue: { fontSize: 18, fontWeight: '900' },
  planStatLabel: { fontSize: 11, color: '#9AB5A3' },
  dashedAction: {
    minHeight: 58,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  actionTitle: { fontWeight: '800' },
  historySummary: {
    flexDirection: 'row',
    borderRadius: 14,
    paddingVertical: 13,
    justifyContent: 'space-around',
  },
  summaryValue: { fontSize: 20, fontWeight: '900', textAlign: 'center' },
  summaryLabel: { fontSize: 10, fontWeight: '800', color: '#9AB5A3', marginTop: 2 },
  historyRow: {
    minHeight: 70,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 8,
  },
  dateTile: { width: 48, height: 48, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  dateDay: { fontSize: 18, fontWeight: '900' },
  dateMonth: { fontSize: 9, fontWeight: '800', color: '#9AB5A3' },
  exerciseRow: { padding: 11 },
  exerciseIcon: { width: 40, height: 40, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
})
