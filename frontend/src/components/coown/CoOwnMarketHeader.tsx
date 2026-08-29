import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Control, Radius, Typography, Stroke} from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { AnimatedPressable } from '../AnimatedPressable';

export interface CoOwnMarketHeaderAction {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
  badge?: number;
  variant?: 'default' | 'primary';
}

export interface CoOwnMarketHeaderProps {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  actions?: CoOwnMarketHeaderAction[];
  style?: ViewStyle;
  showBackButton?: boolean;
}

export function CoOwnMarketHeader({
  title,
  subtitle,
  onBack,
  actions = [],
  style,
  showBackButton = true,
}: CoOwnMarketHeaderProps) {
  const { colors } = useAppTheme();

  return (
    <View style={[styles.root, style]}>
      <View style={styles.row}>
        {showBackButton && onBack ? (
          <AnimatedPressable
            style={styles.iconBtn}
            onPress={onBack}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            scaleValue={0.92}
            hapticFeedback="light"
            activeOpacity={0.62}
          >
            <Ionicons name="chevron-back" size={Control.icon} color={colors.textPrimary} />
          </AnimatedPressable>
        ) : (
          <View style={styles.iconBtnPlaceholder} />
        )}

        <View style={styles.titleWrap}>
          <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1} maxFontSizeMultiplier={1.2}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={[styles.subtitle, { color: colors.textSecondary }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>
              {subtitle}
            </Text>
          ) : null}
        </View>

        <View style={styles.actionsRow}>
          {actions.map((action, i) => {
            const isPrimary = action.variant === 'primary';
            return (
              <AnimatedPressable
                key={`${action.label}-${i}`}
                style={[
                  styles.iconBtn,
                ]}
                onPress={action.onPress}
                accessibilityRole="button"
                accessibilityLabel={action.label}
                scaleValue={0.92}
                hapticFeedback="light"
                activeOpacity={0.62}
              >
                <View style={isPrimary ? [styles.primaryChrome, { backgroundColor: colors.brand }] : undefined}>
                  <Ionicons name={action.icon} size={isPrimary ? 19 : Control.icon} color={isPrimary ? colors.background : colors.textPrimary} />
                </View>
                {action.badge != null && action.badge > 0 && (
                  <View style={[styles.badge, { backgroundColor: isPrimary ? colors.background : colors.brand, borderColor: colors.background }]}>
                    <Text style={[styles.badgeText, { color: isPrimary ? colors.brand : colors.background }]} maxFontSizeMultiplier={1.1}>
                      {action.badge > 9 ? '9+' : action.badge}
                    </Text>
                  </View>
                )}
              </AnimatedPressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const ICON_SIZE = Control.hit;

const styles = StyleSheet.create({
  root: {
    paddingHorizontal: Space.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 56,
  },
  iconBtn: {
    width: ICON_SIZE,
    height: ICON_SIZE,
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryChrome: {
    width: Control.chrome,
    height: Control.chrome,
    borderRadius: Radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconBtnPlaceholder: {
    width: ICON_SIZE,
    height: ICON_SIZE,
  },
  titleWrap: {
    flex: 1,
    alignItems: 'flex-start',
    marginHorizontal: Space.sm,
    gap: 2,
  },
  title: {
    fontSize: TypographyV2.screenTitle.size,
    fontFamily: TypographyV2.screenTitle.fontFamily,
    letterSpacing: TypographyV2.screenTitle.letterSpacing,
    lineHeight: TypographyV2.screenTitle.lineHeight,
  },
  subtitle: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    letterSpacing: TypographyV2.body.letterSpacing,
    lineHeight: TypographyV2.body.lineHeight,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  badge: {
    position: 'absolute',
    top: -5,
    right: -5,
    minWidth: 17,
    height: 17,
    borderRadius: Radius.lg,
    paddingHorizontal: Space.xs,
    borderWidth: Stroke.standard,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeText: {
    fontSize: 10,
    fontFamily: Typography.family.bold,
  },
});
