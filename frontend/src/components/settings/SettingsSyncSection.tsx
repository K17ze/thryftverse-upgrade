import React from 'react';
import { Alert } from 'react-native';
import { useAppTranslation } from '../../i18n/useAppTranslation';
import { useOfflineQueue } from '../../lib/offlineQueue';
import { SettingsSection } from './SettingsSection';
import { SettingsRow } from './SettingsRow';

/**
 * Offline-write truth surface (audit R76): mutations that exhausted retries
 * must stay visible to the user — never silently appear saved. This section
 * renders only while the queue holds pending or dead-lettered writes, and
 * offers the two honest resolutions: retry the failed ones, or acknowledge
 * and discard them.
 */
export function SettingsSyncSection() {
  const { t: ts } = useAppTranslation('settings');
  const pendingCount = useOfflineQueue((s) => s.queue.length);
  const failedCount = useOfflineQueue((s) => s.deadLetterQueue.length);
  const retryAllDeadLetters = useOfflineQueue((s) => s.retryAllDeadLetters);
  const clearDeadLetters = useOfflineQueue((s) => s.clearDeadLetters);

  if (pendingCount === 0 && failedCount === 0) return null;

  const subtitleParts: string[] = [];
  if (pendingCount > 0) {
    subtitleParts.push(ts('rows.syncPending', { count: pendingCount }));
  }
  if (failedCount > 0) {
    subtitleParts.push(ts('rows.syncFailed', { count: failedCount }));
  }

  const openActions = () => {
    if (failedCount === 0) {
      Alert.alert(
        ts('sync.title'),
        ts('sync.pendingOnlyBody'),
        [{ text: ts('sync.dismiss'), style: 'cancel' }],
      );
      return;
    }
    Alert.alert(
      ts('sync.title'),
      ts('sync.failedBody', { count: failedCount }),
      [
        {
          text: ts('sync.retry'),
          onPress: retryAllDeadLetters,
        },
        {
          text: ts('sync.discard'),
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              ts('sync.discardConfirmTitle'),
              ts('sync.discardConfirmBody', { count: failedCount }),
              [
                { text: ts('sync.dismiss'), style: 'cancel' },
                { text: ts('sync.discardConfirm'), style: 'destructive', onPress: clearDeadLetters },
              ],
            );
          },
        },
        { text: ts('sync.dismiss'), style: 'cancel' },
      ],
    );
  };

  return (
    <SettingsSection title={ts('sections.sync')}>
      <SettingsRow
        icon="sync-outline"
        title={ts('rows.syncTitle')}
        subtitle={subtitleParts.join(' · ')}
        onPress={openActions}
        isFirst
        isLast
      />
    </SettingsSection>
  );
}
