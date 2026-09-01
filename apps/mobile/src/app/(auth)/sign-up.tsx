import { useSignUp } from '@clerk/expo'
import { Redirect, router } from 'expo-router'
import { useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { AppText, Button, Card, Field, Heading, Screen } from '@/components/ui'
import { isClerkConfigured, useAppAuth } from '@/providers/auth-provider'

function ClerkSignUpForm() {
  const { signUp, errors, fetchStatus } = useSignUp()
  const [emailAddress, setEmailAddress] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [verificationSent, setVerificationSent] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const loading = fetchStatus === 'fetching'

  const submit = async () => {
    setMessage(null)
    const { error } = await signUp.password({ emailAddress: emailAddress.trim(), password })
    if (error) return
    await signUp.verifications.sendEmailCode()
    setVerificationSent(true)
  }

  const verify = async () => {
    const { error } = await signUp.verifications.verifyEmailCode({ code })
    if (error) return
    if (signUp.status !== 'complete') {
      setMessage('Your account still has missing requirements in Clerk.')
      return
    }
    await signUp.finalize({
      navigate: async ({ session }) => {
        if (session?.currentTask) {
          setMessage('Complete the remaining Clerk security task before continuing.')
          return
        }
        router.replace('/(tabs)')
      },
    })
  }

  if (verificationSent) {
    return (
      <Card>
        <Heading subtitle={`Enter the code sent to ${emailAddress}.`}>Verify your email</Heading>
        <Field
          label="Verification code"
          value={code}
          keyboardType="number-pad"
          onChangeText={setCode}
          error={errors.fields.code?.message}
        />
        {message ? <AppText style={styles.error}>{message}</AppText> : null}
        <Button title="Verify account" onPress={() => void verify()} loading={loading} disabled={!code} />
        <Button
          title="Send another code"
          variant="ghost"
          onPress={() => void signUp.verifications.sendEmailCode()}
        />
      </Card>
    )
  }

  return (
    <Card>
      <Field
        label="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
        value={emailAddress}
        onChangeText={setEmailAddress}
        error={errors.fields.emailAddress?.message}
      />
      <Field
        label="Password"
        secureTextEntry
        autoComplete="new-password"
        value={password}
        onChangeText={setPassword}
        error={errors.fields.password?.message}
      />
      <View nativeID="clerk-captcha" />
      {message ? <AppText style={styles.error}>{message}</AppText> : null}
      <Button
        title="Create account"
        onPress={() => void submit()}
        loading={loading}
        disabled={!emailAddress.trim() || !password}
      />
      <Button title="Back to sign in" variant="ghost" onPress={() => router.back()} />
    </Card>
  )
}

export default function SignUpScreen() {
  const auth = useAppAuth()
  if (auth.isSignedIn) return <Redirect href="/(tabs)" />
  if (!isClerkConfigured) return <Redirect href="/(auth)/sign-in" />
  return (
    <Screen>
      <View style={styles.centered}>
        <ClerkSignUpForm />
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  centered: { flex: 1, width: '100%', maxWidth: 440, alignSelf: 'center', justifyContent: 'center' },
  error: { color: '#DC2626', fontSize: 13 },
})
