import React, { useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, type TextStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Control, FontFamily, PressScale } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { AnimatedPressable } from '../AnimatedPressable';
import { PremiumToggle } from '../PremiumToggle';

import { AppIcon } from '../common/AppIcon';
import { AppGlyph, type AppGlyphName } from '../common/AppGlyph';
import { IconSize } from '../../theme/iconTokens';

export interface SettingsRowProps {
  title: string;
  subtitle?: string;
  value?: string;
  icon?: string;
  glyph?: AppGlyphName;
  iconColor?: string;
  danger?: boolean;
  disabled?: boolean;
  /** When true, the row is syncing to the server: a small spinner is shown
   *  next to the toggle and the toggle is non-interactive. */
  syncing?: boolean;
  onPress?: () => void;
  toggleValue?: boolean;
  onToggle?: (v: boolean) => void;
  isFirst?: boolean;
  isLast?: boolean;
  children?: React.ReactNode;
  /** Explicit accessibility labels. Defaults to the row title. */
  accessibilityLabel?: string;
  /** Accessibility hint describing the action. */
  accessibilityHint?: string;
  /** Optional style override for the title text. */
  titleStyle?: TextStyle;
}

export function SettingsRow({
  title,
  subtitle,
  value,
  icon,
  glyph,
  iconColor,
  danger,
  disabled,
  syncing,
  onPress,
  toggleValue,
  onToggle,
  isFirst,
  isLast,
  children,
  accessibilityLabel,
  accessibilityHint,
  titleStyle }: SettingsRowProps) {
  const { colors } = useAppTheme();
  const [isPressed, setIsPressed] = useState(false);
  const hasAction = !!onPress || !!onToggle;
  const showChevron = !!onPress && !onToggle && toggleValue === undefined;
  const isToggle = onToggle !== undefined;
  const isSyncing = !!syncing;
  const toggleDisabled = disabled || isSyncing;

  // Compose a truthful accessibility label from the visible text so screen
  // readers announce the row's identity without duplicating the title.
  const resolvedLabel = accessibilityLabel ?? title;
  const resolvedHint =
    accessibilityHint ??
    (isToggle
      ? `Toggle ${title}`
      : onPress
        ? `Open ${title}`
        : undefined);

  // For toggle rows, the switch itself needs a label that includes the
  // setting name and current state per accessibility best practices.
  const toggleA11yLabel = accessibilityLabel
    ? `${accessibilityLabel}, ${toggleValue ? 'on' : 'off'}`
    : `${title}, ${toggleValue ? 'on' : 'off'}`;

  return (
    <AnimatedPressable
      onPress={onPress}
      activeOpacity={0.7}
      scaleValue={PressScale.tap}
      hapticFeedback="light"
      disabled={!hasAction || toggleDisabled}
      onPressIn={() => setIsPressed(true)}
      onPressOut={() => setIsPressed(false)}
      accessibilityRole={isToggle ? 'switch' : 'button'}
      accessibilityLabel={isToggle ? toggleA11yLabel : resolvedLabel}
      accessibilityHint={resolvedHint}
      accessibilityState={isToggle ? { checked: !!toggleValue } : undefined}
    >
      <View
        style={[
          styles.root,
          !isLast && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
          isPressed && !toggleDisabled && { backgroundColor: colors.rowPressed },
          toggleDisabled && { opacity: 0.4 },
        ]}
      >
        {glyph ? (
          // Compact decorative slot for the leading glyph. The parent row owns the touch target.
          <View style={styles.iconTarget}>
            <AppGlyph
              name={glyph}
              size={20}
              color={iconColor ?? colors.textSecondary}
            />
          </View>
        ) : icon ? (
          // Compact decorative slot for the leading glyph. The parent row owns the touch target.
          <View style={styles.iconTarget}>
            <AppIcon
              name={icon}
              size={IconSize.lg}
              color={iconColor ?? (danger ? 'danger' : 'textSecondary')}
              opticalCenter={true}
              accessible={false}
            />
          </View>
        ) : null}

        <View style={styles.textWrap}>
          <Text
            style={[
              styles.title,
              { color: danger ? colors.danger : colors.textPrimary },
              titleStyle,
            ]}
            numberOfLines={1}
          >
            {title}
          </Text>
          {subtitle ? (
            <Text style={[styles.subtitle, { color: colors.textSecondary }]} numberOfLines={2}>
              {subtitle}
            </Text>
          ) : null}
        </View>

        <View style={styles.right}>
          {value ? (
            <Text style={[styles.value, { color: colors.textSecondary }]} numberOfLines={1}>
              {value}
            </Text>
          ) : null}
          {isToggle ? (
            <>
              {isSyncing ? (
                <ActivityIndicator size={16} color={colors.textSecondary} />
              ) : null}
              <PremiumToggle
                value={!!toggleValue}
                onValueChange={onToggle}
                disabled={toggleDisabled}
                accessibilityLabel={toggleA11yLabel}
              />
            </>
          ) : showChevron ? (
            <AppIcon name="forward" size={IconSize.md} color="textMuted" accessible={false} />
          ) : null}
          {children}
        </View>
      </View>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Space.sm + Space.xs,
    paddingHorizontal: Space.md,
    minHeight: 56,
    gap: Space.sm },
  // Compact decorative slot for the leading glyph — optical centering only.
  iconTarget: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center' },
  textWrap: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
    gap: Space.xs / 4 },
  // Label: 15sp semibold per TypographyV2.bodyStrong (2026 mobile UX spec).
  title: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: FontFamily.semibold,
    letterSpacing: TypographyV2.bodyStrong.letterSpacing,
    lineHeight: TypographyV2.bodyStrong.lineHeight },
  subtitle: {
    fontSize: TypographyV2.captionElevated.size,
    fontFamily: FontFamily.medium,
    marginTop: 0,
    letterSpacing: TypographyV2.captionElevated.letterSpacing,
    lineHeight: TypographyV2.captionElevated.lineHeight },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
    flexShrink: 1,
    justifyContent: 'flex-end',
    gap: Space.xs },
  // Value/status: 14sp muted per spec.
  value: {
    fontSize: TypographyV2.body.size,
    fontFamily: FontFamily.regular,
    flexShrink: 1,
    maxWidth: '100%',
    textAlign: 'right',
    letterSpacing: TypographyV2.body.letterSpacing,
    fontVariant: ['tabular-nums'] as ['tabular-nums'] } });
