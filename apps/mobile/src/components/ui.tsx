import type { PropsWithChildren, ReactNode } from 'react'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  type TextProps,
  View,
  type ViewProps,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAppTheme } from '@/theme/use-theme'

export function Screen({ children, scroll = true }: PropsWithChildren<{ scroll?: boolean }>) {
  const { colors } = useAppTheme()
  const body = scroll ? (
    <ScrollView contentContainerStyle={styles.screenContent} keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  ) : (
    <View style={styles.screenContent}>{children}</View>
  )
  return <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>{body}</SafeAreaView>
}

export function AppText({ style, ...props }: TextProps) {
  const { colors } = useAppTheme()
  return <Text {...props} style={[styles.text, { color: colors.text }, style]} />
}

export function Heading({ children, subtitle }: { children: ReactNode; subtitle?: string }) {
  const { colors } = useAppTheme()
  return (
    <View style={styles.headingBlock}>
      <Text style={[styles.heading, { color: colors.text }]}>{children}</Text>
      {subtitle ? <Text style={[styles.subtitle, { color: colors.textMuted }]}>{subtitle}</Text> : null}
    </View>
  )
}

export function Card({ style, ...props }: ViewProps) {
  const { colors } = useAppTheme()
  return (
    <View
      {...props}
      style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, style]}
    />
  )
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  compact = false,
}: {
  title: string
  onPress: () => void
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
  disabled?: boolean
  loading?: boolean
  compact?: boolean
}) {
  const { colors } = useAppTheme()
  const background =
    variant === 'primary'
      ? colors.primary
      : variant === 'danger'
        ? colors.danger
        : variant === 'secondary'
          ? colors.surfaceRaised
          : 'transparent'
  const foreground =
    variant === 'primary'
      ? colors.primaryText
      : variant === 'danger'
        ? '#FFFFFF'
        : variant === 'secondary'
          ? colors.text
          : colors.primary
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        compact && styles.buttonCompact,
        { backgroundColor: background, borderColor: variant === 'ghost' ? colors.border : background },
        (disabled || loading) && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={foreground} />
      ) : (
        <Text style={[styles.buttonText, { color: foreground }]}>{title}</Text>
      )}
    </Pressable>
  )
}

export function Field({
  label,
  error,
  style,
  ...props
}: TextInputProps & { label: string; error?: string | undefined }) {
  const { colors } = useAppTheme()
  return (
    <View style={styles.fieldWrap}>
      <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
      <TextInput
        {...props}
        placeholderTextColor={colors.textMuted}
        style={[
          styles.field,
          {
            backgroundColor: colors.surface,
            borderColor: error ? colors.danger : colors.border,
            color: colors.text,
          },
          style,
        ]}
      />
      {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}
    </View>
  )
}

export function Metric({ label, value }: { label: string; value: string }) {
  const { colors } = useAppTheme()
  return (
    <View style={[styles.metric, { backgroundColor: colors.surfaceRaised }]}>
      <Text style={[styles.metricValue, { color: colors.text }]}>{value}</Text>
      <Text style={[styles.metricLabel, { color: colors.textMuted }]}>{label}</Text>
    </View>
  )
}

export function EmptyState({
  title,
  message,
  action,
}: {
  title: string
  message: string
  action?: ReactNode
}) {
  const { colors } = useAppTheme()
  return (
    <View style={[styles.empty, { borderColor: colors.border }]}>
      <Text style={[styles.emptyTitle, { color: colors.text }]}>{title}</Text>
      <Text style={[styles.subtitle, { color: colors.textMuted }]}>{message}</Text>
      {action}
    </View>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  screenContent: { padding: 18, gap: 14, paddingBottom: 40, flexGrow: 1 },
  text: { fontSize: 16 },
  headingBlock: { gap: 4, marginBottom: 4 },
  heading: { fontSize: 30, fontWeight: '800', letterSpacing: -0.6 },
  subtitle: { fontSize: 14, lineHeight: 20 },
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 18, padding: 16, gap: 12 },
  button: {
    minHeight: 50,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonCompact: { minHeight: 38, borderRadius: 10, paddingHorizontal: 12 },
  buttonText: { fontSize: 16, fontWeight: '700' },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.75, transform: [{ scale: 0.99 }] },
  fieldWrap: { gap: 6 },
  label: { fontSize: 14, fontWeight: '600' },
  field: { minHeight: 50, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, fontSize: 16 },
  error: { fontSize: 13 },
  metric: { flex: 1, minWidth: 100, borderRadius: 14, padding: 13, gap: 2 },
  metricValue: { fontSize: 21, fontWeight: '800' },
  metricLabel: { fontSize: 12, fontWeight: '600' },
  empty: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 18,
    padding: 24,
    gap: 10,
    alignItems: 'center',
  },
  emptyTitle: { fontSize: 18, fontWeight: '700' },
})
