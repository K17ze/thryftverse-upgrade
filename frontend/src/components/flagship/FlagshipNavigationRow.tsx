/**
 * FlagshipNavigationRow — canonical transparent navigation row.
 *
 * A content-over-chrome row with NO card background, NO border, NO radius.
 * Uses whitespace, hairline separators, and typography for structure.
 *
 * This is the preferred primitive for settings, disclosure, and navigation
 * rows where the content is a title + optional subtitle + trailing chevron.
 *
 * Per AGENTS.md §4:
 *   - Ordinary navigation controls default to transparent 44pt targets.
 *   - Visible containment must have meaning.
 *   - Flat canvas, spacing and hairlines are the default utility structure.
 *
 * For richer rows (leading images, badges, custom trailing), use FlatRow.
 * For settings rows with toggles, use SettingsRow.
 * This component is the simplest, most focused navigation primitive.
 */

import React from 'react';
import { View, Text, StyleSheet, type TextStyle, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Type, FontFamily, Control } from '../../theme/designTokens';
import { AnimatedPressable } from '../AnimatedPressable';

export interface FlagshipNavigationRowProps {
  /** Primary title — the row's identity. */
  title: string;
  /** Optional subtitle / value summary (e.g. "Small parcel · Buyer pays"). */
  subtitle?: string;
  /** Style override for the title text. */
  titleStyle?: TextStyle;
  /** Style override for the subtitle text. */
  subtitleStyle?: TextStyle;
  /** Optional leading icon name (Ionicons). Rendered directly — no circle. */
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  /** Leading icon color override. */
  iconColor?: string;
  /** Custom trailing node (overrides chevron). */
  trailing?: React.ReactNode;
  /** Show trailing chevron. Defaults to true when onPress is set and no custom trailing. */
  showChevron?: boolean;
  /** Tap handler. When supplied, the row becomes a button with 44pt target. */
  onPress?: () => void;
  /** Disabled state — mutes the row and removes press affordance. */
  disabled?: boolean;
  /** Destructive / danger styling — mutes title to danger color. */
  danger?: boolean;
  /** Show hairline separator below this row. Defaults to true. */
  separator?: boolean;
  /** Inset the separator to start from the text edge. Defaults to true. */
  separatorInset?: boolean;
  /** Explicit accessibility label. */
  accessibilityLabel?: string;
  /** Accessibility hint describing the action. */
  accessibilityHint?: string;
  /** Override the minimum touch target height. Defaults to Control.hit (44). */
  minHeight?: number;
  /** Extra content rendered below the row content. */
  children?: React.ReactNode;
  style?: ViewStyle;
}

export function FlagshipNavigationRow({
  title,
  subtitle,
  titleStyle,
  subtitleStyle,
  icon,
  iconColor,
  trailing,
  showChevron,
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
}: FlagshipNavigationRowProps) {
  const { colors } = useAppTheme();
  const isTappable = !!onPress && !disabled;
  const resolvedShowChevron =
    showChevron ?? (isTappable && !trailing);

  const titleColor = disabled
    ? colors.textMuted
    : danger
      ? colors.danger
      : colors.textPrimary;

  const resolvedLabel = accessibilityLabel ?? [title, subtitle].filter(Boolean).join(', ');

  const leadingWidth = icon ? Control.iconCompact + Space.xs : 0;

  const content = (
    <View style={[styles.inner, { minHeight }, style]}>
      <View style={styles.contentRow}>
        {icon ? (
          <View style={styles.iconWrap}>
            <Ionicons
              name={icon}
              size={Control.iconCompact}
              color={iconColor ?? (danger ? colors.danger : colors.textSecondary)}
            />
          </View>
        ) : null}

        <View style={styles.textWrap}>
          <Text
            style={[styles.title, { color: titleColor }, titleStyle]}
            numberOfLines={1}
          >
            {title}
          </Text>
          {subtitle ? (
            <Text
              style={[styles.subtitle, { color: colors.textMuted }, subtitleStyle]}
              numberOfLines={2}
            >
              {subtitle}
            </Text>
          ) : null}
        </View>

        {trailing ? (
          <View style={styles.trailing}>{trailing}</View>
        ) : resolvedShowChevron ? (
          <View style={styles.trailing}>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </View>
        ) : null}
      </View>

      {children ? <View style={styles.children}>{children}</View> : null}

      {separator ? (
        <View
          style={[
            styles.separator,
            { backgroundColor: colors.border },
            separatorInset && { marginLeft: Space.md + leadingWidth + Space.sm },
          ]}
        />
      ) : null}
    </View>
  );

  if (!isTappable) {
    return content;
  }

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

const styles = StyleSheet.create({
  pressable: {},
  inner: {
    paddingVertical: Space.sm + Space.xs,
    paddingHorizontal: Space.md,
    justifyContent: 'center',
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    minHeight: Control.hit,
  },
  iconWrap: {
    width: Control.iconCompact + Space.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textWrap: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
    gap: Space.xxs,
  },
  title: {
    fontSize: Type.bodyEmphasis.size,
    fontFamily: FontFamily.semibold,
    letterSpacing: Type.bodyEmphasis.letterSpacing,
    lineHeight: Type.bodyEmphasis.lineHeight,
  },
  subtitle: {
    fontSize: Type.captionElevated.size,
    fontFamily: FontFamily.regular,
    letterSpacing: Type.captionElevated.letterSpacing,
    lineHeight: Type.captionElevated.lineHeight,
  },
  trailing: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
    justifyContent: 'flex-end',
  },
  children: {
    paddingTop: Space.sm,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginTop: Space.sm + Space.xs,
  },
});
