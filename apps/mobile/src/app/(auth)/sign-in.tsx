import { useSignIn } from '@clerk/expo'
import { useHostedAuth } from '@clerk/expo/hosted-auth'
import { Redirect, router } from 'expo-router'
import * as WebBrowser from 'expo-web-browser'
import { useEffect, useState } from 'react'
import { Platform, StyleSheet, View } from 'react-native'
import { AuthFrame } from '@/components/design'
import { AppText, Button, Card, Field, Heading, Screen } from '@/components/ui'
import { isClerkConfigured, useAppAuth } from '@/providers/auth-provider'

WebBrowser.maybeCompleteAuthSession()

function useWarmBrowser(): void {
  useEffect(() => {
    if (Platform.OS !== 'android') return
    void WebBrowser.warmUpAsync()
    return () => {
      void WebBrowser.coolDownAsync()
    }
  }, [])
}

function ClerkSignInForm() {
  useWarmBrowser()
  const { signIn, errors, fetchStatus } = useSignIn()
  const { startHostedAuth } = useHostedAuth()
  const [emailAddress, setEmailAddress] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [hostedAuthLoading, setHostedAuthLoading] = useState(false)
  const loading = fetchStatus === 'fetching'

  const finish = async () => {
    if (signIn.status !== 'complete') return
    await signIn.finalize({
      navigate: async ({ session }) => {
        if (session?.currentTask) {
          setMessage(
            'Your Clerk account has an unfinished security task. Complete it in Clerk Account Portal.',
          )
          return
        }
        router.replace('/(tabs)')
      },
    })
  }

  const submit = async () => {
    setMessage(null)
    const { error } = await signIn.password({ emailAddress: emailAddress.trim(), password })
    if (error) return
    if (signIn.status === 'needs_client_trust') {
      const emailFactor = signIn.supportedSecondFactors.find((factor) => factor.strategy === 'email_code')
      if (emailFactor) await signIn.mfa.sendEmailCode()
      return
    }
    if (signIn.status === 'needs_second_factor') {
      setMessage('This account requires a second factor that is not enabled in this personal-app flow.')
      return
    }
    await finish()
  }

  const verifyDevice = async () => {
    await signIn.mfa.verifyEmailCode({ code })
    await finish()
  }

  const openHostedSignIn = async () => {
    setMessage(null)
    setHostedAuthLoading(true)
    try {
      const result = await startHostedAuth({ mode: 'sign-in' })
      if (result.createdSessionId) {
        router.replace('/(tabs)')
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Browser sign-in failed')
    } finally {
      setHostedAuthLoading(false)
    }
  }

  if (signIn.status === 'needs_client_trust') {
    return (
      <Card>
        <Heading subtitle="Clerk sent an email code to trust this device.">Verify this device</Heading>
        <Field label="Verification code" value={code} keyboardType="number-pad" onChangeText={setCode} />
        <Button title="Verify and sign in" onPress={() => void verifyDevice()} loading={loading} />
        <Button title="Start over" variant="ghost" onPress={() => signIn.reset()} />
      </Card>
    )
  }

  return (
    <Card style={styles.authCard}>
      <View style={styles.welcome}>
        <AppText style={styles.title}>Welcome back.</AppText>
        <AppText style={styles.subtitle}>Sign in to continue training.</AppText>
      </View>
      <Field
        label="Email"
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        value={emailAddress}
        onChangeText={setEmailAddress}
        error={errors.fields.identifier?.message}
      />
      <Field
        label="Password"
        secureTextEntry
        autoComplete="current-password"
        value={password}
        onChangeText={setPassword}
        error={errors.fields.password?.message}
      />
      {message ? <AppText style={styles.error}>{message}</AppText> : null}
      <Button
        title="Sign in"
        onPress={() => void submit()}
        loading={loading}
        disabled={!emailAddress.trim() || !password || hostedAuthLoading}
      />
      <AppText style={styles.separator}>or</AppText>
      <Button
        title="Continue in browser"
        variant="outline"
        icon="web"
        onPress={() => void openHostedSignIn()}
        loading={hostedAuthLoading}
        disabled={loading}
      />
      <View style={styles.links}>
        <Button
          title="Create account"
          compact
          variant="ghost"
          onPress={() => router.push('/(auth)/sign-up')}
        />
        <Button
          title="Forgot password"
          compact
          variant="ghost"
          onPress={() => router.push('/(auth)/forgot-password')}
        />
      </View>
    </Card>
  )
}

function DemoSignIn() {
  const auth = useAppAuth()
  return (
    <Card style={styles.authCard}>
      <View style={styles.welcome}>
        <AppText style={styles.title}>Welcome back.</AppText>
        <AppText style={styles.subtitle}>Continue in local demo mode.</AppText>
      </View>
      <AppText>
        Clerk is not configured yet. Demo mode keeps everything on this phone and uses the development-only
        API token.
      </AppText>
      <Button title="Continue in demo mode" onPress={() => void auth.signInDemo()} />
    </Card>
  )
}

export default function SignInScreen() {
  const auth = useAppAuth()
  if (auth.isSignedIn) return <Redirect href="/(tabs)" />
  return (
    <Screen safeTop contentStyle={styles.screen}>
      <AuthFrame>{isClerkConfigured ? <ClerkSignInForm /> : <DemoSignIn />}</AuthFrame>
    </Screen>
  )
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 24, paddingBottom: 18 },
  authCard: { padding: 0, borderWidth: 0, backgroundColor: 'transparent', gap: 14 },
  welcome: { alignItems: 'center', gap: 4, marginBottom: 8 },
  title: { fontSize: 24, fontWeight: '600', letterSpacing: -0.7 },
  separator: { color: '#9AB5A3', textAlign: 'center' },
  subtitle: { color: '#9AB5A3' },
  links: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 },
  error: { color: '#FF5C5C', fontSize: 13 },
})
