import { Alert, StyleSheet, View } from 'react-native'
import { ChoiceChip, SectionTitle } from '@/components/controls'
import { AppText, Button, Card, Heading, Screen } from '@/components/ui'
import { useAppAuth } from '@/providers/auth-provider'
import { useData } from '@/providers/data-provider'
import { useAppTheme } from '@/theme/use-theme'

export default function SettingsScreen() {
  const auth = useAppAuth()
  const data = useData()
  const { colors } = useAppTheme()
  const unit = data.profile?.weightUnit ?? 'kg'

  const syncNow = async () => {
    const result = await data.synchronize()
    Alert.alert(result.ok ? 'Sync complete' : 'Sync failed', result.message)
  }

  const confirmDeleteConflictData = (
    mutationId: string,
    entityType: string,
    activeWorkoutConflict: boolean,
  ) => {
    Alert.alert(
      'Delete conflicted data?',
      activeWorkoutConflict
        ? 'Developer tool: this permanently deletes the conflicting local workout and syncs that deletion. The other active cloud workout is kept.'
        : `Developer tool: this permanently deletes the conflicted ${entityType.replaceAll('_', ' ')} locally and from the cloud.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete data',
          style: 'destructive',
          onPress: () => {
            void data
              .deleteConflictedData(mutationId)
              .then((result) =>
                Alert.alert(result.ok ? 'Conflict data deleted' : 'Delete status', result.message),
              )
          },
        },
      ],
    )
  }

  const updateUnit = async (nextUnit: 'kg' | 'lb') => {
    if (data.profile === null) return
    await data.save({ ...data.profile, weightUnit: nextUnit, updatedAt: new Date().toISOString() })
  }

  const updateTimezone = async () => {
    if (data.profile === null) return
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
    await data.save({ ...data.profile, timezone, updatedAt: new Date().toISOString() })
  }

  return (
    <Screen>
      <Heading subtitle="Units affect display only; storage stays normalized in grams.">Settings</Heading>
      <Card>
        <SectionTitle>Profile</SectionTitle>
        <AppText style={styles.label}>Weight unit</AppText>
        <View style={styles.row}>
          <ChoiceChip label="Kilograms" selected={unit === 'kg'} onPress={() => void updateUnit('kg')} />
          <ChoiceChip label="Pounds" selected={unit === 'lb'} onPress={() => void updateUnit('lb')} />
        </View>
        <AppText style={styles.label}>Profile timezone</AppText>
        <AppText style={{ color: colors.textMuted }}>{data.profile?.timezone ?? 'Loading…'}</AppText>
        <Button title="Use this device timezone" variant="secondary" onPress={() => void updateTimezone()} />
      </Card>

      <Card>
        <SectionTitle>Synchronization</SectionTitle>
        <AppText>Pending changes: {data.syncStatus.pending}</AppText>
        <AppText>Conflicts: {data.syncStatus.conflicts}</AppText>
        <AppText style={{ color: colors.textMuted }}>
          Last sync:{' '}
          {data.syncStatus.lastSyncedAt === null
            ? 'Not yet'
            : new Date(data.syncStatus.lastSyncedAt).toLocaleString()}
        </AppText>
        {data.syncStatus.lastError ? (
          <AppText style={{ color: colors.danger }}>{data.syncStatus.lastError}</AppText>
        ) : null}
        <Button title="Sync now" loading={data.syncStatus.syncing} onPress={() => void syncNow()} />
        {__DEV__ && data.conflicts.length > 0 ? (
          <AppText style={{ color: colors.warning, fontWeight: '800' }}>
            Development tools are enabled for conflict cleanup.
          </AppText>
        ) : null}
        {data.conflicts.map((conflict) => (
          <View key={conflict.mutationId} style={[styles.conflict, { borderColor: colors.warning }]}>
            <AppText style={styles.label}>{conflict.entityType.replaceAll('_', ' ')} conflict</AppText>
            <AppText style={{ color: colors.textMuted }}>
              {conflict.reason}. Cloud version {conflict.serverVersion}; your local copy remains recoverable.
            </AppText>
            <View style={styles.row}>
              {conflict.reason === 'active_workout_exists' ? (
                <>
                  <Button
                    title="Take over"
                    compact
                    variant="secondary"
                    onPress={() => void data.resolveConflict(conflict.mutationId, 'takeover')}
                  />
                  <Button
                    title="Keep as draft"
                    compact
                    variant="ghost"
                    onPress={() => void data.resolveConflict(conflict.mutationId, 'cloud')}
                  />
                </>
              ) : (
                <>
                  <Button
                    title="Keep mine"
                    compact
                    variant="secondary"
                    onPress={() => void data.resolveConflict(conflict.mutationId, 'mine')}
                  />
                  <Button
                    title="Use cloud"
                    compact
                    variant="ghost"
                    onPress={() =>
                      Alert.alert(
                        'Use cloud version?',
                        conflict.entityType === 'template' || conflict.entityType === 'workout'
                          ? 'A recoverable copy of your local version will be kept.'
                          : 'Your pending local edit for this item will be replaced.',
                        [
                          { text: 'Cancel', style: 'cancel' },
                          {
                            text: 'Use cloud',
                            onPress: () => void data.resolveConflict(conflict.mutationId, 'cloud'),
                          },
                        ],
                      )
                    }
                  />
                </>
              )}
              {__DEV__ ? (
                <Button
                  title="Delete data"
                  compact
                  variant="danger"
                  onPress={() =>
                    confirmDeleteConflictData(
                      conflict.mutationId,
                      conflict.entityType,
                      conflict.reason === 'active_workout_exists',
                    )
                  }
                />
              ) : null}
            </View>
          </View>
        ))}
      </Card>

      <Card>
        <SectionTitle>Security</SectionTitle>
        <AppText style={{ color: colors.textMuted }}>
          {auth.clerkEnabled
            ? 'Signed in with Clerk. Session tokens are stored securely.'
            : 'Local demo authentication is active. Add Clerk keys before deployment.'}
        </AppText>
        <AppText style={{ color: colors.textMuted }}>
          {process.env.EXPO_PUBLIC_USE_SQLCIPHER === 'true'
            ? 'SQLCipher is enabled for this development build.'
            : 'Expo Go uses standard SQLite. SQLCipher is enabled only in a custom signed build.'}
        </AppText>
        <Button title="Sign out" variant="danger" onPress={() => void auth.signOut()} />
      </Card>
    </Screen>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10 },
  label: { fontWeight: '800' },
  conflict: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 9 },
})
