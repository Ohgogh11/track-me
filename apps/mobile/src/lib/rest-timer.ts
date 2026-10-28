import * as Haptics from 'expo-haptics'
// Local-only imports avoid the barrel's remote-push registration side effect in Expo Go.
import cancelScheduledNotificationAsync from 'expo-notifications/build/cancelScheduledNotificationAsync'
import getAllScheduledNotificationsAsync from 'expo-notifications/build/getAllScheduledNotificationsAsync'
import { AndroidImportance } from 'expo-notifications/build/NotificationChannelManager.types'
import {
  getPermissionsAsync,
  requestPermissionsAsync,
} from 'expo-notifications/build/NotificationPermissions'
import { SchedulableTriggerInputTypes } from 'expo-notifications/build/Notifications.types'
import { setNotificationHandler } from 'expo-notifications/build/NotificationsHandler'
import scheduleNotificationAsync from 'expo-notifications/build/scheduleNotificationAsync'
import setNotificationChannelAsync from 'expo-notifications/build/setNotificationChannelAsync'
import { Platform } from 'react-native'

setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
})

export async function configureRestNotifications(): Promise<void> {
  if (Platform.OS === 'android') {
    await setNotificationChannelAsync('rest-timers', {
      name: 'Rest timers',
      importance: AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 150, 250],
    })
  }
}

export async function scheduleRestTimer(seconds: number, setId: string): Promise<string | null> {
  if (seconds <= 0) return null
  await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
  const permission = await getPermissionsAsync()
  const status =
    permission.status === 'granted' ? permission.status : (await requestPermissionsAsync()).status
  if (status !== 'granted') return null
  return scheduleNotificationAsync({
    content: {
      title: 'Rest complete',
      body: 'Your next set is ready.',
      sound: true,
      data: { kind: 'rest-timer', setId },
    },
    trigger: {
      type: SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds,
      repeats: false,
      ...(Platform.OS === 'android' ? { channelId: 'rest-timers' } : {}),
    },
  })
}

export async function cancelRestTimer(notificationId: string | null): Promise<void> {
  if (notificationId === null) return
  await cancelScheduledNotificationAsync(notificationId)
}

export async function findScheduledRestTimer(setId: string): Promise<string | null> {
  const scheduled = await getAllScheduledNotificationsAsync()
  return scheduled.find((notification) => notification.content.data?.setId === setId)?.identifier ?? null
}
