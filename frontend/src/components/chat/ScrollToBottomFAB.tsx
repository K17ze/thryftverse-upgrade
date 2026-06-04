import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { Space, Radius, Elevation } from '../../theme/designTokens';
import { AnimatedPressable } from '../AnimatedPressable';
import { Caption } from '../ui/Text';

interface ScrollToBottomFABProps {
  unreadCount?: number;
  onPress: () => void;
  visible: boolean;
  style?: ViewStyle;
}

export function ScrollToBottomFAB({
  unreadCount = 0,
  onPress,
  visible,
  style,
}: ScrollToBottomFABProps) {
  if (!visible) return null;

  return (
    <View style={[styles.container, style]}>
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
        <Ionicons name="chevron-down" size={20} color={Colors.textPrimary} />
        {unreadCount > 0 ? (
          <View style={styles.badge}>
            <Caption color={Colors.textInverse} style={styles.badgeText}>
              {unreadCount > 99 ? '99+' : unreadCount}
            </Caption>
          </View>
        ) : null}
      </AnimatedPressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: Space.xl + 16,
    right: Space.md,
    zIndex: 10,
  },
  button: {
    width: 44,
    height: 44,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceAlt,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 0.5,
    borderColor: Colors.border,
    ...Elevation.floating,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Colors.brand,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: Colors.background,
  },
  badgeText: {
    fontSize: 10,
    fontFamily: Typography.family.bold,
  },
});
