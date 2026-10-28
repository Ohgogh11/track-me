import {
  type CompletedSet,
  calculateActiveSeconds,
  formatDuration,
  gramsToUnit,
  type SetPerformance,
  setTotalReps,
  unitToGrams,
  type WorkoutSession,
} from '@track-me/contracts'
import { router, useLocalSearchParams } from 'expo-router'
import { useEffect, useState } from 'react'
import { Alert, StyleSheet, View } from 'react-native'
import { ChoiceChip } from '@/components/controls'
import { PageTitle, SectionHeader } from '@/components/design'
import { AppText, Button, Card, EmptyState, Field, Metric, Screen } from '@/components/ui'
import { useData } from '@/providers/data-provider'
import { useAppTheme } from '@/theme/use-theme'

function numberOrNull(value: string): number | null {
  const parsed = Number(value)
  return value.trim() === '' || !Number.isFinite(parsed) ? null : parsed
}

function PerformanceFields({
  label,
  result,
  unit,
  onUpdate,
}: {
  label: string | null
  result: SetPerformance
  unit: 'kg' | 'lb'
  onUpdate: (change: Partial<SetPerformance>) => void
}) {
  return (
    <View style={styles.performance}>
      {label === null ? null : <AppText style={styles.side}>{label}</AppText>}
      <View style={styles.fields}>
        <View style={styles.field}>
          <Field
            label={`Weight (${unit})`}
            keyboardType="decimal-pad"
            value={
              result.actualWeightGrams === null
                ? ''
                : String(Number(gramsToUnit(result.actualWeightGrams, unit).toFixed(2)))
            }
            onChangeText={(value) => {
              const parsed = numberOrNull(value)
              onUpdate({ actualWeightGrams: parsed === null ? null : unitToGrams(parsed, unit) })
            }}
          />
        </View>
        <View style={styles.field}>
          <Field
            label="Reps"
            keyboardType="number-pad"
            value={result.actualReps === null ? '' : String(result.actualReps)}
            onChangeText={(value) => onUpdate({ actualReps: numberOrNull(value) })}
          />
        </View>
        <View style={styles.field}>
          <Field
            label="RPE"
            keyboardType="decimal-pad"
            value={result.actualRpeTenths === null ? '' : String(result.actualRpeTenths / 10)}
            onChangeText={(value) => {
              const parsed = numberOrNull(value)
              onUpdate({ actualRpeTenths: parsed === null ? null : Math.round(parsed * 10) })
            }}
          />
        </View>
      </View>
    </View>
  )
}

export default function WorkoutHistoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const data = useData()
  const { colors } = useAppTheme()
  const source = data.workouts.find((item) => item.id === id) ?? null
  const [draft, setDraft] = useState<WorkoutSession | null>(null)
  const unit = data.profile?.weightUnit ?? 'kg'

  useEffect(() => {
    if (source !== null && draft === null) setDraft(JSON.parse(JSON.stringify(source)) as WorkoutSession)
  }, [draft, source])

  if (draft === null)
    return (
      <Screen>
        <EmptyState
          title="Workout not found"
          message="It may have been deleted locally or on another device."
        />
      </Screen>
    )

  const updateSet = (exerciseIndex: number, setIndex: number, change: Partial<CompletedSet>) =>
    setDraft({
      ...draft,
      exercises: draft.exercises.map((exercise, currentExercise) =>
        currentExercise === exerciseIndex
          ? {
              ...exercise,
              sets: exercise.sets.map((set, currentSet) =>
                currentSet === setIndex ? { ...set, ...change } : set,
              ),
            }
          : exercise,
      ),
    })
  const completedSets = draft.exercises
    .flatMap((exercise) => exercise.sets)
    .filter((set) => set.status === 'completed')
  const reps = completedSets.reduce((total, set) => total + setTotalReps(set), 0)

  return (
    <Screen>
      <PageTitle
        eyebrow={`Completed ${new Date(draft.completedAt ?? draft.startedAt).toLocaleDateString()}`}
        title={draft.name}
      />
      <View style={styles.metrics}>
        <Metric
          label="Duration"
          value={formatDuration(
            calculateActiveSeconds(draft.timerSegments, new Date(draft.completedAt ?? draft.startedAt)),
          )}
        />
        <Metric label="Sets" value={String(completedSets.length)} />
        <Metric label="Reps" value={String(reps)} />
      </View>
      <Card>
        <Field
          label="Workout name"
          value={draft.name}
          onChangeText={(name) => setDraft({ ...draft, name })}
        />
        <Field
          label="Notes"
          multiline
          value={draft.notes}
          onChangeText={(notes) => setDraft({ ...draft, notes })}
        />
      </Card>
      <SectionHeader title="Exercises" />
      {draft.exercises.map((exercise, exerciseIndex) => (
        <Card key={exercise.id}>
          <View style={styles.row}>
            <AppText style={styles.exercise}>{exercise.exerciseName}</AppText>
            <Button
              title="Progress"
              compact
              variant="ghost"
              onPress={() => router.push({ pathname: '/exercise/[id]', params: { id: exercise.exerciseId } })}
            />
          </View>
          {exercise.sets.map((set, setIndex) => (
            <View key={set.id} style={[styles.set, { borderColor: colors.border }]}>
              <View style={styles.row}>
                <AppText style={styles.grow}>Set {setIndex + 1}</AppText>
                <ChoiceChip
                  label="Completed"
                  selected={set.status === 'completed'}
                  onPress={() =>
                    updateSet(exerciseIndex, setIndex, {
                      status: 'completed',
                      completedAt: set.completedAt ?? draft.completedAt,
                    })
                  }
                />
                <ChoiceChip
                  label="Skipped"
                  selected={set.status === 'skipped'}
                  onPress={() => updateSet(exerciseIndex, setIndex, { status: 'skipped', completedAt: null })}
                />
              </View>
              {exercise.trackingMode === 'unilateral' ? (
                (['left', 'right'] as const).map((side) => {
                  const empty: SetPerformance = {
                    actualWeightGrams: null,
                    actualReps: null,
                    actualRpeTenths: null,
                  }
                  const sideResults = set.sideResults ?? { left: empty, right: empty }
                  return (
                    <PerformanceFields
                      key={side}
                      label={side === 'left' ? 'Left' : 'Right'}
                      result={sideResults[side]}
                      unit={unit}
                      onUpdate={(change) =>
                        updateSet(exerciseIndex, setIndex, {
                          actualWeightGrams: null,
                          actualReps: null,
                          actualRpeTenths: null,
                          sideResults: {
                            ...sideResults,
                            [side]: { ...sideResults[side], ...change },
                          },
                        })
                      }
                    />
                  )
                })
              ) : (
                <PerformanceFields
                  label={null}
                  result={set}
                  unit={unit}
                  onUpdate={(change) => updateSet(exerciseIndex, setIndex, change)}
                />
              )}
            </View>
          ))}
        </Card>
      ))}
      <Button
        title="Save corrections"
        onPress={() =>
          void data.save({ ...draft, updatedAt: new Date().toISOString() }).then(() => router.back())
        }
      />
      <Button
        title="Delete workout"
        variant="danger"
        onPress={() =>
          Alert.alert(
            'Delete this workout?',
            'Analytics and personal records will be recalculated. The synchronized tombstone can resolve other devices safely.',
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Delete',
                style: 'destructive',
                onPress: () => void data.remove(draft).then(() => router.replace('/(tabs)/workouts')),
              },
            ],
          )
        }
      />
    </Screen>
  )
}

const styles = StyleSheet.create({
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  grow: { flex: 1 },
  exercise: { flex: 1, minWidth: 150, fontSize: 19, fontWeight: '800' },
  set: { borderTopWidth: 1, paddingTop: 12, gap: 10 },
  fields: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  field: { flex: 1, minWidth: 90 },
  performance: { gap: 6 },
  side: { fontWeight: '900' },
})
