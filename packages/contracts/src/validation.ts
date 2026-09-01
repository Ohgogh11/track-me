import type {
  BodyWeightEntry,
  CalorieEntry,
  CalorieGoal,
  EntityPayload,
  EntityType,
  Exercise,
  PersonalFood,
  SetPrescription,
  WorkoutSession,
  WorkoutTemplate,
} from './domain'
import type { SyncRequest } from './sync'

export class ContractValidationError extends Error {
  constructor(readonly issues: readonly string[]) {
    super(issues.join('; '))
    this.name = 'ContractValidationError'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requireString(value: unknown, path: string, issues: string[]): value is string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    issues.push(`${path} must be a non-empty string`)
    return false
  }
  return true
}

function requireNonNegativeInteger(value: unknown, path: string, issues: string[]): value is number {
  if (!Number.isInteger(value) || Number(value) < 0) {
    issues.push(`${path} must be a non-negative integer`)
    return false
  }
  return true
}

function validateOptionalNonNegativeInteger(value: unknown, path: string, issues: string[]): void {
  if (value !== undefined && value !== null) requireNonNegativeInteger(value, path, issues)
}

function validatePrescription(set: SetPrescription, path: string, issues: string[]): void {
  requireString(set.id, `${path}.id`, issues)
  requireNonNegativeInteger(set.order, `${path}.order`, issues)
  if (set.type !== 'warmup' && set.type !== 'work') issues.push(`${path}.type is invalid`)
  if (!Number.isInteger(set.targetReps.min) || set.targetReps.min < 1) {
    issues.push(`${path}.targetReps.min must be at least 1`)
  }
  if (!Number.isInteger(set.targetReps.max) || set.targetReps.max < set.targetReps.min) {
    issues.push(`${path}.targetReps.max must be at least min`)
  }
  if (
    set.targetRpeTenths !== null &&
    (!Number.isInteger(set.targetRpeTenths) || set.targetRpeTenths < 10 || set.targetRpeTenths > 100)
  ) {
    issues.push(`${path}.targetRpeTenths must be between 10 and 100`)
  }
  if (!Number.isInteger(set.restSeconds) || set.restSeconds < 0 || set.restSeconds > 3600) {
    issues.push(`${path}.restSeconds must be between 0 and 3600`)
  }
}

function validateExercise(exercise: Exercise, issues: string[]): void {
  requireString(exercise.name, 'exercise.name', issues)
  requireString(exercise.primaryMuscleId, 'exercise.primaryMuscleId', issues)
  if (!Array.isArray(exercise.secondaryMuscleIds)) issues.push('exercise.secondaryMuscleIds must be an array')
  if (exercise.loadType !== 'external' && exercise.loadType !== 'bodyweight') {
    issues.push('exercise.loadType is invalid')
  }
  if (
    exercise.trackingMode !== undefined &&
    exercise.trackingMode !== 'bilateral' &&
    exercise.trackingMode !== 'unilateral'
  ) {
    issues.push('exercise.trackingMode is invalid')
  }
  if (exercise.instructions !== undefined && !Array.isArray(exercise.instructions)) {
    issues.push('exercise.instructions must be an array')
  }
  if (exercise.imageUrls !== undefined && !Array.isArray(exercise.imageUrls)) {
    issues.push('exercise.imageUrls must be an array')
  }
}

function validateSetPerformance(value: unknown, path: string, issues: string[]): void {
  if (!isRecord(value)) {
    issues.push(`${path} must be an object`)
    return
  }
  if (!Number.isInteger(value.actualReps) || Number(value.actualReps) < 0) {
    issues.push(`${path}.actualReps is required`)
  }
  if (
    value.actualWeightGrams !== null &&
    (!Number.isInteger(value.actualWeightGrams) || Number(value.actualWeightGrams) < 0)
  ) {
    issues.push(`${path}.actualWeightGrams is invalid`)
  }
  if (
    value.actualRpeTenths !== null &&
    (!Number.isInteger(value.actualRpeTenths) ||
      Number(value.actualRpeTenths) < 0 ||
      Number(value.actualRpeTenths) > 100)
  ) {
    issues.push(`${path}.actualRpeTenths is invalid`)
  }
}

function validateTemplate(template: WorkoutTemplate, issues: string[]): void {
  requireString(template.name, 'template.name', issues)
  if (!Array.isArray(template.exercises) || template.exercises.length === 0) {
    issues.push('template.exercises must contain at least one exercise')
    return
  }
  template.exercises.forEach((exercise, exerciseIndex) => {
    requireString(exercise.exerciseId, `template.exercises[${exerciseIndex}].exerciseId`, issues)
    if (
      exercise.trackingMode !== undefined &&
      exercise.trackingMode !== 'bilateral' &&
      exercise.trackingMode !== 'unilateral'
    ) {
      issues.push(`template.exercises[${exerciseIndex}].trackingMode is invalid`)
    }
    if (!Array.isArray(exercise.sets) || exercise.sets.length === 0) {
      issues.push(`template.exercises[${exerciseIndex}].sets must contain at least one set`)
    } else {
      exercise.sets.forEach((set, setIndex) => {
        validatePrescription(set, `template.exercises[${exerciseIndex}].sets[${setIndex}]`, issues)
      })
    }
  })
}

function validateWorkout(workout: WorkoutSession, issues: string[]): void {
  requireString(workout.name, 'workout.name', issues)
  if (!['draft', 'active', 'completed'].includes(workout.status)) issues.push('workout.status is invalid')
  if (!Array.isArray(workout.timerSegments)) issues.push('workout.timerSegments must be an array')
  if (!Array.isArray(workout.exercises)) {
    issues.push('workout.exercises must be an array')
    return
  }
  workout.exercises.forEach((exercise, exerciseIndex) => {
    requireString(exercise.exerciseId, `workout.exercises[${exerciseIndex}].exerciseId`, issues)
    exercise.sets.forEach((set, setIndex) => {
      validatePrescription(set, `workout.exercises[${exerciseIndex}].sets[${setIndex}]`, issues)
      const path = `workout.exercises[${exerciseIndex}].sets[${setIndex}]`
      if (!['planned', 'completed', 'skipped'].includes(set.status)) {
        issues.push(`${path}.status is invalid`)
      }
      // startedAt was added after the first local/sync payloads shipped. Missing
      // values remain valid and are normalized to null by the mobile store.
      if (set.startedAt !== undefined && set.startedAt !== null) {
        requireString(set.startedAt, `${path}.startedAt`, issues)
      }
      if (
        set.actualRestSeconds !== null &&
        (!Number.isInteger(set.actualRestSeconds) || set.actualRestSeconds < 0)
      ) {
        issues.push(`${path}.actualRestSeconds must be a non-negative integer`)
      }
      if (set.status === 'completed') {
        if (set.sideResults !== undefined && set.sideResults !== null) {
          validateSetPerformance(set.sideResults.left, `${path}.sideResults.left`, issues)
          validateSetPerformance(set.sideResults.right, `${path}.sideResults.right`, issues)
        } else if (!Number.isInteger(set.actualReps) || Number(set.actualReps) < 0) {
          issues.push(`workout.exercises[${exerciseIndex}].sets[${setIndex}].actualReps is required`)
        }
        if (
          set.actualWeightGrams !== null &&
          (!Number.isInteger(set.actualWeightGrams) || set.actualWeightGrams < 0)
        ) {
          issues.push(`workout.exercises[${exerciseIndex}].sets[${setIndex}].actualWeightGrams is invalid`)
        }
      }
    })
  })
}

function validateCalorieEntry(entry: CalorieEntry, issues: string[]): void {
  requireString(entry.description, 'calorieEntry.description', issues)
  if (!Number.isInteger(entry.calories) || entry.calories < 1 || entry.calories > 100_000) {
    issues.push('calorieEntry.calories must be between 1 and 100000')
  }
  validateOptionalNonNegativeInteger(entry.servingGrams, 'calorieEntry.servingGrams', issues)
  validateOptionalNonNegativeInteger(
    entry.servingCountThousandths,
    'calorieEntry.servingCountThousandths',
    issues,
  )
  validateOptionalNonNegativeInteger(entry.proteinTenthsGrams, 'calorieEntry.proteinTenthsGrams', issues)
  validateOptionalNonNegativeInteger(
    entry.carbohydrateTenthsGrams,
    'calorieEntry.carbohydrateTenthsGrams',
    issues,
  )
  validateOptionalNonNegativeInteger(entry.fatTenthsGrams, 'calorieEntry.fatTenthsGrams', issues)
  if (entry.source !== undefined && !['manual', 'custom', 'usda', 'open_food_facts'].includes(entry.source)) {
    issues.push('calorieEntry.source is invalid')
  }
}

function validateCalorieGoal(goal: CalorieGoal, issues: string[]): void {
  if (!Number.isInteger(goal.calories) || goal.calories < 1 || goal.calories > 100_000) {
    issues.push('calorieGoal.calories must be between 1 and 100000')
  }
  requireString(goal.effectiveFrom, 'calorieGoal.effectiveFrom', issues)
  validateOptionalNonNegativeInteger(goal.proteinTenthsGrams, 'calorieGoal.proteinTenthsGrams', issues)
  validateOptionalNonNegativeInteger(
    goal.carbohydrateTenthsGrams,
    'calorieGoal.carbohydrateTenthsGrams',
    issues,
  )
  validateOptionalNonNegativeInteger(goal.fatTenthsGrams, 'calorieGoal.fatTenthsGrams', issues)
}

function validatePersonalFood(food: PersonalFood, issues: string[]): void {
  requireString(food.name, 'foodItem.name', issues)
  if (!['manual', 'custom', 'usda', 'open_food_facts'].includes(food.source)) {
    issues.push('foodItem.source is invalid')
  }
  requireNonNegativeInteger(food.caloriesPer100Grams, 'foodItem.caloriesPer100Grams', issues)
  validateOptionalNonNegativeInteger(
    food.proteinTenthsPer100Grams,
    'foodItem.proteinTenthsPer100Grams',
    issues,
  )
  validateOptionalNonNegativeInteger(
    food.carbohydrateTenthsPer100Grams,
    'foodItem.carbohydrateTenthsPer100Grams',
    issues,
  )
  validateOptionalNonNegativeInteger(food.fatTenthsPer100Grams, 'foodItem.fatTenthsPer100Grams', issues)
  if (!Number.isInteger(food.defaultServingGrams) || food.defaultServingGrams < 1) {
    issues.push('foodItem.defaultServingGrams must be a positive integer')
  }
  requireString(food.defaultServingLabel, 'foodItem.defaultServingLabel', issues)
  if (typeof food.favorite !== 'boolean') issues.push('foodItem.favorite must be boolean')
}

function validateBodyWeight(entry: BodyWeightEntry, issues: string[]): void {
  if (!Number.isInteger(entry.weightGrams) || entry.weightGrams < 1_000 || entry.weightGrams > 1_000_000) {
    issues.push('bodyWeight.weightGrams must be between 1000 and 1000000')
  }
}

export function validateEntityPayload(entityType: EntityType, value: unknown): EntityPayload {
  const issues: string[] = []
  if (!isRecord(value)) throw new ContractValidationError(['payload must be an object'])
  requireString(value.id, 'payload.id', issues)
  requireNonNegativeInteger(value.version, 'payload.version', issues)
  requireString(value.updatedAt, 'payload.updatedAt', issues)
  if (value.kind !== entityType) issues.push(`payload.kind must equal ${entityType}`)

  const payload = value as unknown as EntityPayload
  switch (entityType) {
    case 'exercise':
      validateExercise(payload as Exercise, issues)
      break
    case 'template':
      validateTemplate(payload as WorkoutTemplate, issues)
      break
    case 'workout':
      validateWorkout(payload as WorkoutSession, issues)
      break
    case 'calorie_entry':
      validateCalorieEntry(payload as CalorieEntry, issues)
      break
    case 'calorie_goal':
      validateCalorieGoal(payload as CalorieGoal, issues)
      break
    case 'food_item':
      validatePersonalFood(payload as PersonalFood, issues)
      break
    case 'body_weight':
      validateBodyWeight(payload as BodyWeightEntry, issues)
      break
    case 'profile':
      if (!['kg', 'lb'].includes(String(value.weightUnit))) issues.push('profile.weightUnit is invalid')
      requireString(value.timezone, 'profile.timezone', issues)
      if (
        value.formulaSex !== undefined &&
        value.formulaSex !== null &&
        !['male', 'female'].includes(String(value.formulaSex))
      ) {
        issues.push('profile.formulaSex is invalid')
      }
      if (
        value.activityLevel !== undefined &&
        value.activityLevel !== null &&
        !['sedentary', 'light', 'moderate', 'very_active'].includes(String(value.activityLevel))
      ) {
        issues.push('profile.activityLevel is invalid')
      }
      if (
        value.nutritionGoalType !== undefined &&
        value.nutritionGoalType !== null &&
        !['lose', 'maintain', 'gain'].includes(String(value.nutritionGoalType))
      ) {
        issues.push('profile.nutritionGoalType is invalid')
      }
      validateOptionalNonNegativeInteger(value.heightCm, 'profile.heightCm', issues)
      validateOptionalNonNegativeInteger(
        value.targetPaceGramsPerWeek,
        'profile.targetPaceGramsPerWeek',
        issues,
      )
      break
    case 'exercise_visibility':
      requireString(value.exerciseId, 'exerciseVisibility.exerciseId', issues)
      if (typeof value.hidden !== 'boolean') issues.push('exerciseVisibility.hidden must be boolean')
      break
  }

  if (issues.length > 0) throw new ContractValidationError(issues)
  return payload
}

export function validateSyncRequest(value: unknown): SyncRequest {
  if (!isRecord(value)) throw new ContractValidationError(['request body must be an object'])
  const issues: string[] = []
  requireString(value.deviceId, 'deviceId', issues)
  if (value.cursor !== null && typeof value.cursor !== 'string')
    issues.push('cursor must be a string or null')
  if (!Array.isArray(value.mutations)) issues.push('mutations must be an array')
  if (issues.length > 0) throw new ContractValidationError(issues)

  const request = value as unknown as SyncRequest
  for (const [index, mutation] of request.mutations.entries()) {
    requireString(mutation.mutationId, `mutations[${index}].mutationId`, issues)
    requireString(mutation.entityId, `mutations[${index}].entityId`, issues)
    if (!Number.isInteger(mutation.baseVersion) || mutation.baseVersion < 0) {
      issues.push(`mutations[${index}].baseVersion must be a non-negative integer`)
    }
    if (!['upsert', 'delete'].includes(mutation.operation)) {
      issues.push(`mutations[${index}].operation is invalid`)
    }
    if (mutation.operation === 'upsert') {
      try {
        validateEntityPayload(mutation.entityType, mutation.payload)
      } catch (error) {
        if (error instanceof ContractValidationError) {
          issues.push(...error.issues.map((issue) => `mutations[${index}].${issue}`))
        } else {
          throw error
        }
      }
    }
  }

  if (issues.length > 0) throw new ContractValidationError(issues)
  return request
}
