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
import { type ReactNode, useMemo, useState } from 'react'
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'
import Svg, { Circle, Polyline } from 'react-native-svg'
import { MiniLineChart, ProgressBar, SectionTitle } from '@/components/controls'
import { AppIcon, type AppIconName, IconButton, PageTitle, ProgressRing } from '@/components/design'
import { candidateFromEntry, type FoodCandidate, NutritionFoodModal } from '@/components/nutrition-food-modal'
import { NutritionGoalModal } from '@/components/nutrition-goal-modal'
import { AppText, Button, Card, EmptyState, Field, Metric, Screen } from '@/components/ui'
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
      <AppText numberOfLines={1} style={[styles.macroLabel, { color: colors.textMuted }]}>
        {label.toUpperCase()}
      </AppText>
      <AppText numberOfLines={1} adjustsFontSizeToFit style={styles.macroValue}>
        {macro(value)}g
      </AppText>
      <ProgressBar value={value} max={goal ?? 0} />
      <AppText numberOfLines={1} style={[styles.micro, { color: colors.textMuted }]}>
        {goal == null
          ? 'No target set'
          : value > goal
            ? `${macro(value - goal)}g over`
            : `${macro(goal - value)}g left`}
      </AppText>
    </View>
  )
}

function QuickNutritionAction({
  icon,
  label,
  onPress,
}: {
  icon: AppIconName
  label: string
  onPress: () => void
}) {
  const { colors } = useAppTheme()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.quickAction,
        { backgroundColor: colors.surface, borderColor: colors.border },
        pressed && styles.pressed,
      ]}
    >
      <AppIcon name={icon} color={colors.primary} />
      <AppText style={styles.quickLabel}>{label}</AppText>
    </Pressable>
  )
}

function NutritionPanel({
  title,
  visible,
  onClose,
  children,
}: {
  title: string
  visible: boolean
  onClose: () => void
  children: ReactNode
}) {
  const { colors } = useAppTheme()
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaProvider>
        <SafeAreaView
          edges={['top', 'left', 'right', 'bottom']}
          style={[styles.panel, { backgroundColor: colors.background }]}
        >
          <KeyboardAvoidingView style={styles.panel} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={[styles.panelHeader, { borderBottomColor: colors.border }]}>
              <IconButton icon="chevron-left" label="Back to nutrition" onPress={onClose} />
              <AppText style={styles.panelTitle}>{title}</AppText>
              <IconButton icon="close" label="Close" onPress={onClose} />
            </View>
            <ScrollView
              contentContainerStyle={styles.panelContent}
              keyboardShouldPersistTaps="handled"
              automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
            >
              {children}
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  )
}

function WeightSparkline({ values }: { values: number[] }) {
  const { colors } = useAppTheme()
  if (values.length < 2) return <AppIcon name="chevron-right" color={colors.textMuted} />
  const minimum = Math.min(...values)
  const range = Math.max(...values) - minimum || 1
  const points = values.map((value, index) => ({
    x: 4 + (index / (values.length - 1)) * 92,
    y: 36 - ((value - minimum) / range) * 28,
  }))
  const last = points[points.length - 1]
  return (
    <Svg width={100} height={42} accessibilityLabel="Recent body weight trend">
      <Polyline
        points={points.map(({ x, y }) => `${x},${y}`).join(' ')}
        fill="none"
        stroke={colors.primary}
        strokeWidth={2.5}
      />
      {last ? <Circle cx={last.x} cy={last.y} r={3} fill={colors.primary} /> : null}
    </Svg>
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
  const [panel, setPanel] = useState<'manual' | 'targets' | 'weight' | 'weekly' | 'entry' | null>(null)
  const [selectedEntry, setSelectedEntry] = useState<CalorieEntry | null>(null)
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
  const weights = useMemo(
    () =>
      data.bodyWeights
        .filter((entry) => entry.deletedAt === null)
        .slice()
        .sort((left, right) => Date.parse(left.measuredAt) - Date.parse(right.measuredAt)),
    [data.bodyWeights],
  )
  const latestWeight = weights[weights.length - 1]
  const weekStartWeight = latestWeight
    ? weights.find(
        (entry) => Date.parse(entry.measuredAt) >= Date.parse(latestWeight.measuredAt) - 7 * 86_400_000,
      )
    : undefined
  const weightDifference =
    latestWeight && weekStartWeight && latestWeight.id !== weekStartWeight.id
      ? gramsToUnit(latestWeight.weightGrams - weekStartWeight.weightGrams, unit)
      : null
  const dateTitle =
    date === localDateToday()
      ? 'Today'
      : date === shiftDate(localDateToday(), -1)
        ? 'Yesterday'
        : new Date(`${date}T12:00:00`).toLocaleDateString([], { weekday: 'long' })

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
    setPanel(null)
  }

  const editEntry = (entry: CalorieEntry) => {
    const instant = new Date(entry.eatenAt)
    setEditing(entry)
    setDescription(entry.description)
    setCalories(String(entry.calories))
    setTime(`${String(instant.getHours()).padStart(2, '0')}:${String(instant.getMinutes()).padStart(2, '0')}`)
    setPanel('manual')
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
    setPanel(null)
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
    setPanel(null)
  }

  const openTargets = () => {
    setGoalCalories(goal ? String(goal.calories) : '')
    setGoalProtein(goal?.proteinTenthsGrams == null ? '' : macro(goal.proteinTenthsGrams))
    setGoalCarbohydrate(goal?.carbohydrateTenthsGrams == null ? '' : macro(goal.carbohydrateTenthsGrams))
    setGoalFat(goal?.fatTenthsGrams == null ? '' : macro(goal.fatTenthsGrams))
    setPanel('targets')
  }

  const entryActions = (entry: CalorieEntry) => {
    setSelectedEntry(entry)
    setPanel('entry')
  }

  return (
    <Screen safeBottom={false}>
      <PageTitle
        eyebrow="Nutrition"
        title="Fuel the work."
        accessory={<IconButton icon="plus" label="Add food" selected onPress={() => openFood('browse')} />}
      />
      <View style={styles.dateRow}>
        <IconButton icon="chevron-left" label="Previous day" onPress={() => setDate(shiftDate(date, -1))} />
        <View style={styles.dateLabel}>
          <AppText style={styles.date}>{dateTitle}</AppText>
          <AppText style={[styles.micro, { color: colors.textMuted }]}>
            {new Date(`${date}T12:00:00`).toLocaleDateString([], {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
            })}
          </AppText>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Next day"
          accessibilityState={{ disabled: date >= localDateToday() }}
          disabled={date >= localDateToday()}
          onPress={() => setDate(shiftDate(date, 1))}
          style={[styles.dateArrow, date >= localDateToday() && styles.disabled]}
        >
          <AppIcon name="chevron-right" color={colors.textMuted} />
        </Pressable>
      </View>

      <Card style={styles.calorieSummary}>
        <ProgressRing
          value={day.totals.calories}
          max={goal?.calories ?? 0}
          primary={day.totals.calories.toLocaleString()}
          secondary={
            goal
              ? `${Math.abs(remaining).toLocaleString()} ${remaining < 0 ? 'over goal' : 'remaining'}`
              : 'No target set'
          }
          size={116}
        />
        <View style={styles.calorieStats}>
          <View style={[styles.summaryRow, { borderBottomColor: colors.border }]}>
            <AppText style={styles.summaryLabel}>GOAL</AppText>
            <AppText style={styles.summaryValue}>{(goal?.calories ?? 0).toLocaleString()}</AppText>
          </View>
          <View style={[styles.summaryRow, { borderBottomColor: colors.border }]}>
            <AppText style={styles.summaryLabel}>FOOD</AppText>
            <AppText style={styles.summaryValue}>{day.totals.calories.toLocaleString()}</AppText>
          </View>
          <View style={styles.summaryRow}>
            <AppText style={styles.summaryLabel}>PROGRESS</AppText>
            <AppText style={[styles.summaryValue, { color: colors.primary }]}>
              {goal?.calories ? Math.round((day.totals.calories / goal.calories) * 100) : 0}%
            </AppText>
          </View>
        </View>
      </Card>
      <View style={styles.macroCards}>
        <Card style={styles.macroCard}>
          <MacroProgress
            label="Protein"
            value={day.totals.proteinTenthsGrams}
            goal={goal?.proteinTenthsGrams}
          />
        </Card>
        <Card style={styles.macroCard}>
          <MacroProgress
            label="Carbs"
            value={day.totals.carbohydrateTenthsGrams}
            goal={goal?.carbohydrateTenthsGrams}
          />
        </Card>
        <Card style={styles.macroCard}>
          <MacroProgress label="Fat" value={day.totals.fatTenthsGrams} goal={goal?.fatTenthsGrams} />
        </Card>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Edit daily nutrition targets"
        onPress={openTargets}
        style={({ pressed }) => [
          styles.navigationRow,
          { backgroundColor: colors.surface, borderColor: colors.border },
          pressed && styles.pressed,
        ]}
      >
        <AppIcon name="tune-variant" color={colors.primary} />
        <View style={styles.flex}>
          <AppText style={styles.navigationTitle}>Daily nutrition targets</AppText>
          <AppText style={[styles.micro, { color: colors.textMuted }]}>
            {goal
              ? `${goal.calories.toLocaleString()} kcal · ${entryMacro(goal.proteinTenthsGrams)}P · ${entryMacro(goal.carbohydrateTenthsGrams)}C · ${entryMacro(goal.fatTenthsGrams)}F`
              : 'Set your calorie and macro goals'}
          </AppText>
        </View>
        <AppIcon name="chevron-right" color={colors.textMuted} />
      </Pressable>
      {day.totals.entriesWithUnknownMacros > 0 ? (
        <Card style={{ borderColor: colors.warning }}>
          {day.totals.entriesWithUnknownMacros > 0 ? (
            <AppText style={{ color: colors.warning }}>
              {day.totals.entriesWithUnknownMacros} calorie-only{' '}
              {day.totals.entriesWithUnknownMacros === 1 ? 'entry is' : 'entries are'} excluded from macro
              totals.
            </AppText>
          ) : null}
        </Card>
      ) : null}

      <View style={styles.actionRow}>
        <QuickNutritionAction icon="magnify" label="Search" onPress={() => openFood('browse')} />
        <QuickNutritionAction icon="barcode-scan" label="Scan" onPress={() => openFood('scan')} />
        <QuickNutritionAction icon="star-outline" label="Favorites" onPress={() => openFood('browse')} />
        <QuickNutritionAction icon="content-copy" label="Yesterday" onPress={() => void copyYesterday()} />
      </View>

      <SectionTitle
        action={
          <AppText style={[styles.micro, { color: colors.textMuted }]}>
            {day.entries.length} {day.entries.length === 1 ? 'entry' : 'entries'}
          </AppText>
        }
      >
        Food log
      </SectionTitle>
      {day.entries.length === 0 ? (
        <EmptyState title="Nothing logged" message="Search, scan, or add a food to start today's log." />
      ) : (
        day.entries.map((entry) => (
          <Pressable
            key={entry.id}
            accessibilityRole="button"
            accessibilityLabel={`${entry.description}, ${entry.calories} calories. Edit, log again, or delete`}
            onPress={() => entryActions(entry)}
            style={({ pressed }) => [
              styles.foodRow,
              { borderBottomColor: colors.border },
              pressed && styles.pressed,
            ]}
          >
            <AppText style={[styles.foodTime, { color: colors.textMuted }]}>
              {new Date(entry.eatenAt).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
                hour12: false,
                timeZone: timezone,
              })}
            </AppText>
            <View style={[styles.foodDot, { backgroundColor: colors.primary }]} />
            <View style={styles.flex}>
              <AppText style={styles.entry}>{entry.description}</AppText>
              <AppText style={[styles.micro, { color: colors.textMuted }]}>
                {entryMacro(entry.proteinTenthsGrams)}P · {entryMacro(entry.carbohydrateTenthsGrams)}C ·{' '}
                {entryMacro(entry.fatTenthsGrams)}F
              </AppText>
            </View>
            <View style={styles.foodEnergy}>
              <AppText style={styles.calorie}>{entry.calories}</AppText>
              <AppText style={[styles.micro, { color: colors.textMuted }]}>kcal</AppText>
            </View>
          </Pressable>
        ))
      )}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="View body weight and record a measurement"
        onPress={() => setPanel('weight')}
        style={({ pressed }) => [
          styles.navigationRow,
          styles.weightTeaser,
          { backgroundColor: colors.surface, borderColor: colors.border },
          pressed && styles.pressed,
        ]}
      >
        <AppIcon name="scale-bathroom" size={26} color={colors.primary} />
        <View style={styles.flex}>
          <AppText style={[styles.micro, { color: colors.textMuted }]}>BODY WEIGHT</AppText>
          <AppText style={styles.weight}>
            {latestWeight
              ? `${Number(gramsToUnit(latestWeight.weightGrams, unit).toFixed(2))} ${unit}`
              : 'Record weight'}
          </AppText>
          <AppText style={[styles.micro, { color: colors.primary }]}>
            {weightDifference === null
              ? 'View measurements'
              : `${weightDifference > 0 ? '+' : ''}${Number(weightDifference.toFixed(2))} ${unit} over 7 days`}
          </AppText>
        </View>
        <WeightSparkline values={weights.slice(-8).map((entry) => entry.weightGrams)} />
      </Pressable>
      <View style={styles.secondaryActions}>
        <Button
          title="Quick calories"
          compact
          variant="ghost"
          onPress={() => {
            clearManualForm()
            setPanel('manual')
          }}
        />
        <Button title="Weekly summary" compact variant="ghost" onPress={() => setPanel('weekly')} />
      </View>

      <NutritionPanel title="Food entry" visible={panel === 'entry'} onClose={() => setPanel(null)}>
        {selectedEntry ? (
          <>
            <SectionTitle>{selectedEntry.description}</SectionTitle>
            <AppText style={{ color: colors.textMuted }}>
              {selectedEntry.brand ? `${selectedEntry.brand} · ` : ''}
              {selectedEntry.calories} kcal
            </AppText>
            <AppText style={{ color: colors.textMuted }}>
              P {entryMacro(selectedEntry.proteinTenthsGrams)} · C{' '}
              {entryMacro(selectedEntry.carbohydrateTenthsGrams)} · F{' '}
              {entryMacro(selectedEntry.fatTenthsGrams)} g
            </AppText>
            <Button title="Edit entry" variant="secondary" onPress={() => editEntry(selectedEntry)} />
            <Button
              title="Log again"
              variant="outline"
              onPress={() => {
                setPanel(null)
                setTimeout(() => openFood('browse', candidateFromEntry(selectedEntry)), 350)
              }}
            />
            <Button
              title="Delete entry"
              variant="danger"
              onPress={() =>
                Alert.alert(
                  'Delete this entry?',
                  'This removes it from your food log and nutrition totals.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Delete',
                      style: 'destructive',
                      onPress: () => {
                        void data.remove(selectedEntry)
                        setPanel(null)
                      },
                    },
                  ],
                )
              }
            />
          </>
        ) : null}
      </NutritionPanel>

      <NutritionPanel
        title={editing === null ? 'Quick calories' : 'Edit entry'}
        visible={panel === 'manual'}
        onClose={() => setPanel(null)}
      >
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
      </NutritionPanel>

      <NutritionPanel title="Nutrition targets" visible={panel === 'targets'} onClose={() => setPanel(null)}>
        <View style={styles.row}>
          <View style={styles.grow}>
            <SectionTitle>Daily targets</SectionTitle>
            <AppText style={{ color: colors.textMuted }}>
              Changes apply from {date}; older days retain their original targets.
            </AppText>
          </View>
          <Button
            title="Suggest"
            compact
            variant="secondary"
            onPress={() => {
              setPanel(null)
              setTimeout(() => setGoalModalVisible(true), 350)
            }}
          />
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
        <Card style={styles.guidance}>
          <AppIcon name="shield-check-outline" color={colors.primary} />
          <View style={styles.flex}>
            <AppText style={[styles.micro, { color: colors.primary }]}>YOU STAY IN CONTROL</AppText>
            <AppText>Nothing changes until you review and save.</AppText>
          </View>
        </Card>
        <Button title={`Save targets from ${date}`} onPress={() => void saveManualGoal()} />
      </NutritionPanel>

      <NutritionPanel title="Body weight" visible={panel === 'weight'} onClose={() => setPanel(null)}>
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
          <>
            <MiniLineChart
              values={weights.slice(-14).map((entry) => gramsToUnit(entry.weightGrams, unit))}
              labels={weights
                .slice(-14)
                .map((entry) =>
                  new Date(entry.measuredAt).toLocaleDateString([], { month: 'short', day: 'numeric' }),
                )}
            />
            {data.bodyWeights
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
              ))}
          </>
        )}
      </NutritionPanel>

      <NutritionPanel title="Seven-day view" visible={panel === 'weekly'} onClose={() => setPanel(null)}>
        <AppText style={{ color: colors.textMuted }}>Calendar-day averages ending on {date}.</AppText>
        <View style={styles.metrics}>
          <Metric label="Avg kcal" value={String(weekly.calories)} />
          <Metric label="Avg protein" value={`${macro(weekly.protein)} g`} />
        </View>
        <Card>
          <AppText>
            P {macro(weekly.protein)} g · C {macro(weekly.carbohydrate)} g · F {macro(weekly.fat)} g
          </AppText>
          <AppText style={{ color: colors.textMuted }}>
            Logged {weekly.loggedDays}/7 days · within 10% of calorie goal {weekly.adherentDays}/
            {weekly.loggedDays} logged days
          </AppText>
        </Card>
        <Button title="Copy yesterday" variant="secondary" onPress={() => void copyYesterday()} />
      </NutritionPanel>

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
  panel: { flex: 1 },
  panelHeader: {
    minHeight: 58,
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  panelTitle: { flex: 1, fontSize: 16, fontWeight: '800', textAlign: 'center' },
  panelContent: { padding: 18, paddingBottom: 32, gap: 16 },
  dateRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 8 },
  dateLabel: { flex: 1, alignItems: 'center', gap: 2 },
  dateArrow: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.35 },
  date: { fontSize: 13, fontWeight: '800', textAlign: 'center' },
  micro: { fontSize: 11 },
  flex: { flex: 1, minWidth: 0, gap: 3 },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  macroProgress: { gap: 5 },
  macroLabel: { fontSize: 10, letterSpacing: 0.4 },
  macroValue: { fontSize: 21, fontWeight: '800', fontVariant: ['tabular-nums'] },
  actionRow: { flexDirection: 'row', gap: 7 },
  quickAction: {
    flex: 1,
    minHeight: 66,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  quickLabel: { fontSize: 11, fontWeight: '800' },
  pressed: { opacity: 0.72 },
  calorieSummary: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  calorieStats: { flex: 1 },
  summaryRow: {
    minHeight: 36,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  summaryLabel: { fontSize: 10, fontWeight: '800', color: '#9AB5A3', letterSpacing: 0.8 },
  summaryValue: { fontSize: 14, fontWeight: '800', fontVariant: ['tabular-nums'] },
  macroCards: { flexDirection: 'row', gap: 7 },
  macroCard: { flex: 1, minWidth: 0, padding: 11, borderWidth: 0, borderRadius: 13 },
  navigationRow: {
    minHeight: 62,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 13,
  },
  navigationTitle: { fontSize: 13, fontWeight: '700' },
  guidance: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  foodRow: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  foodTime: { width: 39, fontSize: 11, fontVariant: ['tabular-nums'] },
  foodDot: { width: 7, height: 7, borderRadius: 4 },
  foodEnergy: { alignItems: 'flex-end', gap: 2 },
  weightTeaser: { padding: 14, borderRadius: 15, marginTop: 4 },
  secondaryActions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 4 },
  fields: { flexDirection: 'row', gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  grow: { flex: 1, minWidth: 0 },
  entry: { fontSize: 13, fontWeight: '700' },
  calorie: { fontSize: 13, fontWeight: '800' },
  weight: { fontSize: 18, fontWeight: '800' },
})
