/**
 * CommerceDetailOfflineBanner — shared offline indicator for
 * product-detail surfaces (direct, auction, Co-Own).
 *
 * Shows a quiet banner when the device is offline. Does not block
 * interaction — cached data may still be visible. Follows spec 05
 * §14: "offline" state must be designed, not just a blank screen.
 *
 * This is the canonical shared primitive. The Co-Own-specific
 * `CoOwnOfflineBanner` delegates to this same pattern.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../../theme/ThemeContext';
import { Space, Radius, Type, Typography } from '../../../theme/designTokens';

export interface CommerceDetailOfflineBannerProps {
  /** Whether the device is currently offline. */
  isOffline: boolean;
  /** Optional last-synced timestamp label. */
  lastSyncedLabel?: string;
}

export function CommerceDetailOfflineBanner({
  isOffline,
  lastSyncedLabel,
}: CommerceDetailOfflineBannerProps) {
  const { colors } = useAppTheme();

  if (!isOffline) return null;

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.warningSubtle,
          borderColor: colors.warning + '30',
        },
      ]}
    >
      <Ionicons name="cloud-offline-outline" size={14} color={colors.warning} />
      <View style={styles.textWrap}>
        <Text style={[styles.title, { color: colors.warning }]} numberOfLines={1}>
          Offline
        </Text>
        <Text
          style={[styles.subtitle, { color: colors.textSecondary }]}
          numberOfLines={2}
        >
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
    gap: Space.xs / 4,
  },
  title: {
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.label.letterSpacing,
  },
  subtitle: {
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.meta.letterSpacing,
  },
});
