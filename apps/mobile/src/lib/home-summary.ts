import { toLocalDate, type WorkoutSession } from '@track-me/contracts'

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

function monday(localDate: string): number {
  const date = new Date(`${localDate}T00:00:00Z`)
  return date.getTime() - ((date.getUTCDay() + 6) % 7) * 24 * 60 * 60 * 1000
}

/** Consecutive calendar weeks with a completed session; the current week may still be in progress. */
export function trainingWeekStreak(
  workouts: readonly WorkoutSession[],
  timezone: string,
  today: string,
): number {
  const trainedWeeks = new Set(
    workouts
      .filter((workout) => workout.status === 'completed' && workout.deletedAt === null)
      .map((workout) => monday(toLocalDate(workout.completedAt ?? workout.startedAt, timezone))),
  )
  let week = monday(today)
  if (!trainedWeeks.has(week)) week -= WEEK_MS
  let count = 0
  while (trainedWeeks.has(week)) {
    count += 1
    week -= WEEK_MS
  }
  return count
}
