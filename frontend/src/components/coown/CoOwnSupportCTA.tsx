/**
 * CoOwnSupportCTA — support + dispute experience entry point.
 *
 * Phase 6 §8: support + dispute experiences. A quiet, always-available
 * entry point for users to reach support, raise a dispute, or view
 * their support history. Does not fabricate availability — shows real
 * status when available, honest "Contact" when not.
 *
 * See docs/coown/flagship-exchange-upgrade/09 Phase 6 §8.
 */

import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Radius, Type, Typography } from '../../theme/designTokens';
import { AnimatedPressable } from '../AnimatedPressable';
import { haptics } from '../../utils/haptics';

export interface CoOwnSupportCTAProps {
  /** onPress for "Contact support". */
  onContactSupport?: () => void;
  /** onPress for "Raise a dispute". */
  onRaiseDispute?: () => void;
  /** onPress for "View support history". */
  onViewHistory?: () => void;
  /** Whether support is currently available (shows status). */
  isSupportAvailable?: boolean;
  /** Compact variant — for inline use in screens. */
  compact?: boolean;
}

export function CoOwnSupportCTA({
  onContactSupport,
  onRaiseDispute,
  onViewHistory,
  isSupportAvailable,
  compact,
}: CoOwnSupportCTAProps) {
  const { colors } = useAppTheme();

  const handleContact = () => { haptics.tap(); onContactSupport?.(); };
  const handleDispute = () => { haptics.tap(); onRaiseDispute?.(); };
  const handleHistory = () => { haptics.tap(); onViewHistory?.(); };

  return (
    <View style={[
      styles.container,
      { backgroundColor: colors.surface, borderColor: colors.border },
      compact && styles.containerCompact,
    ]}>
      {/* Header */}
      <View style={styles.headerRow}>
        <Ionicons name="headset-outline" size={16} color={colors.textSecondary} />
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
          Support
        </Text>
        {isSupportAvailable != null && (
          <View style={[styles.availabilityDot, { backgroundColor: isSupportAvailable ? colors.success : colors.textMuted }]} />
        )}
      </View>

      {/* Actions */}
      <View style={styles.actionCol}>
        {onContactSupport && (
          <Pressable
            onPress={handleContact}
            style={({ pressed }) => [
              styles.actionRow,
              { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Contact support"
          >
            <View style={styles.actionLeft}>
              <Ionicons name="chatbubbles-outline" size={16} color={colors.textPrimary} />
              <View style={styles.actionTextWrap}>
                <Text style={[styles.actionTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                  Contact support
                </Text>
                {isSupportAvailable != null && (
                  <Text style={[styles.actionSub, { color: isSupportAvailable ? colors.success : colors.textMuted }]} numberOfLines={1}>
                    {isSupportAvailable ? 'Available now' : 'Leave a message'}
                  </Text>
                )}
              </View>
            </View>
            <Ionicons name="chevron-forward" size={15} color={colors.textMuted} />
          </Pressable>
        )}

        {onRaiseDispute && (
          <Pressable
            onPress={handleDispute}
            style={({ pressed }) => [
              styles.actionRow,
              { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Raise a dispute"
          >
            <View style={styles.actionLeft}>
              <Ionicons name="flag-outline" size={16} color={colors.textPrimary} />
              <Text style={[styles.actionTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                Raise a dispute
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={15} color={colors.textMuted} />
          </Pressable>
        )}

        {onViewHistory && (
          <AnimatedPressable
            onPress={handleHistory}
            style={styles.historyRow}
            accessibilityRole="button"
            accessibilityLabel="View support history"
            scaleValue={0.98}
          >
            <Text style={[styles.historyText, { color: colors.textSecondary }]}>
              Support history
            </Text>
            <Ionicons name="chevron-forward" size={13} color={colors.textMuted} />
          </AnimatedPressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: Radius.lg,
    borderWidth: 0.5,
    padding: Space.md,
    gap: Space.sm,
  },
  containerCompact: {
    padding: Space.sm,
    gap: Space.xs,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },
  headerTitle: {
    flex: 1,
    fontSize: Type.bodyEmphasis.size,
    lineHeight: Type.bodyEmphasis.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.bodyEmphasis.letterSpacing,
  },
  availabilityDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  actionCol: {
    gap: 0,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Space.sm + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: 48,
  },
  actionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    flex: 1,
    minWidth: 0,
  },
  actionTextWrap: {
    flex: 1,
    gap: 1,
    minWidth: 0,
  },
  actionTitle: {
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.body.letterSpacing,
  },
  actionSub: {
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.meta.letterSpacing,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.xs,
    paddingVertical: Space.sm,
    minHeight: 44,
  },
  historyText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.medium,
    letterSpacing: Type.body.letterSpacing,
  },
});

export default CoOwnSupportCTA;
