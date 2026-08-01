import React from 'react';
import { View, StyleSheet, Text, Pressable, useWindowDimensions, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Reanimated from 'react-native-reanimated';
import { FadeIn } from 'react-native-reanimated';
import { useAppTheme } from '../../../theme/ThemeContext';
import { Space, Type, Radius, Typography } from '../../../theme/designTokens';
import { useReducedMotion } from '../../../hooks/useReducedMotion';
import { useHaptic } from '../../../hooks/useHaptic';
import { CachedImage } from '../../CachedImage';
import type { CommerceDetailDockLayout } from './types';
import { COMMERCE_DETAIL_COMPACT_WIDTH } from './types';

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
 * Per spec 05 §4 (dock geometry):
 *   - layout: 'inline' | 'stacked' | 'auto';
 *   - auto: inline on sufficient width, stacked on compact widths;
 *   - prevent button labels from truncating;
 *   - keep visible controls from becoming giant pills;
 *   - preserve 44–48pt hit targets.
 *
 * Per spec 05 §5 (restrained radii):
 *   - primary commerce action: medium radius (Radius.md = 8);
 *   - secondary: quiet text or outlined control;
 *   - no radius 24 for every action by default.
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
  /** Optional original price shown with strikethrough above the current
   *  value. Used for discounted items (Depop/eBay pattern). */
  originalValue?: string;
  /** Optional label under the value (e.g. "Current bid"). */
  valueLabel?: string;
  /** Optional state badge rendered on the left in place of value (e.g.
   * "Sold", "Cancelled", "Trading unavailable"). */
  stateBadge?: React.ReactNode;
  /** Optional subtitle under the value/state (e.g. "Complete rights
   * disclosure"). Used for blocked-state explanation. */
  subtitle?: string;
  /** Optional product thumbnail rendered on the left edge. Anchors the
   * user to the product when they've scrolled past the hero image.
   * Research (ecomsdesignpro): "A small thumbnail helps, especially
   * when users scroll far past the hero image." */
  thumbnailUri?: string;
  /** Primary action (max 1). Required when no blocked state is shown. */
  primaryAction?: CommerceDetailStateDockAction;
  /** Secondary action (max 1). */
  secondaryAction?: CommerceDetailStateDockAction;
  /** When true, the dock uses the elevated surface fill. */
  elevated?: boolean;
  /** Optional bottom inset override. Defaults to safe area inset. */
  bottomInset?: number;
  /** Dock layout strategy. Defaults to `auto`.
   *
   * Per spec 05 §4:
   *   - inline: actions sit on the right of the value cluster.
   *   - stacked: actions sit below the value cluster, full width.
   *   - auto: inline on sufficient width (>= 360), stacked on compact.
   */
  layout?: CommerceDetailDockLayout;
}

/** Compact width threshold below which `auto` layout stacks actions.
 *  Aligned with the shared product-detail compact width so identity,
 *  media and dock all switch behaviour at the same breakpoint. */
const COMPACT_STACK_THRESHOLD = COMMERCE_DETAIL_COMPACT_WIDTH;

export function CommerceDetailStateDock({
  value,
  originalValue,
  valueLabel,
  stateBadge,
  subtitle,
  thumbnailUri,
  primaryAction,
  secondaryAction,
  elevated = false,
  bottomInset,
  layout = 'auto',
}: CommerceDetailStateDockProps) {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const haptic = useHaptic();
  const safeBottom = bottomInset ?? insets.bottom;
  const { width: screenWidth } = useWindowDimensions();

  // Per spec 05 §4: auto stacks on compact widths to prevent label
  // truncation and giant pill overflow.
  const hasSecondary = !!secondaryAction;
  const primaryIsEmphasized = primaryAction?.primary !== false;
  const shouldStack =
    layout === 'stacked' ||
    (layout === 'auto' && hasSecondary && screenWidth < COMPACT_STACK_THRESHOLD);

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
          paddingBottom: Math.max(safeBottom + Space.xs, Space.sm),
          borderTopColor: colors.border,
        },
      ]}
    >
      <View style={shouldStack ? styles.rowStacked : styles.row}>
        <View style={styles.valueCluster}>
          {/* Product thumbnail — anchors the user to the product when
              they've scrolled past the hero. Small, quiet, no border.
              Per AGENTS.md: visible containment must have meaning. The
              thumbnail is informational, not a container. */}
          {thumbnailUri && !stateBadge ? (
            <CachedImage
              uri={thumbnailUri}
              style={styles.thumbnail}
              contentFit="cover"
            />
          ) : null}
          <View style={styles.valueTextCluster}>
            {stateBadge}
            {originalValue && !stateBadge ? (
              <Text
                style={[styles.originalValue, { color: colors.textMuted }]}
                accessibilityRole="text"
              >
                {originalValue}
              </Text>
            ) : null}
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
            {subtitle ? (
              <Text
                style={[styles.subtitle, { color: colors.textSecondary }]}
                numberOfLines={2}
              >
                {subtitle}
              </Text>
            ) : null}
          </View>
        </View>

        <View style={shouldStack ? styles.actionClusterStacked : styles.actionCluster}>
          {secondaryAction ? (
            <Pressable
              onPress={() => handlePress(secondaryAction)}
              disabled={secondaryAction.disabled || secondaryAction.loading}
              style={({ pressed }) => [
                shouldStack ? styles.secondaryActionStacked : styles.secondaryAction,
                { borderColor: colors.border },
                pressed && !secondaryAction.disabled && styles.pressed,
                secondaryAction.disabled && styles.disabled,
              ]}
              accessibilityLabel={secondaryAction.accessibilityLabel ?? secondaryAction.label}
              accessibilityRole="button"
              accessibilityState={{
                disabled: secondaryAction.disabled,
                busy: secondaryAction.loading,
              }}
            >
              {secondaryAction.loading ? (
                <ActivityIndicator size="small" color={colors.textPrimary} />
              ) : (
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
              )}
            </Pressable>
          ) : null}
          {primaryAction ? (
            <Pressable
              onPress={() => handlePress(primaryAction)}
              disabled={primaryAction.disabled || primaryAction.loading}
              style={({ pressed }) => [
                shouldStack ? styles.primaryActionStacked : styles.primaryAction,
                {
                  backgroundColor: primaryAction.disabled
                    ? colors.surfaceAlt
                    : primaryIsEmphasized
                      ? colors.brand
                      : colors.background,
                  borderColor: colors.border,
                  borderWidth: primaryIsEmphasized ? 0 : 1,
                },
                pressed && !primaryAction.disabled && styles.pressed,
                primaryAction.disabled && styles.disabled,
              ]}
              accessibilityLabel={primaryAction.accessibilityLabel ?? primaryAction.label}
              accessibilityRole="button"
              accessibilityState={{
                disabled: primaryAction.disabled,
                busy: primaryAction.loading,
              }}
            >
              {primaryAction.loading ? (
                <ActivityIndicator size="small" color={primaryIsEmphasized ? colors.textInverse : colors.textPrimary} />
              ) : (
                <Text
                  style={[
                    styles.primaryActionText,
                    {
                      color: primaryAction.disabled
                        ? colors.textMuted
                        : primaryIsEmphasized
                          ? colors.textInverse
                          : colors.textPrimary,
                    },
                  ]}
                >
                  {primaryAction.label}
                </Text>
              )}
            </Pressable>
          ) : null}
        </View>
      </View>
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
    paddingHorizontal: Space.md,
    paddingTop: Space.sm + 2,
    borderTopWidth: StyleSheet.hairlineWidth,
    // Per Design.md Elevation.floating: the dock is a genuinely floating
    // surface separating persistent action from scroll content. A stronger
    // shadow (0.10/12px) creates clear depth separation without being
    // decorative. Research: "0 -2px 8px rgba(0,0,0,0.06)" is the minimum;
    // flagship docks use 0.10–0.12 to read as elevated, not flat.
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.10,
    shadowRadius: 12,
    elevation: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Space.md,
    minHeight: 44,
  },
  // Per spec 05 §4: stacked layout — value cluster on top, actions
  // below in a full-width row. Prevents label truncation on compact
  // widths while preserving 44–48pt hit targets.
  rowStacked: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: Space.sm,
    minHeight: 44,
  },
  valueCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    flexShrink: 1,
  },
  // Text cluster inside the value cluster — holds value, label, subtitle.
  // Needed so the thumbnail sits to the left and text stacks vertically.
  valueTextCluster: {
    flexDirection: 'column',
    gap: Space.xs,
    flexShrink: 1,
  },
  // Product thumbnail — 40x40, medium radius. Quiet, no border.
  // Research (ecomdesignpro 2026): "40-48px with 8px radius, optional
  // on mobile." Radius.md (8px) matches the primary action radius for
  // visual coherence within the dock.
  thumbnail: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    flexShrink: 0,
  },
  value: {
    // Per Design.md: price-list (20px) is the correct size for dock
    // values. price-large (28px) is reserved for checkout totals.
    // Research (ecomdesignpro 2026): "Keep the bar short, usually 64
    // to 80 px tall" — a 28px price dominates a 72px dock.
    fontSize: Type.priceList.size,
    lineHeight: Type.priceList.lineHeight,
    fontFamily: Typography.family.bold,
    letterSpacing: Type.priceList.letterSpacing,
    fontVariant: ['tabular-nums'],
  },
  // Strikethrough original price — quiet, muted, shown above current
  // value when a discount is active. Depop/eBay pattern.
  originalValue: {
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
    fontFamily: Typography.family.regular,
    textDecorationLine: 'line-through',
    fontVariant: ['tabular-nums'],
  },
  valueLabel: {
    // Per Design.md trust/commerce card micro spec: captionElevated
    // (13px) for trust copy and metadata labels. The value label
    // ("Current bid", "Your listing") is a metadata label that
    // benefits from slightly larger size for legibility in the dock.
    fontSize: Type.captionElevated.size,
    lineHeight: Type.captionElevated.lineHeight,
    fontFamily: Typography.family.medium,
    letterSpacing: Type.captionElevated.letterSpacing,
  },
  actionCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    flexShrink: 0,
  },
  // Stacked action cluster: full-width row, primary consumes available
  // space, secondary is constrained.
  actionClusterStacked: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    flexGrow: 1,
  },
  // Per spec 05 §5: restrained radii — medium radius (Radius.md = 8)
  // for primary commerce action, not radius 24.
  // Research 2025: 48–52dp tall for persistent footer buttons. Using
  // 50px to give the primary action slightly more presence than the
  // secondary (48px), creating subtle hierarchy within the dock.
  primaryAction: {
    minHeight: 50,
    paddingHorizontal: Space.lg,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 120,
  },
  // Stacked primary: flexes to consume available width so the label
  // never truncates on compact widths.
  primaryActionStacked: {
    minHeight: 50,
    paddingHorizontal: Space.lg,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexGrow: 1,
    flexShrink: 1,
  },
  primaryActionText: {
    fontSize: Type.bodyEmphasis.size,
    lineHeight: Type.bodyEmphasis.lineHeight,
    fontFamily: Typography.family.semibold,
  },
  // Per spec 05 §5: secondary is a quiet outlined control with medium
  // radius, not a giant pill.
  secondaryAction: {
    minHeight: 48,
    paddingHorizontal: Space.md,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  secondaryActionStacked: {
    minHeight: 48,
    paddingHorizontal: Space.md,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    flexShrink: 0,
  },
  secondaryActionText: {
    fontSize: Type.bodyEmphasis.size,
    lineHeight: Type.bodyEmphasis.lineHeight,
    fontFamily: Typography.family.semibold,
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.97 }],
  },
  // Disabled state — opacity reduction per research: "Use opacity
  // reduction (40%), avoid graying out (can be confused with secondary
  // actions)."
  disabled: {
    opacity: 0.4,
  },
  subtitle: {
    // Per Design.md trust/commerce card micro spec: captionElevated
    // (13px) for trust copy and state explanations. The subtitle
    // ("Complete rights disclosure", "This item has been sold") is
    // contextual copy that benefits from the slightly larger size.
    fontSize: Type.captionElevated.size,
    lineHeight: Type.captionElevated.lineHeight,
    fontFamily: Typography.family.regular,
  },
});
