/**
 * CommerceDetailFreshnessBanner — shared data-freshness indicator for
 * product-detail surfaces (direct, auction, Co-Own).
 *
 * Surfaces stale, reconnecting, and refresh-failed states that the
 * offline banner does not cover. Follows the same quiet visual language
 * as `CommerceDetailOfflineBanner`. Does not block interaction — cached
 * data may still be visible.
 *
 * States (first match wins):
 *   - refreshing: "Updating…" (lifecycle transition or manual refresh)
 *   - stale:      "Reconnecting…" (app returned from background)
 *   - failed:     "Couldn't refresh · tap to retry" (last fetch failed)
 *
 * When all states are false, renders nothing.
 */

import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../../theme/ThemeContext';
import { Space, Radius, Type, Typography } from '../../../theme/designTokens';

export interface CommerceDetailFreshnessBannerProps {
  /** True when a lifecycle-transition refresh is in progress. */
  isRefreshing?: boolean;
  /** True when the server clock detected a background gap and needs resync. */
  isStale?: boolean;
  /** True when the last refresh attempt failed. */
  refreshFailed?: boolean;
  /** Tap handler when refreshFailed is true. */
  onRetry?: () => void;
}

export function CommerceDetailFreshnessBanner({
  isRefreshing = false,
  isStale = false,
  refreshFailed = false,
  onRetry,
}: CommerceDetailFreshnessBannerProps) {
  const { colors } = useAppTheme();

  if (refreshFailed) {
    return (
      <Pressable
        onPress={onRetry}
        style={({ pressed }) => [
          styles.container,
          {
            backgroundColor: colors.dangerSubtle,
            borderColor: colors.dangerBorder,
          },
          pressed && { opacity: 0.6 },
        ]}
        accessibilityRole="button"
        accessibilityLabel="Couldn't refresh. Tap to retry."
      >
        <Ionicons name="refresh-circle-outline" size={14} color={colors.danger} />
        <View style={styles.textWrap}>
          <Text style={[styles.title, { color: colors.danger }]} numberOfLines={1}>
            Couldn't refresh
          </Text>
          <Text
            style={[styles.subtitle, { color: colors.textSecondary }]}
            numberOfLines={2}
          >
            Tap to retry · showing last known
          </Text>
        </View>
      </Pressable>
    );
  }

  if (isRefreshing) {
    return (
      <View
        style={[
          styles.container,
          {
            backgroundColor: colors.surfaceAlt,
            borderColor: colors.border,
          },
        ]}
      >
        <Ionicons name="sync-outline" size={14} color={colors.textSecondary} />
        <View style={styles.textWrap}>
          <Text style={[styles.title, { color: colors.textSecondary }]} numberOfLines={1}>
            Updating
          </Text>
          <Text
            style={[styles.subtitle, { color: colors.textMuted }]}
            numberOfLines={2}
          >
            Refreshing latest data
          </Text>
        </View>
      </View>
    );
  }

  if (isStale) {
    return (
      <View
        style={[
          styles.container,
          {
            backgroundColor: colors.warningSubtle,
            borderColor: colors.warningBorder,
          },
        ]}
      >
        <Ionicons name="time-outline" size={14} color={colors.warning} />
        <View style={styles.textWrap}>
          <Text style={[styles.title, { color: colors.warning }]} numberOfLines={1}>
            Reconnecting
          </Text>
          <Text
            style={[styles.subtitle, { color: colors.textSecondary }]}
            numberOfLines={2}
          >
            Data may be outdated · refreshing
          </Text>
        </View>
      </View>
    );
  }

  return null;
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
