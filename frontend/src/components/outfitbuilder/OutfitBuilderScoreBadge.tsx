import React, { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing } from 'react-native-reanimated';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Radius, Space, Stroke, Typography } from '../../theme/designTokens';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { T } from '../ui/Text';

export interface OutfitBuilderScoreBadgeProps {
  score: number;
}

function OutfitBuilderScoreBadgeImpl({ score }: OutfitBuilderScoreBadgeProps) {
  const { colors } = useAppTheme();
  const reducedMotion = useReducedMotion();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const scale = useSharedValue(1);
  React.useEffect(() => {
    if (reducedMotion) {
      scale.value = 1;
      return;
    }
    scale.value = withTiming(1.12, { duration: 150, easing: Easing.out(Easing.quad) });
    const t = setTimeout(() => {
      scale.value = withTiming(1, { duration: 150, easing: Easing.inOut(Easing.quad) });
    }, 200);
    return () => clearTimeout(t);
  }, [score, reducedMotion]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }] }));

  const scoreColor = score >= 80 ? colors.success : score >= 50 ? colors.brand : colors.danger;

  return (
    <Reanimated.View style={[styles.badge, { borderColor: scoreColor }, animStyle]}>
      <T.Caption color={scoreColor} style={{ fontFamily: Typography.family.bold }}>
        {score}
      </T.Caption>
    </Reanimated.View>
  );
}

export const OutfitBuilderScoreBadge = React.memo(OutfitBuilderScoreBadgeImpl);

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  badge: {
    width: Space.xl + Space.sm,
    height: Space.xl + Space.sm,
    borderRadius: Radius.xxl,
    borderWidth: Stroke.emphasis,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.surface } });
}
