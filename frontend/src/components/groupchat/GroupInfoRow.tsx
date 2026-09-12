/**
 * GroupInfoRow — iOS grouped-table row for group admin surfaces.
 *
 * Anatomy: 32pt icon target · title + optional subtitle · optional detail
 * value · trailing node or disclosure chevron · hairline divider inset to
 * the text edge. Flat on the section canvas — no card chrome of its own.
 */

import React, { useMemo } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { AnimatedPressable } from '../AnimatedPressable';
import { AppIcon } from '../common/AppIcon';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { FontFamily, Space } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import type { IoniconsGlyphName, SemanticIconName } from '../../theme/iconTokens';

export interface GroupInfoRowProps {
  icon: SemanticIconName | IoniconsGlyphName;
  iconColor?: string;
  label: string;
  labelColor?: string;
  subtitle?: string;
  detail?: string;
  showChevron?: boolean;
  isLast?: boolean;
  onPress?: () => void;
  trailing?: React.ReactNode;
  disabled?: boolean;
  busy?: boolean;
}

export function GroupInfoRow({
  icon,
  iconColor,
  label,
  labelColor,
  subtitle,
  detail,
  showChevron = true,
  isLast = false,
  onPress,
  trailing,
  disabled = false,
  busy = false,
}: GroupInfoRowProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createRowStyles(colors), [colors]);

  const content = (
    <View style={styles.row}>
      <View style={styles.iconWrap} importantForAccessibility="no-hide-descendants">
        <AppIcon name={icon} size="md" color={iconColor ?? colors.textPrimary} accessible={false} />
      </View>
      <View style={styles.copyCol}>
        <Text style={[styles.label, labelColor ? { color: labelColor } : undefined]} numberOfLines={1}>
          {label}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {busy ? <ActivityIndicator size="small" color={colors.textMuted} /> : null}
      {detail ? <Text style={styles.detail}>{detail}</Text> : null}
      {trailing ? (
        trailing
      ) : showChevron ? (
        <AppIcon name="forward" size="sm" color="textMuted" accessible={false} />
      ) : null}
    </View>
  );

  return (
    <>
      {onPress && !disabled ? (
        <AnimatedPressable
          onPress={onPress}
          activeOpacity={0.68}
          scaleValue={0.985}
          hapticFeedback="light"
          accessibilityRole="button"
          accessibilityLabel={label}
          disabled={busy}
        >
          {content}
        </AnimatedPressable>
      ) : (
        <View style={disabled ? styles.disabled : undefined}>{content}</View>
      )}
      {!isLast && <View style={styles.divider} />}
    </>
  );
}

const createRowStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    row: {
      minHeight: 52,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm + 2,
      gap: Space.sm,
    },
    iconWrap: {
      width: 32,
      alignItems: 'center',
      justifyContent: 'center',
    },
    copyCol: {
      flex: 1,
      gap: 2,
    },
    label: {
      fontSize: TypographyV2.body.size,
      fontFamily: FontFamily.medium,
      color: colors.textPrimary,
    },
    subtitle: {
      fontSize: TypographyV2.meta.size,
      fontFamily: FontFamily.regular,
      color: colors.textMuted,
      lineHeight: TypographyV2.meta.lineHeight,
    },
    detail: {
      fontSize: TypographyV2.meta.size,
      fontFamily: FontFamily.regular,
      color: colors.textMuted,
      marginRight: 4,
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.borderSubtle,
      marginLeft: 56, // Inset divider past the icon
    },
    disabled: {
      opacity: 0.55,
    },
  });
