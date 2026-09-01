import type { ExpoConfig } from 'expo/config'

const useSqlCipher = process.env.EXPO_USE_SQLCIPHER === 'true'

const config: ExpoConfig = {
  name: 'Track Me',
  slug: 'track-me',
  version: '0.1.0',
  orientation: 'portrait',
  scheme: 'trackme',
  userInterfaceStyle: 'dark',
  newArchEnabled: true,
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'com.itayf.trackme',
  },
  android: {
    package: 'com.itayf.trackme',
    adaptiveIcon: {
      backgroundColor: '#050806',
    },
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    [
      'expo-camera',
      {
        cameraPermission: 'Allow Track Me to scan food barcodes.',
      },
    ],
    '@clerk/expo',
    [
      'expo-notifications',
      {
        defaultChannel: 'rest-timers',
      },
    ],
    ['expo-sqlite', { useSQLCipher: useSqlCipher }],
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    useSqlCipher,
  },
}

export default config
