import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { Redirect, Tabs } from 'expo-router'
import type { ComponentProps } from 'react'
import { useAppAuth } from '@/providers/auth-provider'
import { useAppTheme } from '@/theme/use-theme'

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name']

const HOME_ICON: { active: IconName; inactive: IconName } = {
  active: 'home-variant',
  inactive: 'home-variant-outline',
}

const icons: Record<string, { active: IconName; inactive: IconName }> = {
  index: HOME_ICON,
  workouts: { active: 'arm-flex', inactive: 'arm-flex-outline' },
  progress: { active: 'chart-line', inactive: 'chart-line' },
  calories: { active: 'food-apple', inactive: 'food-apple-outline' },
  settings: { active: 'cog', inactive: 'cog-outline' },
}

export default function TabsLayout() {
  const auth = useAppAuth()
  const { colors } = useAppTheme()
  if (!auth.isSignedIn) return <Redirect href="/(auth)/sign-in" />
  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: '#7D8580',
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border, height: 62 },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600', paddingBottom: 5 },
        tabBarIcon: ({ color, focused, size }) => {
          const icon = icons[route.name] ?? HOME_ICON
          return (
            <MaterialCommunityIcons name={focused ? icon.active : icon.inactive} color={color} size={size} />
          )
        },
      })}
    >
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="workouts" options={{ title: 'Workouts' }} />
      <Tabs.Screen name="progress" options={{ title: 'Progress' }} />
      <Tabs.Screen name="calories" options={{ title: 'Nutrition' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
    </Tabs>
  )
}
