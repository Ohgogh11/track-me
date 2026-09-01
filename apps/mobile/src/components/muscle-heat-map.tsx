import type { MuscleInsight } from '@track-me/contracts'
import { StyleSheet, View } from 'react-native'
import Body, { type ExtendedBodyPart, type Slug } from 'react-native-body-highlighter'
import { AppText } from '@/components/ui'
import { useAppTheme } from '@/theme/use-theme'

interface MuscleMapping {
  slug: Slug
  muscleIds: string[]
}

const FRONT_MUSCLES: MuscleMapping[] = [
  { slug: 'neck', muscleIds: ['neck'] },
  { slug: 'chest', muscleIds: ['chest'] },
  { slug: 'deltoids', muscleIds: ['front-delts', 'side-delts', 'shoulders'] },
  { slug: 'biceps', muscleIds: ['biceps'] },
  { slug: 'forearm', muscleIds: ['forearms'] },
  { slug: 'abs', muscleIds: ['abs'] },
  { slug: 'obliques', muscleIds: ['obliques'] },
  { slug: 'quadriceps', muscleIds: ['quadriceps'] },
  { slug: 'adductors', muscleIds: ['adductors'] },
  { slug: 'calves', muscleIds: ['calves'] },
]

const BACK_MUSCLES: MuscleMapping[] = [
  { slug: 'neck', muscleIds: ['neck'] },
  { slug: 'trapezius', muscleIds: ['traps'] },
  { slug: 'deltoids', muscleIds: ['rear-delts', 'shoulders'] },
  { slug: 'upper-back', muscleIds: ['upper-back', 'lats'] },
  { slug: 'triceps', muscleIds: ['triceps'] },
  { slug: 'forearm', muscleIds: ['forearms'] },
  { slug: 'lower-back', muscleIds: ['lower-back'] },
  { slug: 'gluteal', muscleIds: ['glutes', 'abductors'] },
  { slug: 'hamstring', muscleIds: ['hamstrings'] },
  { slug: 'calves', muscleIds: ['calves'] },
]

function heatColor(score: number, maximum: number, empty: string): string {
  if (score <= 0 || maximum <= 0) return empty
  const ratio = Math.min(1, score / maximum)
  const red = Math.round(22 + (50 - 22) * ratio)
  const green = Math.round(52 + (232 - 52) * ratio)
  const blue = Math.round(31 + (117 - 31) * ratio)
  return `rgb(${red}, ${green}, ${blue})`
}

export function ExerciseMuscleMap({
  primaryMuscleId,
  secondaryMuscleIds,
}: {
  primaryMuscleId: string
  secondaryMuscleIds: readonly string[]
}) {
  const insights: MuscleInsight[] = [
    {
      muscleId: primaryMuscleId,
      heatScore: 1,
      primarySets: 1,
      secondarySets: 0,
      attributedVolumeKg: 0,
      exerciseIds: [],
      recordCount: 0,
    },
    ...secondaryMuscleIds.map((muscleId) => ({
      muscleId,
      heatScore: 0.5,
      primarySets: 0,
      secondarySets: 1,
      attributedVolumeKg: 0,
      exerciseIds: [],
      recordCount: 0,
    })),
  ]
  return <MuscleHeatMap insights={insights} selectedMuscleId={primaryMuscleId} onSelect={() => undefined} />
}

function strongestMuscle(mapping: MuscleMapping, scores: ReadonlyMap<string, number>): string {
  return mapping.muscleIds.reduce((strongest, muscleId) =>
    (scores.get(muscleId) ?? 0) > (scores.get(strongest) ?? 0) ? muscleId : strongest,
  )
}

export function MuscleHeatMap({
  insights,
  selectedMuscleId,
  onSelect,
}: {
  insights: readonly MuscleInsight[]
  selectedMuscleId: string | null
  onSelect: (muscleId: string) => void
}) {
  const { colors } = useAppTheme()
  const scores = new Map(insights.map((insight) => [insight.muscleId, insight.heatScore]))
  const maximum = Math.max(0, ...insights.map((insight) => insight.heatScore))

  const dataFor = (mappings: MuscleMapping[]): ExtendedBodyPart[] =>
    mappings.map((mapping) => {
      const score = Math.max(...mapping.muscleIds.map((muscleId) => scores.get(muscleId) ?? 0))
      const selected = selectedMuscleId !== null && mapping.muscleIds.includes(selectedMuscleId)
      return {
        slug: mapping.slug,
        color: heatColor(score, maximum, colors.border),
        styles: {
          stroke: selected ? colors.primary : colors.background,
          strokeWidth: selected ? 5 : 1,
        },
      }
    })

  const press = (mappings: MuscleMapping[], slug: Slug | undefined) => {
    const mapping = mappings.find((item) => item.slug === slug)
    if (mapping !== undefined) onSelect(strongestMuscle(mapping, scores))
  }

  return (
    <View style={[styles.wrap, { backgroundColor: colors.surfaceRaised }]}>
      <View style={styles.bodies}>
        <View style={styles.body}>
          <Body
            data={dataFor(FRONT_MUSCLES)}
            gender="male"
            side="front"
            scale={0.78}
            border={colors.border}
            defaultFill={colors.surface}
            defaultStroke={colors.border}
            onBodyPartPress={(part) => press(FRONT_MUSCLES, part.slug)}
          />
          <AppText style={[styles.label, { color: colors.textMuted }]}>Front</AppText>
        </View>
        <View style={styles.body}>
          <Body
            data={dataFor(BACK_MUSCLES)}
            gender="male"
            side="back"
            scale={0.78}
            border={colors.border}
            defaultFill={colors.surface}
            defaultStroke={colors.border}
            onBodyPartPress={(part) => press(BACK_MUSCLES, part.slug)}
          />
          <AppText style={[styles.label, { color: colors.textMuted }]}>Back</AppText>
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { borderRadius: 18, overflow: 'hidden', paddingVertical: 12, paddingHorizontal: 4 },
  bodies: { flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-start' },
  body: { alignItems: 'center' },
  label: { marginTop: -3, fontSize: 12, fontWeight: '700' },
})
