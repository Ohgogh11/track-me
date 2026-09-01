import { useSignIn, useSSO } from '@clerk/expo'
import * as AuthSession from 'expo-auth-session'
import { Redirect, router } from 'expo-router'
import * as WebBrowser from 'expo-web-browser'
import { useEffect, useState } from 'react'
import { Platform, StyleSheet, View } from 'react-native'
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
  const { startSSOFlow } = useSSO()
  const [emailAddress, setEmailAddress] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [message, setMessage] = useState<string | null>(null)
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

  const google = async () => {
    setMessage(null)
    try {
      const result = await startSSOFlow({
        strategy: 'oauth_google',
        redirectUrl: AuthSession.makeRedirectUri({ scheme: 'trackme', path: 'continue' }),
      })
      if (result.createdSessionId && result.setActive) {
        await result.setActive({ session: result.createdSessionId })
        router.replace('/(tabs)')
      } else {
        setMessage(
          'Google sign-in needs another Clerk verification step. Check the Clerk dashboard configuration.',
        )
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Google sign-in failed')
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
    <Card>
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
        disabled={!emailAddress.trim() || !password}
      />
      <Button
        title="Continue with Google"
        variant="secondary"
        onPress={() => void google()}
        loading={loading}
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
    <Card>
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
    <Screen>
      <View style={styles.centered}>{isClerkConfigured ? <ClerkSignInForm /> : <DemoSignIn />}</View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  centered: { flex: 1, width: '100%', maxWidth: 440, alignSelf: 'center', justifyContent: 'center' },
  links: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 },
  error: { color: '#DC2626', fontSize: 13 },
})
