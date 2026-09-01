import {
  BUILT_IN_EXERCISES,
  calculateExerciseInsights,
  completedWorkouts,
  detectPersonalRecords,
  formatDuration,
  getMuscleName,
  gramsToUnit,
  isEligibleWorkSet,
  setBestEstimatedOneRepMaxGrams,
  setHeaviestWeightGrams,
  setPerformances,
  setTotalReps,
  setVolumeKg,
} from '@track-me/contracts'
import { useLocalSearchParams } from 'expo-router'
import { useMemo } from 'react'
import { Image, ScrollView, StyleSheet, View } from 'react-native'
import { MiniLineChart, SectionTitle } from '@/components/controls'
import { ExerciseMuscleMap } from '@/components/muscle-heat-map'
import { AppText, Card, EmptyState, Heading, Metric, Screen } from '@/components/ui'
import { formatShortDate } from '@/lib/date'
import { useData } from '@/providers/data-provider'
import { useAppTheme } from '@/theme/use-theme'

export default function ExerciseDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const data = useData()
  const { colors } = useAppTheme()
  const unit = data.profile?.weightUnit ?? 'kg'
  const range = useMemo(
    () => ({ from: '1970-01-01T00:00:00.000Z', to: new Date(8_640_000_000_000_000).toISOString() }),
    [],
  )
  const insight =
    calculateExerciseInsights(data.workouts, range).find((item) => item.exerciseId === id) ?? null
  const sessions = completedWorkouts(data.workouts).flatMap((workout) => {
    const exercise = workout.exercises.find((item) => item.exerciseId === id)
    if (exercise === undefined) return []
    const sets = exercise.sets.filter(isEligibleWorkSet)
    return sets.length === 0 ? [] : [{ workout, exercise, sets }]
  })
  const setHistory = sessions
    .flatMap(({ workout, sets }) =>
      sets.map((set) => ({ set, date: workout.completedAt ?? workout.startedAt, workoutName: workout.name })),
    )
    .slice(-12)
  const records = detectPersonalRecords(data.workouts).filter((record) => record.exerciseId === id)
  const catalogExercise =
    data.exercises.find((exercise) => exercise.id === id) ??
    BUILT_IN_EXERCISES.find((exercise) => exercise.id === id) ??
    null
  const name =
    insight?.exerciseName ?? catalogExercise?.name ?? sessions.at(-1)?.exercise.exerciseName ?? 'Exercise'

  return (
    <Screen>
      <Heading subtitle="All completed work sets, regardless of whether the workout began from a plan.">
        {name}
      </Heading>
      {catalogExercise !== null ? (
        <>
          <Card>
            <ExerciseMuscleMap
              primaryMuscleId={catalogExercise.primaryMuscleId}
              secondaryMuscleIds={catalogExercise.secondaryMuscleIds}
            />
            <AppText style={styles.title}>Muscles worked</AppText>
            <AppText>Primary: {getMuscleName(catalogExercise.primaryMuscleId)}</AppText>
            <AppText style={{ color: colors.textMuted }}>
              Secondary:{' '}
              {catalogExercise.secondaryMuscleIds.length === 0
                ? 'None listed'
                : catalogExercise.secondaryMuscleIds.map(getMuscleName).join(', ')}
            </AppText>
            <AppText style={{ color: colors.textMuted }}>
              {catalogExercise.equipment ?? 'No equipment'} · {catalogExercise.category ?? 'Exercise'} ·{' '}
              {catalogExercise.difficulty ?? 'Unspecified level'}
            </AppText>
            {catalogExercise.trackingMode === 'unilateral' ? (
              <AppText style={{ color: colors.primary, fontWeight: '800' }}>
                Tracked separately for left and right sides
              </AppText>
            ) : null}
          </Card>

          {catalogExercise.imageUrls.length > 0 ? (
            <>
              <SectionTitle>Movement</SectionTitle>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.images}
              >
                {catalogExercise.imageUrls.slice(0, 2).map((uri, index) => (
                  <Image
                    key={uri}
                    accessibilityLabel={`${catalogExercise.name} position ${index + 1}`}
                    source={{ uri }}
                    style={[styles.image, { backgroundColor: colors.surfaceRaised }]}
                  />
                ))}
              </ScrollView>
            </>
          ) : null}

          <SectionTitle>How to perform it</SectionTitle>
          <Card>
            {catalogExercise.instructions.length === 0 ? (
              <AppText style={{ color: colors.textMuted }}>No instructions are available yet.</AppText>
            ) : (
              catalogExercise.instructions.map((instruction, index) => (
                <View key={instruction} style={styles.instruction}>
                  <AppText style={[styles.step, { color: colors.primary }]}>{index + 1}</AppText>
                  <AppText style={styles.grow}>{instruction}</AppText>
                </View>
              ))
            )}
          </Card>
        </>
      ) : null}
      {insight === null ? (
        <EmptyState
          title="No completed work sets"
          message="Complete a work set to create exercise trends and records."
        />
      ) : (
        <>
          <View style={styles.metrics}>
            <Metric label="Sessions" value={String(insight.sessions)} />
            <Metric label="Work sets" value={String(insight.workSets)} />
            <Metric label="Reps" value={String(insight.totalReps)} />
            <Metric label="Volume" value={`${Math.round(insight.volumeKg)} kg`} />
            <Metric
              label="Heaviest"
              value={
                insight.heaviestWeightGrams === null
                  ? '—'
                  : `${Number(gramsToUnit(insight.heaviestWeightGrams, unit).toFixed(1))} ${unit}`
              }
            />
            <Metric
              label="Est. 1RM"
              value={
                insight.estimatedOneRepMaxGrams === null
                  ? '—'
                  : `${Number(gramsToUnit(insight.estimatedOneRepMaxGrams, unit).toFixed(1))} ${unit}`
              }
            />
          </View>

          <SectionTitle>Recent set trends</SectionTitle>
          <Card>
            <AppText style={styles.title}>Load ({unit})</AppText>
            <MiniLineChart
              values={setHistory.map(({ set }) =>
                setHeaviestWeightGrams(set) === null
                  ? 0
                  : gramsToUnit(setHeaviestWeightGrams(set) ?? 0, unit),
              )}
              labels={setHistory.map(({ date }) => formatShortDate(date))}
            />
            <AppText style={styles.title}>Reps</AppText>
            <MiniLineChart
              values={setHistory.map(({ set }) => setTotalReps(set))}
              labels={setHistory.map(({ date }) => formatShortDate(date))}
            />
            <AppText style={styles.title}>Set volume (kg)</AppText>
            <MiniLineChart
              values={setHistory.map(({ set }) => setVolumeKg(set))}
              labels={setHistory.map(({ date }) => formatShortDate(date))}
            />
            <AppText style={styles.title}>Estimated 1RM ({unit})</AppText>
            <MiniLineChart
              values={setHistory.map(({ set }) => {
                const value = setBestEstimatedOneRepMaxGrams(set)
                return value === null ? 0 : gramsToUnit(value, unit)
              })}
              labels={setHistory.map(({ date }) => formatShortDate(date))}
            />
          </Card>

          <SectionTitle>All-time records</SectionTitle>
          {records.length === 0 ? (
            <EmptyState
              title="No records"
              message="Loaded sets of 1–12 reps are eligible for estimated 1RM records."
            />
          ) : (
            records
              .slice(-10)
              .reverse()
              .map((record) => (
                <Card key={`${record.workoutId}-${record.type}-${record.value}`}>
                  <View style={styles.row}>
                    <View style={styles.grow}>
                      <AppText style={styles.title}>{record.type.replaceAll('_', ' ')}</AppText>
                      <AppText style={{ color: colors.textMuted }}>
                        {new Date(record.achievedAt).toLocaleString()}
                      </AppText>
                    </View>
                    <AppText style={styles.recordValue}>
                      {record.type === 'max_reps'
                        ? `${record.value} reps`
                        : record.type === 'session_volume'
                          ? `${Math.round(record.value)} kg`
                          : `${Number(gramsToUnit(record.value, unit).toFixed(1))} ${unit}`}
                    </AppText>
                  </View>
                </Card>
              ))
          )}

          <SectionTitle>Session history</SectionTitle>
          {sessions
            .slice()
            .reverse()
            .map(({ workout, sets }) => (
              <Card key={workout.id}>
                <AppText style={styles.title}>{workout.name}</AppText>
                <AppText style={{ color: colors.textMuted }}>
                  {new Date(workout.completedAt ?? workout.startedAt).toLocaleString()} ·{' '}
                  {formatDuration(sets.reduce((total, set) => total + (set.actualRestSeconds ?? 0), 0))}{' '}
                  recorded rest
                </AppText>
                {sets.flatMap((set) => {
                  const results =
                    set.sideResults === undefined || set.sideResults === null
                      ? [{ key: 'bilateral', label: null, result: setPerformances(set)[0] }]
                      : [
                          { key: 'left', label: 'Left', result: set.sideResults.left },
                          { key: 'right', label: 'Right', result: set.sideResults.right },
                        ]
                  return results.flatMap(({ key, label, result }) =>
                    result === undefined
                      ? []
                      : [
                          <AppText key={`${set.id}:${key}`}>
                            {label === null ? '' : `${label} · `}
                            {result.actualWeightGrams === null
                              ? 'Bodyweight / no load'
                              : `${Number(gramsToUnit(result.actualWeightGrams, unit).toFixed(1))} ${unit}`}{' '}
                            × {result.actualReps ?? 0} · RPE{' '}
                            {result.actualRpeTenths === null ? '—' : result.actualRpeTenths / 10}
                          </AppText>,
                        ],
                  )
                })}
              </Card>
            ))}
        </>
      )}
    </Screen>
  )
}

const styles = StyleSheet.create({
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  title: { fontSize: 18, fontWeight: '800', textTransform: 'capitalize' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  grow: { flex: 1 },
  recordValue: { fontSize: 18, fontWeight: '900' },
  images: { gap: 10, paddingRight: 18 },
  image: { width: 220, height: 220, borderRadius: 16 },
  instruction: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  step: { width: 24, fontSize: 16, fontWeight: '900' },
})
