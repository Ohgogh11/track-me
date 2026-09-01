import { Redirect } from 'expo-router'
import { ActivityIndicator, View } from 'react-native'
import { useAppAuth } from '@/providers/auth-provider'
import { useData } from '@/providers/data-provider'
import { useAppTheme } from '@/theme/use-theme'

export default function Index() {
  const auth = useAppAuth()
  const data = useData()
  const { colors } = useAppTheme()
  if (!auth.isLoaded || (auth.isSignedIn && !data.ready)) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.background,
        }}
      >
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }
  return <Redirect href={auth.isSignedIn ? '/(tabs)' : '/(auth)/sign-in'} />
}
