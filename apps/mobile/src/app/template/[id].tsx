import type { SetPrescription, WorkoutTemplate } from '@track-me/contracts'
import { router, useLocalSearchParams } from 'expo-router'
import { useEffect, useMemo, useState } from 'react'
import { Alert, Pressable, StyleSheet, View } from 'react-native'
import { ChoiceChip, SectionTitle } from '@/components/controls'
import { AppText, Button, Card, EmptyState, Field, Screen } from '@/components/ui'
import { createPrescription, createTemplateExercise } from '@/lib/factories'
import { useData } from '@/providers/data-provider'
import { useAppTheme } from '@/theme/use-theme'

function numeric(text: string, fallback: number): number {
  const value = Number(text)
  return Number.isFinite(value) ? value : fallback
}

export default function TemplateEditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const data = useData()
  const { colors } = useAppTheme()
  const source = data.templates.find((item) => item.id === id) ?? null
  const [draft, setDraft] = useState<WorkoutTemplate | null>(null)
  const [addingExercise, setAddingExercise] = useState(false)
  const [exerciseSearch, setExerciseSearch] = useState('')
  const [expandedExerciseId, setExpandedExerciseId] = useState<string | null>(null)
  const pickerExercises = useMemo(() => {
    const query = exerciseSearch.trim().toLocaleLowerCase()
    return data.exercises
      .filter(
        (exercise) =>
          (query.length === 0 ||
            exercise.name.toLocaleLowerCase().includes(query) ||
            exercise.equipment?.toLocaleLowerCase().includes(query)) &&
          !draft?.exercises.some((item) => item.exerciseId === exercise.id),
      )
      .slice(0, 50)
  }, [data.exercises, draft?.exercises, exerciseSearch])

  useEffect(() => {
    if (source !== null && draft === null) {
      const next = JSON.parse(JSON.stringify(source)) as WorkoutTemplate
      setDraft(next)
      setExpandedExerciseId(next.exercises[0]?.id ?? null)
    }
  }, [draft, source])

  if (draft === null)
    return (
      <Screen>
        <EmptyState
          title="Plan not found"
          message="It may still be loading or was deleted on another device."
        />
      </Screen>
    )

  const updateSet = (exerciseIndex: number, setIndex: number, change: Partial<SetPrescription>) => {
    setDraft((current) => {
      if (current === null) return current
      const exercises = current.exercises.map((exercise, index) =>
        index === exerciseIndex
          ? {
              ...exercise,
              sets: exercise.sets.map((set, currentSetIndex) =>
                currentSetIndex === setIndex ? { ...set, ...change } : set,
              ),
            }
          : exercise,
      )
      return { ...current, exercises }
    })
  }

  const moveExercise = (index: number, direction: -1 | 1) => {
    const destination = index + direction
    if (destination < 0 || destination >= draft.exercises.length) return
    const exercises = [...draft.exercises]
    const selected = exercises[index]
    const other = exercises[destination]
    if (selected === undefined || other === undefined) return
    exercises[index] = other
    exercises[destination] = selected
    setDraft({ ...draft, exercises: exercises.map((exercise, order) => ({ ...exercise, order })) })
  }

  const moveSet = (exerciseIndex: number, setIndex: number, direction: -1 | 1) => {
    const exercise = draft.exercises[exerciseIndex]
    const destination = setIndex + direction
    if (exercise === undefined || destination < 0 || destination >= exercise.sets.length) return
    const sets = [...exercise.sets]
    const selected = sets[setIndex]
    const other = sets[destination]
    if (selected === undefined || other === undefined) return
    sets[setIndex] = other
    sets[destination] = selected
    setDraft({
      ...draft,
      exercises: draft.exercises.map((item, index) =>
        index === exerciseIndex ? { ...item, sets: sets.map((set, order) => ({ ...set, order })) } : item,
      ),
    })
  }

  const removeExercise = (exerciseIndex: number) => {
    const removed = draft.exercises[exerciseIndex]
    const exercises = draft.exercises
      .filter((_, index) => index !== exerciseIndex)
      .map((item, order) => ({ ...item, order }))
    setDraft({ ...draft, exercises })
    if (removed?.id === expandedExerciseId) {
      setExpandedExerciseId(exercises[exerciseIndex]?.id ?? exercises[exerciseIndex - 1]?.id ?? null)
    }
  }

  const save = async () => {
    if (draft.name.trim().length < 2) {
      Alert.alert('Add a name', 'Workout plan names need at least two characters.')
      return
    }
    await data.save({ ...draft, name: draft.name.trim(), updatedAt: new Date().toISOString() })
    router.back()
  }

  const confirmDelete = () =>
    Alert.alert('Delete workout plan?', 'Completed workouts will keep their historical snapshot.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => void data.remove(draft).then(() => router.back()),
      },
    ])

  return (
    <Screen>
      <Field label="Plan name" value={draft.name} onChangeText={(name) => setDraft({ ...draft, name })} />
      <Field
        label="Notes"
        multiline
        value={draft.notes}
        onChangeText={(notes) => setDraft({ ...draft, notes })}
        placeholder="Optional cues or focus"
      />
      <SectionTitle
        action={<Button title="Add exercise" compact onPress={() => setAddingExercise((value) => !value)} />}
      >
        Exercises
      </SectionTitle>
      {addingExercise ? (
        <Card>
          <AppText style={styles.title}>Choose an exercise</AppText>
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
                  const added = createTemplateExercise(exercise, draft.exercises.length)
                  setDraft({
                    ...draft,
                    exercises: [...draft.exercises, added],
                  })
                  setExpandedExerciseId(added.id)
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
        <EmptyState title="No exercises" message="Add an exercise, then adjust every set independently." />
      ) : null}
      {draft.exercises.map((exercise, exerciseIndex) => {
        const expanded = exercise.id === expandedExerciseId
        return (
          <Card key={exercise.id} style={styles.exerciseCard}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded }}
              onPress={() => setExpandedExerciseId(expanded ? null : exercise.id)}
              style={({ pressed }) => [styles.accordionHeader, pressed && styles.pressed]}
            >
              <View style={styles.grow}>
                <AppText style={styles.title}>
                  {exerciseIndex + 1}. {exercise.exerciseName}
                </AppText>
                <AppText style={{ color: colors.textMuted }}>
                  {exercise.sets.length} set{exercise.sets.length === 1 ? '' : 's'}
                  {exercise.trackingMode === 'unilateral' ? ' · left/right' : ''}
                </AppText>
              </View>
              <AppText style={[styles.chevron, { color: colors.primary }]}>{expanded ? '⌃' : '⌄'}</AppText>
            </Pressable>
            {expanded ? (
              <View style={[styles.exerciseBody, { borderTopColor: colors.border }]}>
                <View style={styles.row}>
                  <Button
                    title="Info"
                    compact
                    variant="ghost"
                    onPress={() =>
                      router.push({ pathname: '/exercise/[id]', params: { id: exercise.exerciseId } })
                    }
                  />
                  <Button
                    title="↑"
                    compact
                    variant="ghost"
                    disabled={exerciseIndex === 0}
                    onPress={() => moveExercise(exerciseIndex, -1)}
                  />
                  <Button
                    title="↓"
                    compact
                    variant="ghost"
                    disabled={exerciseIndex === draft.exercises.length - 1}
                    onPress={() => moveExercise(exerciseIndex, 1)}
                  />
                  <Button
                    title="Remove"
                    compact
                    variant="ghost"
                    onPress={() => removeExercise(exerciseIndex)}
                  />
                </View>
                <Field
                  label="Exercise notes"
                  value={exercise.notes}
                  onChangeText={(notes) =>
                    setDraft({
                      ...draft,
                      exercises: draft.exercises.map((item, index) =>
                        index === exerciseIndex ? { ...item, notes } : item,
                      ),
                    })
                  }
                  placeholder="Optional setup cues"
                />
                {exercise.sets.map((set, setIndex) => (
                  <View key={set.id} style={[styles.set, { borderColor: colors.border }]}>
                    <View style={styles.row}>
                      <AppText style={styles.setNumber}>Set {setIndex + 1}</AppText>
                      <ChoiceChip
                        label="Warm-up"
                        selected={set.type === 'warmup'}
                        onPress={() => updateSet(exerciseIndex, setIndex, { type: 'warmup' })}
                      />
                      <ChoiceChip
                        label="Work"
                        selected={set.type === 'work'}
                        onPress={() => updateSet(exerciseIndex, setIndex, { type: 'work' })}
                      />
                      <Button
                        title="↑"
                        compact
                        variant="ghost"
                        disabled={setIndex === 0}
                        onPress={() => moveSet(exerciseIndex, setIndex, -1)}
                      />
                      <Button
                        title="↓"
                        compact
                        variant="ghost"
                        disabled={setIndex === exercise.sets.length - 1}
                        onPress={() => moveSet(exerciseIndex, setIndex, 1)}
                      />
                    </View>
                    <View style={styles.fieldRow}>
                      <View style={styles.field}>
                        <Field
                          label="Min reps"
                          keyboardType="number-pad"
                          value={String(set.targetReps.min)}
                          onChangeText={(value) =>
                            updateSet(exerciseIndex, setIndex, {
                              targetReps: { ...set.targetReps, min: numeric(value, 0) },
                            })
                          }
                        />
                      </View>
                      <View style={styles.field}>
                        <Field
                          label="Max reps"
                          keyboardType="number-pad"
                          value={String(set.targetReps.max)}
                          onChangeText={(value) =>
                            updateSet(exerciseIndex, setIndex, {
                              targetReps: { ...set.targetReps, max: numeric(value, 0) },
                            })
                          }
                        />
                      </View>
                    </View>
                    <View style={styles.fieldRow}>
                      <View style={styles.field}>
                        <Field
                          label="Target RPE"
                          keyboardType="decimal-pad"
                          value={set.targetRpeTenths === null ? '' : String(set.targetRpeTenths / 10)}
                          onChangeText={(value) =>
                            updateSet(exerciseIndex, setIndex, {
                              targetRpeTenths:
                                value.trim() === '' ? null : Math.round(numeric(value, 0) * 10),
                            })
                          }
                          placeholder="8"
                        />
                      </View>
                      <View style={styles.field}>
                        <Field
                          label="Rest seconds"
                          keyboardType="number-pad"
                          value={String(set.restSeconds)}
                          onChangeText={(value) =>
                            updateSet(exerciseIndex, setIndex, { restSeconds: numeric(value, 0) })
                          }
                        />
                      </View>
                    </View>
                    <Button
                      title="Remove set"
                      compact
                      variant="ghost"
                      onPress={() =>
                        setDraft({
                          ...draft,
                          exercises: draft.exercises.map((item, index) =>
                            index === exerciseIndex
                              ? {
                                  ...item,
                                  sets: item.sets
                                    .filter((_, current) => current !== setIndex)
                                    .map((row, order) => ({ ...row, order })),
                                }
                              : item,
                          ),
                        })
                      }
                    />
                  </View>
                ))}
                <Button
                  title="Add work set"
                  variant="secondary"
                  onPress={() =>
                    setDraft({
                      ...draft,
                      exercises: draft.exercises.map((item, index) =>
                        index === exerciseIndex
                          ? { ...item, sets: [...item.sets, createPrescription(item.sets.length)] }
                          : item,
                      ),
                    })
                  }
                />
              </View>
            ) : null}
          </Card>
        )
      })}
      <Button title="Save plan" onPress={() => void save()} />
      <Button title="Delete plan" variant="danger" onPress={confirmDelete} />
    </Screen>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  grow: { flex: 1, minWidth: 130 },
  title: { fontSize: 18, fontWeight: '800' },
  setNumber: { fontSize: 16, fontWeight: '800', marginRight: 'auto' },
  set: { borderTopWidth: 1, paddingTop: 12, gap: 10 },
  fieldRow: { flexDirection: 'row', gap: 10 },
  field: { flex: 1 },
  exerciseCard: { padding: 0, gap: 0, overflow: 'hidden' },
  accordionHeader: {
    minHeight: 66,
    paddingHorizontal: 15,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  exerciseBody: { padding: 14, gap: 12, borderTopWidth: 1 },
  chevron: { fontSize: 24, fontWeight: '900' },
  pressed: { opacity: 0.72 },
})
