import {
  calculateActiveSeconds,
  caloriesForLocalDate,
  formatDuration,
  selectCalorieGoal,
} from '@track-me/contracts'
import { router } from 'expo-router'
import { Alert, StyleSheet, View } from 'react-native'
import { AppText, Button, Card, EmptyState, Heading, Metric, Screen } from '@/components/ui'
import { localDateToday } from '@/lib/date'
import { startWorkout } from '@/lib/factories'
import { getDeviceId, useData } from '@/providers/data-provider'
import { useAppTheme } from '@/theme/use-theme'

export default function HomeScreen() {
  const data = useData()
  const { colors } = useAppTheme()
  const active = data.workouts.find((workout) => workout.status === 'active') ?? null
  const completed = data.workouts.filter(
    (workout) => workout.status === 'completed' && workout.deletedAt === null,
  )
  const today = localDateToday()
  const timezone = data.profile?.timezone ?? 'UTC'
  const calories = caloriesForLocalDate(data.calorieEntries, today, timezone)
  const goal = selectCalorieGoal(data.calorieGoals, today)?.calories ?? 0

  const beginEmpty = async () => {
    if (active !== null) {
      Alert.alert('Workout already active', 'Resume it before starting another workout.')
      return
    }
    const workout = startWorkout(await getDeviceId(), data.exercises, null)
    await data.save(workout)
    router.push({ pathname: '/workout/[id]', params: { id: workout.id } })
  }

  return (
    <Screen>
      <Heading subtitle="Offline-ready training and nutrition, in one place.">Today</Heading>
      {active === null ? (
        <Card>
          <AppText style={styles.cardTitle}>Ready to train?</AppText>
          <Button title="Start empty workout" onPress={() => void beginEmpty()} />
          <Button
            title="Choose a workout plan"
            variant="secondary"
            onPress={() => router.push('/(tabs)/workouts')}
          />
        </Card>
      ) : (
        <Card style={{ borderColor: colors.primary }}>
          <AppText style={styles.cardTitle}>{active.name}</AppText>
          <AppText style={{ color: colors.textMuted }}>
            Active for {formatDuration(calculateActiveSeconds(active.timerSegments))} ·{' '}
            {active.exercises.length} exercises
          </AppText>
          <Button
            title="Resume workout"
            onPress={() => router.push({ pathname: '/workout/[id]', params: { id: active.id } })}
          />
        </Card>
      )}

      <AppText style={styles.section}>Daily calories</AppText>
      <View style={styles.metrics}>
        <Metric label="Consumed" value={`${calories.total}`} />
        <Metric label="Remaining" value={`${Math.max(0, goal - calories.total)}`} />
        <Metric label="Goal" value={`${goal}`} />
      </View>
      <Button title="Log food" variant="secondary" onPress={() => router.push('/(tabs)/calories')} />

      <AppText style={styles.section}>Recent workouts</AppText>
      {completed.length === 0 ? (
        <EmptyState title="No completed workouts" message="Your first completed session will appear here." />
      ) : (
        completed.slice(0, 4).map((workout) => (
          <Card key={workout.id}>
            <View style={styles.row}>
              <View style={styles.grow}>
                <AppText style={styles.cardTitle}>{workout.name}</AppText>
                <AppText style={{ color: colors.textMuted }}>
                  {new Date(workout.completedAt ?? workout.startedAt).toLocaleString()}
                </AppText>
              </View>
              <Button
                title="View"
                compact
                variant="ghost"
                onPress={() => router.push({ pathname: '/history/[id]', params: { id: workout.id } })}
              />
            </View>
          </Card>
        ))
      )}
    </Screen>
  )
}

const styles = StyleSheet.create({
  cardTitle: { fontSize: 19, fontWeight: '800' },
  section: { fontSize: 21, fontWeight: '800', marginTop: 4 },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  grow: { flex: 1, gap: 3 },
})
