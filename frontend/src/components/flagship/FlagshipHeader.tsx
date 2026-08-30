import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Control, TypeStyles, PressScale } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
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
  /** Optional large-title scroll progress (0 = expanded, 1 = collapsed).
   *  When provided, the large variant fades the big title into the compact
   *  bar title as the user scrolls, mirroring iOS large-title behaviour
   *  without a separate native component. */
  collapseProgress?: number;
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
  collapseProgress }: FlagshipHeaderProps) {
  const { colors } = useAppTheme();
  const isLarge = variant === 'large';
  const isModal = variant === 'modal';

  const effectiveBackIcon = backIcon ?? (isModal ? 'close' : 'chevron-back');
  const effectiveOnBack = onClose ?? onBack;

  // Large-title collapse: when a collapse progress is supplied (0→1), the
  // compact bar title opacity tracks it so the title only appears in the bar
  // once the large title has scrolled away. Default to fully visible for the
  // non-large / non-collapsing case.
  const compactTitleOpacity =
    collapseProgress == null ? 1 : Math.max(0, Math.min(1, collapseProgress));

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
              fontSize: isLarge ? TypographyV2.screenTitle.size : TypographyV2.sectionTitle.size,
              fontFamily: isLarge ? TypeStyles.title.fontFamily : TypeStyles.bodyStrong.fontFamily,
              lineHeight: isLarge ? TypographyV2.screenTitle.lineHeight : TypographyV2.sectionTitle.lineHeight,
              letterSpacing: isLarge ? TypographyV2.screenTitle.letterSpacing : TypographyV2.sectionTitle.letterSpacing,
              opacity: compactTitleOpacity },
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
            accessibilityHint={isModal ? 'Closes this screen' : 'Returns to the previous screen'}
            scaleValue={PressScale.icon}
            hapticFeedback="light"
            activeOpacity={0.62}
          >
            <Ionicons name={effectiveBackIcon} size={Control.icon} color={colors.textPrimary} aria-hidden={true} />
          </AnimatedPressable>
        ) : (
          <View style={styles.iconBtnPlaceholder} accessible={false} />
        )}

        {onTitlePress ? (
          <AnimatedPressable
            style={styles.identityPress}
            onPress={onTitlePress}
            accessibilityRole="button"
            accessibilityLabel={titleAccessibilityLabel ?? `${title} details`}
            scaleValue={PressScale.gentle}
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
    paddingVertical: Space.xs,
    minHeight: 56 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between' },
  iconBtn: {
    width: ICON_SIZE,
    height: ICON_SIZE,
    justifyContent: 'center',
    alignItems: 'center' },
  iconBtnPlaceholder: {
    width: ICON_SIZE,
    height: ICON_SIZE },
  titleWrap: {
    flex: 1,
    alignItems: 'center',
    marginHorizontal: Space.sm },
  title: {
    textAlign: 'center' },
  subtitle: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypeStyles.body.fontFamily,
    marginTop: Space.xs / 2,
    letterSpacing: TypographyV2.meta.letterSpacing,
    lineHeight: TypographyV2.meta.lineHeight },
  rightSlot: {
    minWidth: ICON_SIZE,
    alignItems: 'flex-end',
    justifyContent: 'center' },
  avatarWrap: {
    marginRight: Space.sm },
  identityPress: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center' } });
