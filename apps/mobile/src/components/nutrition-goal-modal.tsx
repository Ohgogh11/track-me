import {
  type ActivityLevel,
  type CalorieGoal,
  type FormulaSex,
  gramsToUnit,
  type NutritionGoalSuggestion,
  type NutritionGoalType,
  suggestNutritionGoal,
  unitToGrams,
} from '@track-me/contracts'
import { randomUUID } from 'expo-crypto'
import { useEffect, useMemo, useState } from 'react'
import { Alert, Modal, ScrollView, StyleSheet, View } from 'react-native'
import { ChipRow, ChoiceChip, SectionTitle, SegmentedControl } from '@/components/controls'
import { AppText, Button, Card, Field } from '@/components/ui'
import { useData } from '@/providers/data-provider'
import { useAppTheme } from '@/theme/use-theme'

function macroInput(tenths: number): string {
  return String(Number((tenths / 10).toFixed(1)))
}

export function NutritionGoalModal({
  visible,
  date,
  onClose,
}: {
  visible: boolean
  date: string
  onClose: () => void
}) {
  const data = useData()
  const { colors } = useAppTheme()
  const unit = data.profile?.weightUnit ?? 'kg'
  const latestWeight = useMemo(
    () =>
      data.bodyWeights
        .slice()
        .sort((left, right) => Date.parse(right.measuredAt) - Date.parse(left.measuredAt))[0] ?? null,
    [data.bodyWeights],
  )
  const [birthDate, setBirthDate] = useState('')
  const [heightCm, setHeightCm] = useState('')
  const [weight, setWeight] = useState('')
  const [formulaSex, setFormulaSex] = useState<FormulaSex>('male')
  const [activity, setActivity] = useState<ActivityLevel>('moderate')
  const [goalType, setGoalType] = useState<NutritionGoalType>('maintain')
  const [pace, setPace] = useState('0')
  const [suggestion, setSuggestion] = useState<NutritionGoalSuggestion | null>(null)
  const [targetCalories, setTargetCalories] = useState('')
  const [targetProtein, setTargetProtein] = useState('')
  const [targetCarbohydrate, setTargetCarbohydrate] = useState('')
  const [targetFat, setTargetFat] = useState('')

  useEffect(() => {
    if (!visible) return
    const profile = data.profile
    setBirthDate(profile?.birthDate ?? '')
    setHeightCm(profile?.heightCm ? String(profile.heightCm) : '')
    setFormulaSex(profile?.formulaSex ?? 'male')
    setActivity(profile?.activityLevel ?? 'moderate')
    setGoalType(profile?.nutritionGoalType ?? 'maintain')
    setPace(String(Math.round(profile?.targetPaceGramsPerWeek ?? 0)))
    setWeight(
      latestWeight === null ? '' : String(Number(gramsToUnit(latestWeight.weightGrams, unit).toFixed(2))),
    )
    setSuggestion(null)
  }, [data.profile, latestWeight, unit, visible])

  const calculate = () => {
    try {
      const weightValue = Number(weight)
      const next = suggestNutritionGoal({
        birthDate,
        heightCm: Number(heightCm),
        formulaSex,
        activityLevel: activity,
        weightGrams: unitToGrams(weightValue, unit),
        goalType,
        targetPaceGramsPerWeek: goalType === 'maintain' ? 0 : Math.round(Number(pace)),
        today: date,
      })
      setSuggestion(next)
      setTargetCalories(String(next.calories))
      setTargetProtein(macroInput(next.proteinTenthsGrams))
      setTargetCarbohydrate(macroInput(next.carbohydrateTenthsGrams))
      setTargetFat(macroInput(next.fatTenthsGrams))
    } catch (error) {
      Alert.alert(
        'Cannot calculate target',
        error instanceof Error ? error.message : 'Check your profile values.',
      )
    }
  }

  const confirm = async () => {
    if (suggestion === null || data.profile === null) return
    const calories = Math.round(Number(targetCalories))
    const proteinTenthsGrams = Math.round(Number(targetProtein) * 10)
    const carbohydrateTenthsGrams = Math.round(Number(targetCarbohydrate) * 10)
    const fatTenthsGrams = Math.round(Number(targetFat) * 10)
    if (
      !Number.isFinite(calories) ||
      calories <= 0 ||
      ![proteinTenthsGrams, carbohydrateTenthsGrams, fatTenthsGrams].every(
        (value) => Number.isFinite(value) && value >= 0,
      )
    ) {
      Alert.alert('Check the target', 'Calories and all macro targets must be non-negative numbers.')
      return
    }
    const now = new Date().toISOString()
    await data.save({
      ...data.profile,
      updatedAt: now,
      birthDate,
      heightCm: Math.round(Number(heightCm)),
      formulaSex,
      activityLevel: activity,
      nutritionGoalType: goalType,
      targetPaceGramsPerWeek: goalType === 'maintain' ? 0 : Math.round(Number(pace)),
    })
    const sameDate = data.calorieGoals.find((goal) => goal.effectiveFrom === date)
    const goal: CalorieGoal = {
      id: sameDate?.id ?? randomUUID(),
      kind: 'calorie_goal',
      version: sameDate?.version ?? 0,
      updatedAt: now,
      deletedAt: null,
      effectiveFrom: date,
      calories,
      proteinTenthsGrams,
      carbohydrateTenthsGrams,
      fatTenthsGrams,
    }
    await data.save(goal)
    onClose()
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.modal, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <AppText style={styles.title}>Suggested nutrition targets</AppText>
          <Button title="Close" compact variant="ghost" onPress={onClose} />
        </View>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Card>
            <AppText style={{ color: colors.textMuted }}>
              This is an estimate, not a measurement or medical recommendation. Review every value before
              applying it.
            </AppText>
          </Card>
          <View style={styles.fields}>
            <View style={styles.grow}>
              <Field
                label="Birth date (YYYY-MM-DD)"
                value={birthDate}
                onChangeText={setBirthDate}
                placeholder="1995-06-15"
              />
            </View>
            <View style={styles.grow}>
              <Field
                label="Height (cm)"
                value={heightCm}
                onChangeText={setHeightCm}
                keyboardType="number-pad"
                placeholder="175"
              />
            </View>
          </View>
          <Field
            label={`Current weight (${unit})`}
            value={weight}
            onChangeText={setWeight}
            keyboardType="decimal-pad"
            placeholder={unit === 'kg' ? '75' : '165'}
          />
          <SectionTitle>Formula sex</SectionTitle>
          <SegmentedControl
            value={formulaSex}
            options={[
              { label: 'Male', value: 'male' },
              { label: 'Female', value: 'female' },
            ]}
            onChange={setFormulaSex}
          />
          <SectionTitle>Activity outside training</SectionTitle>
          <ChipRow>
            {(
              [
                ['sedentary', 'Sedentary'],
                ['light', 'Light'],
                ['moderate', 'Moderate'],
                ['very_active', 'Very active'],
              ] as const
            ).map(([value, label]) => (
              <ChoiceChip
                key={value}
                label={label}
                selected={activity === value}
                onPress={() => setActivity(value)}
              />
            ))}
          </ChipRow>
          <SectionTitle>Goal</SectionTitle>
          <SegmentedControl
            value={goalType}
            options={[
              { label: 'Lose', value: 'lose' },
              { label: 'Maintain', value: 'maintain' },
              { label: 'Gain', value: 'gain' },
            ]}
            onChange={(value) => {
              setGoalType(value)
              if (value === 'maintain') setPace('0')
            }}
          />
          {goalType !== 'maintain' ? (
            <Field
              label="Target pace (grams/week)"
              value={pace}
              onChangeText={setPace}
              keyboardType="number-pad"
              placeholder={goalType === 'lose' ? '500' : '250'}
            />
          ) : null}
          <Button title="Calculate suggestion" onPress={calculate} />

          {suggestion !== null ? (
            <Card>
              <SectionTitle>Review before applying</SectionTitle>
              <AppText style={{ color: colors.textMuted }}>
                Estimated resting: {suggestion.restingCalories} kcal · maintenance:{' '}
                {suggestion.maintenanceCalories} kcal
              </AppText>
              {suggestion.warnings.map((warning) => (
                <AppText key={warning} style={{ color: colors.warning }}>
                  {warning}
                </AppText>
              ))}
              <View style={styles.fields}>
                <View style={styles.grow}>
                  <Field
                    label="Calories"
                    value={targetCalories}
                    onChangeText={setTargetCalories}
                    keyboardType="number-pad"
                  />
                </View>
                <View style={styles.grow}>
                  <Field
                    label="Protein (g)"
                    value={targetProtein}
                    onChangeText={setTargetProtein}
                    keyboardType="decimal-pad"
                  />
                </View>
              </View>
              <View style={styles.fields}>
                <View style={styles.grow}>
                  <Field
                    label="Carbs (g)"
                    value={targetCarbohydrate}
                    onChangeText={setTargetCarbohydrate}
                    keyboardType="decimal-pad"
                  />
                </View>
                <View style={styles.grow}>
                  <Field
                    label="Fat (g)"
                    value={targetFat}
                    onChangeText={setTargetFat}
                    keyboardType="decimal-pad"
                  />
                </View>
              </View>
              <Button title={`Apply from ${date}`} onPress={() => void confirm()} />
            </Card>
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  modal: { flex: 1 },
  header: {
    minHeight: 64,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  title: { flex: 1, fontSize: 22, fontWeight: '800' },
  content: { padding: 18, gap: 14, paddingBottom: 44 },
  fields: { flexDirection: 'row', gap: 10 },
  grow: { flex: 1, minWidth: 130 },
})
