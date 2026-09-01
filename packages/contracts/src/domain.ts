export type EntityId = string
export type IsoDateTime = string
export type LocalDate = string

export type WeightUnit = 'kg' | 'lb'
export type SetType = 'warmup' | 'work'
export type SetStatus = 'planned' | 'completed' | 'skipped'
export type WorkoutStatus = 'draft' | 'active' | 'completed'
export type ExerciseLoadType = 'external' | 'bodyweight'
export type ExerciseTrackingMode = 'bilateral' | 'unilateral'
export type FoodSource = 'manual' | 'custom' | 'usda' | 'open_food_facts'
export type FormulaSex = 'male' | 'female'
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'very_active'
export type NutritionGoalType = 'lose' | 'maintain' | 'gain'

export interface VersionedAggregate {
  id: EntityId
  version: number
  updatedAt: IsoDateTime
  deletedAt: IsoDateTime | null
}

export interface UserProfile extends VersionedAggregate {
  kind: 'profile'
  timezone: string
  weightUnit: WeightUnit
  birthDate?: LocalDate | null
  heightCm?: number | null
  formulaSex?: FormulaSex | null
  activityLevel?: ActivityLevel | null
  nutritionGoalType?: NutritionGoalType | null
  targetPaceGramsPerWeek?: number | null
}

export interface MuscleGroup {
  id: EntityId
  name: string
  region: 'front' | 'back'
  svgRegionIds: readonly string[]
}

export interface Exercise extends VersionedAggregate {
  kind: 'exercise'
  name: string
  primaryMuscleId: EntityId
  secondaryMuscleIds: EntityId[]
  loadType: ExerciseLoadType
  trackingMode: ExerciseTrackingMode
  equipment: string | null
  category: string | null
  difficulty: string | null
  instructions: string[]
  imageUrls: string[]
  builtIn: boolean
  archivedAt: IsoDateTime | null
}

export interface ExerciseVisibility extends VersionedAggregate {
  kind: 'exercise_visibility'
  exerciseId: EntityId
  hidden: boolean
}

export interface RepTarget {
  min: number
  max: number
}

export interface SetPrescription {
  id: EntityId
  order: number
  type: SetType
  targetReps: RepTarget
  targetRpeTenths: number | null
  restSeconds: number
}

export interface TemplateExercise {
  id: EntityId
  exerciseId: EntityId
  exerciseName: string
  order: number
  notes: string
  trackingMode?: ExerciseTrackingMode
  sets: SetPrescription[]
}

export interface WorkoutTemplate extends VersionedAggregate {
  kind: 'template'
  name: string
  notes: string
  exercises: TemplateExercise[]
}

export interface TimerSegment {
  id: EntityId
  startedAt: IsoDateTime
  endedAt: IsoDateTime | null
}

export interface CompletedSet extends SetPrescription {
  status: SetStatus
  startedAt: IsoDateTime | null
  actualReps: number | null
  actualWeightGrams: number | null
  actualRpeTenths: number | null
  sideResults?: UnilateralSetResults | null
  actualRestSeconds: number | null
  completedAt: IsoDateTime | null
}

export interface SetPerformance {
  actualReps: number | null
  actualWeightGrams: number | null
  actualRpeTenths: number | null
}

export interface UnilateralSetResults {
  left: SetPerformance
  right: SetPerformance
}

export interface WorkoutExercise {
  id: EntityId
  exerciseId: EntityId
  exerciseName: string
  order: number
  notes: string
  primaryMuscleId: EntityId
  secondaryMuscleIds: EntityId[]
  loadType: ExerciseLoadType
  trackingMode?: ExerciseTrackingMode
  sets: CompletedSet[]
}

export interface WorkoutSession extends VersionedAggregate {
  kind: 'workout'
  name: string
  notes: string
  status: WorkoutStatus
  sourceTemplateId: EntityId | null
  activeDeviceId: EntityId
  startedAt: IsoDateTime
  completedAt: IsoDateTime | null
  timerSegments: TimerSegment[]
  exercises: WorkoutExercise[]
  recoveryReason: string | null
}

export interface CalorieEntry extends VersionedAggregate {
  kind: 'calorie_entry'
  description: string
  calories: number
  eatenAt: IsoDateTime
  brand?: string | null
  source?: FoodSource
  providerId?: string | null
  barcode?: string | null
  servingLabel?: string | null
  servingGrams?: number | null
  servingCountThousandths?: number | null
  proteinTenthsGrams?: number | null
  carbohydrateTenthsGrams?: number | null
  fatTenthsGrams?: number | null
}

export interface CalorieGoal extends VersionedAggregate {
  kind: 'calorie_goal'
  calories: number
  effectiveFrom: LocalDate
  proteinTenthsGrams?: number | null
  carbohydrateTenthsGrams?: number | null
  fatTenthsGrams?: number | null
}

export interface PersonalFood extends VersionedAggregate {
  kind: 'food_item'
  name: string
  brand: string | null
  source: FoodSource
  providerId: string | null
  barcode: string | null
  caloriesPer100Grams: number
  proteinTenthsPer100Grams: number | null
  carbohydrateTenthsPer100Grams: number | null
  fatTenthsPer100Grams: number | null
  defaultServingGrams: number
  defaultServingLabel: string
  favorite: boolean
}

export interface BodyWeightEntry extends VersionedAggregate {
  kind: 'body_weight'
  weightGrams: number
  measuredAt: IsoDateTime
  notes: string
}

export type EntityType =
  | 'profile'
  | 'exercise'
  | 'exercise_visibility'
  | 'template'
  | 'workout'
  | 'calorie_entry'
  | 'calorie_goal'
  | 'food_item'
  | 'body_weight'

export interface EntityMap {
  profile: UserProfile
  exercise: Exercise
  exercise_visibility: ExerciseVisibility
  template: WorkoutTemplate
  workout: WorkoutSession
  calorie_entry: CalorieEntry
  calorie_goal: CalorieGoal
  food_item: PersonalFood
  body_weight: BodyWeightEntry
}

export type EntityPayload = EntityMap[EntityType]

export interface DateRange {
  from: IsoDateTime
  to: IsoDateTime
}

export interface PersonalRecord {
  workoutId: EntityId
  exerciseId: EntityId
  setId: EntityId | null
  achievedAt: IsoDateTime
  type: 'heaviest_weight' | 'estimated_one_rep_max' | 'max_reps' | 'session_volume'
  value: number
}

export interface ExerciseInsight {
  exerciseId: EntityId
  exerciseName: string
  sessions: number
  workSets: number
  totalReps: number
  volumeKg: number
  heaviestWeightGrams: number | null
  maxReps: number | null
  estimatedOneRepMaxGrams: number | null
  records: PersonalRecord[]
}

export interface MuscleInsight {
  muscleId: EntityId
  heatScore: number
  primarySets: number
  secondarySets: number
  attributedVolumeKg: number
  exerciseIds: EntityId[]
  recordCount: number
}

export interface ProgressSummary {
  workoutCount: number
  activeSeconds: number
  workSets: number
  totalReps: number
  volumeKg: number
  personalRecordCount: number
  workoutsByLocalDate: Record<LocalDate, number>
}

export interface FoodServing {
  id: string
  label: string
  grams: number
}

export interface FoodSearchResult {
  provider: 'usda' | 'open_food_facts'
  providerId: string
  name: string
  brand: string | null
  barcode: string | null
  caloriesPer100Grams: number
  proteinTenthsPer100Grams: number | null
  carbohydrateTenthsPer100Grams: number | null
  fatTenthsPer100Grams: number | null
  servings: FoodServing[]
  attribution: string
  complete: boolean
}

export interface FoodSearchResponse {
  results: FoodSearchResult[]
  page: number
  hasMore: boolean
  stale: boolean
}

export interface NutritionTotals {
  calories: number
  proteinTenthsGrams: number
  carbohydrateTenthsGrams: number
  fatTenthsGrams: number
  entriesWithUnknownMacros: number
}

export interface NutritionGoalSuggestion {
  restingCalories: number
  maintenanceCalories: number
  calories: number
  proteinTenthsGrams: number
  carbohydrateTenthsGrams: number
  fatTenthsGrams: number
  warnings: string[]
}
