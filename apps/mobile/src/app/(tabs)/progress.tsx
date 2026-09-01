import {
  bodyWeightTrend,
  calculateExerciseInsights,
  calculateMuscleInsights,
  calculateProgressSummary,
  type DateRange,
  formatDuration,
  getMuscleName,
  gramsToUnit,
} from '@track-me/contracts'
import { router } from 'expo-router'
import { useMemo, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { ChipRow, ChoiceChip, MiniLineChart, SectionTitle } from '@/components/controls'
import { MuscleHeatMap } from '@/components/muscle-heat-map'
import { AppText, Button, Card, EmptyState, Field, Heading, Metric, Screen } from '@/components/ui'
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
  const muscle = muscles.find((item) => item.muscleId === selectedMuscle) ?? muscles[0] ?? null
  const activeDays = Object.keys(summary.workoutsByLocalDate).length

  return (
    <Screen>
      <Heading subtitle="Warm-ups and deleted sessions are excluded from performance analytics.">
        Progress
      </Heading>
      <ChipRow>
        {(['7', '30', '90'] as const).map((value) => (
          <ChoiceChip
            key={value}
            label={`${value} days`}
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

      <SectionTitle>Overview</SectionTitle>
      <View style={styles.metrics}>
        <Metric label="Workouts" value={String(summary.workoutCount)} />
        <Metric label="Active time" value={formatDuration(summary.activeSeconds)} />
        <Metric label="Work sets" value={String(summary.workSets)} />
        <Metric label="Reps" value={String(summary.totalReps)} />
        <Metric label="Load volume" value={`${Math.round(summary.volumeKg)} kg`} />
        <Metric label="PRs" value={String(summary.personalRecordCount)} />
        <Metric label="Active days" value={String(activeDays)} />
      </View>

      <SectionTitle>Muscle heat</SectionTitle>
      <MuscleHeatMap
        insights={muscles}
        selectedMuscleId={muscle?.muscleId ?? null}
        onSelect={setSelectedMuscle}
      />
      {muscle === null ? (
        <EmptyState
          title="No muscle activity"
          message="Complete work sets to populate the map. Primary sets count 1.0 and secondary sets count 0.5."
        />
      ) : (
        <Card>
          <AppText style={styles.title}>{getMuscleName(muscle.muscleId)}</AppText>
          <View style={styles.metrics}>
            <Metric label="Weighted sets" value={String(muscle.heatScore)} />
            <Metric label="Attributed volume" value={`${Math.round(muscle.attributedVolumeKg)} kg`} />
            <Metric label="Exercises" value={String(muscle.exerciseIds.length)} />
            <Metric label="PRs" value={String(muscle.recordCount)} />
          </View>
        </Card>
      )}

      <SectionTitle>Exercise insights</SectionTitle>
      {exercises.length === 0 ? (
        <EmptyState
          title="No exercise data"
          message="Insights combine exercise history from both planned and empty workouts."
        />
      ) : (
        exercises.map((exercise) => (
          <Card key={exercise.exerciseId}>
            <View style={styles.row}>
              <View style={styles.grow}>
                <AppText style={styles.title}>{exercise.exerciseName}</AppText>
                <AppText style={{ color: colors.textMuted }}>
                  {exercise.sessions} sessions · {exercise.workSets} sets · {exercise.totalReps} reps
                </AppText>
              </View>
              <Button
                title="Details"
                compact
                variant="secondary"
                onPress={() =>
                  router.push({ pathname: '/exercise/[id]', params: { id: exercise.exerciseId } })
                }
              />
            </View>
            <View style={styles.metrics}>
              <Metric label="Volume" value={`${Math.round(exercise.volumeKg)} kg`} />
              <Metric
                label="Heaviest"
                value={
                  exercise.heaviestWeightGrams === null
                    ? '—'
                    : `${Number(gramsToUnit(exercise.heaviestWeightGrams, unit).toFixed(1))} ${unit}`
                }
              />
              <Metric label="Best reps" value={exercise.maxReps === null ? '—' : String(exercise.maxReps)} />
            </View>
          </Card>
        ))
      )}

      <SectionTitle>Body-weight trend</SectionTitle>
      {weightTrend.length === 0 ? (
        <EmptyState title="No weight trend" message="Record measurements in Calories." />
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
  grow: { flex: 1, minWidth: 130 },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  title: { fontSize: 19, fontWeight: '800' },
})
