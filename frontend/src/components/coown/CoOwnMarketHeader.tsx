import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { StyleSheet as RNStyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Radius, Type, Typography } from '../../theme/designTokens';
import { AnimatedPressable } from '../AnimatedPressable';
import { haptics } from '../../utils/haptics';

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
            style={[styles.iconBtn, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}
            onPress={onBack}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            scaleValue={0.92}
            hapticFeedback="light"
          >
            <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
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
                  isPrimary
                    ? { backgroundColor: colors.brand, borderColor: colors.brand }
                    : { backgroundColor: colors.surfaceAlt, borderColor: colors.border },
                ]}
                onPress={() => { haptics.tap(); action.onPress(); }}
                accessibilityRole="button"
                accessibilityLabel={action.label}
                scaleValue={0.92}
                hapticFeedback="light"
              >
                <Ionicons name={action.icon} size={18} color={isPrimary ? colors.background : colors.textPrimary} />
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

const ICON_SIZE = 44;

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
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
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
    fontSize: Type.title.size,
    fontFamily: Typography.family.bold,
    letterSpacing: Type.title.letterSpacing,
    lineHeight: Type.title.lineHeight,
  },
  subtitle: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.body.letterSpacing,
    lineHeight: Type.body.lineHeight,
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
    borderRadius: 9,
    paddingHorizontal: 4,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeText: {
    fontSize: 10,
    fontFamily: Typography.family.bold,
  },
});
