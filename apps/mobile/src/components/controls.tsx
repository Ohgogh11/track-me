import { type ReactNode, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import Svg, { Circle, Polyline, Line as SvgLine } from 'react-native-svg'
import { useAppTheme } from '@/theme/use-theme'

export function ChoiceChip({
  label,
  selected,
  onPress,
}: {
  label: string
  selected: boolean
  onPress: () => void
}) {
  const { colors } = useAppTheme()
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: selected ? colors.primary : colors.surface,
          borderColor: selected ? colors.primary : colors.border,
        },
        pressed && styles.pressed,
      ]}
    >
      <Text style={{ color: selected ? colors.primaryText : colors.text, fontWeight: '700' }}>{label}</Text>
    </Pressable>
  )
}

export function ChipRow({ children }: { children: ReactNode }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.chipScroll}
      contentContainerStyle={styles.chipRow}
    >
      {children}
    </ScrollView>
  )
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly { label: string; value: T }[]
  value: T
  onChange: (value: T) => void
}) {
  const { colors } = useAppTheme()
  return (
    <View style={[styles.segmented, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {options.map((option) => {
        const selected = option.value === value
        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [
              styles.segment,
              selected && { backgroundColor: colors.primary },
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.segmentText, { color: selected ? colors.primaryText : colors.textMuted }]}>
              {option.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  const { colors } = useAppTheme()
  return (
    <View style={styles.sectionTitle}>
      <Text style={[styles.sectionText, { color: colors.text }]}>{children}</Text>
      {action}
    </View>
  )
}

export function ProgressBar({ value, max, color }: { value: number; max: number; color?: string }) {
  const { colors } = useAppTheme()
  const ratio = max <= 0 ? 0 : Math.min(1, Math.max(0, value / max))
  return (
    <View style={[styles.track, { backgroundColor: colors.surfaceRaised }]}>
      <View style={[styles.fill, { backgroundColor: color ?? colors.primary, width: `${ratio * 100}%` }]} />
    </View>
  )
}

export function MiniLineChart({ values, labels }: { values: number[]; labels: string[] }) {
  const { colors } = useAppTheme()
  const [width, setWidth] = useState(300)
  const height = 112
  const padding = 10
  const safeValues = values.map((value) => (Number.isFinite(value) ? value : 0))
  const minimum = safeValues.length === 0 ? 0 : Math.min(...safeValues)
  const maximum = safeValues.length === 0 ? 1 : Math.max(...safeValues)
  const range = maximum === minimum ? 1 : maximum - minimum
  const xFor = (position: number) =>
    safeValues.length <= 1
      ? width / 2
      : padding + (position / (safeValues.length - 1)) * (width - padding * 2)
  const yFor = (value: number) => height - padding - ((value - minimum) / range) * (height - padding * 2)
  const points = safeValues.map((value, position) => `${xFor(position)},${yFor(value)}`).join(' ')
  const lastIndex = Math.max(0, labels.length - 1)
  const labelPoints = [
    { id: 'first', label: labels[0] ?? '' },
    { id: 'middle', label: labels[Math.floor(lastIndex / 2)] ?? '' },
    { id: 'last', label: labels[lastIndex] ?? '' },
  ].filter(
    (item, position, items) => items.findIndex((candidate) => candidate.label === item.label) === position,
  )

  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={`Line chart with ${safeValues.length} points`}
      style={styles.lineChart}
      onLayout={(event) => setWidth(Math.max(1, event.nativeEvent.layout.width))}
    >
      <Svg width="100%" height={height}>
        <SvgLine
          x1={padding}
          x2={width - padding}
          y1={height - padding}
          y2={height - padding}
          stroke={colors.border}
          strokeWidth={1}
        />
        <SvgLine
          x1={padding}
          x2={width - padding}
          y1={padding}
          y2={padding}
          stroke={colors.border}
          strokeWidth={1}
          strokeDasharray="4 5"
        />
        {safeValues.length > 1 ? (
          <Polyline
            points={points}
            fill="none"
            stroke={colors.primary}
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : null}
        {safeValues.map((value, position) => (
          <Circle
            key={`${xFor(position)}:${value}`}
            cx={xFor(position)}
            cy={yFor(value)}
            r={4}
            fill={colors.primary}
            stroke={colors.surface}
            strokeWidth={2}
          />
        ))}
      </Svg>
      <View style={styles.lineLabels}>
        {labelPoints.map((item) => (
          <Text key={item.id} numberOfLines={1} style={[styles.lineLabel, { color: colors.textMuted }]}>
            {item.label}
          </Text>
        ))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9 },
  chipScroll: { flexGrow: 0 },
  chipRow: { gap: 8, paddingRight: 16 },
  segmented: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    padding: 3,
    overflow: 'hidden',
  },
  segment: { flex: 1, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 9 },
  segmentText: { fontSize: 14, fontWeight: '800' },
  pressed: { opacity: 0.7 },
  sectionTitle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  sectionText: { fontSize: 20, fontWeight: '800' },
  track: { height: 10, borderRadius: 999, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 999 },
  lineChart: { width: '100%', minHeight: 136 },
  lineLabels: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  lineLabel: { flex: 1, fontSize: 10, textAlign: 'center' },
})
