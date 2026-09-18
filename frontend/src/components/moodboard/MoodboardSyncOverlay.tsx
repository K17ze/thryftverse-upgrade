/**
 * MoodboardSyncOverlay — honest per-operation sync status surface.
 *
 * Replaces the global "Saving…" pill. Shows syncing, synced, conflict, or
 * error states for position/theme operations. The `saving` flag still drives
 * the pill for add/delete/reorder (heavier operations that re-fetch the full
 * board).
 */
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Pressable } from 'react-native';

import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Radius, Stroke } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { AppIcon } from '../common/AppIcon';
import { IconSize } from '../../theme/iconTokens';
import type { ConflictDetail, SyncStatus } from './useMoodboardBoard';

export interface MoodboardSyncOverlayProps {
  saving: boolean;
  syncStatus: SyncStatus;
  conflictDetail: ConflictDetail | null;
  onDismissConflict: () => void;
  onCompareConflict: () => void;
  /** Re-runs the outbox drain + reconcile after a sync error. */
  onRetrySync: () => void;
}

export function MoodboardSyncOverlay({
  saving,
  syncStatus,
  conflictDetail,
  onDismissConflict,
  onCompareConflict,
  onRetrySync }: MoodboardSyncOverlayProps) {
  const { colors } = useAppTheme();
  const styles = useStyles();

  if (!saving && syncStatus === 'idle') return null;

  return (
    <View style={styles.savingOverlay} pointerEvents={syncStatus === 'conflict' || syncStatus === 'error' ? 'auto' : 'none'}>
      {syncStatus === 'conflict' && conflictDetail ? (
        <View style={styles.conflictCard}>
          <AppIcon name="alert-circle-outline" size={IconSize.sm} color={colors.warningText} accessible={false} />
          <Text style={styles.conflictText}>{conflictDetail.message}</Text>
          <Pressable
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            onPress={onCompareConflict}
            accessibilityRole="button"
            accessibilityLabel="Compare versions"
          >
            <Text style={styles.conflictDismiss}>Compare</Text>
          </Pressable>
          <Pressable
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            onPress={onDismissConflict}
            accessibilityRole="button"
            accessibilityLabel="Dismiss conflict notice"
          >
            <Text style={styles.conflictDismiss}>OK</Text>
          </Pressable>
        </View>
      ) : syncStatus === 'error' ? (
        <View style={styles.errorRow}>
          <View style={styles.errorPill}>
            <AppIcon name="cloud-offline-outline" size={IconSize.xs} color="textInverse" accessible={false} />
            <Text style={styles.savingText}>Couldn't save</Text>
          </View>
          <Pressable
            onPress={onRetrySync}
            accessibilityRole="button"
            accessibilityLabel="Retry sync"
            accessibilityHint="Pushes queued changes to the server again"
            style={styles.retryTarget}
          >
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : syncStatus === 'synced' ? (
        <View style={styles.syncedPill}>
          <AppIcon name="checkmark" size={IconSize.xs} color="textInverse" accessible={false} />
          <Text style={styles.savingText}>Synced</Text>
        </View>
      ) : (
        <View style={styles.savingPill}>
          <ActivityIndicator size="small" color={colors.textInverse} />
          <Text style={styles.savingText}>Saving…</Text>
        </View>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Themed styles (depend on useAppTheme colors)
// ---------------------------------------------------------------------------
function useStyles() {
  const { colors } = useAppTheme();
  return React.useMemo(
    () =>
      StyleSheet.create({
        savingOverlay: {
          ...StyleSheet.absoluteFill,
          alignItems: 'center',
          justifyContent: 'center' },
        savingPill: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: Space.sm,
          paddingHorizontal: Space.md,
          paddingVertical: Space.sm,
          borderRadius: Radius.full,
          backgroundColor: colors.brand },
        savingText: {
          fontSize: TypographyV2.bodyStrong.size,
          fontFamily: TypographyV2.bodyStrong.fontFamily,
          color: colors.textInverse },
        syncedPill: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: Space.xs,
          paddingHorizontal: Space.md,
          paddingVertical: Space.sm,
          borderRadius: Radius.full,
          backgroundColor: colors.success },
        errorRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: Space.sm },
        errorPill: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: Space.xs,
          paddingHorizontal: Space.md,
          paddingVertical: Space.sm,
          borderRadius: Radius.full,
          backgroundColor: colors.danger },
        // Transparent 44pt text target — no pill or card chrome (AGENTS.md §4).
        retryTarget: {
          minHeight: 44,
          minWidth: 44,
          alignItems: 'center',
          justifyContent: 'center' },
        retryText: {
          fontSize: TypographyV2.body.size,
          fontFamily: TypographyV2.bodyStrong.fontFamily,
          color: colors.dangerText },
        conflictCard: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: Space.sm,
          paddingHorizontal: Space.md,
          paddingVertical: Space.sm,
          borderRadius: Radius.lg,
          backgroundColor: colors.warningSubtle,
          borderWidth: Stroke.standard,
          borderColor: colors.warningBorder,
          marginHorizontal: Space.md,
          maxWidth: 320 },
        conflictText: {
          flex: 1,
          fontSize: TypographyV2.meta.size,
          lineHeight: TypographyV2.meta.lineHeight,
          fontFamily: TypographyV2.meta.fontFamily,
          color: colors.warningText },
        conflictDismiss: {
          fontSize: TypographyV2.bodyStrong.size,
          fontFamily: TypographyV2.bodyStrong.fontFamily,
          color: colors.warningText } }),
    [colors],
  );
}
