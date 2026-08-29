import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Typography , Space, Radius, Elevation  } from '../../theme/designTokens';
import { AnimatedPressable } from '../AnimatedPressable';
import { Caption } from '../ui/Text';

interface ScrollToBottomFABProps {
  unreadCount?: number;
  onPress: () => void;
  visible: boolean;
  style?: ViewStyle;
  bottomOffset?: number;
}

export function ScrollToBottomFAB({
  unreadCount = 0,
  onPress,
  visible,
  style,
  bottomOffset,
}: ScrollToBottomFABProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  if (!visible) return null;

  return (
    <View style={[styles.container, bottomOffset !== undefined && { bottom: bottomOffset }, style]}>
      <AnimatedPressable
        style={styles.button}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`Scroll to bottom${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
        accessibilityHint="Scrolls to the latest message"
        activeOpacity={0.7}
        scaleValue={0.92}
        hapticFeedback="light"
      >
        <Ionicons name="chevron-down" size={20} color={colors.textPrimary} />
        {unreadCount > 0 ? (
          <View style={styles.badge}>
            <Caption color={colors.textInverse} style={styles.badgeText}>
              {unreadCount > 99 ? '99+' : unreadCount}
            </Caption>
          </View>
        ) : null}
      </AnimatedPressable>
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: Space.xl + 52,
    right: Space.md,
    zIndex: 10,
  },
  button: {
    width: 44,
    height: 44,
    borderRadius: Radius.full,
    backgroundColor: colors.surfaceAlt,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    ...Elevation.floating,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: Radius.lg,
    backgroundColor: colors.brand,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Space.xs,
    borderWidth: 2,
    borderColor: colors.background,
  },
  badgeText: {
    fontSize: 10,
    fontFamily: Typography.family.bold,
  },
});
