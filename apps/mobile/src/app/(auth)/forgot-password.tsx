import { useSignIn } from '@clerk/expo'
import { Redirect, router } from 'expo-router'
import { useState } from 'react'
import { StyleSheet } from 'react-native'
import { AppText, Button, Card, Field, Heading, Screen } from '@/components/ui'
import { isClerkConfigured, useAppAuth } from '@/providers/auth-provider'

function ForgotPasswordForm() {
  const { signIn, errors, fetchStatus } = useSignIn()
  const [emailAddress, setEmailAddress] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [codeSent, setCodeSent] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const loading = fetchStatus === 'fetching'

  const sendCode = async () => {
    const created = await signIn.create({ identifier: emailAddress.trim() })
    if (created.error) return
    const sent = await signIn.resetPasswordEmailCode.sendCode()
    if (!sent.error) setCodeSent(true)
  }

  const verify = async () => {
    await signIn.resetPasswordEmailCode.verifyCode({ code })
  }

  const submitPassword = async () => {
    const result = await signIn.resetPasswordEmailCode.submitPassword({
      password,
      signOutOfOtherSessions: true,
    })
    if (result.error) return
    if (signIn.status !== 'complete') {
      setMessage('Password changed, but another Clerk verification step is required.')
      return
    }
    await signIn.finalize({ navigate: async () => router.replace('/(tabs)') })
  }

  if (signIn.status === 'needs_new_password') {
    return (
      <Card>
        <Heading>Choose a new password</Heading>
        <Field
          label="New password"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          error={errors.fields.password?.message}
        />
        <Button title="Set new password" onPress={() => void submitPassword()} loading={loading} />
      </Card>
    )
  }

  if (codeSent) {
    return (
      <Card>
        <Heading subtitle="Check your email for the reset code.">Verify reset</Heading>
        <Field
          label="Reset code"
          keyboardType="number-pad"
          value={code}
          onChangeText={setCode}
          error={errors.fields.code?.message}
        />
        <Button title="Verify code" onPress={() => void verify()} loading={loading} disabled={!code} />
      </Card>
    )
  }

  return (
    <Card>
      <Field
        label="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        value={emailAddress}
        onChangeText={setEmailAddress}
        error={errors.fields.identifier?.message}
      />
      {message ? <AppText style={styles.error}>{message}</AppText> : null}
      <Button title="Send reset code" onPress={() => void sendCode()} loading={loading} />
      <Button title="Back to sign in" variant="ghost" onPress={() => router.back()} />
    </Card>
  )
}

export default function ForgotPasswordScreen() {
  const auth = useAppAuth()
  if (auth.isSignedIn) return <Redirect href="/(tabs)" />
  if (!isClerkConfigured) return <Redirect href="/(auth)/sign-in" />
  return (
    <Screen>
      <Heading>Reset your password</Heading>
      <ForgotPasswordForm />
    </Screen>
  )
}

const styles = StyleSheet.create({ error: { color: '#DC2626', fontSize: 13 } })
