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
 *  - Pressed state: scale 0.98 + opacity 0.6 (Reanimated spring, reduced-motion
 *    aware) — physical press feedback, never a fill.
 *  - 44pt minimum touch target when tappable.
 *  - accessibilityRole="button" + accessibilityHint when an onPress is supplied.
 *  - Optional leading media thumbnail (square, rounded corners — never circle).
 *  - Optional trailing status badge (small, only when carrying state).
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
  type TextStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import {
  Space,
  Type,
  FontFamily,
  Control,
  Radius,
} from '../../theme/designTokens';
import { AnimatedPressable } from '../AnimatedPressable';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FlatRowProps {
  /** Primary label — the row's identity. */
  label: string;
  /** Optional style override for the label text. */
  labelStyle?: TextStyle;
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
  /**
   * Optional leading media thumbnail (square, rounded corners — not circle).
   * Distinct from `imageUri` (which is sharp/full-bleed for editorial rows):
   * thumbnails use a small radius so they read as media previews, not raw
   * imagery. Takes precedence over `imageUri` and `icon`.
   */
  thumbnailUri?: string;
  /** Leading thumbnail size (square). Defaults to 40. */
  thumbnailSize?: number;
  /** Leading thumbnail corner radius. Defaults to Radius.sm (4pt). */
  thumbnailRadius?: number;
  /**
   * Optional trailing status badge — small pill that carries state
   * (e.g. "Live", "Pending", "3 left"). Only render when the row
   * genuinely carries status; never decorative. Accepts a string or
   * a custom node. Rendered before the value/chevron.
   */
  badge?: React.ReactNode;
  /** Badge tone — controls pill background. Defaults to 'neutral'. */
  badgeTone?: 'neutral' | 'success' | 'danger' | 'warning' | 'brand';
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
  labelStyle,
  secondary,
  value,
  valueColor,
  showChevron,
  icon,
  iconColor,
  imageUri,
  imageSize = 32,
  imageRadius = 0,
  thumbnailUri,
  thumbnailSize = 40,
  thumbnailRadius = Radius.sm,
  badge,
  badgeTone = 'neutral',
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
    showChevron ?? (isTappable && !trailing && value === undefined && !badge);

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

  const badgeBg = (() => {
    switch (badgeTone) {
      case 'success': return colors.success;
      case 'danger': return colors.danger;
      case 'warning': return colors.warning;
      case 'brand': return colors.brand;
      default: return colors.surfaceAlt;
    }
  })();
  const badgeFg = badgeTone === 'neutral' ? colors.textSecondary : colors.textInverse;

  // Compute the leading-element width so the inset separator aligns with
  // the text edge regardless of which leading element is rendered.
  const leadingWidth = thumbnailUri
    ? thumbnailSize
    : imageUri
      ? imageSize
      : icon
        ? Control.iconCompact + Space.xs
        : 0;

  const content = (
    <View style={[styles.inner, { minHeight }, style]}>
      <View style={styles.contentRow}>
        {/* Leading thumbnail (square, rounded) — takes precedence */}
        {thumbnailUri ? (
          <Image
            source={{ uri: thumbnailUri }}
            style={[styles.thumbnail, { width: thumbnailSize, height: thumbnailSize, borderRadius: thumbnailRadius }]}
            accessibilityLabel={label}
          />
        ) : imageUri ? (
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
            style={[styles.label, { color: labelColor }, labelStyle]}
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

        {/* Trailing badge / value / chevron / custom node */}
        {trailing ? (
          <View style={styles.trailing}>{trailing}</View>
        ) : (
          <View style={styles.trailing}>
            {badge ? (
              <View style={[styles.badge, { backgroundColor: badgeBg }]}>
                {typeof badge === 'string' ? (
                  <Text style={[styles.badgeText, { color: badgeFg }]} numberOfLines={1}>
                    {badge}
                  </Text>
                ) : badge}
              </View>
            ) : null}
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

      {/* Hairline separator — inset from text edge by default.
          The inset accounts for whichever leading element is rendered so
          the separator always aligns with the start of the text, not the
          leading media, and never runs full width. */}
      {separator ? (
        <View
          style={[
            styles.separator,
            { backgroundColor: colors.border },
            separatorInset && { marginLeft: Space.md + leadingWidth + Space.sm + Space.xs },
          ]}
        />
      ) : null}
    </View>
  );

  if (!isTappable) {
    return content;
  }

  // Pressed feedback: scale 0.98 + opacity 0.6 via Reanimated spring
  // (reduced-motion aware through AnimatedPressable / useMotionConfig).
  return (
    <AnimatedPressable
      onPress={onPress}
      disabled={disabled}
      scaleValue={0.98}
      activeOpacity={0.6}
      hapticFeedback="light"
      accessibilityRole="button"
      accessibilityLabel={resolvedLabel}
      accessibilityHint={accessibilityHint}
      style={styles.pressable}
    >
      {content}
    </AnimatedPressable>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const IconGrammar = {
  metadata: 18,
} as const;

const styles = StyleSheet.create({
  pressable: {
    // AnimatedPressable applies scale + opacity; no extra layout needed.
  },
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
  thumbnail: {
    flexShrink: 0,
  },
  textWrap: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
    gap: Space.xs / 4,
  },
  label: {
    fontSize: Type.bodyStrong.size,
    fontFamily: FontFamily.semibold,
    letterSpacing: Type.bodyStrong.letterSpacing,
    lineHeight: Type.bodyStrong.lineHeight,
  },
  secondary: {
    fontSize: Type.caption.size,
    fontFamily: FontFamily.regular,
    letterSpacing: Type.caption.letterSpacing,
    lineHeight: Type.caption.lineHeight,
  },
  trailing: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
    gap: Space.xs,
    justifyContent: 'flex-end',
  },
  badge: {
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs / 2 + 1,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    fontFamily: FontFamily.semibold,
    letterSpacing: 0.2,
  },
  value: {
    fontSize: Type.caption.size,
    fontFamily: FontFamily.regular,
    letterSpacing: Type.caption.letterSpacing,
    textAlign: 'right',
  },
  children: {
    paddingTop: Space.sm,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginTop: Space.sm + Space.xs,
  },
});
