import {
  type CompletedSet,
  type ExerciseTrackingMode,
  formatDuration,
  gramsToUnit,
  type SetPerformance,
  unitToGrams,
  type WeightUnit,
} from '@track-me/contracts'
import { useEffect, useState } from 'react'
import { Modal, Pressable, StyleSheet, TextInput, View } from 'react-native'
import { AppText, Button, Card, Field } from '@/components/ui'
import { useAppTheme } from '@/theme/use-theme'

export interface RestEditTarget {
  exerciseIndex: number
  setIndex: number
  value: number
}

function nullableNumber(value: string): number | null {
  if (value.trim() === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function CompactInput({
  label,
  value,
  placeholder,
  keyboardType,
  onChangeText,
}: {
  label: string
  value: string
  placeholder: string
  keyboardType: 'decimal-pad' | 'number-pad'
  onChangeText: (value: string) => void
}) {
  const { colors } = useAppTheme()
  return (
    <TextInput
      accessibilityLabel={label}
      keyboardType={keyboardType}
      selectTextOnFocus
      value={value}
      placeholder={placeholder}
      placeholderTextColor={colors.textMuted}
      onChangeText={onChangeText}
      style={[
        styles.input,
        {
          backgroundColor: colors.surfaceRaised,
          borderColor: colors.border,
          color: colors.text,
        },
      ]}
    />
  )
}

function Action({
  label,
  accessibilityLabel,
  variant,
  onPress,
}: {
  label: string
  accessibilityLabel: string
  variant: 'start' | 'complete' | 'remove'
  onPress: () => void
}) {
  const { colors } = useAppTheme()
  const foreground =
    variant === 'complete' ? colors.primaryText : variant === 'remove' ? colors.danger : colors.primary
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={4}
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        {
          backgroundColor: variant === 'complete' ? colors.primary : colors.surfaceRaised,
          borderColor: variant === 'remove' ? colors.danger : colors.border,
        },
        pressed && styles.pressed,
      ]}
    >
      <AppText style={[styles.actionText, { color: foreground }]}>{label}</AppText>
    </Pressable>
  )
}

export function WorkoutSetColumns({ unilateral = false }: { unilateral?: boolean }) {
  const { colors } = useAppTheme()
  const textStyle = [styles.columnText, { color: colors.textMuted }]
  return (
    <View style={styles.row}>
      <AppText style={[styles.identity, ...textStyle]}>{unilateral ? 'Set/side' : 'Set'}</AppText>
      <AppText style={[styles.inputCell, ...textStyle]}>Weight</AppText>
      <AppText style={[styles.inputCell, ...textStyle]}>Reps</AppText>
      <AppText style={[styles.inputCell, ...textStyle]}>RPE</AppText>
      <View style={styles.completeCell} />
      <View style={styles.removeCell} />
    </View>
  )
}

function PerformanceInputs({
  result,
  setIndex,
  side,
  unit,
  targets,
  onUpdate,
}: {
  result: SetPerformance
  setIndex: number
  side: 'left' | 'right' | null
  unit: WeightUnit
  targets: Pick<CompletedSet, 'targetReps' | 'targetRpeTenths'>
  onUpdate: (change: Partial<SetPerformance>) => void
}) {
  const prefix = side === null ? `Set ${setIndex + 1}` : `Set ${setIndex + 1}, ${side}`
  return (
    <>
      <View style={styles.inputCell}>
        <CompactInput
          label={`${prefix} weight in ${unit}`}
          keyboardType="decimal-pad"
          placeholder="—"
          value={
            result.actualWeightGrams === null
              ? ''
              : String(Number(gramsToUnit(result.actualWeightGrams, unit).toFixed(2)))
          }
          onChangeText={(value) => {
            const parsed = nullableNumber(value)
            onUpdate({
              actualWeightGrams: parsed === null ? null : unitToGrams(Math.max(0, parsed), unit),
            })
          }}
        />
      </View>
      <View style={styles.inputCell}>
        <CompactInput
          label={`${prefix} reps`}
          keyboardType="number-pad"
          placeholder={`${targets.targetReps.min}–${targets.targetReps.max}`}
          value={result.actualReps === null ? '' : String(result.actualReps)}
          onChangeText={(value) => {
            const parsed = nullableNumber(value)
            onUpdate({ actualReps: parsed === null ? null : Math.max(0, Math.round(parsed)) })
          }}
        />
      </View>
      <View style={styles.inputCell}>
        <CompactInput
          label={`${prefix} RPE`}
          keyboardType="decimal-pad"
          placeholder={targets.targetRpeTenths === null ? '—' : String(targets.targetRpeTenths / 10)}
          value={result.actualRpeTenths === null ? '' : String(result.actualRpeTenths / 10)}
          onChangeText={(value) => {
            const parsed = nullableNumber(value)
            onUpdate({
              actualRpeTenths: parsed === null ? null : Math.round(Math.min(10, Math.max(0, parsed)) * 10),
            })
          }}
        />
      </View>
    </>
  )
}

export function WorkoutSetRow({
  set,
  setIndex,
  unit,
  trackingMode,
  onUpdate,
  onStart,
  onComplete,
  onRemove,
  onChooseType,
  onEditRest,
}: {
  set: CompletedSet
  setIndex: number
  unit: WeightUnit
  trackingMode: ExerciseTrackingMode
  onUpdate: (change: Partial<CompletedSet>) => void
  onStart: () => void
  onComplete: () => void
  onRemove: () => void
  onChooseType: () => void
  onEditRest: () => void
}) {
  const { colors } = useAppTheme()
  const active = set.status === 'planned' && set.startedAt !== null && set.completedAt === null
  const completed = set.status === 'completed'
  const emptyResult: SetPerformance = {
    actualWeightGrams: null,
    actualReps: null,
    actualRpeTenths: null,
  }
  const sideResults = set.sideResults ?? { left: emptyResult, right: emptyResult }
  const updateSide = (side: 'left' | 'right', change: Partial<SetPerformance>) =>
    onUpdate({
      actualWeightGrams: null,
      actualReps: null,
      actualRpeTenths: null,
      sideResults: {
        ...sideResults,
        [side]: { ...sideResults[side], ...change },
      },
    })
  return (
    <View
      style={[
        styles.block,
        { borderColor: active || completed ? colors.primary : colors.border },
        active && { backgroundColor: colors.surfaceRaised },
      ]}
    >
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Set ${setIndex + 1}, ${set.type}`}
          onPress={onChooseType}
          style={styles.identity}
        >
          <AppText style={styles.setNumber}>
            {setIndex + 1}
            {trackingMode === 'unilateral' ? ' L' : ''}
          </AppText>
          <View
            style={[
              styles.badge,
              {
                backgroundColor: set.type === 'work' ? colors.primary : colors.surface,
                borderColor: colors.primary,
              },
            ]}
          >
            <AppText
              style={[styles.badgeText, { color: set.type === 'work' ? colors.primaryText : colors.primary }]}
            >
              {set.type === 'work' ? 'W' : 'WU'}
            </AppText>
          </View>
        </Pressable>

        <PerformanceInputs
          result={trackingMode === 'unilateral' ? sideResults.left : set}
          setIndex={setIndex}
          side={trackingMode === 'unilateral' ? 'left' : null}
          unit={unit}
          targets={set}
          onUpdate={(change) =>
            trackingMode === 'unilateral' ? updateSide('left', change) : onUpdate(change)
          }
        />
        <View style={styles.completeCell}>
          <Action
            label={completed || active ? '✓' : 'Start'}
            accessibilityLabel={
              completed
                ? `Undo set ${setIndex + 1}`
                : active
                  ? `Complete set ${setIndex + 1}`
                  : `Start set ${setIndex + 1}`
            }
            variant={completed || active ? 'complete' : 'start'}
            onPress={completed || active ? onComplete : onStart}
          />
        </View>
        <View style={styles.removeCell}>
          <Action
            label="×"
            accessibilityLabel={`Remove set ${setIndex + 1}`}
            variant="remove"
            onPress={onRemove}
          />
        </View>
      </View>

      {trackingMode === 'unilateral' ? (
        <View style={styles.row}>
          <View style={styles.identity}>
            <AppText style={[styles.sideLabel, { color: colors.textMuted }]}>R</AppText>
          </View>
          <PerformanceInputs
            result={sideResults.right}
            setIndex={setIndex}
            side="right"
            unit={unit}
            targets={set}
            onUpdate={(change) => updateSide('right', change)}
          />
          <View style={styles.completeCell} />
          <View style={styles.removeCell} />
        </View>
      ) : null}

      <View style={styles.meta}>
        <AppText style={[styles.hint, { color: colors.textMuted }]}>
          Target {set.targetReps.min}–{set.targetReps.max} reps · RPE{' '}
          {set.targetRpeTenths === null ? '—' : set.targetRpeTenths / 10} · rest{' '}
          {formatDuration(set.restSeconds)}
        </AppText>
        {completed ? (
          set.actualRestSeconds === null ? (
            <AppText style={[styles.rest, { color: colors.warning }]}>Rest running</AppText>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Edit rest for set ${setIndex + 1}`}
              onPress={onEditRest}
            >
              <AppText style={[styles.rest, { color: colors.primary }]}>
                Rest {formatDuration(set.actualRestSeconds)}
              </AppText>
            </Pressable>
          )
        ) : null}
      </View>
    </View>
  )
}

export function RestEditorModal({
  target,
  onClose,
  onSave,
}: {
  target: RestEditTarget | null
  onClose: () => void
  onSave: (seconds: number) => void
}) {
  const { colors } = useAppTheme()
  const [minutes, setMinutes] = useState('')
  const [seconds, setSeconds] = useState('')

  useEffect(() => {
    if (target === null) return
    setMinutes(String(Math.floor(target.value / 60)))
    setSeconds(String(target.value % 60))
  }, [target])

  const save = () => {
    const minuteValue = Math.max(0, Math.round(nullableNumber(minutes) ?? 0))
    const secondValue = Math.max(0, Math.round(nullableNumber(seconds) ?? 0))
    onSave(minuteValue * 60 + secondValue)
  }

  return (
    <Modal transparent animationType="fade" visible={target !== null} onRequestClose={onClose}>
      <View style={[styles.overlay, { backgroundColor: colors.overlay }]}>
        <Card style={styles.modal}>
          <AppText style={styles.modalTitle}>Edit measured rest</AppText>
          <AppText style={{ color: colors.textMuted }}>
            This does not change the plan’s prescribed rest target.
          </AppText>
          <View style={styles.modalFields}>
            <View style={styles.flex}>
              <Field label="Minutes" keyboardType="number-pad" value={minutes} onChangeText={setMinutes} />
            </View>
            <View style={styles.flex}>
              <Field label="Seconds" keyboardType="number-pad" value={seconds} onChangeText={setSeconds} />
            </View>
          </View>
          <Button title="Save rest" onPress={save} />
          <Button title="Cancel" variant="ghost" onPress={onClose} />
        </Card>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.72 },
  flex: { flex: 1 },
  block: { borderWidth: 1, borderRadius: 11, padding: 7, gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  identity: { width: 33, alignItems: 'center', justifyContent: 'center', gap: 2 },
  setNumber: { fontSize: 12, fontWeight: '900' },
  sideLabel: { fontSize: 12, fontWeight: '900' },
  badge: {
    minWidth: 28,
    height: 18,
    paddingHorizontal: 3,
    borderRadius: 5,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontSize: 9, fontWeight: '900' },
  inputCell: { flex: 1, minWidth: 0 },
  input: {
    width: '100%',
    height: 38,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 4,
    paddingVertical: 0,
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  completeCell: { width: 48 },
  removeCell: { width: 40 },
  action: {
    width: '100%',
    height: 44,
    borderWidth: 1,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: { fontSize: 13, fontWeight: '900' },
  columnText: { fontSize: 10, textAlign: 'center', fontWeight: '800', textTransform: 'uppercase' },
  meta: {
    minHeight: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  hint: { flex: 1, fontSize: 11, lineHeight: 15 },
  rest: { fontSize: 12, fontWeight: '800' },
  overlay: { flex: 1, justifyContent: 'center', padding: 22 },
  modal: { width: '100%', maxWidth: 420, alignSelf: 'center' },
  modalTitle: { fontSize: 21, fontWeight: '900' },
  modalFields: { flexDirection: 'row', gap: 10 },
})
