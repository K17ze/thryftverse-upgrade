import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AnimatedPressable } from '../AnimatedPressable';
import { useAppTheme } from '../../theme/ThemeContext';

import { Space, Control, Typography, PressScale } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
export type ScreenHeaderVariant = 'standard' | 'large' | 'minimal' | 'modal';

interface ScreenHeaderProps {
  title: string;
  onBack?: () => void;
  rightAction?: React.ReactNode;
  variant?: ScreenHeaderVariant;
  style?: ViewStyle;
  showBackButton?: boolean;
  backButtonColor?: string;
  backIcon?: React.ComponentProps<typeof Ionicons>['name'];
  subtitle?: string;
}

export function ScreenHeader({
  title,
  onBack,
  rightAction,
  variant = 'standard',
  style,
  showBackButton = true,
  backButtonColor,
  backIcon = 'chevron-back',
  subtitle }: ScreenHeaderProps) {
  const { colors } = useAppTheme();
  const titleSize = variant === 'large' ? TypographyV2.screenTitle.size : TypographyV2.sectionTitle.size;
  const titleFamily = variant === 'large' ? Typography.family.bold : Typography.family.semibold;
  const titleLineHeight = variant === 'large' ? TypographyV2.screenTitle.lineHeight : TypographyV2.sectionTitle.lineHeight;

  return (
    <View style={[styles.header, style]}>
      {showBackButton && onBack ? (
        <AnimatedPressable
          style={styles.backBtn}
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          accessibilityHint="Returns to the previous screen"
          scaleValue={PressScale.icon}
          hapticFeedback="light"
          activeOpacity={0.62}
        >
          <Ionicons name={backIcon} size={Control.icon} color={backButtonColor ?? colors.textPrimary} aria-hidden={true} />
        </AnimatedPressable>
      ) : (
        <View style={styles.backBtnPlaceholder} accessible={false} />
      )}

      <View style={styles.titleContainer}>
        <Text
          style={[
            styles.title,
            { color: colors.textPrimary },
            {
              fontSize: titleSize,
              fontFamily: titleFamily,
              lineHeight: titleLineHeight,
              letterSpacing: variant === 'large' ? TypographyV2.screenTitle.letterSpacing : TypographyV2.sectionTitle.letterSpacing },
          ]}
          numberOfLines={1}
          accessibilityRole="header"
        >
          {title}
        </Text>
        {subtitle ? (
          <Text style={[styles.subtitle, { color: colors.textSecondary }]} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      <View style={styles.rightSlot}>
        {rightAction || <View style={styles.spacer} accessible={false} />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md - Space.xs,
    paddingVertical: 6,
    minHeight: 56 },
  backBtn: {
    width: Control.hit,
    height: Control.hit,
    justifyContent: 'center',
    alignItems: 'center' },
  backBtnPlaceholder: {
    width: Control.hit },
  titleContainer: {
    flex: 1,
    alignItems: 'center',
    marginHorizontal: Space.sm },
  title: {
    textAlign: 'center' },
  subtitle: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    marginTop: 1,
    textAlign: 'center' },
  rightSlot: {
    minWidth: Control.hit,
    alignItems: 'flex-end',
    justifyContent: 'center' },
  spacer: {
    width: Control.hit } });
