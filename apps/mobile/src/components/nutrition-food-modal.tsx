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
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { ChipRow, ChoiceChip, SectionTitle, SegmentedControl } from '@/components/controls'
import { AppText, Button, Card, EmptyState, Field } from '@/components/ui'
import { lookupFoodBarcode, searchFoods } from '@/data/food-api'
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
    <Pressable onPress={onPress}>
      <Card>
        <View style={styles.row}>
          <View style={styles.grow}>
            <AppText style={styles.foodName}>{candidate.name}</AppText>
            <AppText style={{ color: colors.textMuted }}>
              {[candidate.brand, candidate.attribution].filter(Boolean).join(' · ')}
            </AppText>
          </View>
          <AppText style={styles.foodCalories}>{candidate.caloriesPer100Grams} kcal</AppText>
        </View>
        <AppText style={{ color: colors.textMuted }}>
          per 100 g · P {macroText(candidate.proteinTenthsPer100Grams) || '?'} · C{' '}
          {macroText(candidate.carbohydrateTenthsPer100Grams) || '?'} · F{' '}
          {macroText(candidate.fatTenthsPer100Grams) || '?'}
        </AppText>
      </Card>
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
  const [stale, setStale] = useState(false)
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
  const [scanned, setScanned] = useState(false)
  const [permission, requestPermission] = useCameraPermissions()
  const personalFoodsRef = useRef(data.personalFoods)
  personalFoodsRef.current = data.personalFoods

  const favoriteFoods = useMemo(
    () => data.personalFoods.filter((food) => food.favorite),
    [data.personalFoods],
  )

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
          setStale(response.stale)
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
    if (corrected || favorite || existing !== undefined) {
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
      <View style={[styles.modal, { backgroundColor: colors.background }]}>
        <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
          <AppText style={styles.modalTitle}>
            {stage === 'review' ? 'Review food' : stage === 'scan' ? 'Scan barcode' : 'Add food'}
          </AppText>
          <Button title="Close" compact variant="ghost" onPress={onClose} />
        </View>
        {stage === 'browse' ? (
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
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
            <Field
              label="Search foods"
              value={query}
              onChangeText={(value) => {
                setQuery(value)
                setPage(1)
              }}
              placeholder="Chicken breast, rice, yogurt…"
              autoCapitalize="none"
            />
            {favoriteFoods.length > 0 ? (
              <>
                <SectionTitle>Favorites</SectionTitle>
                {favoriteFoods.map((food) => (
                  <FoodResultCard
                    key={food.id}
                    candidate={candidateFromPersonalFood(food)}
                    onPress={() => openReview(candidateFromPersonalFood(food))}
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
            {stale ? (
              <AppText style={{ color: colors.warning }}>Showing cached provider results.</AppText>
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
              <Button title="Load more" variant="secondary" onPress={() => setPage((value) => value + 1)} />
            ) : null}
            {query.trim().length < 2 && favoriteFoods.length === 0 ? (
              <EmptyState
                title="Find or create food"
                message="Search USDA, scan a packaged-food barcode, or create a personal food."
              />
            ) : null}
          </ScrollView>
        ) : null}

        {stage === 'scan' ? (
          <View style={styles.content}>
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
          </View>
        ) : null}

        {stage === 'review' && candidate !== null ? (
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <Field label="Food" value={name} onChangeText={setName} placeholder="Food name" />
            <Field label="Brand (optional)" value={brand} onChangeText={setBrand} placeholder="Brand" />
            <AppText style={{ color: colors.textMuted }}>{candidate.attribution}</AppText>
            {!candidate.complete ? (
              <Card style={{ borderColor: colors.warning }}>
                <AppText style={{ color: colors.warning }}>
                  Some macro values are missing. Review the values before saving.
                </AppText>
              </Card>
            ) : null}
            <SectionTitle>Serving</SectionTitle>
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
            <View style={styles.fields}>
              <View style={styles.grow}>
                <Field
                  label="Amount (g)"
                  value={grams}
                  onChangeText={updateGrams}
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={styles.grow}>
                <Field
                  label="Time (HH:MM)"
                  value={time}
                  onChangeText={setTime}
                  keyboardType="numbers-and-punctuation"
                />
              </View>
            </View>
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
                <Field label="Protein" value={protein} onChangeText={setProtein} keyboardType="decimal-pad" />
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
            <ChoiceChip
              label={favorite ? '★ Favorite' : '☆ Add to favorites'}
              selected={favorite}
              onPress={() => setFavorite((value) => !value)}
            />
            <Button title="Save food" onPress={() => void save()} />
            <Button
              title="Back"
              variant="ghost"
              onPress={() => {
                setCandidate(null)
                setStage('browse')
              }}
            />
          </ScrollView>
        ) : null}
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  modal: { flex: 1 },
  modalHeader: {
    minHeight: 64,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalTitle: { fontSize: 24, fontWeight: '800' },
  content: { padding: 18, gap: 14, paddingBottom: 44 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  grow: { flex: 1, minWidth: 130 },
  foodName: { fontSize: 17, fontWeight: '800' },
  foodCalories: { fontSize: 16, fontWeight: '800' },
  fields: { flexDirection: 'row', gap: 10 },
  macroField: { flex: 1 },
  camera: { minHeight: 360, borderRadius: 18, overflow: 'hidden' },
})
