import * as Haptics from 'expo-haptics'
import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
})

export async function configureRestNotifications(): Promise<void> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('rest-timers', {
      name: 'Rest timers',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 150, 250],
    })
  }
}

export async function scheduleRestTimer(seconds: number, setId: string): Promise<string | null> {
  if (seconds <= 0) return null
  await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
  const permission = await Notifications.getPermissionsAsync()
  const status =
    permission.status === 'granted'
      ? permission.status
      : (await Notifications.requestPermissionsAsync()).status
  if (status !== 'granted') return null
  return Notifications.scheduleNotificationAsync({
    content: {
      title: 'Rest complete',
      body: 'Your next set is ready.',
      sound: true,
      data: { kind: 'rest-timer', setId },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds,
      repeats: false,
      ...(Platform.OS === 'android' ? { channelId: 'rest-timers' } : {}),
    },
  })
}

export async function cancelRestTimer(notificationId: string | null): Promise<void> {
  if (notificationId !== null) await Notifications.cancelScheduledNotificationAsync(notificationId)
}

export async function findScheduledRestTimer(setId: string): Promise<string | null> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync()
  return scheduled.find((notification) => notification.content.data?.setId === setId)?.identifier ?? null
}
