import {
  BUILT_IN_EXERCISES,
  calculateActiveSeconds,
  type Exercise,
  type ExerciseVisibility,
  formatDuration,
  MUSCLE_GROUPS,
} from '@track-me/contracts'
import { randomUUID } from 'expo-crypto'
import { router } from 'expo-router'
import { useMemo, useState } from 'react'
import { Alert, StyleSheet, View } from 'react-native'
import { ChipRow, ChoiceChip, SectionTitle, SegmentedControl } from '@/components/controls'
import { AppText, Button, Card, EmptyState, Field, Heading, Screen } from '@/components/ui'
import { createWorkoutTemplate, startWorkout } from '@/lib/factories'
import { getDeviceId, useData } from '@/providers/data-provider'
import { useAppTheme } from '@/theme/use-theme'

type Mode = 'plans' | 'history' | 'exercises'

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
  const active = data.workouts.find((workout) => workout.status === 'active') ?? null
  const history = data.workouts.filter((workout) => workout.status === 'completed')
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

  const beginPlan = async (templateId: string) => {
    if (active !== null) {
      Alert.alert('Workout already active', 'Resume or finish your active workout before starting another.')
      return
    }
    const template = data.templates.find((item) => item.id === templateId)
    if (template === undefined) return
    const workout = startWorkout(await getDeviceId(), data.exercises, template)
    await data.save(workout)
    router.push({ pathname: '/workout/[id]', params: { id: workout.id } })
  }

  return (
    <Screen>
      <Heading subtitle="Plans are reusable. Each workout keeps its own snapshot.">Workouts</Heading>
      <SegmentedControl
        value={mode}
        onChange={setMode}
        options={[
          { label: 'Plans', value: 'plans' },
          { label: 'History', value: 'history' },
          { label: 'Exercises', value: 'exercises' },
        ]}
      />

      {active !== null ? (
        <Card style={{ borderColor: colors.primary }}>
          <SectionTitle>Active now</SectionTitle>
          <AppText style={styles.itemTitle}>{active.name}</AppText>
          <AppText style={{ color: colors.textMuted }}>
            {formatDuration(calculateActiveSeconds(active.timerSegments))} elapsed
          </AppText>
          <Button
            title="Resume"
            onPress={() => router.push({ pathname: '/workout/[id]', params: { id: active.id } })}
          />
        </Card>
      ) : null}

      {mode === 'plans' ? (
        <>
          <SectionTitle action={<Button title="New plan" compact onPress={() => void createPlan()} />}>
            Workout plans
          </SectionTitle>
          {data.templates.length === 0 ? (
            <EmptyState
              title="No plans yet"
              message="Create a plan with ordered exercises and a prescription for every set."
              action={<Button title="Create first plan" onPress={() => void createPlan()} />}
            />
          ) : (
            data.templates.map((template) => (
              <Card key={template.id}>
                <AppText style={styles.itemTitle}>{template.name}</AppText>
                <AppText style={{ color: colors.textMuted }}>
                  {template.exercises.length} exercises ·{' '}
                  {template.exercises.reduce((total, exercise) => total + exercise.sets.length, 0)} sets
                </AppText>
                <View style={styles.row}>
                  <View style={styles.grow}>
                    <Button title="Start" onPress={() => void beginPlan(template.id)} />
                  </View>
                  <Button
                    title="Edit"
                    variant="secondary"
                    onPress={() => router.push({ pathname: '/template/[id]', params: { id: template.id } })}
                  />
                </View>
              </Card>
            ))
          )}
        </>
      ) : null}

      {mode === 'history' ? (
        <>
          <SectionTitle>Completed workouts</SectionTitle>
          {history.length === 0 ? (
            <EmptyState
              title="Nothing here yet"
              message="Completed workouts are editable and can be recovered from sync conflicts."
            />
          ) : (
            history.map((workout) => (
              <Card key={workout.id}>
                <View style={styles.row}>
                  <View style={styles.grow}>
                    <AppText style={styles.itemTitle}>{workout.name}</AppText>
                    <AppText style={{ color: colors.textMuted }}>
                      {new Date(workout.completedAt ?? workout.startedAt).toLocaleString()} ·{' '}
                      {workout.exercises.length} exercises
                    </AppText>
                  </View>
                  <Button
                    title="Open"
                    compact
                    variant="secondary"
                    onPress={() => router.push({ pathname: '/history/[id]', params: { id: workout.id } })}
                  />
                </View>
              </Card>
            ))
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
            <Card>
              <AppText style={styles.itemTitle}>
                {editing === null ? 'Create exercise' : 'Edit exercise'}
              </AppText>
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
                title="Save exercise"
                disabled={name.trim().length < 2}
                onPress={() => void saveExercise()}
              />
              <Button title="Cancel" variant="ghost" onPress={() => setShowForm(false)} />
            </Card>
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
            <Card key={exercise.id}>
              <View style={styles.row}>
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
})
