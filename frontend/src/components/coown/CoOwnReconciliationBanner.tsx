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
import { Space, Radius, Type, Typography } from '../../theme/designTokens';

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
    <View style={[styles.container, { backgroundColor: colors.warning + '12', borderColor: colors.warning + '30' }]}>
      <View style={styles.iconWrap}>
        <Ionicons name="sync-circle-outline" size={18} color={colors.warning} />
      </View>
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
          style={[styles.contactBtn, { borderColor: colors.warning + '40' }]}
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
  iconWrap: {
    flexShrink: 0,
  },
  body: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: Type.bodyEmphasis.size,
    lineHeight: Type.bodyEmphasis.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.bodyEmphasis.letterSpacing,
  },
  subtitle: {
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight + 1,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.caption.letterSpacing,
  },
  contactBtn: {
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs + 2,
    borderRadius: Radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    flexShrink: 0,
  },
  contactText: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.meta.letterSpacing,
  },
});

export default CoOwnReconciliationBanner;
