import { getMuscleName, type SetPrescription, type WorkoutTemplate } from '@track-me/contracts'
import { router, Stack, useLocalSearchParams } from 'expo-router'
import { useEffect, useMemo, useState } from 'react'
import { Alert, Modal, Pressable, StyleSheet, TextInput, View } from 'react-native'
import { SectionTitle } from '@/components/controls'
import { AppIcon, IconButton } from '@/components/design'
import { AppText, Button, Card, EmptyState, Field, Screen } from '@/components/ui'
import { createPrescription, createTemplateExercise } from '@/lib/factories'
import { useData } from '@/providers/data-provider'
import { useAppTheme } from '@/theme/use-theme'

function numeric(text: string, fallback: number): number {
  const value = Number(text)
  return Number.isFinite(value) ? value : fallback
}

function parseRepRange(value: string, fallback: SetPrescription['targetReps']) {
  const match = value.trim().match(/^(\d+)(?:\s*[-–]\s*(\d+))?$/)
  if (match === null) return fallback
  const minimum = Number(match[1])
  const maximum = Number(match[2] ?? match[1])
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum)) return fallback
  return { min: Math.min(minimum, maximum), max: Math.max(minimum, maximum) }
}

function PrescriptionRow({
  set,
  setIndex,
  first,
  last,
  onChange,
  onMove,
  onRemove,
}: {
  set: SetPrescription
  setIndex: number
  first: boolean
  last: boolean
  onChange: (change: Partial<SetPrescription>) => void
  onMove: (direction: -1 | 1) => void
  onRemove: () => void
}) {
  const { colors } = useAppTheme()
  const inputStyle = [
    styles.compactInput,
    { backgroundColor: colors.background, borderColor: colors.border, color: colors.text },
  ]
  return (
    <View style={styles.prescription}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Set ${setIndex + 1}, ${set.type}. Tap to change type.`}
        accessibilityHint="Hold to reorder this set."
        onPress={() => onChange({ type: set.type === 'work' ? 'warmup' : 'work' })}
        onLongPress={() =>
          Alert.alert(`Reorder set ${setIndex + 1}`, 'Choose a new position.', [
            ...(!first ? [{ text: 'Move up', onPress: () => onMove(-1) }] : []),
            ...(!last ? [{ text: 'Move down', onPress: () => onMove(1) }] : []),
            { text: 'Cancel', style: 'cancel' },
          ])
        }
        style={styles.typeTarget}
      >
        <View style={[styles.typeBadge, { backgroundColor: '#193221' }]}>
          <AppText style={[styles.typeText, { color: colors.primary }]}>
            {set.type === 'work' ? 'W' : 'WU'}
          </AppText>
        </View>
      </Pressable>
      <TextInput
        accessibilityLabel={`Set ${setIndex + 1} rep range`}
        defaultValue={`${set.targetReps.min}–${set.targetReps.max}`}
        placeholder="8–10"
        placeholderTextColor={colors.textMuted}
        onEndEditing={(event) =>
          onChange({ targetReps: parseRepRange(event.nativeEvent.text, set.targetReps) })
        }
        style={inputStyle}
      />
      <TextInput
        accessibilityLabel={`Set ${setIndex + 1} target RPE`}
        defaultValue={set.targetRpeTenths === null ? '' : String(set.targetRpeTenths / 10)}
        keyboardType="decimal-pad"
        placeholder="RPE"
        placeholderTextColor={colors.textMuted}
        onEndEditing={(event) =>
          onChange({
            targetRpeTenths:
              event.nativeEvent.text.trim() === ''
                ? null
                : Math.round(Math.min(10, Math.max(0, numeric(event.nativeEvent.text, 0))) * 10),
          })
        }
        style={inputStyle}
      />
      <TextInput
        accessibilityLabel={`Set ${setIndex + 1} rest seconds`}
        defaultValue={String(set.restSeconds)}
        keyboardType="number-pad"
        placeholder="sec"
        placeholderTextColor={colors.textMuted}
        onEndEditing={(event) =>
          onChange({ restSeconds: Math.max(0, Math.round(numeric(event.nativeEvent.text, 0))) })
        }
        style={inputStyle}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Remove set ${setIndex + 1}`}
        onPress={onRemove}
        style={styles.smallAction}
      >
        <AppIcon name="close" size={18} color={colors.textMuted} />
      </Pressable>
    </View>
  )
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
  const [showPlanNotes, setShowPlanNotes] = useState(false)
  const [notesExerciseId, setNotesExerciseId] = useState<string | null>(null)
  const [optionsExerciseId, setOptionsExerciseId] = useState<string | null>(null)
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
    <Screen safeTop contentStyle={styles.screen}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.subtop, { borderBottomColor: colors.border }]}>
        <IconButton icon="chevron-left" label="Back to training" onPress={() => router.back()} />
        <AppText style={[styles.headerTitle, styles.grow]}>Edit plan</AppText>
        <IconButton
          icon="dots-horizontal"
          label="Plan options"
          onPress={() =>
            Alert.alert('Plan options', draft.name, [
              {
                text: showPlanNotes ? 'Hide plan notes' : 'Edit plan notes',
                onPress: () => setShowPlanNotes(!showPlanNotes),
              },
              { text: 'Delete plan', style: 'destructive', onPress: confirmDelete },
              { text: 'Cancel', style: 'cancel' },
            ])
          }
        />
        <Pressable accessibilityRole="button" onPress={() => void save()} style={styles.headerAction}>
          <AppText style={{ color: colors.primary }}>Save</AppText>
        </Pressable>
      </View>
      <View style={styles.planName}>
        <AppText style={[styles.label, { color: colors.primary }]}>PLAN NAME</AppText>
        <TextInput
          accessibilityLabel="Plan name"
          value={draft.name}
          onChangeText={(name) => setDraft({ ...draft, name })}
          style={[
            styles.nameInput,
            { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border },
          ]}
        />
      </View>
      {showPlanNotes ? (
        <Field
          label="Notes"
          multiline
          value={draft.notes}
          onChangeText={(notes) => setDraft({ ...draft, notes })}
          placeholder="Optional cues or focus"
        />
      ) : null}
      <SectionTitle
        action={<AppText style={[styles.meta, { color: colors.textMuted }]}>Tap grip to reorder</AppText>}
      >
        Exercises
      </SectionTitle>
      <Modal visible={addingExercise} animationType="slide" onRequestClose={() => setAddingExercise(false)}>
        <Screen safeTop>
          <View style={styles.row}>
            <AppText style={[styles.title, styles.grow]}>Add exercise</AppText>
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
        </Screen>
      </Modal>

      {draft.exercises.length === 0 ? (
        <EmptyState title="No exercises" message="Add an exercise, then adjust every set independently." />
      ) : null}
      {draft.exercises.map((exercise, exerciseIndex) => {
        const expanded = exercise.id === expandedExerciseId
        const catalogExercise = data.exercises.find((item) => item.id === exercise.exerciseId)
        return (
          <Card key={exercise.id} style={styles.exerciseCard}>
            <View style={styles.headerRow}>
              <IconButton
                icon="drag-vertical"
                label={`Options and reorder ${exercise.exerciseName}`}
                onPress={() => setOptionsExerciseId(exercise.id)}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded }}
                onPress={() => setExpandedExerciseId(expanded ? null : exercise.id)}
                style={({ pressed }) => [styles.accordionHeader, pressed && styles.pressed]}
              >
                <View style={styles.grow}>
                  <AppText style={styles.title}>{exercise.exerciseName}</AppText>
                  <AppText style={[styles.meta, { color: colors.textMuted }]}>
                    {exercise.sets.length} set{exercise.sets.length === 1 ? '' : 's'}
                    {' · '}
                    {exercise.trackingMode === 'unilateral'
                      ? 'Left / right'
                      : catalogExercise === undefined
                        ? 'Exercise'
                        : getMuscleName(catalogExercise.primaryMuscleId)}
                  </AppText>
                </View>
                <AppIcon name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
              </Pressable>
            </View>
            {expanded ? (
              <View style={[styles.exerciseBody, { borderTopColor: colors.border }]}>
                {notesExerciseId === exercise.id ? (
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
                ) : null}
                {exercise.sets.length > 0 ? (
                  <View style={styles.prescriptionHeader}>
                    <AppText style={[styles.headerCell, styles.typeHeader]}>TYPE</AppText>
                    <AppText style={styles.headerCell}>REPS</AppText>
                    <AppText style={styles.headerCell}>RPE</AppText>
                    <AppText style={styles.headerCell}>REST</AppText>
                    <View style={styles.actionColumn} />
                  </View>
                ) : null}
                {exercise.sets.map((set, setIndex) => (
                  <PrescriptionRow
                    key={set.id}
                    set={set}
                    setIndex={setIndex}
                    first={setIndex === 0}
                    last={setIndex === exercise.sets.length - 1}
                    onChange={(change) => updateSet(exerciseIndex, setIndex, change)}
                    onMove={(direction) => moveSet(exerciseIndex, setIndex, direction)}
                    onRemove={() =>
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
                ))}
                <Button
                  title="Add prescribed set"
                  icon="plus"
                  compact
                  variant="dashed"
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
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add exercise"
        onPress={() => setAddingExercise(true)}
        style={[styles.addExercise, { borderColor: colors.border }]}
      >
        <AppIcon name="plus" color={colors.primary} />
        <View>
          <AppText style={{ color: colors.primary }}>Add exercise</AppText>
          <AppText style={[styles.meta, { color: colors.textMuted }]}>Search the full library</AppText>
        </View>
      </Pressable>
      <Modal
        transparent
        animationType="fade"
        visible={optionsExerciseId !== null}
        onRequestClose={() => setOptionsExerciseId(null)}
      >
        <View style={[styles.overlay, { backgroundColor: colors.overlay }]}>
          <Card>
            <AppText style={styles.title}>Exercise options</AppText>
            {(() => {
              const index = draft.exercises.findIndex((item) => item.id === optionsExerciseId)
              const exercise = draft.exercises[index]
              if (exercise === undefined) return null
              const closeThen = (action: () => void) => {
                setOptionsExerciseId(null)
                action()
              }
              return (
                <>
                  <AppText style={{ color: colors.textMuted }}>{exercise.exerciseName}</AppText>
                  <Button
                    title="Exercise details"
                    variant="ghost"
                    icon="information-outline"
                    onPress={() =>
                      closeThen(() =>
                        router.push({ pathname: '/exercise/[id]', params: { id: exercise.exerciseId } }),
                      )
                    }
                  />
                  <Button
                    title="Move up"
                    variant="ghost"
                    icon="arrow-up"
                    disabled={index === 0}
                    onPress={() => closeThen(() => moveExercise(index, -1))}
                  />
                  <Button
                    title="Move down"
                    variant="ghost"
                    icon="arrow-down"
                    disabled={index === draft.exercises.length - 1}
                    onPress={() => closeThen(() => moveExercise(index, 1))}
                  />
                  <Button
                    title="Edit exercise notes"
                    variant="ghost"
                    icon="note-edit-outline"
                    onPress={() =>
                      closeThen(() => {
                        setExpandedExerciseId(exercise.id)
                        setNotesExerciseId(exercise.id)
                      })
                    }
                  />
                  <Button
                    title="Remove exercise"
                    variant="ghost"
                    icon="trash-can-outline"
                    onPress={() => closeThen(() => removeExercise(index))}
                  />
                </>
              )
            })()}
            <Button title="Close" variant="outline" onPress={() => setOptionsExerciseId(null)} />
          </Card>
        </View>
      </Modal>
    </Screen>
  )
}

const styles = StyleSheet.create({
  screen: { padding: 12, paddingTop: 0, gap: 8 },
  subtop: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginHorizontal: -12,
    paddingHorizontal: 8,
  },
  headerTitle: { textAlign: 'center', fontSize: 15, fontWeight: '600' },
  headerAction: { minWidth: 48, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  planName: { marginVertical: 8, gap: 6 },
  label: { fontSize: 10, letterSpacing: 0.7 },
  nameInput: { minHeight: 46, borderWidth: 1, borderRadius: 11, paddingHorizontal: 12, fontSize: 14 },
  meta: { fontSize: 11, marginTop: 2 },
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  grow: { flex: 1, minWidth: 0 },
  title: { fontSize: 14, fontWeight: '600' },
  exerciseCard: { padding: 0, gap: 0, overflow: 'hidden' },
  headerRow: { flexDirection: 'row', alignItems: 'center', paddingLeft: 2 },
  accordionHeader: {
    flex: 1,
    minWidth: 0,
    minHeight: 60,
    paddingRight: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  exerciseBody: { padding: 10, gap: 6, borderTopWidth: 1 },
  pressed: { opacity: 0.72 },
  prescriptionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 1,
  },
  headerCell: {
    flex: 1,
    minWidth: 0,
    textAlign: 'center',
    fontSize: 10,
    fontWeight: '500',
    color: '#9AB5A3',
  },
  typeHeader: { flex: 0, width: 44 },
  prescription: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    minHeight: 44,
  },
  typeTarget: { width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  typeBadge: {
    width: 36,
    height: 36,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeText: { fontSize: 11, fontWeight: '500' },
  compactInput: {
    flex: 1,
    minWidth: 0,
    height: 38,
    borderWidth: 1,
    borderRadius: 9,
    paddingHorizontal: 4,
    paddingVertical: 0,
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '500',
  },
  smallAction: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  actionColumn: { width: 44 },
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
  overlay: { flex: 1, justifyContent: 'center', padding: 24 },
})
