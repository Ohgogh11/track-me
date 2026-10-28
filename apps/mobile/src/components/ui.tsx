import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import type { ComponentProps, PropsWithChildren, ReactNode } from 'react'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  type StyleProp,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  type TextProps,
  View,
  type ViewProps,
  type ViewStyle,
} from 'react-native'
import { type Edge, SafeAreaView } from 'react-native-safe-area-context'
import { useAppTheme } from '@/theme/use-theme'

export function Screen({
  children,
  scroll = true,
  contentStyle,
  safeTop = false,
  safeBottom = true,
}: PropsWithChildren<{
  scroll?: boolean
  contentStyle?: StyleProp<ViewStyle>
  safeTop?: boolean
  safeBottom?: boolean
}>) {
  const { colors } = useAppTheme()
  const edges: Edge[] = [
    ...(safeTop ? (['top'] as const) : []),
    'right',
    ...(safeBottom ? (['bottom'] as const) : []),
    'left',
  ]
  const body = scroll ? (
    <ScrollView
      contentContainerStyle={[styles.screenContent, contentStyle]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.screenContent, contentStyle]}>{children}</View>
  )
  return (
    <SafeAreaView edges={edges} style={[styles.safe, { backgroundColor: colors.background }]}>
      {body}
    </SafeAreaView>
  )
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
  icon,
}: {
  title: string
  onPress: () => void
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline' | 'dashed'
  disabled?: boolean
  loading?: boolean
  compact?: boolean
  icon?: ComponentProps<typeof MaterialCommunityIcons>['name']
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
        : variant === 'secondary' || variant === 'outline'
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
        {
          backgroundColor: background,
          borderColor: variant === 'outline' || variant === 'dashed' ? colors.border : background,
          borderStyle: variant === 'dashed' ? 'dashed' : 'solid',
        },
        (disabled || loading) && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={foreground} />
      ) : (
        <View style={styles.buttonContent}>
          {icon ? <MaterialCommunityIcons name={icon} size={17} color={foreground} /> : null}
          <Text style={[styles.buttonText, { color: foreground }]}>{title}</Text>
        </View>
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
      <Text style={[styles.label, { color: colors.textMuted }]}>{label}</Text>
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
  screenContent: { padding: 16, gap: 12, paddingBottom: 36, flexGrow: 1 },
  text: { fontSize: 13 },
  headingBlock: { gap: 4, marginBottom: 4 },
  heading: { fontSize: 22, fontWeight: '600', letterSpacing: -0.6 },
  subtitle: { fontSize: 13, lineHeight: 19 },
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, padding: 15, gap: 11 },
  button: {
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonCompact: { minHeight: 44, borderRadius: 10, paddingHorizontal: 12 },
  buttonContent: { flexDirection: 'row', gap: 7, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontSize: 13, fontWeight: '600', flexShrink: 1, textAlign: 'center' },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.75, transform: [{ scale: 0.99 }] },
  fieldWrap: { gap: 6 },
  label: { fontSize: 12, fontWeight: '500' },
  field: { minHeight: 46, borderWidth: 1, borderRadius: 11, paddingHorizontal: 12, fontSize: 14 },
  error: { fontSize: 13 },
  metric: { flex: 1, minWidth: 96, borderRadius: 13, padding: 12, gap: 2 },
  metricValue: { fontSize: 20, fontWeight: '600' },
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
