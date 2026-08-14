/**
 * FlatRow — anti-synthetic list row primitive.
 *
 * A content-over-chrome row with NO card background, NO border, NO radius.
 * Uses whitespace, hairline separators, and typography for structure instead
 * of rounded containment. This is the preferred substitute for cards in list
 * contexts (settings, connections, analytics KPIs, etc.).
 *
 * Design principles (Phase 4 anti-AI doctrine):
 *  - Leading image/icon is rendered directly, NOT inside a colored circle.
 *  - Hairline separator starts from the text edge (inset), not full width.
 *  - Transparent pressed state (opacity 0.6) — no scale, no fill.
 *  - 44pt minimum touch target when tappable.
 *  - accessibilityRole="button" when an onPress is supplied.
 *
 * Use this instead of card-wrapped rows whenever the row is part of a list
 * and does not meet the card budget criteria (draggable, transactional state,
 * media with intrinsic shape, temporary callout).
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import {
  Space,
  Type,
  FontFamily,
  Control,
  Stroke,
} from '../../theme/designTokens';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FlatRowProps {
  /** Primary label — the row's identity. */
  label: string;
  /** Optional secondary text below the label. */
  secondary?: string;
  /** Optional trailing value (e.g. "£42.00", "On", "3 connected"). */
  value?: string;
  /** Optional trailing value color override (e.g. success/danger). */
  valueColor?: string;
  /** Show a trailing chevron. Defaults to true when onPress is set and no custom trailing node. */
  showChevron?: boolean;
  /** Optional leading icon name (Ionicons). Rendered directly — no colored circle. */
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  /** Leading icon color override. */
  iconColor?: string;
  /** Optional leading image URI. When supplied, takes precedence over icon. */
  imageUri?: string;
  /** Leading image size (square). Defaults to 32. */
  imageSize?: number;
  /** Leading image radius. Defaults to 0 (sharp / full-bleed). */
  imageRadius?: number;
  /** Custom trailing node (overrides value + chevron). */
  trailing?: React.ReactNode;
  /** Tap handler. When supplied, the row becomes a button with 44pt target. */
  onPress?: () => void;
  /** Disabled state — mutes the row and removes press affordance. */
  disabled?: boolean;
  /** Destructive / danger styling — mutes label to danger color. */
  danger?: boolean;
  /** Show hairline separator below this row. Defaults to true. */
  separator?: boolean;
  /** Inset the separator to start from the text edge instead of full width. */
  separatorInset?: boolean;
  /** Explicit accessibility label. Defaults to label + value. */
  accessibilityLabel?: string;
  /** Accessibility hint describing the action. */
  accessibilityHint?: string;
  /** Extra content rendered below the row content (e.g. expanded editor). */
  children?: React.ReactNode;
  /** Override the minimum touch target height. Defaults to Control.hit (44). */
  minHeight?: number;
  style?: any;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FlatRow({
  label,
  secondary,
  value,
  valueColor,
  showChevron,
  icon,
  iconColor,
  imageUri,
  imageSize = 32,
  imageRadius = 0,
  trailing,
  onPress,
  disabled,
  danger,
  separator = true,
  separatorInset = true,
  accessibilityLabel,
  accessibilityHint,
  children,
  minHeight = Control.hit,
  style,
}: FlatRowProps) {
  const { colors } = useAppTheme();
  const isTappable = !!onPress && !disabled;
  const resolvedShowChevron =
    showChevron ?? (isTappable && !trailing && value === undefined);

  const labelColor = disabled
    ? colors.textMuted
    : danger
      ? colors.danger
      : colors.textPrimary;

  const resolvedValueColor = valueColor ?? colors.textMuted;

  const resolvedLabel = accessibilityLabel ?? [
    label,
    value,
    secondary,
  ].filter(Boolean).join(', ');

  const content = (
    <View style={[styles.inner, { minHeight }, style]}>
      <View style={styles.contentRow}>
        {/* Leading image or icon — no colored circle wrapper */}
        {imageUri ? (
          <Image
            source={{ uri: imageUri }}
            style={[styles.image, { width: imageSize, height: imageSize, borderRadius: imageRadius }]}
            accessibilityLabel={label}
          />
        ) : icon ? (
          <View style={styles.iconWrap}>
            <Ionicons
              name={icon}
              size={IconGrammar.metadata}
              color={iconColor ?? (danger ? colors.danger : colors.textSecondary)}
            />
          </View>
        ) : null}

        {/* Label + secondary text */}
        <View style={styles.textWrap}>
          <Text
            style={[styles.label, { color: labelColor }]}
            numberOfLines={1}
          >
            {label}
          </Text>
          {secondary ? (
            <Text
              style={[styles.secondary, { color: colors.textMuted }]}
              numberOfLines={2}
            >
              {secondary}
            </Text>
          ) : null}
        </View>

        {/* Trailing value / chevron / custom node */}
        {trailing ? (
          <View style={styles.trailing}>{trailing}</View>
        ) : (
          <View style={styles.trailing}>
            {value ? (
              <Text
                style={[styles.value, { color: resolvedValueColor }]}
                numberOfLines={1}
              >
                {value}
              </Text>
            ) : null}
            {resolvedShowChevron ? (
              <Ionicons
                name="chevron-forward"
                size={16}
                color={colors.textMuted}
              />
            ) : null}
          </View>
        )}
      </View>

      {/* Expanded children (e.g. inline editor, discovered models) */}
      {children ? <View style={styles.children}>{children}</View> : null}

      {/* Hairline separator — inset from text edge by default */}
      {separator ? (
        <View
          style={[
            styles.separator,
            { backgroundColor: colors.border },
            separatorInset && styles.separatorInset,
          ]}
        />
      ) : null}
    </View>
  );

  if (!isTappable) {
    return content;
  }

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={resolvedLabel}
      accessibilityHint={accessibilityHint}
      style={({ pressed }) => (pressed ? { opacity: 0.6 } : undefined)}
    >
      {content}
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const IconGrammar = {
  metadata: 18,
} as const;

const styles = StyleSheet.create({
  inner: {
    paddingVertical: Space.sm + Space.xs,
    paddingHorizontal: Space.md,
    justifyContent: 'center',
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm + Space.xs,
    minHeight: Control.hit,
  },
  iconWrap: {
    width: Control.iconCompact + Space.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    flexShrink: 0,
  },
  textWrap: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
    gap: Space.xs / 4,
  },
  label: {
    fontSize: Type.bodyEmphasis.size,
    fontFamily: FontFamily.semibold,
    letterSpacing: Type.bodyEmphasis.letterSpacing,
    lineHeight: Type.bodyEmphasis.lineHeight,
  },
  secondary: {
    fontSize: Type.captionElevated.size,
    fontFamily: FontFamily.regular,
    letterSpacing: Type.captionElevated.letterSpacing,
    lineHeight: Type.captionElevated.lineHeight,
  },
  trailing: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
    gap: Space.xs,
    justifyContent: 'flex-end',
  },
  value: {
    fontSize: Type.captionElevated.size,
    fontFamily: FontFamily.regular,
    letterSpacing: Type.captionElevated.letterSpacing,
    textAlign: 'right',
  },
  children: {
    paddingTop: Space.sm,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginTop: Space.sm + Space.xs,
  },
  separatorInset: {
    marginLeft: Space.md + Control.iconCompact + Space.xs + Space.sm + Space.xs,
  },
});
