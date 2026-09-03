/**
 * CoOwnReconciliationBanner — read-only stale view indicator.
 *
 * Doc 10 §10.6 + §10.10: on a reconciliation break, the UI retains a
 * read-only stale view with a timestamp ("Last reliable: 14:02 · 3m
 * ago") instead of blanking the market. Order submission is disabled;
 * cancels remain allowed.
 *
 * The banner is quiet but clear — it does not panic the user, but it
 * does not hide the fact that data may be stale.
 *
 * See docs/coown/flagship-exchange-upgrade/10 §10.6, §10.10.
 */

import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Radius } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';

export interface CoOwnReconciliationBannerProps {
  /** Whether a reconciliation break is active. */
  isActive: boolean;
  /** Timestamp of last reliable data (e.g. "14:02"). */
  lastReliableTimestamp?: string;
  /** Age label of last reliable data (e.g. "3m ago"). */
  lastReliableAgeLabel?: string;
  /** Contact support callback. */
  onContactSupport?: () => void;
}

export function CoOwnReconciliationBanner({
  isActive,
  lastReliableTimestamp,
  lastReliableAgeLabel,
  onContactSupport,
}: CoOwnReconciliationBannerProps) {
  const { colors } = useAppTheme();

  if (!isActive) return null;

  return (
    <View style={[styles.container, { backgroundColor: colors.warningSubtle, borderColor: colors.warningBorder }]}>
      <Ionicons name="sync-circle-outline" size={20} color={colors.warning} />
      <View style={styles.body}>
        <Text style={[styles.title, { color: colors.warning }]} numberOfLines={1}>
          Reconciling
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]} numberOfLines={2}>
          Temporarily unavailable — we're reconciling balances.
          {lastReliableTimestamp && ` Last reliable: ${lastReliableTimestamp}`}
          {lastReliableAgeLabel && ` · ${lastReliableAgeLabel}`}
        </Text>
      </View>
      {onContactSupport && (
        <Pressable
          onPress={onContactSupport}
          style={[styles.contactBtn, { borderColor: colors.warningBorder }]}
          accessibilityRole="button"
          accessibilityLabel="Contact support about reconciliation"
        >
          <Text style={[styles.contactText, { color: colors.warning }]} numberOfLines={1}>
            Contact
          </Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm + 2,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    marginHorizontal: Space.md,
    marginTop: Space.sm,
  },
  body: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: TypographyV2.bodyStrong.size,
    lineHeight: TypographyV2.bodyStrong.lineHeight,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    letterSpacing: TypographyV2.bodyStrong.letterSpacing,
  },
  subtitle: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight + 1,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
  },
  contactBtn: {
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs + 2,
    borderRadius: Radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    flexShrink: 0,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
  },
});

export default CoOwnReconciliationBanner;
