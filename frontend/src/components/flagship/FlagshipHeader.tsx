import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Radius, Type } from '../../theme/designTokens';
import { AnimatedPressable } from '../AnimatedPressable';
import { Typography } from '../../theme/designTokens';

export type FlagshipHeaderVariant = 'pushed' | 'modal' | 'large';

export interface FlagshipHeaderProps {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  onClose?: () => void;
  rightAction?: React.ReactNode;
  variant?: FlagshipHeaderVariant;
  style?: ViewStyle;
  showBackButton?: boolean;
  backIcon?: React.ComponentProps<typeof Ionicons>['name'];
  avatar?: React.ReactNode;
}

export function FlagshipHeader({
  title,
  subtitle,
  onBack,
  onClose,
  rightAction,
  variant = 'pushed',
  style,
  showBackButton = true,
  backIcon,
  avatar,
}: FlagshipHeaderProps) {
  const { colors } = useAppTheme();
  const isLarge = variant === 'large';
  const isModal = variant === 'modal';

  const effectiveBackIcon = backIcon ?? (isModal ? 'close' : 'arrow-back');
  const effectiveOnBack = onClose ?? onBack;

  return (
    <View style={[styles.root, style]}>
      <View style={styles.row}>
        {showBackButton && effectiveOnBack ? (
          <AnimatedPressable
            style={[styles.iconBtn, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}
            onPress={effectiveOnBack}
            accessibilityRole="button"
            accessibilityLabel={isModal ? 'Close' : 'Go back'}
            scaleValue={0.92}
            hapticFeedback="light"
          >
            <Ionicons name={effectiveBackIcon as any} size={24} color={colors.textPrimary} />
          </AnimatedPressable>
        ) : (
          <View style={styles.iconBtnPlaceholder} />
        )}

        {avatar ? (
          <View style={styles.avatarWrap}>{avatar}</View>
        ) : null}
        <View style={styles.titleWrap}>
          <Text
            style={[
              styles.title,
              {
                color: colors.textPrimary,
                fontSize: isLarge ? Type.title.size : Type.subtitle.size,
                fontFamily: isLarge ? Typography.family.bold : Typography.family.semibold,
                lineHeight: isLarge ? Type.title.lineHeight : Type.subtitle.lineHeight,
                letterSpacing: isLarge ? Type.title.letterSpacing : Type.subtitle.letterSpacing,
              },
            ]}
            numberOfLines={1}
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
          {rightAction || <View style={styles.iconBtnPlaceholder} />}
        </View>
      </View>
    </View>
  );
}

const ICON_SIZE = 44;

const styles = StyleSheet.create({
  root: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm + 4,
    minHeight: 56,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconBtn: {
    width: ICON_SIZE,
    height: ICON_SIZE,
    borderRadius: Radius.md,
    borderWidth: 0.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconBtnPlaceholder: {
    width: ICON_SIZE,
    height: ICON_SIZE,
  },
  titleWrap: {
    flex: 1,
    alignItems: 'center',
    marginHorizontal: Space.sm,
  },
  title: {
    textAlign: 'center',
  },
  subtitle: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    marginTop: 2,
    letterSpacing: Type.caption.letterSpacing,
    lineHeight: Type.caption.lineHeight,
  },
  rightSlot: {
    minWidth: ICON_SIZE,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  avatarWrap: {
    marginRight: Space.sm,
  },
});
