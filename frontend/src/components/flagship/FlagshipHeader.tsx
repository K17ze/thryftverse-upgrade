import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Control, Type, TypeStyles } from '../../theme/designTokens';
import { AnimatedPressable } from '../AnimatedPressable';

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
  onTitlePress?: () => void;
  titleAccessibilityLabel?: string;
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
  onTitlePress,
  titleAccessibilityLabel,
}: FlagshipHeaderProps) {
  const { colors } = useAppTheme();
  const isLarge = variant === 'large';
  const isModal = variant === 'modal';

  const effectiveBackIcon = backIcon ?? (isModal ? 'close' : 'arrow-back');
  const effectiveOnBack = onClose ?? onBack;

  const identity = (
    <>
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
              fontFamily: isLarge ? TypeStyles.title.fontFamily : TypeStyles.bodyEmphasis.fontFamily,
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
    </>
  );

  return (
    <View style={[styles.root, style]}>
      <View style={styles.row}>
        {showBackButton && effectiveOnBack ? (
          <AnimatedPressable
            style={styles.iconBtn}
            onPress={effectiveOnBack}
            accessibilityRole="button"
            accessibilityLabel={isModal ? 'Close' : 'Go back'}
            scaleValue={0.92}
            hapticFeedback="light"
            activeOpacity={0.62}
          >
            <Ionicons name={effectiveBackIcon as any} size={Control.icon} color={colors.textPrimary} />
          </AnimatedPressable>
        ) : (
          <View style={styles.iconBtnPlaceholder} />
        )}

        {onTitlePress ? (
          <AnimatedPressable
            style={styles.identityPress}
            onPress={onTitlePress}
            accessibilityRole="button"
            accessibilityLabel={titleAccessibilityLabel ?? `${title} details`}
            scaleValue={0.98}
            hapticFeedback="light"
          >
            {identity}
          </AnimatedPressable>
        ) : (
          identity
        )}

        <View style={styles.rightSlot}>
          {rightAction || <View style={styles.iconBtnPlaceholder} />}
        </View>
      </View>
    </View>
  );
}

const ICON_SIZE = Control.hit;

const styles = StyleSheet.create({
  root: {
    paddingHorizontal: Space.md,
    paddingVertical: 6,
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
    fontFamily: TypeStyles.body.fontFamily,
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
  identityPress: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
});
