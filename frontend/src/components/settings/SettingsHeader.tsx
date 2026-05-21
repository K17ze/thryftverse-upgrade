import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { Space, Radius } from '../../theme/designTokens';
import { AnimatedPressable } from '../AnimatedPressable';
import { Headline } from '../ui/Text';

interface SettingsHeaderProps {
  title: string;
  onBack: () => void;
  rightAction?: React.ReactNode;
  style?: ViewStyle;
}

export function SettingsHeader({ title, onBack, rightAction, style }: SettingsHeaderProps) {
  return (
    <View style={[styles.header, style]}>
      <AnimatedPressable
        style={styles.backBtn}
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel="Go back"
        accessibilityHint="Returns to the previous screen"
        activeOpacity={0.7}
        scaleValue={0.92}
        hapticFeedback="light"
      >
        <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
      </AnimatedPressable>

      <View style={styles.titleContainer}>
        <Headline numberOfLines={1}>{title}</Headline>
      </View>

      <View style={styles.rightSlot}>{rightAction || <View style={styles.spacer} />}</View>
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
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  titleContainer: {
    flex: 1,
    alignItems: 'center',
    marginHorizontal: Space.sm,
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
