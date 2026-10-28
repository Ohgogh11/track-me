import {
  type CalorieEntry,
  type FoodSearchResult,
  type FoodServing,
  type FoodSource,
  type PersonalFood,
  scaleNutritionPer100Grams,
} from '@track-me/contracts'
import { CameraView, useCameraPermissions } from 'expo-camera'
import { randomUUID } from 'expo-crypto'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'
import { ChipRow, ChoiceChip, SectionTitle, SegmentedControl } from '@/components/controls'
import { AppIcon, IconButton } from '@/components/design'
import { AppText, Button, Card, EmptyState, Field } from '@/components/ui'
import { lookupFoodBarcode, searchFoods } from '@/data/food-api'
import { localDateToday } from '@/lib/date'
import { useAppAuth } from '@/providers/auth-provider'
import { useData } from '@/providers/data-provider'
import { useAppTheme } from '@/theme/use-theme'

export interface FoodCandidate {
  name: string
  brand: string | null
  source: FoodSource
  providerId: string | null
  barcode: string | null
  caloriesPer100Grams: number
  proteinTenthsPer100Grams: number | null
  carbohydrateTenthsPer100Grams: number | null
  fatTenthsPer100Grams: number | null
  servings: FoodServing[]
  attribution: string
  complete: boolean
  personalFoodId: string | null
}

function currentTime(): string {
  const now = new Date()
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
}

function fromSearchResult(result: FoodSearchResult): FoodCandidate {
  return {
    ...result,
    source: result.provider,
    personalFoodId: null,
  }
}

export function candidateFromPersonalFood(food: PersonalFood): FoodCandidate {
  return {
    name: food.name,
    brand: food.brand,
    source: food.source,
    providerId: food.providerId,
    barcode: food.barcode,
    caloriesPer100Grams: food.caloriesPer100Grams,
    proteinTenthsPer100Grams: food.proteinTenthsPer100Grams,
    carbohydrateTenthsPer100Grams: food.carbohydrateTenthsPer100Grams,
    fatTenthsPer100Grams: food.fatTenthsPer100Grams,
    servings: [
      {
        id: 'default',
        label: food.defaultServingLabel,
        grams: food.defaultServingGrams,
      },
      { id: '100g', label: '100 g', grams: 100 },
    ],
    attribution: food.source === 'custom' ? 'Personal food' : 'Saved personal copy',
    complete:
      food.proteinTenthsPer100Grams !== null &&
      food.carbohydrateTenthsPer100Grams !== null &&
      food.fatTenthsPer100Grams !== null,
    personalFoodId: food.id,
  }
}

export function candidateFromEntry(entry: CalorieEntry): FoodCandidate {
  const grams = entry.servingGrams ?? 100
  const per100 = (value: number | null | undefined) =>
    value === null || value === undefined ? null : Math.round((value / grams) * 100)
  return {
    name: entry.description,
    brand: entry.brand ?? null,
    source: entry.source ?? 'manual',
    providerId: entry.providerId ?? null,
    barcode: entry.barcode ?? null,
    caloriesPer100Grams: Math.max(1, Math.round((entry.calories / grams) * 100)),
    proteinTenthsPer100Grams: per100(entry.proteinTenthsGrams),
    carbohydrateTenthsPer100Grams: per100(entry.carbohydrateTenthsGrams),
    fatTenthsPer100Grams: per100(entry.fatTenthsGrams),
    servings: [{ id: 'previous', label: entry.servingLabel ?? `${grams} g`, grams }],
    attribution: 'Previous entry',
    complete:
      entry.proteinTenthsGrams !== null &&
      entry.proteinTenthsGrams !== undefined &&
      entry.carbohydrateTenthsGrams !== null &&
      entry.carbohydrateTenthsGrams !== undefined &&
      entry.fatTenthsGrams !== null &&
      entry.fatTenthsGrams !== undefined,
    personalFoodId: null,
  }
}

function blankCustomCandidate(): FoodCandidate {
  return {
    name: '',
    brand: null,
    source: 'custom',
    providerId: null,
    barcode: null,
    caloriesPer100Grams: 0,
    proteinTenthsPer100Grams: null,
    carbohydrateTenthsPer100Grams: null,
    fatTenthsPer100Grams: null,
    servings: [{ id: 'custom', label: '1 serving (100 g)', grams: 100 }],
    attribution: 'Personal food',
    complete: false,
    personalFoodId: null,
  }
}

function macroText(tenths: number | null): string {
  return tenths === null ? '' : String(Number((tenths / 10).toFixed(1)))
}

function parseMacro(value: string): number | null {
  if (value.trim() === '') return null
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? Math.round(number * 10) : null
}

function FoodResultCard({ candidate, onPress }: { candidate: FoodCandidate; onPress: () => void }) {
  const { colors } = useAppTheme()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Review ${candidate.name}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.foodResult,
        { borderBottomColor: colors.border },
        pressed && styles.pressed,
      ]}
    >
      {candidate.personalFoodId ? <AppIcon name="star" color={colors.primary} /> : null}
      <View style={styles.grow}>
        <AppText style={styles.foodName}>{candidate.name}</AppText>
        <AppText style={[styles.small, { color: colors.textMuted }]}>
          {[candidate.brand, candidate.complete ? 'Complete data' : 'Incomplete data', candidate.attribution]
            .filter(Boolean)
            .join(' · ')}
        </AppText>
      </View>
      <View style={styles.energy}>
        <AppText style={styles.foodCalories}>{candidate.caloriesPer100Grams}</AppText>
        <AppText style={[styles.small, { color: colors.textMuted }]}>kcal / 100g</AppText>
      </View>
      <AppIcon name="chevron-right" color={colors.textMuted} />
    </Pressable>
  )
}

export function NutritionFoodModal({
  visible,
  date,
  initialCandidate,
  initialMode,
  onClose,
  onSaved,
}: {
  visible: boolean
  date: string
  initialCandidate: FoodCandidate | null
  initialMode: 'browse' | 'scan' | 'custom'
  onClose: () => void
  onSaved: () => void
}) {
  const data = useData()
  const auth = useAppAuth()
  const { colors } = useAppTheme()
  const [stage, setStage] = useState<'browse' | 'scan' | 'review'>('browse')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [results, setResults] = useState<FoodCandidate[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [candidate, setCandidate] = useState<FoodCandidate | null>(null)
  const [name, setName] = useState('')
  const [brand, setBrand] = useState('')
  const [grams, setGrams] = useState('100')
  const [serving, setServing] = useState<FoodServing>({ id: '100g', label: '100 g', grams: 100 })
  const [calories, setCalories] = useState('')
  const [protein, setProtein] = useState('')
  const [carbohydrate, setCarbohydrate] = useState('')
  const [fat, setFat] = useState('')
  const [time, setTime] = useState(currentTime())
  const [favorite, setFavorite] = useState(false)
  const [editingDetails, setEditingDetails] = useState(false)
  const [scanned, setScanned] = useState(false)
  const [permission, requestPermission] = useCameraPermissions()
  const personalFoodsRef = useRef(data.personalFoods)
  personalFoodsRef.current = data.personalFoods

  const favoriteFoods = useMemo(
    () => data.personalFoods.filter((food) => food.favorite),
    [data.personalFoods],
  )
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

  const openReview = useCallback((next: FoodCandidate) => {
    const firstServing = next.servings[0] ?? { id: '100g', label: '100 g', grams: 100 }
    const totals = scaleNutritionPer100Grams(next, firstServing.grams)
    const existing = next.personalFoodId
      ? personalFoodsRef.current.find((food) => food.id === next.personalFoodId)
      : undefined
    setCandidate(next)
    setName(next.name)
    setBrand(next.brand ?? '')
    setServing(firstServing)
    setGrams(String(firstServing.grams))
    setCalories(String(totals.calories))
    setProtein(macroText(totals.proteinTenthsGrams))
    setCarbohydrate(macroText(totals.carbohydrateTenthsGrams))
    setFat(macroText(totals.fatTenthsGrams))
    setFavorite(existing?.favorite ?? false)
    setEditingDetails(next.name === '')
    setTime(currentTime())
    setStage('review')
  }, [])

  useEffect(() => {
    if (!visible) return
    setError(null)
    setScanned(false)
    if (initialCandidate !== null) openReview(initialCandidate)
    else if (initialMode === 'custom') openReview(blankCustomCandidate())
    else setStage(initialMode)
  }, [initialCandidate, initialMode, openReview, visible])

  useEffect(() => {
    if (!visible || stage !== 'browse' || query.trim().length < 2) {
      if (query.trim().length < 2) {
        setResults([])
        setHasMore(false)
      }
      return
    }
    let active = true
    const timer = setTimeout(() => {
      setLoading(true)
      setError(null)
      auth
        .getToken()
        .then((token) => searchFoods(query, page, token))
        .then((response) => {
          if (!active) return
          const next = response.results.map(fromSearchResult)
          setResults((current) => (page === 1 ? next : [...current, ...next]))
          setHasMore(response.hasMore)
        })
        .catch((searchError: unknown) => {
          if (active) setError(searchError instanceof Error ? searchError.message : 'Food search failed')
        })
        .finally(() => {
          if (active) setLoading(false)
        })
    }, 450)
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [auth, page, query, stage, visible])

  const updateGrams = (value: string) => {
    setGrams(value)
    if (candidate === null) return
    const amount = Math.round(Number(value))
    if (!Number.isFinite(amount) || amount <= 0) return
    const totals = scaleNutritionPer100Grams(candidate, amount)
    setCalories(String(totals.calories))
    setProtein(macroText(totals.proteinTenthsGrams))
    setCarbohydrate(macroText(totals.carbohydrateTenthsGrams))
    setFat(macroText(totals.fatTenthsGrams))
  }

  const chooseServing = (next: FoodServing) => {
    setServing(next)
    updateGrams(String(next.grams))
  }

  const scanBarcode = async (barcode: string) => {
    if (scanned) return
    setScanned(true)
    setLoading(true)
    setError(null)
    try {
      const token = await auth.getToken()
      const response = await lookupFoodBarcode(barcode, token)
      const result = response.results[0]
      if (result === undefined) {
        setError('This barcode is not in Open Food Facts. Create a custom food instead.')
        return
      }
      openReview(fromSearchResult(result))
    } catch (lookupError) {
      setError(lookupError instanceof Error ? lookupError.message : 'Barcode lookup failed')
    } finally {
      setLoading(false)
    }
  }

  const save = async () => {
    if (candidate === null) return
    const amountGrams = Math.round(Number(grams))
    const calorieValue = Math.round(Number(calories))
    const proteinValue = parseMacro(protein)
    const carbohydrateValue = parseMacro(carbohydrate)
    const fatValue = parseMacro(fat)
    if (
      name.trim() === '' ||
      !Number.isFinite(amountGrams) ||
      amountGrams <= 0 ||
      !Number.isFinite(calorieValue) ||
      calorieValue <= 0 ||
      !/^\d{2}:\d{2}$/.test(time)
    ) {
      Alert.alert('Check the food', 'Add a name, positive serving weight and calories, and a valid time.')
      return
    }
    const expected = scaleNutritionPer100Grams(candidate, amountGrams)
    const corrected =
      candidate.source === 'custom' ||
      name.trim() !== candidate.name ||
      brand.trim() !== (candidate.brand ?? '') ||
      calorieValue !== expected.calories ||
      proteinValue !== expected.proteinTenthsGrams ||
      carbohydrateValue !== expected.carbohydrateTenthsGrams ||
      fatValue !== expected.fatTenthsGrams
    const now = new Date().toISOString()
    const source: FoodSource = corrected ? 'custom' : candidate.source
    const entry: CalorieEntry = {
      id: randomUUID(),
      kind: 'calorie_entry',
      version: 0,
      updatedAt: now,
      deletedAt: null,
      description: name.trim(),
      calories: calorieValue,
      eatenAt: new Date(`${date}T${time}:00`).toISOString(),
      brand: brand.trim() || null,
      source,
      providerId: candidate.providerId,
      barcode: candidate.barcode,
      servingLabel: serving.label,
      servingGrams: amountGrams,
      servingCountThousandths: Math.round((amountGrams / serving.grams) * 1_000),
      proteinTenthsGrams: proteinValue,
      carbohydrateTenthsGrams: carbohydrateValue,
      fatTenthsGrams: fatValue,
    }
    await data.save(entry)

    const existing =
      candidate.personalFoodId === null
        ? undefined
        : data.personalFoods.find((food) => food.id === candidate.personalFoodId)
    if (existing !== undefined && !favorite && !corrected && existing.source !== 'custom') {
      await data.remove(existing)
    } else if (corrected || favorite || existing?.source === 'custom') {
      const per100 = (value: number | null) =>
        value === null ? null : Math.round((value / amountGrams) * 100)
      const personalFood: PersonalFood = {
        id: existing?.id ?? randomUUID(),
        kind: 'food_item',
        version: existing?.version ?? 0,
        updatedAt: now,
        deletedAt: null,
        name: name.trim(),
        brand: brand.trim() || null,
        source,
        providerId: candidate.providerId,
        barcode: candidate.barcode,
        caloriesPer100Grams: Math.round((calorieValue / amountGrams) * 100),
        proteinTenthsPer100Grams: per100(proteinValue),
        carbohydrateTenthsPer100Grams: per100(carbohydrateValue),
        fatTenthsPer100Grams: per100(fatValue),
        defaultServingGrams: amountGrams,
        defaultServingLabel: serving.label,
        favorite,
      }
      await data.save(personalFood)
    }
    onSaved()
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaProvider>
        <SafeAreaView
          edges={['top', 'right', 'bottom', 'left']}
          style={[styles.safeArea, { backgroundColor: colors.background }]}
        >
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modal}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <IconButton
                icon="chevron-left"
                label={stage === 'browse' ? 'Back to nutrition' : 'Back to food search'}
                onPress={() => (stage === 'browse' ? onClose() : setStage('browse'))}
              />
              <AppText style={styles.modalTitle}>
                {stage === 'review' ? 'Review food' : stage === 'scan' ? 'Scan barcode' : 'Add food'}
              </AppText>
              <IconButton icon="close" label="Close food logging" onPress={onClose} />
            </View>
            {stage === 'browse' ? (
              <ScrollView
                automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
                contentContainerStyle={styles.content}
                keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
                keyboardShouldPersistTaps="handled"
              >
                <SegmentedControl
                  value="search"
                  options={[
                    { label: 'Search', value: 'search' },
                    { label: 'Barcode', value: 'barcode' },
                    { label: 'Custom', value: 'custom' },
                  ]}
                  onChange={(value) => {
                    if (value === 'barcode') {
                      setScanned(false)
                      setStage('scan')
                    } else if (value === 'custom') openReview(blankCustomCandidate())
                  }}
                />
                <View
                  style={[styles.searchBox, { backgroundColor: colors.surface, borderColor: colors.border }]}
                >
                  <AppIcon name="magnify" color={colors.textMuted} />
                  <TextInput
                    accessibilityLabel="Search foods"
                    value={query}
                    onChangeText={(value) => {
                      setQuery(value)
                      setPage(1)
                    }}
                    placeholder="Search foods…"
                    placeholderTextColor={colors.textMuted}
                    autoCapitalize="none"
                    style={[styles.searchInput, { color: colors.text }]}
                  />
                </View>
                {favoriteFoods.length > 0 ? (
                  <>
                    <SectionTitle
                      action={
                        <AppText style={[styles.small, { color: colors.textMuted }]}>
                          Available offline
                        </AppText>
                      }
                    >
                      Favorites
                    </SectionTitle>
                    {favoriteFoods.map((food) => (
                      <FoodResultCard
                        key={food.id}
                        candidate={candidateFromPersonalFood(food)}
                        onPress={() => openReview(candidateFromPersonalFood(food))}
                      />
                    ))}
                  </>
                ) : null}
                {query.trim().length < 2 && recentEntries.length > 0 ? (
                  <>
                    <SectionTitle
                      action={
                        <AppText style={[styles.small, { color: colors.textMuted }]}>Log again</AppText>
                      }
                    >
                      Recent foods
                    </SectionTitle>
                    {recentEntries.map((entry) => (
                      <FoodResultCard
                        key={entry.id}
                        candidate={candidateFromEntry(entry)}
                        onPress={() => openReview(candidateFromEntry(entry))}
                      />
                    ))}
                  </>
                ) : null}
                {error ? (
                  <Card style={{ borderColor: colors.danger }}>
                    <AppText style={{ color: colors.danger }}>{error}</AppText>
                    <AppText style={{ color: colors.textMuted }}>
                      Favorites and custom food entry remain available offline.
                    </AppText>
                  </Card>
                ) : null}
                {results.length > 0 ? (
                  <SectionTitle
                    action={<AppText style={[styles.small, { color: colors.primary }]}>LIVE</AppText>}
                  >
                    USDA results
                  </SectionTitle>
                ) : null}
                {results.map((result) => (
                  <FoodResultCard
                    key={`${result.source}:${result.providerId}`}
                    candidate={result}
                    onPress={() => openReview(result)}
                  />
                ))}
                {loading ? <ActivityIndicator color={colors.primary} /> : null}
                {hasMore && !loading ? (
                  <Button
                    title="Load more"
                    variant="secondary"
                    onPress={() => setPage((value) => value + 1)}
                  />
                ) : null}
                <View style={[styles.note, { backgroundColor: colors.surfaceRaised }]}>
                  <AppIcon name="cloud-off-outline" color={colors.textMuted} />
                  <AppText style={[styles.grow, { color: colors.textMuted }]}>
                    Provider results are live. Star a food to keep it offline.
                  </AppText>
                </View>
                {query.trim().length < 2 && favoriteFoods.length === 0 ? (
                  <EmptyState
                    title="Find or create food"
                    message="Search USDA, scan a packaged-food barcode, or create a personal food."
                  />
                ) : null}
              </ScrollView>
            ) : null}

            {stage === 'scan' ? (
              <ScrollView contentContainerStyle={styles.content}>
                <SegmentedControl
                  value="barcode"
                  options={[
                    { label: 'Search', value: 'search' },
                    { label: 'Barcode', value: 'barcode' },
                    { label: 'Custom', value: 'custom' },
                  ]}
                  onChange={(value) => {
                    if (value === 'search') setStage('browse')
                    if (value === 'custom') openReview(blankCustomCandidate())
                  }}
                />
                {!permission?.granted ? (
                  <Card>
                    <SectionTitle>Camera access</SectionTitle>
                    <AppText style={{ color: colors.textMuted }}>
                      Camera permission is used only to read a food barcode.
                    </AppText>
                    <Button title="Allow camera" onPress={() => void requestPermission()} />
                  </Card>
                ) : (
                  <CameraView
                    style={styles.camera}
                    barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'] }}
                    onBarcodeScanned={scanned ? undefined : ({ data: barcode }) => void scanBarcode(barcode)}
                  />
                )}
                {loading ? <ActivityIndicator color={colors.primary} /> : null}
                {error ? <AppText style={{ color: colors.danger }}>{error}</AppText> : null}
                {scanned && !loading ? (
                  <Button
                    title="Scan again"
                    variant="secondary"
                    onPress={() => {
                      setError(null)
                      setScanned(false)
                    }}
                  />
                ) : null}
              </ScrollView>
            ) : null}

            {stage === 'review' && candidate !== null ? (
              <ScrollView
                automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
                contentContainerStyle={styles.content}
                keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
                keyboardShouldPersistTaps="handled"
              >
                <View style={styles.reviewHeading}>
                  <AppText style={[styles.eyebrow, { color: colors.primary }]}>REVIEW FOOD</AppText>
                  <AppText style={styles.reviewName}>{name || 'Create a custom food'}</AppText>
                  <AppText style={[styles.small, { color: colors.textMuted }]}>
                    {[
                      brand,
                      candidate.attribution,
                      candidate.complete ? 'Complete nutrition' : 'Incomplete nutrition',
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </AppText>
                </View>
                {!candidate.complete ? (
                  <Card style={{ borderColor: colors.warning }}>
                    <AppText style={{ color: colors.warning }}>
                      Some macro values are missing. Review the values before saving.
                    </AppText>
                  </Card>
                ) : null}
                <View
                  style={[
                    styles.servingControl,
                    { backgroundColor: colors.surface, borderColor: colors.border },
                  ]}
                >
                  <IconButton
                    icon="minus"
                    label="Decrease serving"
                    onPress={() =>
                      updateGrams(String(Math.max(1, Math.round(Number(grams) - serving.grams))))
                    }
                  />
                  <View style={styles.servingCenter}>
                    <View style={styles.servingAmount}>
                      <TextInput
                        accessibilityLabel="Serving weight in grams"
                        value={grams}
                        onChangeText={updateGrams}
                        keyboardType="decimal-pad"
                        selectTextOnFocus
                        style={[styles.servingInput, { color: colors.text }]}
                      />
                      <AppText style={styles.servingUnit}>g</AppText>
                    </View>
                    <AppText style={[styles.small, { color: colors.textMuted }]}>
                      {Number.isFinite(Number(grams))
                        ? Number((Number(grams) / serving.grams).toFixed(2))
                        : '—'}{' '}
                      servings · {serving.label}
                    </AppText>
                  </View>
                  <IconButton
                    icon="plus"
                    label="Increase serving"
                    onPress={() =>
                      updateGrams(String(Math.max(1, Math.round(Number(grams) + serving.grams))))
                    }
                  />
                </View>
                <ChipRow>
                  {candidate.servings.map((option) => (
                    <ChoiceChip
                      key={option.id}
                      label={option.label}
                      selected={option.id === serving.id}
                      onPress={() => chooseServing(option)}
                    />
                  ))}
                </ChipRow>
                <View style={[styles.reviewMacros, { backgroundColor: colors.surface }]}>
                  {[
                    ['KCAL', calories || '—'],
                    ['PROTEIN', protein ? `${protein}g` : '—'],
                    ['CARBS', carbohydrate ? `${carbohydrate}g` : '—'],
                    ['FAT', fat ? `${fat}g` : '—'],
                  ].map(([label, value]) => (
                    <View key={label} style={styles.reviewMacro}>
                      <AppText style={[styles.eyebrow, { color: colors.textMuted }]}>{label}</AppText>
                      <AppText numberOfLines={1} adjustsFontSizeToFit style={styles.reviewMacroValue}>
                        {value}
                      </AppText>
                    </View>
                  ))}
                </View>
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: favorite }}
                  onPress={() => setFavorite((value) => !value)}
                  style={styles.favoriteRow}
                >
                  <AppIcon
                    name={favorite ? 'checkbox-marked-outline' : 'checkbox-blank-outline'}
                    color={favorite ? colors.primary : colors.textMuted}
                  />
                  <AppIcon name={favorite ? 'star' : 'star-outline'} color={colors.primary} />
                  <AppText style={styles.foodName}>Star for offline use</AppText>
                </Pressable>
                {!editingDetails ? (
                  <Button
                    title={`Add to ${date === localDateToday() ? 'today' : date} · ${Number(calories) || 0} kcal`}
                    onPress={() => void save()}
                  />
                ) : null}
                <Button
                  title={editingDetails ? 'Hide food details' : `Edit nutrition, name or time · ${time}`}
                  variant="ghost"
                  onPress={() => setEditingDetails((current) => !current)}
                />
                {editingDetails ? (
                  <>
                    <AppText style={{ color: colors.textMuted }}>
                      Corrections create a private personal copy. Shared provider data is never changed.
                    </AppText>
                    <Field label="Food" value={name} onChangeText={setName} placeholder="Food name" />
                    <Field
                      label="Brand (optional)"
                      value={brand}
                      onChangeText={setBrand}
                      placeholder="Brand"
                    />
                    <Field
                      label="Time (HH:MM)"
                      value={time}
                      onChangeText={setTime}
                      keyboardType="numbers-and-punctuation"
                    />
                    <SectionTitle>Nutrition for this amount</SectionTitle>
                    <View style={styles.fields}>
                      <View style={styles.macroField}>
                        <Field
                          label="Calories"
                          value={calories}
                          onChangeText={setCalories}
                          keyboardType="number-pad"
                        />
                      </View>
                      <View style={styles.macroField}>
                        <Field
                          label="Protein"
                          value={protein}
                          onChangeText={setProtein}
                          keyboardType="decimal-pad"
                        />
                      </View>
                    </View>
                    <View style={styles.fields}>
                      <View style={styles.macroField}>
                        <Field
                          label="Carbs"
                          value={carbohydrate}
                          onChangeText={setCarbohydrate}
                          keyboardType="decimal-pad"
                        />
                      </View>
                      <View style={styles.macroField}>
                        <Field label="Fat" value={fat} onChangeText={setFat} keyboardType="decimal-pad" />
                      </View>
                    </View>
                    <Button title={`Add food · ${Number(calories) || 0} kcal`} onPress={() => void save()} />
                  </>
                ) : null}
              </ScrollView>
            ) : null}
          </KeyboardAvoidingView>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  )
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  modal: { flex: 1 },
  modalHeader: {
    minHeight: 58,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '800' },
  content: { padding: 18, gap: 14, paddingBottom: 44 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  grow: { flex: 1, minWidth: 0, gap: 3 },
  pressed: { opacity: 0.7 },
  small: { fontSize: 11 },
  foodResult: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  foodName: { fontSize: 13, fontWeight: '700' },
  foodCalories: { fontSize: 15, fontWeight: '800' },
  energy: { alignItems: 'flex-end', gap: 2 },
  searchBox: {
    minHeight: 46,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchInput: { flex: 1, minWidth: 0, minHeight: 44, fontSize: 13 },
  note: { padding: 12, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 9 },
  reviewHeading: { gap: 6, paddingTop: 6 },
  eyebrow: { fontSize: 10, letterSpacing: 0.6, fontWeight: '700' },
  reviewName: { fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
  servingControl: {
    borderWidth: 1,
    borderRadius: 14,
    minHeight: 86,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  servingCenter: { flex: 1, alignItems: 'center', gap: 3 },
  servingAmount: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  servingInput: {
    minWidth: 55,
    maxWidth: 120,
    minHeight: 44,
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
  },
  servingUnit: { fontSize: 22, fontWeight: '700' },
  reviewMacros: { flexDirection: 'row', padding: 14, borderRadius: 14, gap: 10 },
  reviewMacro: { flex: 1, minWidth: 0, gap: 5 },
  reviewMacroValue: { fontSize: 18, fontWeight: '800' },
  favoriteRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 9 },
  fields: { flexDirection: 'row', gap: 10 },
  macroField: { flex: 1 },
  camera: { minHeight: 360, borderRadius: 18, overflow: 'hidden' },
})
