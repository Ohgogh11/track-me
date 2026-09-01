import type {
  BodyWeightEntry,
  CalorieEntry,
  CalorieGoal,
  CompletedSet,
  DateRange,
  ExerciseInsight,
  LocalDate,
  MuscleInsight,
  NutritionTotals,
  PersonalRecord,
  ProgressSummary,
  SetPerformance,
  TimerSegment,
  WeightUnit,
  WorkoutExercise,
  WorkoutSession,
} from './domain'
import { sumNutrition } from './nutrition'

const POUNDS_PER_KILOGRAM = 2.2046226218

export function kilogramsToGrams(kilograms: number): number {
  return Math.round(kilograms * 1_000)
}

export function poundsToGrams(pounds: number): number {
  return Math.round((pounds / POUNDS_PER_KILOGRAM) * 1_000)
}

export function gramsToUnit(grams: number, unit: WeightUnit): number {
  const kilograms = grams / 1_000
  return unit === 'kg' ? kilograms : kilograms * POUNDS_PER_KILOGRAM
}

export function unitToGrams(value: number, unit: WeightUnit): number {
  return unit === 'kg' ? kilogramsToGrams(value) : poundsToGrams(value)
}

export function estimateOneRepMaxGrams(weightGrams: number | null, reps: number | null): number | null {
  if (weightGrams === null || reps === null || weightGrams <= 0 || reps < 1 || reps > 12) return null
  return Math.round(weightGrams * (1 + reps / 30))
}

export function setPerformances(set: CompletedSet): readonly SetPerformance[] {
  if (set.sideResults !== undefined && set.sideResults !== null) {
    return [set.sideResults.left, set.sideResults.right]
  }
  return [
    {
      actualReps: set.actualReps,
      actualWeightGrams: set.actualWeightGrams,
      actualRpeTenths: set.actualRpeTenths,
    },
  ]
}

export function setTotalReps(set: CompletedSet): number {
  return setPerformances(set).reduce((total, result) => total + (result.actualReps ?? 0), 0)
}

export function setHeaviestWeightGrams(set: CompletedSet): number | null {
  const weights = setPerformances(set).flatMap((result) =>
    result.actualWeightGrams === null ? [] : [result.actualWeightGrams],
  )
  return weights.length === 0 ? null : Math.max(...weights)
}

export function setMaxReps(set: CompletedSet): number | null {
  const reps = setPerformances(set).flatMap((result) =>
    result.actualReps === null ? [] : [result.actualReps],
  )
  return reps.length === 0 ? null : Math.max(...reps)
}

export function setBestEstimatedOneRepMaxGrams(set: CompletedSet): number | null {
  const estimates = setPerformances(set).flatMap((result) => {
    const estimate = estimateOneRepMaxGrams(result.actualWeightGrams, result.actualReps)
    return estimate === null ? [] : [estimate]
  })
  return estimates.length === 0 ? null : Math.max(...estimates)
}

export function setVolumeKg(set: CompletedSet): number {
  if (set.status !== 'completed') return 0
  return setPerformances(set).reduce(
    (total, result) =>
      total +
      (result.actualWeightGrams === null || result.actualReps === null
        ? 0
        : (result.actualWeightGrams / 1_000) * result.actualReps),
    0,
  )
}

export function isEligibleWorkSet(set: CompletedSet): boolean {
  return set.type === 'work' && set.status === 'completed' && set.completedAt !== null
}

export function calculateActiveSeconds(segments: readonly TimerSegment[], now = new Date()): number {
  const nowMs = now.getTime()
  const milliseconds = segments.reduce((total, segment) => {
    const startMs = Date.parse(segment.startedAt)
    const endMs = segment.endedAt === null ? nowMs : Date.parse(segment.endedAt)
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return total
    return total + (endMs - startMs)
  }, 0)
  return Math.floor(milliseconds / 1_000)
}

export function toLocalDate(isoDateTime: string, timezone: string): LocalDate {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(isoDateTime))
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

function workoutInstant(workout: WorkoutSession): string {
  return workout.completedAt ?? workout.startedAt
}

function isWithinRange(instant: string, range: DateRange): boolean {
  const value = Date.parse(instant)
  return value >= Date.parse(range.from) && value <= Date.parse(range.to)
}

export function completedWorkouts(
  workouts: readonly WorkoutSession[],
  range: DateRange | null = null,
): WorkoutSession[] {
  return workouts
    .filter(
      (workout) =>
        workout.deletedAt === null &&
        workout.status === 'completed' &&
        workout.completedAt !== null &&
        (range === null || isWithinRange(workoutInstant(workout), range)),
    )
    .sort((left, right) => Date.parse(workoutInstant(left)) - Date.parse(workoutInstant(right)))
}

interface SessionExerciseMetrics {
  heaviestWeightGrams: number | null
  maxReps: number | null
  estimatedOneRepMaxGrams: number | null
  sessionVolumeKg: number
  heaviestSetId: string | null
  maxRepSetId: string | null
  estimatedOneRepMaxSetId: string | null
}

function getExerciseMetrics(exercise: WorkoutExercise): SessionExerciseMetrics {
  const sets = exercise.sets.filter(isEligibleWorkSet)
  let heaviestWeightGrams: number | null = null
  let maxReps: number | null = null
  let estimatedOneRepMaxGrams: number | null = null
  let heaviestSetId: string | null = null
  let maxRepSetId: string | null = null
  let estimatedOneRepMaxSetId: string | null = null

  for (const set of sets) {
    const setWeight = setHeaviestWeightGrams(set)
    const setReps = setMaxReps(set)
    if (setWeight !== null && (heaviestWeightGrams === null || setWeight > heaviestWeightGrams)) {
      heaviestWeightGrams = setWeight
      heaviestSetId = set.id
    }
    if (setReps !== null && (maxReps === null || setReps > maxReps)) {
      maxReps = setReps
      maxRepSetId = set.id
    }
    const estimated = setBestEstimatedOneRepMaxGrams(set)
    if (estimated !== null && (estimatedOneRepMaxGrams === null || estimated > estimatedOneRepMaxGrams)) {
      estimatedOneRepMaxGrams = estimated
      estimatedOneRepMaxSetId = set.id
    }
  }

  return {
    heaviestWeightGrams,
    maxReps,
    estimatedOneRepMaxGrams,
    sessionVolumeKg: sets.reduce((total, set) => total + setVolumeKg(set), 0),
    heaviestSetId,
    maxRepSetId,
    estimatedOneRepMaxSetId,
  }
}

export function detectPersonalRecords(workouts: readonly WorkoutSession[]): PersonalRecord[] {
  const records: PersonalRecord[] = []
  const best = new Map<
    string,
    { heaviest: number; maxReps: number; estimated: number; sessionVolume: number }
  >()

  for (const workout of completedWorkouts(workouts)) {
    for (const exercise of workout.exercises) {
      const metrics = getExerciseMetrics(exercise)
      const previous = best.get(exercise.exerciseId) ?? {
        heaviest: 0,
        maxReps: 0,
        estimated: 0,
        sessionVolume: 0,
      }
      const achievedAt = workout.completedAt ?? workout.startedAt
      if (metrics.heaviestWeightGrams !== null && metrics.heaviestWeightGrams > previous.heaviest) {
        records.push({
          workoutId: workout.id,
          exerciseId: exercise.exerciseId,
          setId: metrics.heaviestSetId,
          achievedAt,
          type: 'heaviest_weight',
          value: metrics.heaviestWeightGrams,
        })
        previous.heaviest = metrics.heaviestWeightGrams
      }
      if (metrics.maxReps !== null && metrics.maxReps > previous.maxReps) {
        records.push({
          workoutId: workout.id,
          exerciseId: exercise.exerciseId,
          setId: metrics.maxRepSetId,
          achievedAt,
          type: 'max_reps',
          value: metrics.maxReps,
        })
        previous.maxReps = metrics.maxReps
      }
      if (metrics.estimatedOneRepMaxGrams !== null && metrics.estimatedOneRepMaxGrams > previous.estimated) {
        records.push({
          workoutId: workout.id,
          exerciseId: exercise.exerciseId,
          setId: metrics.estimatedOneRepMaxSetId,
          achievedAt,
          type: 'estimated_one_rep_max',
          value: metrics.estimatedOneRepMaxGrams,
        })
        previous.estimated = metrics.estimatedOneRepMaxGrams
      }
      if (metrics.sessionVolumeKg > previous.sessionVolume) {
        records.push({
          workoutId: workout.id,
          exerciseId: exercise.exerciseId,
          setId: null,
          achievedAt,
          type: 'session_volume',
          value: metrics.sessionVolumeKg,
        })
        previous.sessionVolume = metrics.sessionVolumeKg
      }
      best.set(exercise.exerciseId, previous)
    }
  }
  return records
}

export function calculateExerciseInsights(
  workouts: readonly WorkoutSession[],
  range: DateRange,
): ExerciseInsight[] {
  const selected = completedWorkouts(workouts, range)
  const allRecords = detectPersonalRecords(workouts).filter((record) =>
    isWithinRange(record.achievedAt, range),
  )
  const insights = new Map<string, ExerciseInsight>()

  for (const workout of selected) {
    for (const exercise of workout.exercises) {
      const workSets = exercise.sets.filter(isEligibleWorkSet)
      if (workSets.length === 0) continue
      const metrics = getExerciseMetrics(exercise)
      const current = insights.get(exercise.exerciseId) ?? {
        exerciseId: exercise.exerciseId,
        exerciseName: exercise.exerciseName,
        sessions: 0,
        workSets: 0,
        totalReps: 0,
        volumeKg: 0,
        heaviestWeightGrams: null,
        maxReps: null,
        estimatedOneRepMaxGrams: null,
        records: [],
      }
      current.sessions += 1
      current.workSets += workSets.length
      current.totalReps += workSets.reduce((total, set) => total + setTotalReps(set), 0)
      current.volumeKg += metrics.sessionVolumeKg
      current.heaviestWeightGrams = maxNullable(current.heaviestWeightGrams, metrics.heaviestWeightGrams)
      current.maxReps = maxNullable(current.maxReps, metrics.maxReps)
      current.estimatedOneRepMaxGrams = maxNullable(
        current.estimatedOneRepMaxGrams,
        metrics.estimatedOneRepMaxGrams,
      )
      current.records = allRecords.filter((record) => record.exerciseId === exercise.exerciseId)
      insights.set(exercise.exerciseId, current)
    }
  }

  return [...insights.values()].sort((left, right) => right.volumeKg - left.volumeKg)
}

function maxNullable(left: number | null, right: number | null): number | null {
  if (left === null) return right
  if (right === null) return left
  return Math.max(left, right)
}

export function calculateMuscleInsights(
  workouts: readonly WorkoutSession[],
  range: DateRange,
): MuscleInsight[] {
  const selected = completedWorkouts(workouts, range)
  const records = detectPersonalRecords(workouts).filter((record) => isWithinRange(record.achievedAt, range))
  const insights = new Map<string, MuscleInsight>()

  const updateMuscle = (muscleId: string, exerciseId: string, primary: boolean, volumeKg: number): void => {
    const current = insights.get(muscleId) ?? {
      muscleId,
      heatScore: 0,
      primarySets: 0,
      secondarySets: 0,
      attributedVolumeKg: 0,
      exerciseIds: [],
      recordCount: 0,
    }
    const weight = primary ? 1 : 0.5
    current.heatScore += weight
    current.attributedVolumeKg += volumeKg * weight
    if (primary) current.primarySets += 1
    else current.secondarySets += 1
    if (!current.exerciseIds.includes(exerciseId)) current.exerciseIds.push(exerciseId)
    insights.set(muscleId, current)
  }

  for (const workout of selected) {
    for (const exercise of workout.exercises) {
      for (const set of exercise.sets.filter(isEligibleWorkSet)) {
        const volume = setVolumeKg(set)
        updateMuscle(exercise.primaryMuscleId, exercise.exerciseId, true, volume)
        for (const secondary of exercise.secondaryMuscleIds) {
          updateMuscle(secondary, exercise.exerciseId, false, volume)
        }
      }
    }
  }

  for (const insight of insights.values()) {
    insight.recordCount = records.filter((record) => insight.exerciseIds.includes(record.exerciseId)).length
  }
  return [...insights.values()].sort((left, right) => right.heatScore - left.heatScore)
}

export function calculateProgressSummary(
  workouts: readonly WorkoutSession[],
  range: DateRange,
  timezone: string,
): ProgressSummary {
  const selected = completedWorkouts(workouts, range)
  const records = detectPersonalRecords(workouts).filter((record) => isWithinRange(record.achievedAt, range))
  const summary: ProgressSummary = {
    workoutCount: selected.length,
    activeSeconds: 0,
    workSets: 0,
    totalReps: 0,
    volumeKg: 0,
    personalRecordCount: records.length,
    workoutsByLocalDate: {},
  }

  for (const workout of selected) {
    summary.activeSeconds += calculateActiveSeconds(
      workout.timerSegments,
      new Date(workout.completedAt ?? workout.startedAt),
    )
    const localDate = toLocalDate(workout.completedAt ?? workout.startedAt, timezone)
    summary.workoutsByLocalDate[localDate] = (summary.workoutsByLocalDate[localDate] ?? 0) + 1
    for (const exercise of workout.exercises) {
      const sets = exercise.sets.filter(isEligibleWorkSet)
      summary.workSets += sets.length
      summary.totalReps += sets.reduce((total, set) => total + setTotalReps(set), 0)
      summary.volumeKg += sets.reduce((total, set) => total + setVolumeKg(set), 0)
    }
  }
  return summary
}

export function selectCalorieGoal(goals: readonly CalorieGoal[], localDate: LocalDate): CalorieGoal | null {
  return (
    goals
      .filter((goal) => goal.deletedAt === null && goal.effectiveFrom <= localDate)
      .sort((left, right) => right.effectiveFrom.localeCompare(left.effectiveFrom))[0] ?? null
  )
}

export function caloriesForLocalDate(
  entries: readonly CalorieEntry[],
  localDate: LocalDate,
  timezone: string,
): { entries: CalorieEntry[]; total: number } {
  const day = nutritionForLocalDate(entries, localDate, timezone)
  return { entries: day.entries, total: day.totals.calories }
}

export function nutritionForLocalDate(
  entries: readonly CalorieEntry[],
  localDate: LocalDate,
  timezone: string,
): { entries: CalorieEntry[]; totals: NutritionTotals } {
  const selected = entries
    .filter((entry) => entry.deletedAt === null && toLocalDate(entry.eatenAt, timezone) === localDate)
    .sort((left, right) => Date.parse(right.eatenAt) - Date.parse(left.eatenAt))
  return { entries: selected, totals: sumNutrition(selected) }
}

export function bodyWeightTrend(entries: readonly BodyWeightEntry[], range: DateRange): BodyWeightEntry[] {
  return entries
    .filter((entry) => entry.deletedAt === null && isWithinRange(entry.measuredAt, range))
    .sort((left, right) => Date.parse(left.measuredAt) - Date.parse(right.measuredAt))
}

export function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3_600)
  const minutes = Math.floor((totalSeconds % 3_600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}
