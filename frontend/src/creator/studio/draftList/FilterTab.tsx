/**
 * FilterTab — underline filter tab for CreatorDraftListScreen.
 * Extracted verbatim from CreatorDraftListScreen.tsx.
 */
import React, { useEffect } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring } from 'react-native-reanimated';
import { Space, Typography, Stroke, IconGrammar } from '../../../theme/designTokens';
import { TypographyV2 } from '../../../theme/typography.v2';
import type { ThemeColors } from '../../../theme/ThemeContext';
import { Motion } from '../../../theme/motionTokens';

// ── Underline filter tab ────────────────────────────────────────────
// Replaces pill-background chips/pills with text-only tabs + 2pt spring-
// animated underline indicator (brand color, Stroke.emphasis).
interface FilterTabProps {
  label: string;
  isActive: boolean;
  onPress: () => void;
  colors: ThemeColors;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  accessibilityLabel: string;
  accessibilityHint?: string;
}

export function FilterTab({ label, isActive, onPress, colors, icon, accessibilityLabel, accessibilityHint }: FilterTabProps) {
  const underlineOpacity = useSharedValue(isActive ? 1 : 0);

  useEffect(() => {
    underlineOpacity.value = withSpring(isActive ? 1 : 0, Motion.spring.indicator);
  }, [isActive, underlineOpacity]);

  const underlineStyle = useAnimatedStyle(() => ({
    opacity: underlineOpacity.value }));

  return (
    <Pressable
      onPress={onPress}
      accessibilityHint={accessibilityHint}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      style={({ pressed }) => [
        {
          paddingHorizontal: Space.md,
          paddingVertical: Space.sm,
          alignItems: 'center',
          marginRight: Space.xs },
        pressed && { opacity: 0.7 },
      ]}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: Space.xxs }}>
        {icon && (
          <Ionicons
            name={icon}
            size={IconGrammar.metadata}
            color={isActive ? colors.textPrimary : colors.textSecondary}
          />
        )}
        <Text
          style={{
            fontFamily: Typography.family.semibold,
            fontSize: TypographyV2.body.size,
            color: isActive ? colors.textPrimary : colors.textSecondary }}
          numberOfLines={1}
        >
          {label}
        </Text>
      </View>
      <Reanimated.View
        style={[
          {
            height: Stroke.emphasis,
            backgroundColor: colors.brand,
            width: '100%',
            marginTop: Space.xxs },
          underlineStyle,
        ]}
      />
    </Pressable>
  );
}
