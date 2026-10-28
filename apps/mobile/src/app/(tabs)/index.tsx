import {
  calculateActiveSeconds,
  detectPersonalRecords,
  formatDuration,
  gramsToUnit,
  MUSCLE_GROUPS,
  nutritionForLocalDate,
  selectCalorieGoal,
  toLocalDate,
} from '@track-me/contracts'
import { router } from 'expo-router'
import { Pressable, StyleSheet, View } from 'react-native'
import { ProgressBar } from '@/components/controls'
import { AppIcon, PageTitle, ProgressRing, SectionHeader } from '@/components/design'
import { AppText, Button, Card, EmptyState, Screen } from '@/components/ui'
import { startWorkout } from '@/lib/factories'
import { trainingWeekStreak } from '@/lib/home-summary'
import { useAppAuth } from '@/providers/auth-provider'
import { getDeviceId, useData } from '@/providers/data-provider'
import { useAppTheme } from '@/theme/use-theme'

function macro(value: number): string {
  return Number((value / 10).toFixed(1)).toString()
}

export default function HomeScreen() {
  const data = useData()
  const auth = useAppAuth()
  const { colors } = useAppTheme()
  const active = data.workouts.find((workout) => workout.status === 'active') ?? null
  const completed = data.workouts
    .filter((workout) => workout.status === 'completed' && workout.deletedAt === null)
    .sort(
      (left, right) =>
        Date.parse(right.completedAt ?? right.startedAt) - Date.parse(left.completedAt ?? left.startedAt),
    )
  const timezone = data.profile?.timezone ?? 'UTC'
  const today = toLocalDate(new Date().toISOString(), timezone)
  const nutrition = nutritionForLocalDate(data.calorieEntries, today, timezone)
  const goal = selectCalorieGoal(data.calorieGoals, today)
  const suggestedPlan = data.templates[0] ?? null
  const firstName = auth.displayName?.split(' ')[0]
  const unit = data.profile?.weightUnit ?? 'kg'
  const weights = data.bodyWeights
    .filter((entry) => entry.deletedAt === null)
    .slice()
    .sort((a, b) => Date.parse(b.measuredAt) - Date.parse(a.measuredAt))
  const latestWeight = weights[0]
  const previousWeight = weights[1]
  const weightChange =
    latestWeight && previousWeight
      ? gramsToUnit(latestWeight.weightGrams - previousWeight.weightGrams, unit)
      : null
  const streak = trainingWeekStreak(completed, timezone, today)
  const records = detectPersonalRecords(completed)
  const planMuscles = [
    ...new Set(
      suggestedPlan?.exercises
        .map((item) => {
          const muscleId = data.exercises.find((exercise) => exercise.id === item.exerciseId)?.primaryMuscleId
          return MUSCLE_GROUPS.find((muscle) => muscle.id === muscleId)?.name
        })
        .filter(Boolean) ?? [],
    ),
  ].join(', ')

  const beginWorkout = async (templateId: string | null) => {
    if (active !== null) {
      router.push({ pathname: '/workout/[id]', params: { id: active.id } })
      return
    }
    const template = data.templates.find((item) => item.id === templateId) ?? null
    const workout = startWorkout(await getDeviceId(), data.exercises, template)
    await data.save(workout)
    router.push({ pathname: '/workout/[id]', params: { id: workout.id } })
  }

  const startSuggested = () => {
    if (active !== null) {
      void beginWorkout(null)
      return
    }
    if (suggestedPlan === null) {
      void beginWorkout(null)
      return
    }
    void beginWorkout(suggestedPlan.id)
  }

  const calorieGoal = goal?.calories ?? 0

  return (
    <Screen safeBottom={false}>
      <PageTitle
        eyebrow={new Date().toLocaleDateString(undefined, {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          timeZone: timezone,
        })}
        title={firstName ? `Ready to move, ${firstName}?` : 'Ready to move?'}
        accessory={
          <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
            <AppText style={{ color: colors.primaryText, fontWeight: '600' }}>{auth.initials}</AppText>
          </View>
        }
      />

      <Card style={[styles.trainingHero, { backgroundColor: colors.surfaceRaised }]}>
        <View pointerEvents="none" style={styles.heroGlow} />
        <View style={styles.eyebrowRow}>
          <View style={[styles.dot, { backgroundColor: colors.primary }]} />
          <AppText style={[styles.eyebrow, { color: colors.primary }]}>
            {active === null ? "TODAY'S TRAINING" : 'ACTIVE WORKOUT'}
          </AppText>
        </View>
        <AppText style={styles.heroTitle}>
          {active?.name ?? suggestedPlan?.name ?? 'Start with a blank canvas'}
        </AppText>
        <AppText style={styles.heroSubtitle}>
          {active === null
            ? suggestedPlan === null
              ? 'Choose exercises as you train'
              : `${planMuscles ? `${planMuscles} · ` : ''}${suggestedPlan.exercises.length} exercises`
            : `${formatDuration(calculateActiveSeconds(active.timerSegments))} · ${active.exercises.length} exercises`}
        </AppText>
        <View style={styles.actions}>
          <Button
            icon="play-outline"
            title={active === null ? 'Start workout' : 'Resume workout'}
            onPress={startSuggested}
          />
          <Button
            title={active === null ? 'Change' : 'View plans'}
            variant="outline"
            onPress={() => router.push('/(tabs)/workouts')}
          />
        </View>
      </Card>

      <SectionHeader
        title="Today"
        action={
          <Button
            title="View nutrition"
            compact
            variant="ghost"
            onPress={() => router.push('/(tabs)/calories')}
          />
        }
      />
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push('/(tabs)/calories')}
        style={({ pressed }) => [
          styles.nutrition,
          { backgroundColor: colors.surface, borderColor: colors.border },
          pressed && styles.pressed,
        ]}
      >
        <ProgressRing
          value={nutrition.totals.calories}
          max={calorieGoal}
          primary={nutrition.totals.calories.toLocaleString()}
          secondary={`of ${calorieGoal.toLocaleString()} kcal`}
          size={94}
        />
        <View style={styles.macros}>
          <MacroRow
            label="Protein"
            value={nutrition.totals.proteinTenthsGrams}
            goal={goal?.proteinTenthsGrams ?? null}
          />
          <MacroRow
            label="Carbs"
            value={nutrition.totals.carbohydrateTenthsGrams}
            goal={goal?.carbohydrateTenthsGrams ?? null}
          />
          <MacroRow label="Fat" value={nutrition.totals.fatTenthsGrams} goal={goal?.fatTenthsGrams ?? null} />
        </View>
      </Pressable>

      <View style={styles.pairs}>
        <Card style={styles.compactCard}>
          <AppIcon name="fire" size={18} color={colors.primary} />
          <View style={styles.grow}>
            <AppText style={styles.compactValue}>
              {streak} {streak === 1 ? 'week' : 'weeks'}
            </AppText>
            <AppText style={[styles.compactLabel, { color: colors.textMuted }]}>Training streak</AppText>
          </View>
        </Card>
        <Card style={styles.compactCard}>
          <AppIcon name="scale-balance" size={18} color={colors.primary} />
          <View style={styles.grow}>
            <AppText style={styles.compactValue}>
              {latestWeight
                ? `${Number(gramsToUnit(latestWeight.weightGrams, unit).toFixed(1))} ${unit}`
                : 'No weight yet'}
            </AppText>
            <AppText style={[styles.compactLabel, { color: colors.textMuted }]}>
              {weightChange === null
                ? 'Body weight'
                : `${weightChange > 0 ? '+' : ''}${weightChange.toFixed(1)} vs last entry`}
            </AppText>
          </View>
        </Card>
      </View>

      <SectionHeader
        title="Recent training"
        action={
          <Button
            title="See all"
            compact
            variant="ghost"
            onPress={() => router.push({ pathname: '/(tabs)/workouts', params: { tab: 'history' } })}
          />
        }
      />
      {completed.length === 0 ? (
        <EmptyState title="No completed workouts" message="Your first completed session will appear here." />
      ) : (
        completed.slice(0, 3).map((workout) => (
          <Pressable
            key={workout.id}
            accessibilityRole="button"
            onPress={() => router.push({ pathname: '/history/[id]', params: { id: workout.id } })}
            style={({ pressed }) => [
              styles.recent,
              { backgroundColor: colors.surface },
              pressed && styles.pressed,
            ]}
          >
            <AppIcon name="dumbbell" size={18} color={colors.primary} />
            <View style={styles.grow}>
              <AppText style={styles.recentTitle}>{workout.name}</AppText>
              <AppText style={[styles.recentMeta, { color: colors.textMuted }]}>
                {new Date(workout.completedAt ?? workout.startedAt).toLocaleDateString()} ·{' '}
                {Math.round(calculateActiveSeconds(workout.timerSegments) / 60)} min ·{' '}
                {workout.exercises.reduce(
                  (sum, exercise) => sum + exercise.sets.filter((set) => set.status === 'completed').length,
                  0,
                )}{' '}
                sets
              </AppText>
            </View>
            {records.some((record) => record.workoutId === workout.id) ? (
              <AppText style={{ color: colors.primary, fontSize: 12 }}>
                {records.filter((record) => record.workoutId === workout.id).length} PRs
              </AppText>
            ) : null}
            <AppIcon name="chevron-right" color={colors.textMuted} />
          </Pressable>
        ))
      )}
    </Screen>
  )
}

function MacroRow({ label, value, goal }: { label: string; value: number; goal: number | null }) {
  const { colors } = useAppTheme()
  return (
    <View style={styles.macro}>
      <View style={styles.macroLabel}>
        <AppText style={{ color: colors.textMuted, fontSize: 12 }}>{label}</AppText>
        <AppText style={styles.macroValue}>
          {macro(value)} / {goal === null ? '—' : macro(goal)}g
        </AppText>
      </View>
      <ProgressBar value={value} max={goal ?? 1} />
    </View>
  )
}

const styles = StyleSheet.create({
  avatar: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  trainingHero: { overflow: 'hidden', borderWidth: 0, borderRadius: 0, padding: 18, gap: 0, marginTop: 6 },
  heroGlow: {
    position: 'absolute',
    width: 160,
    height: 160,
    right: -75,
    top: -65,
    borderRadius: 80,
    backgroundColor: 'rgba(50,232,117,0.08)',
  },
  heroSubtitle: { color: '#9AB5A3', fontSize: 13, marginTop: 4 },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  eyebrow: { fontSize: 11, fontWeight: '500' },
  heroTitle: { fontSize: 20, fontWeight: '600', letterSpacing: -0.4, marginTop: 12 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 16 },
  grow: { flex: 1, minWidth: 0 },
  nutrition: {
    minHeight: 130,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    padding: 15,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  macros: { flex: 1, gap: 9 },
  macro: { gap: 5 },
  macroLabel: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  macroValue: { fontSize: 12, fontWeight: '800', fontVariant: ['tabular-nums'] },
  pairs: { flexDirection: 'row', gap: 8 },
  compactCard: { flex: 1, flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10, borderWidth: 0 },
  compactValue: { fontSize: 13, fontWeight: '600' },
  compactLabel: { fontSize: 11 },
  recent: {
    minHeight: 60,
    borderRadius: 14,
    padding: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  recentTitle: { fontSize: 13, fontWeight: '600' },
  recentMeta: { fontSize: 11, marginTop: 3 },
  pressed: { opacity: 0.72 },
})
