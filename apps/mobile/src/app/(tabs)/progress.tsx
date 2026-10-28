import {
  bodyWeightTrend,
  calculateExerciseInsights,
  calculateMuscleInsights,
  calculateProgressSummary,
  completedWorkouts,
  type DateRange,
  formatDuration,
  getMuscleName,
  gramsToUnit,
  isEligibleWorkSet,
  setVolumeKg,
} from '@track-me/contracts'
import { router } from 'expo-router'
import { useMemo, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { ChipRow, ChoiceChip, MiniLineChart } from '@/components/controls'
import { AppIcon, IconButton, PageTitle, SectionHeader } from '@/components/design'
import { MuscleHeatMap } from '@/components/muscle-heat-map'
import { AppText, Card, EmptyState, Field, Metric, Screen } from '@/components/ui'
import { dateRangeForDays, formatShortDate, localDateToday } from '@/lib/date'
import { useData } from '@/providers/data-provider'
import { useAppTheme } from '@/theme/use-theme'

type Preset = '7' | '30' | '90' | 'custom'

function customRange(from: string, to: string): DateRange {
  const start = new Date(`${from}T00:00:00`)
  const end = new Date(`${to}T23:59:59.999`)
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return dateRangeForDays(30)
  return { from: start.toISOString(), to: end.toISOString() }
}

function displayVolume(volumeKg: number): string {
  if (volumeKg >= 1000) return `${Number((volumeKg / 1000).toFixed(1))}t`
  return `${Math.round(volumeKg)} kg`
}

export default function ProgressScreen() {
  const data = useData()
  const { colors } = useAppTheme()
  const [preset, setPreset] = useState<Preset>('30')
  const [from, setFrom] = useState(() => {
    const date = new Date()
    date.setDate(date.getDate() - 29)
    return date.toISOString().slice(0, 10)
  })
  const [to, setTo] = useState(localDateToday())
  const [selectedMuscle, setSelectedMuscle] = useState<string | null>(null)
  const [showMuscleDetails, setShowMuscleDetails] = useState(false)
  const [showAllExercises, setShowAllExercises] = useState(false)
  const range = useMemo(
    () => (preset === 'custom' ? customRange(from, to) : dateRangeForDays(Number(preset))),
    [from, preset, to],
  )
  const timezone = data.profile?.timezone ?? 'UTC'
  const unit = data.profile?.weightUnit ?? 'kg'
  const summary = useMemo(
    () => calculateProgressSummary(data.workouts, range, timezone),
    [data.workouts, range, timezone],
  )
  const exercises = useMemo(() => calculateExerciseInsights(data.workouts, range), [data.workouts, range])
  const muscles = useMemo(() => calculateMuscleInsights(data.workouts, range), [data.workouts, range])
  const weightTrend = useMemo(() => bodyWeightTrend(data.bodyWeights, range), [data.bodyWeights, range])
  const selectedWorkouts = useMemo(
    () =>
      completedWorkouts(data.workouts, range)
        .slice()
        .sort(
          (left, right) =>
            Date.parse(left.completedAt ?? left.startedAt) -
            Date.parse(right.completedAt ?? right.startedAt),
        ),
    [data.workouts, range],
  )
  const volumeTrend = useMemo(
    () =>
      selectedWorkouts.map((workout) => ({
        label: formatShortDate(workout.completedAt ?? workout.startedAt),
        volumeKg: workout.exercises.reduce(
          (workoutTotal, exercise) =>
            workoutTotal +
            exercise.sets
              .filter(isEligibleWorkSet)
              .reduce((exerciseTotal, set) => exerciseTotal + setVolumeKg(set), 0),
          0,
        ),
      })),
    [selectedWorkouts],
  )
  const muscle = muscles.find((item) => item.muscleId === selectedMuscle) ?? muscles[0] ?? null
  const activeDays = Object.keys(summary.workoutsByLocalDate).length
  const displayedExercises = showAllExercises ? exercises : exercises.slice(0, 4)

  return (
    <Screen safeBottom={false}>
      <PageTitle
        eyebrow="Progress"
        title="See the work add up."
        accessory={
          <IconButton
            icon="calendar-month-outline"
            label="Choose date range"
            onPress={() => setPreset('custom')}
          />
        }
      />
      <ChipRow>
        {(['7', '30', '90'] as const).map((value) => (
          <ChoiceChip
            key={value}
            label={`${value}D`}
            selected={preset === value}
            onPress={() => setPreset(value)}
          />
        ))}
        <ChoiceChip label="Custom" selected={preset === 'custom'} onPress={() => setPreset('custom')} />
      </ChipRow>
      {preset === 'custom' ? (
        <View style={styles.row}>
          <View style={styles.grow}>
            <Field label="From (inclusive)" value={from} onChangeText={setFrom} placeholder="YYYY-MM-DD" />
          </View>
          <View style={styles.grow}>
            <Field label="To (inclusive)" value={to} onChangeText={setTo} placeholder="YYYY-MM-DD" />
          </View>
        </View>
      ) : null}

      <View style={styles.kpis}>
        <View style={[styles.kpi, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <AppText style={styles.kpiLabel}>WORKOUTS</AppText>
          <AppText style={styles.kpiValue}>{summary.workoutCount}</AppText>
          <AppText numberOfLines={1} style={[styles.kpiNote, { color: colors.textMuted }]}>
            {activeDays} active {activeDays === 1 ? 'day' : 'days'}
          </AppText>
        </View>
        <View style={[styles.kpi, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <AppText style={styles.kpiLabel}>VOLUME</AppText>
          <AppText numberOfLines={1} adjustsFontSizeToFit style={styles.kpiValue}>
            {displayVolume(summary.volumeKg)}
          </AppText>
          <AppText numberOfLines={1} style={[styles.kpiNote, { color: colors.textMuted }]}>
            completed load
          </AppText>
        </View>
        <View style={[styles.kpi, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <AppText style={styles.kpiLabel}>PRs</AppText>
          <AppText style={styles.kpiValue}>{summary.personalRecordCount}</AppText>
          <AppText numberOfLines={1} style={[styles.kpiNote, { color: colors.textMuted }]}>
            in this range
          </AppText>
        </View>
      </View>

      <Card style={styles.chartCard}>
        <View style={styles.chartHeader}>
          <View style={styles.grow}>
            <AppText style={[styles.overline, { color: colors.primary }]}>TRAINING VOLUME</AppText>
            <AppText style={styles.chartValue}>{Math.round(summary.volumeKg).toLocaleString()} kg</AppText>
          </View>
          <AppText style={{ color: colors.textMuted }}>{summary.workoutCount} sessions</AppText>
        </View>
        {volumeTrend.length === 0 ? (
          <EmptyState
            title="No volume yet"
            message="Completed loaded work sets will appear as a line across this range."
          />
        ) : (
          <MiniLineChart
            values={volumeTrend.map((point) => point.volumeKg)}
            labels={volumeTrend.map((point) => point.label)}
          />
        )}
      </Card>

      <SectionHeader
        title="Muscle balance"
        action={
          muscle === null ? null : (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: showMuscleDetails }}
              onPress={() => setShowMuscleDetails((value) => !value)}
              style={styles.linkButton}
            >
              <AppText style={{ color: colors.primary }}>
                {showMuscleDetails ? 'Less' : 'Details'}
              </AppText>
            </Pressable>
          )
        }
      />
      <Card style={styles.muscleCard}>
        <MuscleHeatMap
          insights={muscles}
          selectedMuscleId={muscle?.muscleId ?? null}
          onSelect={setSelectedMuscle}
        />
        {muscle === null ? (
          <View style={styles.emptyInset}>
            <AppText style={{ color: colors.textMuted }}>
              Complete work sets to populate the map. Primary sets count 1.0 and secondary sets count 0.5.
            </AppText>
          </View>
        ) : (
          <View style={styles.muscleSummary}>
            <View style={styles.grow}>
              <AppText style={[styles.overline, { color: colors.primary }]}>SELECTED MUSCLE</AppText>
              <AppText style={styles.muscleTitle}>{getMuscleName(muscle.muscleId)}</AppText>
              <AppText style={{ color: colors.textMuted }}>
                {muscle.heatScore} weighted sets · {Math.round(muscle.attributedVolumeKg)} kg attributed
              </AppText>
            </View>
            <AppIcon name="arm-flex-outline" size={24} color={colors.primary} />
          </View>
        )}
        {showMuscleDetails && muscle !== null ? (
          <View style={[styles.detailGrid, { borderTopColor: colors.border }]}>
            <Metric label="Primary sets" value={String(muscle.primarySets)} />
            <Metric label="Secondary sets" value={String(muscle.secondarySets)} />
            <Metric label="Exercises" value={String(muscle.exerciseIds.length)} />
            <Metric label="PRs" value={String(muscle.recordCount)} />
          </View>
        ) : null}
      </Card>

      <SectionHeader title="Range details" />
      <View style={styles.detailGrid}>
        <Metric label="Active time" value={formatDuration(summary.activeSeconds)} />
        <Metric label="Work sets" value={String(summary.workSets)} />
        <Metric label="Reps" value={String(summary.totalReps)} />
        <Metric label="Active days" value={String(activeDays)} />
      </View>

      <SectionHeader
        title="Exercise momentum"
        action={
          exercises.length > 4 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: showAllExercises }}
              onPress={() => setShowAllExercises((value) => !value)}
              style={styles.linkButton}
            >
              <AppText style={{ color: colors.primary }}>{showAllExercises ? 'Show less' : 'See all'}</AppText>
            </Pressable>
          ) : null
        }
      />
      {exercises.length === 0 ? (
        <EmptyState
          title="No exercise data"
          message="Insights combine exercise history from both planned and empty workouts."
        />
      ) : (
        <Card style={styles.listCard}>
          {displayedExercises.map((exercise, index) => (
            <Pressable
              key={exercise.exerciseId}
              accessibilityRole="button"
              accessibilityLabel={`Open ${exercise.exerciseName} details`}
              onPress={() =>
                router.push({ pathname: '/exercise/[id]', params: { id: exercise.exerciseId } })
              }
              style={({ pressed }) => [
                styles.momentumRow,
                index < displayedExercises.length - 1 && { borderBottomColor: colors.border },
                pressed && styles.pressed,
              ]}
            >
              <AppText style={[styles.rank, { color: colors.primary }]}>
                {String(index + 1).padStart(2, '0')}
              </AppText>
              <View style={styles.grow}>
                <AppText numberOfLines={1} style={styles.title}>
                  {exercise.exerciseName}
                </AppText>
                <AppText numberOfLines={1} style={{ color: colors.textMuted }}>
                  {exercise.estimatedOneRepMaxGrams === null
                    ? `${exercise.workSets} work sets · ${exercise.totalReps} reps`
                    : `Est. 1RM · ${Number(
                        gramsToUnit(exercise.estimatedOneRepMaxGrams, unit).toFixed(1),
                      )} ${unit}`}
                </AppText>
              </View>
              <AppIcon name="chevron-right" color={colors.textMuted} />
            </Pressable>
          ))}
        </Card>
      )}

      <SectionHeader title="Body-weight trend" />
      {weightTrend.length === 0 ? (
        <EmptyState title="No weight trend" message="Record measurements in Nutrition." />
      ) : (
        <Card>
          <MiniLineChart
            values={weightTrend.map((entry) => gramsToUnit(entry.weightGrams, unit))}
            labels={weightTrend.map((entry) => formatShortDate(entry.measuredAt))}
          />
          <AppText style={{ color: colors.textMuted }}>
            Latest: {Number(gramsToUnit(weightTrend.at(-1)?.weightGrams ?? 0, unit).toFixed(2))} {unit}
          </AppText>
        </Card>
      )}
    </Screen>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10 },
  grow: { flex: 1, minWidth: 0 },
  pressed: { opacity: 0.72 },
  kpis: { flexDirection: 'row', gap: 8 },
  kpi: { flex: 1, minWidth: 0, borderWidth: StyleSheet.hairlineWidth, borderRadius: 13, padding: 11, gap: 2 },
  kpiLabel: { fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  kpiValue: { fontSize: 20, lineHeight: 25, fontWeight: '900', fontVariant: ['tabular-nums'] },
  kpiNote: { fontSize: 10 },
  chartCard: { gap: 8 },
  chartHeader: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  chartValue: { fontSize: 24, fontWeight: '900', fontVariant: ['tabular-nums'] },
  overline: { fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  linkButton: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' },
  muscleCard: { overflow: 'hidden', padding: 0, gap: 0 },
  muscleSummary: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  muscleTitle: { fontSize: 21, fontWeight: '900', textTransform: 'capitalize' },
  emptyInset: { padding: 14 },
  detailGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  listCard: { padding: 0, gap: 0, overflow: 'hidden' },
  momentumRow: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rank: { width: 24, fontSize: 13, fontWeight: '900', fontVariant: ['tabular-nums'] },
  title: { fontSize: 15, fontWeight: '800' },
})
