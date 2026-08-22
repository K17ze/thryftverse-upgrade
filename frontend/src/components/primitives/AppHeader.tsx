import React from 'react';
import { View, Text, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { AnimatedPressable } from '../AnimatedPressable';
import {
  Space,
  Control,
  Type,
  TypeStyles,
  PressScale,
} from '../../theme/designTokens';

export type AppHeaderVariant = 'default' | 'large' | 'compact';

export interface AppHeaderProps {
  title: string;
  subtitle?: string;
  leftAction?: React.ReactNode;
  rightAction?: React.ReactNode;
  variant?: AppHeaderVariant;
  onBack?: () => void;
  showBackButton?: boolean;
  backIcon?: React.ComponentProps<typeof Ionicons>['name'];
  style?: StyleProp<ViewStyle>;
  collapseProgress?: number;
}

/**
 * Unified header primitive covering standard, large-title, and compact
 * variants. Replaces the fragmented ScreenHeader and FlagshipHeader
 * implementations with a single accessible component backed by design
 * tokens.
 */
export function AppHeader({
  title,
  subtitle,
  leftAction,
  rightAction,
  variant = 'default',
  onBack,
  showBackButton = true,
  backIcon = 'chevron-back',
  style,
  collapseProgress,
}: AppHeaderProps) {
  const { colors } = useAppTheme();
  const isLarge = variant === 'large';
  const isCompact = variant === 'compact';

  const titleFontSize = isLarge
    ? Type.title.size
    : isCompact
      ? Type.bodyEmphasis.size
      : Type.subtitle.size;
  const titleFontFamily = isLarge
    ? TypeStyles.title.fontFamily
    : TypeStyles.bodyStrong.fontFamily;
  const titleLineHeight = isLarge
    ? Type.title.lineHeight
    : Type.subtitle.lineHeight;
  const titleLetterSpacing = isLarge
    ? Type.title.letterSpacing
    : Type.subtitle.letterSpacing;

  const compactTitleOpacity =
    collapseProgress == null ? 1 : Math.max(0, Math.min(1, collapseProgress));

  const renderLeft = () => {
    if (leftAction) return leftAction;
    if (showBackButton && onBack) {
      return (
        <AnimatedPressable
          style={styles.iconBtn}
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          accessibilityHint="Returns to the previous screen"
          scaleValue={PressScale.icon}
          hapticFeedback="light"
          activeOpacity={0.62}
        >
          <Ionicons name={backIcon} size={Control.icon} color={colors.textPrimary} />
        </AnimatedPressable>
      );
    }
    return <View style={styles.iconBtnPlaceholder} />;
  };

  return (
    <View
      style={[styles.root, style]}
      accessibilityRole="header"
      accessibilityLabel={title}
    >
      <View style={styles.row}>
        {renderLeft()}

        <View style={styles.titleWrap}>
          <Text
            style={[
              styles.title,
              {
                color: colors.textPrimary,
                fontSize: titleFontSize,
                fontFamily: titleFontFamily,
                lineHeight: titleLineHeight,
                letterSpacing: titleLetterSpacing,
                opacity: compactTitleOpacity,
              },
            ]}
            numberOfLines={1}
          >
            {title}
          </Text>
          {subtitle ? (
            <Text
              style={[
                styles.subtitle,
                {
                  color: colors.textSecondary,
                  fontSize: Type.caption.size,
                  fontFamily: TypeStyles.body.fontFamily,
                  lineHeight: Type.caption.lineHeight,
                  letterSpacing: Type.caption.letterSpacing,
                },
              ]}
              numberOfLines={1}
            >
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

const ICON_SIZE = Control.hit;

const styles = StyleSheet.create({
  root: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.xs,
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
    marginTop: Space.xs / 2,
    textAlign: 'center',
  },
  rightSlot: {
    minWidth: ICON_SIZE,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
});
