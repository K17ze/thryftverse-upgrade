/**
 * CoOwnOfflineBanner — offline indicator for Co-Own screens.
 *
 * Shows a quiet banner when the device is offline. Does not block
 * interaction — cached data may still be visible. Follows source §14:
 * "offline" state must be designed, not just a blank screen.
 *
 * See docs/coown/flagship-exchange-upgrade/07 §1.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Radius, Type, Typography } from '../../theme/designTokens';

export interface CoOwnOfflineBannerProps {
  /** Whether the device is currently offline. */
  isOffline: boolean;
  /** Optional last-synced timestamp label. */
  lastSyncedLabel?: string;
}

export function CoOwnOfflineBanner({ isOffline, lastSyncedLabel }: CoOwnOfflineBannerProps) {
  const { colors } = useAppTheme();

  if (!isOffline) return null;

  return (
    <View style={[styles.container, { backgroundColor: colors.warning + '12', borderColor: colors.warning + '30' }]}>
      <Ionicons name="cloud-offline-outline" size={14} color={colors.warning} />
      <View style={styles.textWrap}>
        <Text style={[styles.title, { color: colors.warning }]} numberOfLines={1}>
          Offline
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]} numberOfLines={1}>
          {lastSyncedLabel
            ? `Showing cached data · last synced ${lastSyncedLabel}`
            : 'Showing cached data'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    marginHorizontal: Space.md,
    marginTop: Space.sm,
  },
  textWrap: {
    flex: 1,
    gap: 1,
  },
  title: {
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.metaElevated.letterSpacing,
  },
  subtitle: {
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.meta.letterSpacing,
  },
});

export default CoOwnOfflineBanner;
