import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, { FadeIn } from 'react-native-reanimated';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { AnimatedPressable } from './AnimatedPressable';
import { Space, Radius } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { useReducedMotion } from '../hooks/useReducedMotion';

interface RetryStateProps {
  onRetry: () => void;
  message?: string;
}

export function RetryState({ onRetry, message = 'Something went wrong.' }: RetryStateProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const reducedMotionEnabled = useReducedMotion();
  const enter = reducedMotionEnabled ? undefined : FadeIn.duration(300);

  return (
    <View style={styles.container}>
      <Reanimated.View entering={enter} style={styles.iconBox}>
        <Ionicons name="warning-outline" size={64} color={colors.danger} />
      </Reanimated.View>

      <Reanimated.Text entering={enter} style={styles.title}>
        Couldn't load
      </Reanimated.Text>

      <Reanimated.Text entering={enter} style={styles.subtext}>
        {message}
      </Reanimated.Text>

      <Reanimated.View entering={enter}>
        <AnimatedPressable style={styles.retryBtn} onPress={onRetry}>
          <Text style={styles.retryBtnText}>Try Again</Text>
        </AnimatedPressable>
      </Reanimated.View>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: colors.background,
      paddingHorizontal: 40 },
    iconBox: {
      width: 120,
      height: 120,
      borderRadius: Radius.full,
      backgroundColor: colors.surfaceAlt,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: Space.lg },
    title: {
      fontSize: TypographyV2.priceHero.size,
      fontFamily: TypographyV2.priceHero.fontFamily,
      color: colors.textPrimary,
      marginBottom: 12 },
    subtext: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      color: colors.textSecondary,
      textAlign: 'center',
      marginBottom: 40,
      lineHeight: 22 },
    retryBtn: {
      backgroundColor: colors.textPrimary,
      paddingHorizontal: 40,
      paddingVertical: 18,
      borderRadius: Radius.xxl },
    retryBtnText: {
      color: colors.background,
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily } });
}
