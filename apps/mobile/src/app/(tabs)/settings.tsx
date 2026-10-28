import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native'
import { AppIcon, IconButton, PageTitle } from '@/components/design'
import { AppText, Button, Card, Screen } from '@/components/ui'
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
    <Screen safeBottom={false}>
      <PageTitle
        eyebrow="Account"
        title="Settings"
        accessory={
          <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
            <AppText style={{ color: colors.primaryText, fontWeight: '600' }}>{auth.initials}</AppText>
          </View>
        }
      />
      <Card style={styles.profile}>
        <View style={[styles.largeAvatar, { backgroundColor: colors.primary }]}>
          <AppText style={{ color: colors.primaryText, fontSize: 16, fontWeight: '600' }}>
            {auth.initials}
          </AppText>
        </View>
        <View style={styles.grow}>
          <AppText style={styles.profileName}>{auth.displayName ?? 'Personal account'}</AppText>
          <AppText style={[styles.detail, { color: colors.textMuted }]}>
            Personal account · {auth.clerkEnabled ? 'Clerk secured' : 'Local demo'}
          </AppText>
        </View>
        <IconButton
          icon="chevron-right"
          label="Account details"
          onPress={() =>
            Alert.alert(
              'Your account',
              `${auth.displayName ?? 'Personal account'}\n${auth.userId ?? 'Signed out'}`,
            )
          }
        />
      </Card>

      <AppText style={[styles.groupLabel, { color: colors.primary }]}>PREFERENCES</AppText>
      <Card style={styles.group}>
        <View style={styles.settingRow}>
          <AppIcon name="scale-bathroom" color={colors.primary} />
          <View style={styles.grow}>
            <AppText style={styles.label}>Weight unit</AppText>
            <AppText style={[styles.detail, { color: colors.textMuted }]}>Storage stays normalized</AppText>
          </View>
          <View style={[styles.units, { backgroundColor: colors.surfaceRaised }]}>
            {(['kg', 'lb'] as const).map((value) => (
              <Pressable
                key={value}
                accessibilityRole="button"
                accessibilityLabel={value === 'kg' ? 'Kilograms' : 'Pounds'}
                accessibilityState={{ selected: unit === value }}
                onPress={() => void updateUnit(value)}
                style={[styles.unit, unit === value && { backgroundColor: colors.primary }]}
              >
                <AppText
                  style={{ color: unit === value ? colors.primaryText : colors.textMuted, fontWeight: '600' }}
                >
                  {value}
                </AppText>
              </Pressable>
            ))}
          </View>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Timezone, use device timezone"
          onPress={() =>
            Alert.alert(
              'Timezone',
              `Current: ${data.profile?.timezone ?? 'UTC'}\nUse this device's timezone for date grouping?`,
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Use device timezone', onPress: () => void updateTimezone() },
              ],
            )
          }
          style={[
            styles.settingRow,
            { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth },
          ]}
        >
          <AppIcon name="earth" color={colors.primary} />
          <View style={styles.grow}>
            <AppText style={styles.label}>Timezone</AppText>
            <AppText style={[styles.detail, { color: colors.textMuted }]}>
              {data.profile?.timezone ?? 'Loading…'}
            </AppText>
          </View>
          <AppIcon name="chevron-right" color={colors.textMuted} />
        </Pressable>
      </Card>

      <AppText style={[styles.groupLabel, { color: colors.primary }]}>DATA & SYNC</AppText>
      <Card style={styles.group}>
        <View style={styles.settingRow}>
          <AppIcon
            name={data.syncStatus.lastError ? 'cloud-alert-outline' : 'cloud-check-outline'}
            color={data.syncStatus.lastError ? colors.warning : colors.primary}
          />
          <View style={styles.grow}>
            <AppText style={styles.label}>
              {data.syncStatus.syncing
                ? 'Syncing now'
                : data.syncStatus.pending > 0
                  ? `${data.syncStatus.pending} changes pending`
                  : data.syncStatus.lastError
                    ? 'Sync needs attention'
                    : data.syncStatus.lastSyncedAt
                      ? 'Everything is synced'
                      : 'Ready to sync'}
            </AppText>
            <AppText style={[styles.detail, { color: colors.textMuted }]}>
              {data.syncStatus.lastSyncedAt === null
                ? 'Not synced yet'
                : new Date(data.syncStatus.lastSyncedAt).toLocaleString()}
            </AppText>
          </View>
          {data.syncStatus.syncing ? (
            <View style={styles.syncSpinner}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : (
            <IconButton icon="sync" label="Sync now" selected onPress={() => void syncNow()} />
          )}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Offline storage details"
          onPress={() =>
            Alert.alert(
              'Offline storage',
              process.env.EXPO_PUBLIC_USE_SQLCIPHER === 'true'
                ? 'SQLCipher is enabled for this development build.'
                : 'Your changes are saved in local SQLite before syncing. Expo Go uses unencrypted SQLite; SQLCipher requires a custom signed build.',
            )
          }
          style={[
            styles.settingRow,
            { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth },
          ]}
        >
          <AppIcon name="database-outline" color={colors.primary} />
          <View style={styles.grow}>
            <AppText style={styles.label}>Offline storage</AppText>
            <AppText style={[styles.detail, { color: colors.textMuted }]}>
              SQLite · device first · {data.syncStatus.conflicts} conflicts
            </AppText>
          </View>
          <AppIcon name="chevron-right" color={colors.textMuted} />
        </Pressable>
      </Card>
      {data.syncStatus.lastError ? (
        <AppText style={{ color: colors.danger }}>{data.syncStatus.lastError}</AppText>
      ) : null}
      {__DEV__ && data.conflicts.length > 0 ? (
        <AppText style={[styles.devLabel, { color: colors.warning }]}>
          Development tools are enabled for conflict cleanup.
        </AppText>
      ) : null}
      {data.conflicts.map((conflict) => (
        <View key={conflict.mutationId} style={[styles.conflict, { borderColor: colors.warning }]}>
          <View style={styles.conflictTitle}>
            <AppIcon name="alert-outline" color={colors.warning} />
            <AppText style={styles.label}>{conflict.entityType.replaceAll('_', ' ')} conflict</AppText>
          </View>
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
          </View>
          {__DEV__ ? (
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                confirmDeleteConflictData(
                  conflict.mutationId,
                  conflict.entityType,
                  conflict.reason === 'active_workout_exists',
                )
              }
              style={[styles.deleteConflict, { borderColor: colors.danger }]}
            >
              <AppIcon name="trash-can-outline" size={16} color={colors.danger} />
              <AppText style={{ color: colors.danger }}>Delete conflicting data · developer only</AppText>
            </Pressable>
          ) : null}
        </View>
      ))}

      <AppText style={[styles.groupLabel, { color: colors.primary }]}>SECURITY</AppText>
      <Card style={styles.group}>
        <View style={styles.settingRow}>
          <AppIcon name="shield-check-outline" color={colors.primary} />
          <View style={styles.grow}>
            <AppText style={styles.label}>Authentication</AppText>
            <AppText style={[styles.detail, { color: colors.textMuted }]}>
              {auth.clerkEnabled ? 'Signed in with Clerk' : 'Local demo authentication'}
            </AppText>
          </View>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Sign out"
          onPress={() => void auth.signOut()}
          style={[
            styles.settingRow,
            { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth },
          ]}
        >
          <AppIcon name="logout" color={colors.danger} />
          <AppText style={[styles.label, { color: colors.danger }]}>Sign out</AppText>
        </Pressable>
      </Card>
    </Screen>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10 },
  label: { fontWeight: '600' },
  detail: { fontSize: 11, marginTop: 3 },
  groupLabel: { fontSize: 11, letterSpacing: 1.3, marginTop: 12 },
  units: { flexDirection: 'row', borderRadius: 9, padding: 2 },
  unit: { width: 44, minHeight: 44, borderRadius: 7, justifyContent: 'center', alignItems: 'center' },
  syncSpinner: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  deleteConflict: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    padding: 10,
    minHeight: 44,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 10,
  },
  conflict: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 9, backgroundColor: '#0D140F' },
  grow: { flex: 1, minWidth: 0 },
  avatar: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  largeAvatar: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  profile: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 },
  profileName: { fontSize: 14, fontWeight: '600' },
  group: { padding: 0, gap: 0, overflow: 'hidden' },
  settingRow: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingVertical: 9,
    paddingHorizontal: 12,
  },
  devLabel: { fontWeight: '800', fontSize: 12 },
  conflictTitle: { flexDirection: 'row', alignItems: 'center', gap: 8 },
})
