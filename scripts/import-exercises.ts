const SOURCE_URL = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json'
const IMAGE_BASE_URL = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/'
const OUTPUT = new URL('../packages/contracts/src/generated/exercises.json', import.meta.url)

interface SourceExercise {
  id: string
  name: string
  level: string
  equipment: string | null
  primaryMuscles: string[]
  secondaryMuscles: string[]
  instructions: string[]
  category: string
  images: string[]
}

const muscleIds: Readonly<Record<string, string>> = {
  abdominals: 'abs',
  abductors: 'abductors',
  adductors: 'adductors',
  biceps: 'biceps',
  calves: 'calves',
  chest: 'chest',
  forearms: 'forearms',
  glutes: 'glutes',
  hamstrings: 'hamstrings',
  lats: 'lats',
  'lower back': 'lower-back',
  'middle back': 'upper-back',
  neck: 'neck',
  quadriceps: 'quadriceps',
  shoulders: 'shoulders',
  traps: 'traps',
  triceps: 'triceps',
}

function muscleId(value: string): string {
  const mapped = muscleIds[value]
  if (mapped === undefined) throw new Error(`Unmapped source muscle: ${value}`)
  return mapped
}

function slug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-|-$/g, '')
}

function isUnilateral(name: string): boolean {
  return /\b(?:single|one)[ -](?:arm|leg|hand|foot)|\bunilateral\b|\balternate\b|\balternating\b/i.test(name)
}

const response = await fetch(SOURCE_URL)
if (!response.ok) throw new Error(`Exercise catalog download failed with ${response.status}`)
const source = (await response.json()) as SourceExercise[]

const exercises = source
  .map((exercise) => ({
    id: `builtin:free-exercise-db:${slug(exercise.id)}`,
    name: exercise.name.trim(),
    primaryMuscleId: muscleId(exercise.primaryMuscles[0] ?? ''),
    secondaryMuscleIds: [...new Set(exercise.secondaryMuscles.map(muscleId))],
    loadType: exercise.equipment === 'body only' ? 'bodyweight' : 'external',
    trackingMode: isUnilateral(exercise.name) ? 'unilateral' : 'bilateral',
    equipment: exercise.equipment,
    category: exercise.category,
    difficulty: exercise.level,
    instructions: exercise.instructions.map((instruction) => instruction.trim()).filter(Boolean),
    imageUrls: exercise.images.map(
      (path) => `${IMAGE_BASE_URL}${path.split('/').map(encodeURIComponent).join('/')}`,
    ),
  }))
  .sort((left, right) => left.name.localeCompare(right.name))

await Bun.write(OUTPUT, `${JSON.stringify(exercises)}\n`)
console.log(`Imported ${exercises.length} public-domain exercises into ${OUTPUT.pathname}`)
