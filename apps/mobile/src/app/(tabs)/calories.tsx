import {
  type BodyWeightEntry,
  type CalorieEntry,
  type CalorieGoal,
  gramsToUnit,
  nutritionForLocalDate,
  selectCalorieGoal,
  unitToGrams,
} from '@track-me/contracts'
import { randomUUID } from 'expo-crypto'
import { useMemo, useState } from 'react'
import { Alert, StyleSheet, View } from 'react-native'
import { ProgressBar, SectionTitle } from '@/components/controls'
import { candidateFromEntry, type FoodCandidate, NutritionFoodModal } from '@/components/nutrition-food-modal'
import { NutritionGoalModal } from '@/components/nutrition-goal-modal'
import { AppText, Button, Card, EmptyState, Field, Heading, Metric, Screen } from '@/components/ui'
import { localDateToday } from '@/lib/date'
import { useData } from '@/providers/data-provider'
import { useAppTheme } from '@/theme/use-theme'

function shiftDate(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00`)
  value.setDate(value.getDate() + days)
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(
    value.getDate(),
  ).padStart(2, '0')}`
}

function currentTime(): string {
  const now = new Date()
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
}

function macro(tenths: number): string {
  return String(Number((tenths / 10).toFixed(1)))
}

function entryMacro(value: number | null | undefined): string {
  return value === null || value === undefined ? '?' : macro(value)
}

function MacroProgress({
  label,
  value,
  goal,
}: {
  label: string
  value: number
  goal: number | null | undefined
}) {
  const { colors } = useAppTheme()
  return (
    <View style={styles.macroProgress}>
      <View style={styles.row}>
        <AppText style={styles.macroLabel}>{label}</AppText>
        <AppText style={{ color: colors.textMuted }}>
          {macro(value)} / {goal === null || goal === undefined ? '—' : macro(goal)} g
        </AppText>
      </View>
      <ProgressBar value={value} max={goal ?? 1} />
    </View>
  )
}

export default function NutritionScreen() {
  const data = useData()
  const { colors } = useAppTheme()
  const [date, setDate] = useState(localDateToday())
  const [description, setDescription] = useState('')
  const [calories, setCalories] = useState('')
  const [time, setTime] = useState(currentTime())
  const [editing, setEditing] = useState<CalorieEntry | null>(null)
  const [goalCalories, setGoalCalories] = useState('')
  const [goalProtein, setGoalProtein] = useState('')
  const [goalCarbohydrate, setGoalCarbohydrate] = useState('')
  const [goalFat, setGoalFat] = useState('')
  const [weight, setWeight] = useState('')
  const [weightNotes, setWeightNotes] = useState('')
  const [foodModal, setFoodModal] = useState<{
    visible: boolean
    mode: 'browse' | 'scan' | 'custom'
    candidate: FoodCandidate | null
  }>({ visible: false, mode: 'browse', candidate: null })
  const [goalModalVisible, setGoalModalVisible] = useState(false)
  const timezone = data.profile?.timezone ?? 'UTC'
  const unit = data.profile?.weightUnit ?? 'kg'
  const day = nutritionForLocalDate(data.calorieEntries, date, timezone)
  const goal = selectCalorieGoal(data.calorieGoals, date)
  const remaining = (goal?.calories ?? 0) - day.totals.calories

  const recentEntries = useMemo(() => {
    const seen = new Set<string>()
    return data.calorieEntries
      .filter((entry) => entry.deletedAt === null)
      .slice()
      .sort((left, right) => Date.parse(right.eatenAt) - Date.parse(left.eatenAt))
      .filter((entry) => {
        const key = `${entry.providerId ?? ''}:${entry.description.toLocaleLowerCase()}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      .slice(0, 6)
  }, [data.calorieEntries])

  const weekly = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, index) =>
      nutritionForLocalDate(data.calorieEntries, shiftDate(date, -index), timezone),
    )
    const totals = days.reduce(
      (sum, item) => ({
        calories: sum.calories + item.totals.calories,
        protein: sum.protein + item.totals.proteinTenthsGrams,
        carbohydrate: sum.carbohydrate + item.totals.carbohydrateTenthsGrams,
        fat: sum.fat + item.totals.fatTenthsGrams,
      }),
      { calories: 0, protein: 0, carbohydrate: 0, fat: 0 },
    )
    const loggedDays = days.filter((item) => item.entries.length > 0).length
    const adherentDays = days.filter((item, index) => {
      if (item.entries.length === 0) return false
      const dayGoal = selectCalorieGoal(data.calorieGoals, shiftDate(date, -index))
      return (
        dayGoal !== null &&
        Math.abs(item.totals.calories - dayGoal.calories) <= Math.round(dayGoal.calories * 0.1)
      )
    }).length
    return {
      calories: Math.round(totals.calories / 7),
      protein: Math.round(totals.protein / 7),
      carbohydrate: Math.round(totals.carbohydrate / 7),
      fat: Math.round(totals.fat / 7),
      loggedDays,
      adherentDays,
    }
  }, [data.calorieEntries, data.calorieGoals, date, timezone])

  const openFood = (mode: 'browse' | 'scan' | 'custom', candidate: FoodCandidate | null = null) => {
    setFoodModal({ visible: true, mode, candidate })
  }

  const clearManualForm = () => {
    setDescription('')
    setCalories('')
    setTime(currentTime())
    setEditing(null)
  }

  const saveManualEntry = async () => {
    const calorieValue = Math.round(Number(calories))
    if (
      description.trim().length === 0 ||
      !Number.isFinite(calorieValue) ||
      calorieValue <= 0 ||
      !/^\d{2}:\d{2}$/.test(time)
    ) {
      Alert.alert('Check the entry', 'Add a food description, positive calories, and time in HH:MM format.')
      return
    }
    const now = new Date().toISOString()
    const entry: CalorieEntry = {
      ...(editing ?? {
        id: randomUUID(),
        kind: 'calorie_entry' as const,
        version: 0,
        deletedAt: null,
        source: 'manual' as const,
        brand: null,
        providerId: null,
        barcode: null,
        servingLabel: null,
        servingGrams: null,
        servingCountThousandths: null,
        proteinTenthsGrams: null,
        carbohydrateTenthsGrams: null,
        fatTenthsGrams: null,
      }),
      updatedAt: now,
      description: description.trim(),
      calories: calorieValue,
      eatenAt: new Date(`${date}T${time}:00`).toISOString(),
    }
    await data.save(entry)
    clearManualForm()
  }

  const editEntry = (entry: CalorieEntry) => {
    const instant = new Date(entry.eatenAt)
    setEditing(entry)
    setDescription(entry.description)
    setCalories(String(entry.calories))
    setTime(`${String(instant.getHours()).padStart(2, '0')}:${String(instant.getMinutes()).padStart(2, '0')}`)
  }

  const saveManualGoal = async () => {
    const calorieValue = Math.round(Number(goalCalories))
    const optionalMacro = (value: string): number | null => {
      if (value.trim() === '') return null
      const number = Number(value)
      return Number.isFinite(number) && number >= 0 ? Math.round(number * 10) : Number.NaN
    }
    const protein = optionalMacro(goalProtein)
    const carbohydrate = optionalMacro(goalCarbohydrate)
    const fat = optionalMacro(goalFat)
    if (
      !Number.isFinite(calorieValue) ||
      calorieValue <= 0 ||
      [protein, carbohydrate, fat].some((value) => Number.isNaN(value))
    ) {
      Alert.alert('Check the goal', 'Enter positive calories and optional non-negative macro targets.')
      return
    }
    const sameDate = data.calorieGoals.find((item) => item.effectiveFrom === date)
    const now = new Date().toISOString()
    const next: CalorieGoal = {
      id: sameDate?.id ?? randomUUID(),
      kind: 'calorie_goal',
      version: sameDate?.version ?? 0,
      updatedAt: now,
      deletedAt: null,
      effectiveFrom: date,
      calories: calorieValue,
      proteinTenthsGrams: protein,
      carbohydrateTenthsGrams: carbohydrate,
      fatTenthsGrams: fat,
    }
    await data.save(next)
    setGoalCalories('')
    setGoalProtein('')
    setGoalCarbohydrate('')
    setGoalFat('')
  }

  const copyYesterday = async () => {
    const previousDate = shiftDate(date, -1)
    const previous = nutritionForLocalDate(data.calorieEntries, previousDate, timezone).entries
    if (previous.length === 0) {
      Alert.alert('Nothing to copy', `There are no entries on ${previousDate}.`)
      return
    }
    const now = new Date().toISOString()
    await Promise.all(
      previous.map((entry) => {
        const instant = new Date(entry.eatenAt)
        const copied: CalorieEntry = {
          ...entry,
          id: randomUUID(),
          version: 0,
          updatedAt: now,
          deletedAt: null,
          eatenAt: new Date(
            `${date}T${String(instant.getHours()).padStart(2, '0')}:${String(instant.getMinutes()).padStart(
              2,
              '0',
            )}:00`,
          ).toISOString(),
        }
        return data.save(copied)
      }),
    )
  }

  const saveWeight = async () => {
    const value = Number(weight)
    if (!Number.isFinite(value) || value <= 0) {
      Alert.alert('Check the measurement', `Enter a positive weight in ${unit}.`)
      return
    }
    const now = new Date().toISOString()
    const entry: BodyWeightEntry = {
      id: randomUUID(),
      kind: 'body_weight',
      version: 0,
      updatedAt: now,
      deletedAt: null,
      weightGrams: unitToGrams(value, unit),
      measuredAt: now,
      notes: weightNotes.trim(),
    }
    await data.save(entry)
    setWeight('')
    setWeightNotes('')
  }

  return (
    <Screen>
      <Heading subtitle={`Daily grouping uses ${timezone}. Targets are effective-dated.`}>Nutrition</Heading>
      <View style={styles.dateRow}>
        <Button title="‹" compact variant="secondary" onPress={() => setDate(shiftDate(date, -1))} />
        <AppText style={styles.date}>{date}</AppText>
        <Button
          title="›"
          compact
          variant="secondary"
          disabled={date >= localDateToday()}
          onPress={() => setDate(shiftDate(date, 1))}
        />
      </View>

      <View style={styles.metrics}>
        <Metric label="Consumed" value={String(day.totals.calories)} />
        <Metric label="Remaining" value={String(remaining)} />
        <Metric label="Goal" value={String(goal?.calories ?? 0)} />
      </View>
      <ProgressBar
        value={day.totals.calories}
        max={goal?.calories ?? 1}
        color={remaining < 0 ? colors.danger : colors.primary}
      />
      <Card>
        <MacroProgress
          label="Protein"
          value={day.totals.proteinTenthsGrams}
          goal={goal?.proteinTenthsGrams}
        />
        <MacroProgress
          label="Carbohydrates"
          value={day.totals.carbohydrateTenthsGrams}
          goal={goal?.carbohydrateTenthsGrams}
        />
        <MacroProgress label="Fat" value={day.totals.fatTenthsGrams} goal={goal?.fatTenthsGrams} />
        {day.totals.entriesWithUnknownMacros > 0 ? (
          <AppText style={{ color: colors.warning }}>
            {day.totals.entriesWithUnknownMacros} calorie-only{' '}
            {day.totals.entriesWithUnknownMacros === 1 ? 'entry is' : 'entries are'} excluded from macro
            totals.
          </AppText>
        ) : null}
      </Card>

      <View style={styles.actionRow}>
        <View style={styles.action}>
          <Button title="Search" onPress={() => openFood('browse')} />
        </View>
        <View style={styles.action}>
          <Button title="Scan" variant="secondary" onPress={() => openFood('scan')} />
        </View>
        <View style={styles.action}>
          <Button title="Custom" variant="secondary" onPress={() => openFood('custom')} />
        </View>
      </View>

      {recentEntries.length > 0 ? (
        <>
          <SectionTitle>Recent</SectionTitle>
          <View style={styles.recentGrid}>
            {recentEntries.map((entry) => (
              <Card key={entry.id} style={styles.recentCard}>
                <AppText numberOfLines={1} style={styles.recentName}>
                  {entry.description}
                </AppText>
                <AppText style={{ color: colors.textMuted }}>{entry.calories} kcal last time</AppText>
                <Button
                  title="Log again"
                  compact
                  variant="secondary"
                  onPress={() => openFood('browse', candidateFromEntry(entry))}
                />
              </Card>
            ))}
          </View>
        </>
      ) : null}

      <Card>
        <View style={styles.row}>
          <View style={styles.grow}>
            <SectionTitle>Seven-day view</SectionTitle>
            <AppText style={{ color: colors.textMuted }}>Calendar-day averages ending on {date}.</AppText>
          </View>
          <Button title="Copy yesterday" compact variant="secondary" onPress={() => void copyYesterday()} />
        </View>
        <View style={styles.metrics}>
          <Metric label="Avg kcal" value={String(weekly.calories)} />
          <Metric label="Avg protein" value={`${macro(weekly.protein)} g`} />
        </View>
        <AppText style={{ color: colors.textMuted }}>
          P {macro(weekly.protein)} g · C {macro(weekly.carbohydrate)} g · F {macro(weekly.fat)} g
        </AppText>
        <AppText style={{ color: colors.textMuted }}>
          Logged {weekly.loggedDays}/7 days · within 10% of calorie goal {weekly.adherentDays}/
          {weekly.loggedDays || 0} logged days
        </AppText>
      </Card>

      <SectionTitle>Entries</SectionTitle>
      {day.entries.length === 0 ? (
        <EmptyState
          title="Nothing logged"
          message="Food entries save on this device immediately and synchronize when possible."
        />
      ) : (
        day.entries.map((entry) => (
          <Card key={entry.id}>
            <View style={styles.row}>
              <View style={styles.grow}>
                <AppText style={styles.entry}>{entry.description}</AppText>
                <AppText style={{ color: colors.textMuted }}>
                  {new Date(entry.eatenAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                  {entry.brand ? ` · ${entry.brand}` : ''}
                </AppText>
                <AppText style={{ color: colors.textMuted }}>
                  P {entryMacro(entry.proteinTenthsGrams)} · C {entryMacro(entry.carbohydrateTenthsGrams)} · F{' '}
                  {entryMacro(entry.fatTenthsGrams)} g
                </AppText>
              </View>
              <AppText style={styles.calorie}>{entry.calories} kcal</AppText>
            </View>
            <View style={styles.row}>
              <Button title="Edit calories" compact variant="secondary" onPress={() => editEntry(entry)} />
              <Button
                title="Log again"
                compact
                variant="secondary"
                onPress={() => openFood('browse', candidateFromEntry(entry))}
              />
              <Button title="Delete" compact variant="ghost" onPress={() => void data.remove(entry)} />
            </View>
          </Card>
        ))
      )}

      <Card>
        <SectionTitle>{editing === null ? 'Quick calorie-only entry' : 'Edit entry'}</SectionTitle>
        <AppText style={{ color: colors.textMuted }}>
          Use this when macros are unavailable. It will be marked as excluded from macro totals.
        </AppText>
        <Field label="Food" value={description} onChangeText={setDescription} placeholder="Restaurant meal" />
        <View style={styles.fields}>
          <View style={styles.grow}>
            <Field
              label="Calories"
              value={calories}
              onChangeText={setCalories}
              keyboardType="number-pad"
              placeholder="450"
            />
          </View>
          <View style={styles.grow}>
            <Field
              label="Time (HH:MM)"
              value={time}
              onChangeText={setTime}
              keyboardType="numbers-and-punctuation"
              placeholder="13:30"
            />
          </View>
        </View>
        <Button
          title={editing === null ? 'Add calorie-only entry' : 'Save entry'}
          onPress={() => void saveManualEntry()}
        />
        {editing !== null ? <Button title="Cancel edit" variant="ghost" onPress={clearManualForm} /> : null}
      </Card>

      <Card>
        <View style={styles.row}>
          <View style={styles.grow}>
            <SectionTitle>Daily targets</SectionTitle>
            <AppText style={{ color: colors.textMuted }}>
              Changes apply from {date}; older days retain their original targets.
            </AppText>
          </View>
          <Button title="Suggest" compact variant="secondary" onPress={() => setGoalModalVisible(true)} />
        </View>
        <View style={styles.fields}>
          <View style={styles.grow}>
            <Field
              label="Calories"
              value={goalCalories}
              onChangeText={setGoalCalories}
              keyboardType="number-pad"
              placeholder={String(goal?.calories ?? 2500)}
            />
          </View>
          <View style={styles.grow}>
            <Field
              label="Protein (g)"
              value={goalProtein}
              onChangeText={setGoalProtein}
              keyboardType="decimal-pad"
              placeholder={goal?.proteinTenthsGrams ? macro(goal.proteinTenthsGrams) : 'Optional'}
            />
          </View>
        </View>
        <View style={styles.fields}>
          <View style={styles.grow}>
            <Field
              label="Carbs (g)"
              value={goalCarbohydrate}
              onChangeText={setGoalCarbohydrate}
              keyboardType="decimal-pad"
              placeholder={goal?.carbohydrateTenthsGrams ? macro(goal.carbohydrateTenthsGrams) : 'Optional'}
            />
          </View>
          <View style={styles.grow}>
            <Field
              label="Fat (g)"
              value={goalFat}
              onChangeText={setGoalFat}
              keyboardType="decimal-pad"
              placeholder={goal?.fatTenthsGrams ? macro(goal.fatTenthsGrams) : 'Optional'}
            />
          </View>
        </View>
        <Button title="Set manual targets" variant="secondary" onPress={() => void saveManualGoal()} />
      </Card>

      <Card>
        <SectionTitle>Body weight</SectionTitle>
        <AppText style={{ color: colors.textMuted }}>
          Measurements use {unit} and remain visible as a trend in Progress.
        </AppText>
        <View style={styles.fields}>
          <View style={styles.grow}>
            <Field
              label={`Weight (${unit})`}
              value={weight}
              onChangeText={setWeight}
              keyboardType="decimal-pad"
              placeholder={unit === 'kg' ? '75.0' : '165.3'}
            />
          </View>
          <View style={styles.grow}>
            <Field label="Notes" value={weightNotes} onChangeText={setWeightNotes} placeholder="Optional" />
          </View>
        </View>
        <Button title="Record measurement" onPress={() => void saveWeight()} />
        {data.bodyWeights.length === 0 ? (
          <EmptyState title="No measurements" message="Record body weight to add a Progress trend." />
        ) : (
          data.bodyWeights
            .slice()
            .sort((left, right) => Date.parse(right.measuredAt) - Date.parse(left.measuredAt))
            .slice(0, 8)
            .map((entry) => (
              <View key={entry.id} style={styles.row}>
                <View style={styles.grow}>
                  <AppText style={styles.weight}>
                    {Number(gramsToUnit(entry.weightGrams, unit).toFixed(2))} {unit}
                  </AppText>
                  <AppText style={{ color: colors.textMuted }}>
                    {new Date(entry.measuredAt).toLocaleString()}
                    {entry.notes ? ` · ${entry.notes}` : ''}
                  </AppText>
                </View>
                <Button title="Delete" compact variant="ghost" onPress={() => void data.remove(entry)} />
              </View>
            ))
        )}
      </Card>

      <NutritionFoodModal
        visible={foodModal.visible}
        date={date}
        initialMode={foodModal.mode}
        initialCandidate={foodModal.candidate}
        onClose={() => setFoodModal((current) => ({ ...current, visible: false }))}
        onSaved={() => setFoodModal((current) => ({ ...current, visible: false }))}
      />
      <NutritionGoalModal visible={goalModalVisible} date={date} onClose={() => setGoalModalVisible(false)} />
    </Screen>
  )
}

const styles = StyleSheet.create({
  dateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16 },
  date: { fontSize: 19, fontWeight: '800', minWidth: 120, textAlign: 'center' },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  macroProgress: { gap: 7 },
  macroLabel: { flex: 1, fontWeight: '800' },
  actionRow: { flexDirection: 'row', gap: 8 },
  action: { flex: 1 },
  recentGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  recentCard: { flex: 1, minWidth: 155 },
  recentName: { fontWeight: '800' },
  fields: { flexDirection: 'row', gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  grow: { flex: 1, minWidth: 130 },
  entry: { fontSize: 18, fontWeight: '700' },
  calorie: { fontSize: 18, fontWeight: '800' },
  weight: { fontSize: 18, fontWeight: '800' },
})
