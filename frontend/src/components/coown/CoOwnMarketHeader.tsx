import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Radius, Type, Typography } from '../../theme/designTokens';
import { AnimatedPressable } from '../AnimatedPressable';
import { haptics } from '../../utils/haptics';

export interface CoOwnMarketHeaderAction {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
  badge?: number;
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
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.root, { paddingTop: insets.top + Space.xs }, style]}>
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
          <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={[styles.subtitle, { color: colors.textSecondary }]} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>

        <View style={styles.actionsRow}>
          {actions.map((action, i) => (
            <AnimatedPressable
              key={`${action.label}-${i}`}
              style={[styles.iconBtn, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}
              onPress={() => { haptics.tap(); action.onPress(); }}
              accessibilityRole="button"
              accessibilityLabel={action.label}
              scaleValue={0.92}
              hapticFeedback="light"
            >
              <Ionicons name={action.icon} size={20} color={colors.textPrimary} />
              {action.badge != null && action.badge > 0 && (
                <View style={[styles.badge, { backgroundColor: colors.brand }]}>
                  <Text style={[styles.badgeText, { color: colors.background }]}>
                    {action.badge > 9 ? '9+' : action.badge}
                  </Text>
                </View>
              )}
            </AnimatedPressable>
          ))}
        </View>
      </View>
    </View>
  );
}

const ICON_SIZE = 40;

const styles = StyleSheet.create({
  root: {
    paddingHorizontal: Space.md,
    paddingBottom: Space.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
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
    alignItems: 'flex-start',
    marginHorizontal: Space.sm,
  },
  title: {
    fontSize: Type.title.size,
    fontFamily: Typography.family.bold,
    letterSpacing: Type.title.letterSpacing,
    lineHeight: Type.title.lineHeight,
  },
  subtitle: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.caption.letterSpacing,
    lineHeight: Type.caption.lineHeight,
    marginTop: 2,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: Space.xs,
    alignItems: 'center',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeText: {
    fontSize: 10,
    fontFamily: Typography.family.bold,
  },
});
