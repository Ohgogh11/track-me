import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { router } from 'expo-router'
import type { ComponentProps, PropsWithChildren, ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Svg, { Circle } from 'react-native-svg'
import { useData } from '@/providers/data-provider'
import { useAppTheme } from '@/theme/use-theme'

export type AppIconName = ComponentProps<typeof MaterialCommunityIcons>['name']

export function AppIcon({ name, size = 20, color }: { name: AppIconName; size?: number; color?: string }) {
  const { colors } = useAppTheme()
  return <MaterialCommunityIcons name={name} size={size} color={color ?? colors.text} />
}

export function IconButton({
  icon,
  label,
  onPress,
  selected = false,
  danger = false,
}: {
  icon: AppIconName
  label: string
  onPress: () => void
  selected?: boolean
  danger?: boolean
}) {
  const { colors } = useAppTheme()
  const color = danger ? colors.danger : selected ? colors.primary : colors.textMuted
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.iconButton,
        selected && { backgroundColor: colors.surfaceRaised },
        pressed && styles.pressed,
      ]}
    >
      <AppIcon name={icon} color={color} />
    </Pressable>
  )
}

export function AppTabHeader() {
  const data = useData()
  const { colors } = useAppTheme()
  const syncLabel = data.syncStatus.syncing
    ? 'Syncing'
    : data.syncStatus.pending > 0
      ? `${data.syncStatus.pending} pending`
      : data.syncStatus.lastError
        ? 'Offline'
        : 'Synced'
  const statusColor = data.syncStatus.lastError ? colors.warning : colors.primary
  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ backgroundColor: colors.background }}>
      <View style={[styles.appHeader, { borderBottomColor: colors.border }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go home"
          onPress={() => router.navigate('/(tabs)')}
          style={({ pressed }) => [styles.brand, pressed && styles.pressed]}
        >
          <View style={[styles.brandMark, { backgroundColor: colors.primary }]}>
            <AppIcon name="pulse" size={19} color={colors.primaryText} />
          </View>
          <Text numberOfLines={1} style={[styles.brandText, { color: colors.text }]}>
            TRACK ME
          </Text>
        </Pressable>
        <View style={styles.sync}>
          <View style={[styles.syncDot, { backgroundColor: statusColor }]} />
          <Text numberOfLines={1} style={[styles.syncText, { color: colors.textMuted }]}>
            {syncLabel}
          </Text>
        </View>
        <IconButton
          icon="cog-outline"
          label="Open settings"
          onPress={() => router.navigate('/(tabs)/settings')}
        />
      </View>
    </SafeAreaView>
  )
}

export function PageTitle({
  eyebrow,
  title,
  accessory,
}: {
  eyebrow: string
  title: string
  accessory?: ReactNode
}) {
  const { colors } = useAppTheme()
  return (
    <View style={styles.pageTitle}>
      <View style={styles.pageTitleText}>
        <Text style={[styles.eyebrow, { color: colors.primary }]}>{eyebrow.toUpperCase()}</Text>
        <Text style={[styles.pageTitleValue, { color: colors.text }]}>{title}</Text>
      </View>
      {accessory}
    </View>
  )
}

export function SectionHeader({ title, action }: { title: string; action?: ReactNode }) {
  const { colors } = useAppTheme()
  return (
    <View style={styles.sectionHeader}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text>
      {action}
    </View>
  )
}

export function AuthFrame({ children }: PropsWithChildren) {
  const { colors } = useAppTheme()
  return (
    <View style={styles.authFrame}>
      <View style={styles.authBrand}>
        <View style={[styles.authMark, { backgroundColor: colors.primary }]}>
          <AppIcon name="pulse" size={25} color={colors.primaryText} />
        </View>
        <Text style={[styles.authName, { color: colors.text }]}>TRACK ME</Text>
        <Text style={[styles.authTagline, { color: colors.textMuted }]}>Your work. Clearly measured.</Text>
      </View>
      <View style={styles.authContent}>{children}</View>
      <Text style={[styles.authFootnote, { color: colors.textMuted }]}>
        Offline changes sync securely when you reconnect.
      </Text>
    </View>
  )
}

export function ProgressRing({
  value,
  max,
  primary,
  secondary,
  size = 112,
}: {
  value: number
  max: number
  primary: string
  secondary: string
  size?: number
}) {
  const { colors } = useAppTheme()
  const strokeWidth = 5
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const ratio = max <= 0 ? 0 : Math.min(1, Math.max(0, value / max))
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={colors.surfaceRaised}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={colors.primary}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - ratio)}
          rotation="-90"
          origin={`${size / 2}, ${size / 2}`}
          fill="none"
        />
      </Svg>
      <View style={styles.ringText}>
        <Text style={[styles.ringPrimary, { color: colors.text }]}>{primary}</Text>
        <Text style={[styles.ringSecondary, { color: colors.textMuted }]}>{secondary}</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.72 },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appHeader: {
    height: 58,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    flex: 1,
    minWidth: 0,
    minHeight: 44,
  },
  brandMark: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  brandText: { flexShrink: 1, fontSize: 13, fontWeight: '500' },
  sync: { flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0, flexShrink: 1 },
  syncDot: { width: 7, height: 7, borderRadius: 4 },
  syncText: { maxWidth: 88, flexShrink: 1, fontSize: 12 },
  pageTitle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  pageTitleText: { flex: 1, gap: 3 },
  eyebrow: { fontSize: 11, fontWeight: '500', letterSpacing: 1.3 },
  pageTitleValue: { fontSize: 22, fontWeight: '600', letterSpacing: -0.6 },
  sectionHeader: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 4,
  },
  sectionTitle: { flexShrink: 1, fontSize: 18, fontWeight: '600', letterSpacing: -0.3 },
  ringText: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', gap: 1 },
  ringPrimary: { fontSize: 16, fontWeight: '600', fontVariant: ['tabular-nums'] },
  ringSecondary: { fontSize: 10, textAlign: 'center' },
  authFrame: {
    flex: 1,
    width: '100%',
    maxWidth: 390,
    alignSelf: 'center',
    justifyContent: 'center',
    paddingVertical: 26,
    gap: 28,
  },
  authBrand: { alignItems: 'center', gap: 6 },
  authMark: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  authName: { fontSize: 14, fontWeight: '600', letterSpacing: 0.7 },
  authTagline: { fontSize: 13 },
  authContent: { width: '100%' },
  authFootnote: { fontSize: 12, textAlign: 'center' },
})
