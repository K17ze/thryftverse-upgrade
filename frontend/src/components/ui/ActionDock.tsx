/**
 * ActionDock — shared sticky bottom dock for primary + secondary actions.
 *
 * A high-value floating surface that uses the iOS 26 Liquid Glass material
 * (via LiquidGlassBackdrop) — the only surface where glass is appropriate
 * per Apple HIG and AGENTS.md §27.5. Falls back to expo-blur on older iOS /
 * Android, and to an opaque surface when Reduce Transparency is enabled.
 *
 * Composition (AGENTS.md §4 — coherent action placement):
 *  - Primary action: full-width, bold, brand color — visually dominant.
 *  - Secondary action: icon or text, restrained — never competes.
 *  - Safe-area aware: paddingBottom accounts for the home indicator.
 *  - 44pt minimum touch targets on every button.
 *  - Pressed feedback: scale 0.97 (AnimatedPressable spring, reduced-motion
 *    aware).
 *  - accessibilityRole for each button; loading state on the primary action.
 *
 * Use this for detail-screen CTAs (Buy, Make Offer, Place Bid, Co-Own).
 * For trade screens that need a plain opaque dock, continue to use
 * CoOwnStickyActionDock / CommerceStickyDock.
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Reanimated, { SlideInDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import {
  Space,
  Radius,
  Type,
  Control,
  FontFamily,
  DockConstants,
  Elevation,
} from '../../theme/designTokens';
import { LiquidGlassBackdrop } from '../LiquidGlassBackdrop';
import { AnimatedPressable } from '../AnimatedPressable';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { useReducedTransparency } from '../../hooks/useReducedMotion';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ActionDockPrimaryAction {
  label: string;
  onPress: () => void;
  /** Disabled state — mutes the button and removes press affordance. */
  disabled?: boolean;
  /** Loading state — shows a spinner and blocks presses. */
  loading?: boolean;
  /** Accessibility hint describing the action. */
  accessibilityHint?: string;
  /** Override the brand color (e.g. danger for destructive primary). */
  color?: string;
  /** TestID for automation. */
  testID?: string;
}

export interface ActionDockSecondaryAction {
  /** Icon glyph (Ionicons). Mutually exclusive with `label`. */
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  /** Text label. Mutually exclusive with `icon`. */
  label?: string;
  onPress: () => void;
  disabled?: boolean;
  accessibilityLabel: string;
  accessibilityHint?: string;
  testID?: string;
}

export interface ActionDockProps {
  /** Primary action — full-width, bold, brand color. */
  primary: ActionDockPrimaryAction;
  /** Secondary actions — restrained icon or text buttons. */
  secondary?: ActionDockSecondaryAction[];
  /** Extra content rendered left of the actions (e.g. price summary). */
  leading?: React.ReactNode;
  /** Animate the dock entrance. Defaults to true. */
  animated?: boolean;
  /** Override the safe-area bottom inset. */
  bottomInset?: number;
  style?: StyleProp<ViewStyle>;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ActionDock({
  primary,
  secondary,
  leading,
  animated = true,
  bottomInset,
  style,
}: ActionDockProps) {
  const { colors, isDark } = useAppTheme();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const reducedTransparency = useReducedTransparency();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  const safeBottom = bottomInset ?? insets.bottom;
  const primaryColor = primary.color ?? colors.brand;
  const primaryFg = primary.color ? colors.textInverse : colors.background;

  const hasSecondary = secondary && secondary.length > 0;

  const content = (
    <View
      style={[
        styles.container,
        { paddingBottom: Math.max(safeBottom + Space.sm, Space.md) },
        style,
      ]}
      accessible
      accessibilityRole="toolbar"
      accessibilityLabel="Primary actions"
    >
      {/* Liquid Glass backdrop — the ONLY surface where glass is used.
          Falls back to opaque when Reduce Transparency is enabled. */}
      {reducedTransparency ? (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.background }]} />
      ) : (
        <LiquidGlassBackdrop
          intensity={70}
          absoluteFill
          effect="regular"
        />
      )}

      <View style={styles.content}>
        {leading ? <View style={styles.leading}>{leading}</View> : null}

        {/* Secondary actions — restrained, 44pt targets */}
        {hasSecondary ? (
          <View style={styles.secondaryRow}>
            {secondary!.map((action, i) => (
              <AnimatedPressable
                key={i}
                style={styles.secondaryBtn}
                onPress={action.onPress}
                disabled={action.disabled || primary.loading}
                scaleValue={0.97}
                activeOpacity={0.6}
                hapticFeedback="light"
                accessibilityRole="button"
                accessibilityLabel={action.accessibilityLabel}
                accessibilityHint={action.accessibilityHint}
                testID={action.testID}
              >
                {action.icon ? (
                  <Ionicons
                    name={action.icon}
                    size={Control.icon}
                    color={action.disabled ? colors.textMuted : colors.textPrimary}
                  />
                ) : action.label ? (
                  <Text
                    style={[
                      styles.secondaryLabel,
                      { color: action.disabled ? colors.textMuted : colors.textPrimary },
                    ]}
                    numberOfLines={1}
                  >
                    {action.label}
                  </Text>
                ) : null}
              </AnimatedPressable>
            ))}
          </View>
        ) : null}

        {/* Primary action — full-width, bold, brand color */}
        <AnimatedPressable
          style={[styles.primaryBtn, { backgroundColor: primaryColor }]}
          onPress={primary.onPress}
          disabled={primary.disabled || primary.loading}
          scaleValue={0.97}
          activeOpacity={0.88}
          hapticFeedback="medium"
          accessibilityRole="button"
          accessibilityLabel={primary.label}
          accessibilityHint={primary.accessibilityHint}
          accessibilityState={{ disabled: primary.disabled || primary.loading }}
          testID={primary.testID}
        >
          {primary.loading ? (
            <ActivityIndicator color={primaryFg} size="small" />
          ) : (
            <Text style={[styles.primaryLabel, { color: primaryFg }]} numberOfLines={1}>
              {primary.label}
            </Text>
          )}
        </AnimatedPressable>
      </View>
    </View>
  );

  if (animated && !reducedMotion) {
    return (
      <Reanimated.View entering={SlideInDown.duration(280)} style={styles.wrapper}>
        {content}
      </Reanimated.View>
    );
  }

  return <View style={styles.wrapper}>{content}</View>;
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const createStyles = (colors: ThemeColors) => StyleSheet.create({
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
    minHeight: DockConstants.baseHeight,
    paddingTop: DockConstants.dockTopPadding,
    overflow: 'hidden',
    // Subtle top hairline separates the glass from scroll content.
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    ...Elevation.floating,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingHorizontal: Space.md,
  },
  leading: {
    flexShrink: 1,
    justifyContent: 'center',
  },
  secondaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    flexShrink: 0,
  },
  secondaryBtn: {
    minWidth: Control.hit,
    minHeight: Control.hit,
    paddingHorizontal: Space.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryLabel: {
    fontSize: Type.bodyStrong.size,
    fontFamily: FontFamily.semibold,
    letterSpacing: Type.bodyStrong.letterSpacing,
  },
  primaryBtn: {
    flex: 1,
    height: DockConstants.primaryButtonHeight,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: Control.hit,
  },
  primaryLabel: {
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight,
    fontFamily: FontFamily.bold,
    letterSpacing: Type.body.letterSpacing,
  },
});
