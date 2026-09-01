import { ClerkProvider, useClerk, useAuth as useClerkAuth } from '@clerk/expo'
import { tokenCache } from '@clerk/expo/token-cache'
import * as SecureStore from 'expo-secure-store'
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'

interface AppAuthContextValue {
  clerkEnabled: boolean
  isLoaded: boolean
  isSignedIn: boolean
  userId: string | null
  getToken: () => Promise<string>
  signOut: () => Promise<void>
  signInDemo: () => Promise<void>
}

const AppAuthContext = createContext<AppAuthContextValue | null>(null)
const clerkPublishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim() ?? ''

function ClerkBridge({ children }: PropsWithChildren) {
  const { isLoaded, isSignedIn, userId, getToken } = useClerkAuth()
  const clerk = useClerk()
  const value = useMemo<AppAuthContextValue>(
    () => ({
      clerkEnabled: true,
      isLoaded,
      isSignedIn: isSignedIn === true,
      userId: userId ?? null,
      getToken: async () => {
        const token = await getToken()
        if (token === null) throw new Error('Clerk did not return a session token')
        return token
      },
      signOut: async () => clerk.signOut(),
      signInDemo: async () => undefined,
    }),
    [clerk, getToken, isLoaded, isSignedIn, userId],
  )
  return <AppAuthContext.Provider value={value}>{children}</AppAuthContext.Provider>
}

function DemoAuthProvider({ children }: PropsWithChildren) {
  const [loaded, setLoaded] = useState(false)
  const [signedIn, setSignedIn] = useState(false)

  useEffect(() => {
    SecureStore.getItemAsync('track-me-demo-signed-in')
      .then((value) => setSignedIn(value === 'true'))
      .finally(() => setLoaded(true))
  }, [])

  const signInDemo = useCallback(async () => {
    await SecureStore.setItemAsync('track-me-demo-signed-in', 'true')
    setSignedIn(true)
  }, [])
  const signOut = useCallback(async () => {
    await SecureStore.deleteItemAsync('track-me-demo-signed-in')
    setSignedIn(false)
  }, [])
  const value = useMemo<AppAuthContextValue>(
    () => ({
      clerkEnabled: false,
      isLoaded: loaded,
      isSignedIn: signedIn,
      userId: signedIn ? 'demo:iphone' : null,
      getToken: async () => 'demo:iphone',
      signOut,
      signInDemo,
    }),
    [loaded, signInDemo, signOut, signedIn],
  )
  return <AppAuthContext.Provider value={value}>{children}</AppAuthContext.Provider>
}

export function AppAuthProvider({ children }: PropsWithChildren) {
  if (clerkPublishableKey.length === 0) return <DemoAuthProvider>{children}</DemoAuthProvider>
  return (
    <ClerkProvider publishableKey={clerkPublishableKey} {...(tokenCache === undefined ? {} : { tokenCache })}>
      <ClerkBridge>{children}</ClerkBridge>
    </ClerkProvider>
  )
}

export function useAppAuth(): AppAuthContextValue {
  const value = useContext(AppAuthContext)
  if (value === null) throw new Error('useAppAuth must be used inside AppAuthProvider')
  return value
}

export const isClerkConfigured = clerkPublishableKey.length > 0
