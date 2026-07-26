import React from 'react';
import { View, StyleSheet, Text, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Reanimated from 'react-native-reanimated';
import { FadeIn } from 'react-native-reanimated';
import { useAppTheme } from '../../../theme/ThemeContext';
import { Space, Elevation, Type } from '../../../theme/designTokens';
import { useReducedMotion } from '../../../hooks/useReducedMotion';
import { useHaptic } from '../../../hooks/useHaptic';

/**
 * Sticky state/action dock — the bottom dock that holds the current
 * actionable value and one primary action (at most one secondary).
 *
 * Per spec 02:
 *   - the dock contains the current actionable value or state;
 *   - one primary action;
 *   - at most one secondary action;
 *   - blocked state must include a valid next step.
 *
 * Per spec 03 (Co-Own rights-incomplete): do not render a large passive
 * warning card. Render: title "Trading unavailable", subtitle "Complete
 * rights disclosure", action "Review rights". The dock opens the rights
 * sheet.
 *
 * Per spec 04 (Auction terminal): one result state, one next valid
 * action.
 *
 * The dock is the only persistent chrome at the bottom of the page. It
 * never covers the last content row because screens add bottom padding
 * equal to dock height + safe area.
 */
export interface CommerceDetailStateDockAction {
  label: string;
  onPress: () => void;
  /** When true, the action renders in the brand fill (primary). Default true. */
  primary?: boolean;
  /** When true, the action is disabled and shows a truthful disabled state. */
  disabled?: boolean;
  /** Optional loading state for async actions. */
  loading?: boolean;
  accessibilityLabel?: string;
}

export interface CommerceDetailStateDockProps {
  /** Optional value line rendered on the left (price / current bid / state). */
  value?: string;
  /** Optional label under the value (e.g. "Current bid"). */
  valueLabel?: string;
  /** Optional state badge rendered on the left in place of value (e.g.
   * "Sold", "Cancelled", "Trading unavailable"). */
  stateBadge?: React.ReactNode;
  /** Optional subtitle under the value/state (e.g. "Complete rights
   * disclosure"). Used for blocked-state explanation. */
  subtitle?: string;
  /** Primary action (max 1). Required when no blocked state is shown. */
  primaryAction?: CommerceDetailStateDockAction;
  /** Secondary action (max 1). */
  secondaryAction?: CommerceDetailStateDockAction;
  /** When true, the dock uses the elevated surface fill. */
  elevated?: boolean;
  /** Optional bottom inset override. Defaults to safe area inset. */
  bottomInset?: number;
}

export function CommerceDetailStateDock({
  value,
  valueLabel,
  stateBadge,
  subtitle,
  primaryAction,
  secondaryAction,
  elevated = false,
  bottomInset,
}: CommerceDetailStateDockProps) {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const haptic = useHaptic();
  const safeBottom = bottomInset ?? insets.bottom;

  const handlePress = (action: CommerceDetailStateDockAction) => {
    if (action.disabled || action.loading) return;
    if (!reducedMotion) haptic.medium();
    action.onPress();
  };

  const content = (
    <View
      style={[
        styles.container,
        {
          backgroundColor: elevated ? colors.surfaceElevated : colors.background,
          paddingBottom: Math.max(safeBottom + Space.sm, Space.md),
          borderTopColor: colors.border,
        },
      ]}
    >
      <View style={styles.row}>
        <View style={styles.valueCluster}>
          {stateBadge}
          {value ? (
            <Text
              style={[styles.value, { color: colors.textPrimary }]}
              accessibilityRole="text"
            >
              {value}
            </Text>
          ) : null}
          {valueLabel ? (
            <Text
              style={[styles.valueLabel, { color: colors.textSecondary }]}
              numberOfLines={1}
            >
              {valueLabel}
            </Text>
          ) : null}
        </View>

        <View style={styles.actionCluster}>
          {secondaryAction ? (
            <Pressable
              onPress={() => handlePress(secondaryAction)}
              disabled={secondaryAction.disabled || secondaryAction.loading}
              style={({ pressed }) => [
                styles.secondaryAction,
                { borderColor: colors.border },
                pressed && !secondaryAction.disabled && styles.pressed,
              ]}
              accessibilityLabel={secondaryAction.accessibilityLabel ?? secondaryAction.label}
              accessibilityRole="button"
              accessibilityState={{
                disabled: secondaryAction.disabled,
                busy: secondaryAction.loading,
              }}
            >
              <Text
                style={[
                  styles.secondaryActionText,
                  {
                    color: secondaryAction.disabled
                      ? colors.textMuted
                      : colors.textPrimary,
                  },
                ]}
              >
                {secondaryAction.label}
              </Text>
            </Pressable>
          ) : null}
          {primaryAction ? (
            <Pressable
              onPress={() => handlePress(primaryAction)}
              disabled={primaryAction.disabled || primaryAction.loading}
              style={({ pressed }) => [
                styles.primaryAction,
                {
                  backgroundColor: primaryAction.disabled
                    ? colors.surfaceAlt
                    : colors.brand,
                },
                pressed && !primaryAction.disabled && styles.pressed,
              ]}
              accessibilityLabel={primaryAction.accessibilityLabel ?? primaryAction.label}
              accessibilityRole="button"
              accessibilityState={{
                disabled: primaryAction.disabled,
                busy: primaryAction.loading,
              }}
            >
              <Text
                style={[
                  styles.primaryActionText,
                  {
                    color: primaryAction.disabled
                      ? colors.textMuted
                      : colors.textInverse,
                  },
                ]}
              >
                {primaryAction.loading ? '…' : primaryAction.label}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>
      {subtitle ? (
        <Text
          style={[styles.subtitle, { color: colors.textSecondary }]}
          numberOfLines={2}
        >
          {subtitle}
        </Text>
      ) : null}
    </View>
  );

  if (reducedMotion) {
    return <View style={styles.wrapper}>{content}</View>;
  }

  return (
    <Reanimated.View entering={FadeIn.duration(200)} style={styles.wrapper}>
      {content}
    </Reanimated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 100,
  },
  container: {
    width: '100%',
    minWidth: 0,
    minHeight: 72,
    paddingHorizontal: Space.md,
    paddingTop: Space.sm + 2,
    borderTopWidth: StyleSheet.hairlineWidth,
    ...Elevation.floating,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Space.md,
    minHeight: 48,
  },
  valueCluster: {
    flexDirection: 'column',
    gap: 2,
    flexShrink: 1,
  },
  value: {
    fontSize: Type.priceList.size,
    lineHeight: Type.priceList.lineHeight,
    fontWeight: '700',
    letterSpacing: Type.priceList.letterSpacing,
    fontVariant: ['tabular-nums'],
  },
  valueLabel: {
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
  },
  actionCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    flexShrink: 0,
  },
  primaryAction: {
    height: 48,
    paddingHorizontal: Space.lg,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 120,
  },
  primaryActionText: {
    fontSize: Type.bodyEmphasis.size,
    lineHeight: Type.bodyEmphasis.lineHeight,
    fontWeight: '600',
  },
  secondaryAction: {
    height: 48,
    paddingHorizontal: Space.md,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  secondaryActionText: {
    fontSize: Type.bodyEmphasis.size,
    lineHeight: Type.bodyEmphasis.lineHeight,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.7,
  },
  subtitle: {
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
    marginTop: Space.xs,
  },
});
