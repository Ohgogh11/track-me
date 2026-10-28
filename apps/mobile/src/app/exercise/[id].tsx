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
import { MiniLineChart } from '@/components/controls'
import { AppIcon, SectionHeader } from '@/components/design'
import { ExerciseMuscleMap } from '@/components/muscle-heat-map'
import { AppText, Card, EmptyState, Metric, Screen } from '@/components/ui'
import { formatShortDate } from '@/lib/date'
import { useData } from '@/providers/data-provider'
import { useAppTheme } from '@/theme/use-theme'

function instructionContent(instructions: readonly string[]): {
  steps: string[]
  coachingTip: string | null
} {
  let coachingTip: string | null = null
  const steps = instructions
    .map((instruction) => {
      const tipStart = instruction.search(/\bTip:\s*/i)
      if (tipStart < 0) return instruction.trim()
      if (coachingTip === null) {
        coachingTip = instruction.slice(tipStart).replace(/^Tip:\s*/i, '').trim()
      }
      return instruction.slice(0, tipStart).trim()
    })
    .filter((instruction) => instruction.length > 0)
  return { steps, coachingTip }
}

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
      sets.map((set) => ({ set, date: workout.completedAt ?? workout.startedAt })),
    )
    .slice(-12)
  const records = detectPersonalRecords(data.workouts).filter((record) => record.exerciseId === id)
  const catalogExercise =
    data.exercises.find((exercise) => exercise.id === id) ??
    BUILT_IN_EXERCISES.find((exercise) => exercise.id === id) ??
    null
  const name =
    insight?.exerciseName ?? catalogExercise?.name ?? sessions.at(-1)?.exercise.exerciseName ?? 'Exercise'
  const guide = instructionContent(catalogExercise?.instructions ?? [])
  const primaryMuscle = catalogExercise === null ? null : getMuscleName(catalogExercise.primaryMuscleId)

  return (
    <Screen>
      <Card style={[styles.hero, { backgroundColor: colors.surfaceRaised }]}>
        <View style={styles.heroCopy}>
          <AppText style={[styles.overline, { color: colors.primary }]}>
            {catalogExercise === null
              ? 'EXERCISE'
              : `${catalogExercise.equipment ?? 'NO EQUIPMENT'} · ${catalogExercise.category ?? 'MOVEMENT'}`.toUpperCase()}
          </AppText>
          <AppText style={styles.heroTitle}>{name}</AppText>
          {catalogExercise !== null ? (
            <AppText style={{ color: colors.textMuted }}>
              {primaryMuscle} focused · {catalogExercise.difficulty ?? 'level not specified'}
              {catalogExercise.trackingMode === 'unilateral' ? ' · left / right tracking' : ''}
            </AppText>
          ) : null}
        </View>
        {catalogExercise !== null ? (
          <ExerciseMuscleMap
            primaryMuscleId={catalogExercise.primaryMuscleId}
            secondaryMuscleIds={catalogExercise.secondaryMuscleIds}
          />
        ) : null}
      </Card>

      {catalogExercise !== null ? (
        <>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.muscleChips}
          >
            <View
              style={[
                styles.muscleChip,
                { backgroundColor: colors.surfaceRaised, borderColor: colors.primary },
              ]}
            >
              <AppText style={styles.muscleChipText}>{primaryMuscle} · primary</AppText>
            </View>
            {catalogExercise.secondaryMuscleIds.map((muscleId) => (
              <View key={muscleId} style={[styles.muscleChip, { borderColor: colors.border }]}>
                <AppText style={[styles.muscleChipText, { color: colors.textMuted }]}>
                  {getMuscleName(muscleId)} · secondary
                </AppText>
              </View>
            ))}
          </ScrollView>

          {catalogExercise.imageUrls.length > 0 ? (
            <>
              <SectionHeader title="Movement" />
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

          <SectionHeader
            title="How to perform"
            action={
              guide.steps.length > 0 ? (
                <AppText style={{ color: colors.textMuted }}>
                  {guide.steps.length} {guide.steps.length === 1 ? 'step' : 'steps'}
                </AppText>
              ) : null
            }
          />
          {guide.steps.length === 0 ? (
            <EmptyState title="No instructions yet" message="Technique guidance is not available for this exercise." />
          ) : (
            <Card style={styles.stepsCard}>
              {guide.steps.map((instruction, index) => (
                <View
                  key={`${index}:${instruction}`}
                  style={[
                    styles.instruction,
                    index < guide.steps.length - 1 && { borderBottomColor: colors.border },
                  ]}
                >
                  <View style={[styles.stepBadge, { backgroundColor: colors.surfaceRaised }]}>
                    <AppText style={[styles.step, { color: colors.primary }]}>{index + 1}</AppText>
                  </View>
                  <AppText style={styles.instructionText}>{instruction}</AppText>
                </View>
              ))}
            </Card>
          )}

          {guide.coachingTip !== null ? (
            <View
              style={[
                styles.tip,
                { backgroundColor: colors.surfaceRaised, borderLeftColor: colors.primary },
              ]}
            >
              <AppIcon name="lightbulb-outline" color={colors.primary} />
              <View style={styles.grow}>
                <AppText style={[styles.overline, { color: colors.primary }]}>COACHING TIP</AppText>
                <AppText style={styles.tipText}>{guide.coachingTip}</AppText>
              </View>
            </View>
          ) : null}
        </>
      ) : null}

      <SectionHeader title="Records" />
      <View style={styles.recordKpis}>
        <View style={[styles.recordKpi, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <AppText style={[styles.kpiLabel, { color: colors.textMuted }]}>BEST LOAD</AppText>
          <AppText numberOfLines={1} adjustsFontSizeToFit style={styles.kpiValue}>
            {insight?.heaviestWeightGrams === null || insight?.heaviestWeightGrams === undefined
              ? '—'
              : `${Number(gramsToUnit(insight.heaviestWeightGrams, unit).toFixed(1))} ${unit}`}
          </AppText>
        </View>
        <View style={[styles.recordKpi, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <AppText style={[styles.kpiLabel, { color: colors.textMuted }]}>EST. 1RM</AppText>
          <AppText numberOfLines={1} adjustsFontSizeToFit style={styles.kpiValue}>
            {insight?.estimatedOneRepMaxGrams === null ||
            insight?.estimatedOneRepMaxGrams === undefined
              ? '—'
              : `${Number(gramsToUnit(insight.estimatedOneRepMaxGrams, unit).toFixed(1))} ${unit}`}
          </AppText>
        </View>
        <View style={[styles.recordKpi, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <AppText style={[styles.kpiLabel, { color: colors.textMuted }]}>BEST REPS</AppText>
          <AppText style={styles.kpiValue}>{insight?.maxReps ?? '—'}</AppText>
        </View>
      </View>

      {insight === null ? (
        <EmptyState
          title="No completed work sets"
          message="Complete a work set to create exercise trends and records."
        />
      ) : (
        <>
          <SectionHeader title="Performance" />
          <View style={styles.metrics}>
            <Metric label="Sessions" value={String(insight.sessions)} />
            <Metric label="Work sets" value={String(insight.workSets)} />
            <Metric label="Reps" value={String(insight.totalReps)} />
            <Metric label="Volume" value={`${Math.round(insight.volumeKg)} kg`} />
          </View>

          <SectionHeader title="Recent set trends" />
          <Card>
            <AppText style={styles.chartTitle}>Load ({unit})</AppText>
            <MiniLineChart
              values={setHistory.map(({ set }) =>
                setHeaviestWeightGrams(set) === null
                  ? 0
                  : gramsToUnit(setHeaviestWeightGrams(set) ?? 0, unit),
              )}
              labels={setHistory.map(({ date }) => formatShortDate(date))}
            />
            <AppText style={styles.chartTitle}>Reps</AppText>
            <MiniLineChart
              values={setHistory.map(({ set }) => setTotalReps(set))}
              labels={setHistory.map(({ date }) => formatShortDate(date))}
            />
            <AppText style={styles.chartTitle}>Set volume (kg)</AppText>
            <MiniLineChart
              values={setHistory.map(({ set }) => setVolumeKg(set))}
              labels={setHistory.map(({ date }) => formatShortDate(date))}
            />
            <AppText style={styles.chartTitle}>Estimated 1RM ({unit})</AppText>
            <MiniLineChart
              values={setHistory.map(({ set }) => {
                const value = setBestEstimatedOneRepMaxGrams(set)
                return value === null ? 0 : gramsToUnit(value, unit)
              })}
              labels={setHistory.map(({ date }) => formatShortDate(date))}
            />
          </Card>

          <SectionHeader title="All-time PRs" />
          {records.length === 0 ? (
            <EmptyState
              title="No PRs yet"
              message="Loaded sets of 1–12 reps are eligible for estimated 1RM records."
            />
          ) : (
            <Card style={styles.listCard}>
              {records
                .slice(-10)
                .reverse()
                .map((record, index, items) => (
                  <View
                    key={`${record.workoutId}-${record.type}-${record.value}`}
                    style={[
                      styles.recordRow,
                      index < items.length - 1 && { borderBottomColor: colors.border },
                    ]}
                  >
                    <View style={[styles.recordIcon, { backgroundColor: colors.surfaceRaised }]}>
                      <AppIcon name="trophy-outline" size={18} color={colors.primary} />
                    </View>
                    <View style={styles.grow}>
                      <AppText style={styles.rowTitle}>{record.type.replaceAll('_', ' ')}</AppText>
                      <AppText style={{ color: colors.textMuted }}>
                        {new Date(record.achievedAt).toLocaleDateString()}
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
                ))}
            </Card>
          )}

          <SectionHeader title="Session history" />
          {sessions
            .slice()
            .reverse()
            .map(({ workout, sets }) => (
              <Card key={workout.id}>
                <View style={styles.sessionHeader}>
                  <View style={styles.grow}>
                    <AppText style={styles.rowTitle}>{workout.name}</AppText>
                    <AppText style={{ color: colors.textMuted }}>
                      {new Date(workout.completedAt ?? workout.startedAt).toLocaleDateString()} ·{' '}
                      {sets.length} work sets
                    </AppText>
                  </View>
                  <AppText style={{ color: colors.textMuted }}>
                    {formatDuration(sets.reduce((total, set) => total + (set.actualRestSeconds ?? 0), 0))}{' '}
                    rest
                  </AppText>
                </View>
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
                          <AppText key={`${set.id}:${key}`} style={{ color: colors.textMuted }}>
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
  grow: { flex: 1, minWidth: 0 },
  hero: { overflow: 'hidden', gap: 14 },
  heroCopy: { gap: 5 },
  heroTitle: { fontSize: 27, lineHeight: 32, fontWeight: '900', letterSpacing: -0.7 },
  overline: { fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  muscleChips: { gap: 7, paddingRight: 16 },
  muscleChip: {
    minHeight: 38,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  muscleChipText: { fontSize: 12, fontWeight: '800' },
  images: { gap: 10, paddingRight: 18 },
  image: { width: 210, height: 210, borderRadius: 16 },
  stepsCard: { padding: 0, gap: 0, overflow: 'hidden' },
  instruction: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 11,
    padding: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  stepBadge: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  step: { fontSize: 13, fontWeight: '900' },
  instructionText: { flex: 1, lineHeight: 20 },
  tip: {
    minHeight: 62,
    borderLeftWidth: 3,
    borderRadius: 12,
    padding: 13,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 11,
  },
  tipText: { fontWeight: '700', lineHeight: 19 },
  recordKpis: { flexDirection: 'row', gap: 8 },
  recordKpi: {
    flex: 1,
    minWidth: 0,
    minHeight: 76,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 13,
    padding: 10,
    gap: 5,
  },
  kpiLabel: { fontSize: 9, fontWeight: '900', letterSpacing: 0.6 },
  kpiValue: { fontSize: 17, fontWeight: '900', fontVariant: ['tabular-nums'] },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chartTitle: { fontSize: 16, fontWeight: '800' },
  listCard: { padding: 0, gap: 0, overflow: 'hidden' },
  recordRow: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  recordIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 15, fontWeight: '800', textTransform: 'capitalize' },
  recordValue: { fontSize: 14, fontWeight: '900' },
  sessionHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
})
