import type {
  ActivityLevel,
  CalorieEntry,
  FormulaSex,
  NutritionGoalSuggestion,
  NutritionGoalType,
  NutritionTotals,
} from './domain'

const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  very_active: 1.725,
}

export interface NutritionSuggestionInput {
  birthDate: string
  heightCm: number
  formulaSex: FormulaSex
  activityLevel: ActivityLevel
  weightGrams: number
  goalType: NutritionGoalType
  targetPaceGramsPerWeek: number
  today?: string
}

export interface ScaledNutrition {
  calories: number
  proteinTenthsGrams: number | null
  carbohydrateTenthsGrams: number | null
  fatTenthsGrams: number | null
}

function ageOnDate(birthDate: string, today: string): number {
  const birth = new Date(`${birthDate}T00:00:00.000Z`)
  const current = new Date(`${today}T00:00:00.000Z`)
  if (!Number.isFinite(birth.getTime()) || !Number.isFinite(current.getTime())) {
    throw new Error('Birth date is invalid')
  }
  let age = current.getUTCFullYear() - birth.getUTCFullYear()
  const beforeBirthday =
    current.getUTCMonth() < birth.getUTCMonth() ||
    (current.getUTCMonth() === birth.getUTCMonth() && current.getUTCDate() < birth.getUTCDate())
  if (beforeBirthday) age -= 1
  if (age < 18 || age > 120) throw new Error('Target suggestions require an age between 18 and 120')
  return age
}

export function scaleNutritionPer100Grams(
  values: {
    caloriesPer100Grams: number
    proteinTenthsPer100Grams: number | null
    carbohydrateTenthsPer100Grams: number | null
    fatTenthsPer100Grams: number | null
  },
  grams: number,
): ScaledNutrition {
  const safeGrams = Math.max(0, Math.round(grams))
  const scale = safeGrams / 100
  const scaleMacro = (value: number | null) => (value === null ? null : Math.round(value * scale))
  return {
    calories: Math.round(values.caloriesPer100Grams * scale),
    proteinTenthsGrams: scaleMacro(values.proteinTenthsPer100Grams),
    carbohydrateTenthsGrams: scaleMacro(values.carbohydrateTenthsPer100Grams),
    fatTenthsGrams: scaleMacro(values.fatTenthsPer100Grams),
  }
}

export function sumNutrition(entries: readonly CalorieEntry[]): NutritionTotals {
  return entries.reduce<NutritionTotals>(
    (totals, entry) => {
      const macrosKnown =
        entry.proteinTenthsGrams !== undefined &&
        entry.proteinTenthsGrams !== null &&
        entry.carbohydrateTenthsGrams !== undefined &&
        entry.carbohydrateTenthsGrams !== null &&
        entry.fatTenthsGrams !== undefined &&
        entry.fatTenthsGrams !== null
      totals.calories += entry.calories
      totals.proteinTenthsGrams += entry.proteinTenthsGrams ?? 0
      totals.carbohydrateTenthsGrams += entry.carbohydrateTenthsGrams ?? 0
      totals.fatTenthsGrams += entry.fatTenthsGrams ?? 0
      if (!macrosKnown) totals.entriesWithUnknownMacros += 1
      return totals
    },
    {
      calories: 0,
      proteinTenthsGrams: 0,
      carbohydrateTenthsGrams: 0,
      fatTenthsGrams: 0,
      entriesWithUnknownMacros: 0,
    },
  )
}

export function suggestNutritionGoal(input: NutritionSuggestionInput): NutritionGoalSuggestion {
  if (!Number.isFinite(input.heightCm) || input.heightCm < 100 || input.heightCm > 250) {
    throw new Error('Height must be between 100 and 250 cm')
  }
  if (!Number.isInteger(input.weightGrams) || input.weightGrams < 30_000 || input.weightGrams > 400_000) {
    throw new Error('Weight must be between 30 and 400 kg')
  }
  if (
    !Number.isInteger(input.targetPaceGramsPerWeek) ||
    input.targetPaceGramsPerWeek < 0 ||
    input.targetPaceGramsPerWeek > 2_000
  ) {
    throw new Error('Target pace must be between 0 and 2000 grams per week')
  }

  const today = input.today ?? new Date().toISOString().slice(0, 10)
  const age = ageOnDate(input.birthDate, today)
  const weightKg = input.weightGrams / 1_000
  const sexConstant = input.formulaSex === 'male' ? 5 : -161
  const restingCalories = Math.round(10 * weightKg + 6.25 * input.heightCm - 5 * age + sexConstant)
  const maintenanceCalories = Math.round(restingCalories * ACTIVITY_MULTIPLIERS[input.activityLevel])
  const requestedDelta = Math.round((input.targetPaceGramsPerWeek / 1_000) * (7_700 / 7))
  const maximumDelta = Math.round(maintenanceCalories * 0.2)
  const appliedDelta = Math.min(requestedDelta, maximumDelta)
  const direction = input.goalType === 'lose' ? -1 : input.goalType === 'gain' ? 1 : 0
  const calories = Math.max(1, maintenanceCalories + direction * appliedDelta)
  const proteinTenthsGrams = Math.round(weightKg * 1.6 * 10)
  const fatTenthsGrams = Math.round(((calories * 0.25) / 9) * 10)
  const proteinCalories = (proteinTenthsGrams / 10) * 4
  const fatCalories = (fatTenthsGrams / 10) * 9
  const carbohydrateTenthsGrams = Math.max(
    0,
    Math.round(((calories - proteinCalories - fatCalories) / 4) * 10),
  )
  const warnings: string[] = []
  if (requestedDelta > maximumDelta) {
    warnings.push('The requested pace was capped at 20% of estimated maintenance calories.')
  }
  if (calories < restingCalories) {
    warnings.push('The suggested target is below estimated resting expenditure. Review it carefully.')
  }
  if (input.goalType !== 'maintain' && input.targetPaceGramsPerWeek === 0) {
    warnings.push('A zero target pace produces the same calorie estimate as maintenance.')
  }
  return {
    restingCalories,
    maintenanceCalories,
    calories,
    proteinTenthsGrams,
    carbohydrateTenthsGrams,
    fatTenthsGrams,
    warnings,
  }
}
