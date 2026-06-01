import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { Space, Radius, Type } from '../../theme/designTokens';
import { AnimatedPressable } from '../AnimatedPressable';
import { Typography } from '../../constants/typography';

export type ScreenHeaderVariant = 'standard' | 'large' | 'minimal';

interface ScreenHeaderProps {
  title: string;
  onBack?: () => void;
  rightAction?: React.ReactNode;
  variant?: ScreenHeaderVariant;
  style?: ViewStyle;
  showBackButton?: boolean;
  backButtonColor?: string;
  backIcon?: React.ComponentProps<typeof Ionicons>['name'];
}

export function ScreenHeader({
  title,
  onBack,
  rightAction,
  variant = 'standard',
  style,
  showBackButton = true,
  backButtonColor = Colors.textPrimary,
  backIcon = 'arrow-back',
}: ScreenHeaderProps) {
  const titleSize = variant === 'large' ? Type.title.size : Type.subtitle.size;
  const titleFamily = variant === 'large' ? Typography.family.bold : Typography.family.semibold;
  const titleLineHeight = variant === 'large' ? Type.title.lineHeight : Type.subtitle.lineHeight;

  return (
    <View style={[styles.header, style]}>
      {showBackButton && onBack ? (
        <AnimatedPressable
          style={styles.backBtn}
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          accessibilityHint="Returns to the previous screen"
          scaleValue={0.92}
          hapticFeedback="light"
        >
          <Ionicons name={backIcon} size={24} color={backButtonColor} />
        </AnimatedPressable>
      ) : (
        <View style={styles.backBtnPlaceholder} />
      )}

      <View style={styles.titleContainer}>
        <Text
          style={[
            styles.title,
            {
              fontSize: titleSize,
              fontFamily: titleFamily,
              lineHeight: titleLineHeight,
              letterSpacing: variant === 'large' ? Type.title.letterSpacing : Type.subtitle.letterSpacing,
            },
          ]}
          numberOfLines={1}
        >
          {title}
        </Text>
      </View>

      <View style={styles.rightSlot}>
        {rightAction || <View style={styles.spacer} />}
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
    paddingVertical: Space.md - Space.xs,
    minHeight: 56,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    backgroundColor: Colors.glassBg,
    borderWidth: 0.5,
    borderColor: Colors.glassBorder,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backBtnPlaceholder: {
    width: 44,
  },
  titleContainer: {
    flex: 1,
    alignItems: 'center',
    marginHorizontal: Space.sm,
  },
  title: {
    color: Colors.textPrimary,
  },
  rightSlot: {
    minWidth: 44,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  spacer: {
    width: 44,
  },
});
