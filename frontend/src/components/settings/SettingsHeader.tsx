import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { Space, Radius, Type } from '../../theme/designTokens';
import { AnimatedPressable } from '../AnimatedPressable';
import { Typography } from '../../constants/typography';

interface SettingsHeaderProps {
  title: string;
  onBack: () => void;
  rightAction?: React.ReactNode;
  style?: ViewStyle;
  subtitle?: string;
}

export function SettingsHeader({ title, onBack, rightAction, style, subtitle }: SettingsHeaderProps) {
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
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>
        ) : null}
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
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    minHeight: 64,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    backgroundColor: Colors.glassBg,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 0.5,
    borderColor: Colors.glassBorder,
  },
  titleContainer: {
    flex: 1,
    alignItems: 'center',
    marginHorizontal: Space.sm,
  },
  title: {
    fontSize: Type.subtitle.size,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
    letterSpacing: Type.subtitle.letterSpacing,
    lineHeight: Type.subtitle.lineHeight,
  },
  subtitle: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    marginTop: 2,
    letterSpacing: Type.caption.letterSpacing,
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
