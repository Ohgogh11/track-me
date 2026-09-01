import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useEffect } from 'react'
import { ActivityIndicator, View } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { configureRestNotifications } from '@/lib/rest-timer'
import { AppAuthProvider, useAppAuth } from '@/providers/auth-provider'
import { DataProvider } from '@/providers/data-provider'
import { useAppTheme } from '@/theme/use-theme'

function AppNavigation() {
  const auth = useAppAuth()
  const { colors, dark } = useAppTheme()

  if (!auth.isLoaded) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.background,
        }}
      >
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    )
  }
  return (
    <DataProvider>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.text,
          contentStyle: { backgroundColor: colors.background },
          headerBackTitle: 'Back',
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="template/[id]" options={{ title: 'Workout plan' }} />
        <Stack.Screen name="workout/[id]" options={{ title: 'Active workout', gestureEnabled: false }} />
        <Stack.Screen name="history/[id]" options={{ title: 'Workout details' }} />
        <Stack.Screen name="exercise/[id]" options={{ title: 'Exercise details' }} />
      </Stack>
    </DataProvider>
  )
}

export default function RootLayout() {
  useEffect(() => {
    void configureRestNotifications()
  }, [])
  return (
    <SafeAreaProvider>
      <AppAuthProvider>
        <AppNavigation />
      </AppAuthProvider>
    </SafeAreaProvider>
  )
}
