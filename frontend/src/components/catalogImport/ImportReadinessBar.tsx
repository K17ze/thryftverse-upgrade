import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
  cancelAnimation } from 'react-native-reanimated';
import { useAppTheme } from '../../theme/ThemeContext';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import {
  Space,
  Radius,
  FontFamily } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';

interface Props {
  phase: string;
  discoveredCount: number;
  readyCount: number;
}

const BAR_HEIGHT = 2;
const INDETERMINATE_FILL_WIDTH = 30; // percent
const INDETERMINATE_DURATION_MS = 1100;

const TERMINAL_PHASES = new Set(['completed', 'cancelled']);

/**
 * ImportReadinessBar — the thin progress bar for the import progress screen.
 *
 * Never fakes a percentage. When items have been discovered the fill is
 * determinate (readyCount / discoveredCount). Before any discovery the bar
 * runs a single indeterminate segment that slides across, gated by the
 * reduced-motion preference.
 */
export function ImportReadinessBar({
  phase,
  discoveredCount,
  readyCount }: Props) {
  const { colors } = useAppTheme();
  const reducedMotion = useReducedMotion();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  const isDeterminate = discoveredCount > 0;
  const isTerminal = TERMINAL_PHASES.has(phase);
  const isActive = !isTerminal;

  const translate = useSharedValue(-100);

  React.useEffect(() => {
    if (isDeterminate || !isActive || reducedMotion) {
      cancelAnimation(translate);
      translate.value = reducedMotion ? 0 : -100;
      return;
    }
    // Indeterminate: slide the 30% segment from -100% to 100% repeatedly.
    translate.value = withRepeat(
      withTiming(100, {
        duration: INDETERMINATE_DURATION_MS,
        easing: Easing.inOut(Easing.ease) }),
      -1, // infinite
      false // no reverse — reset to start each cycle
    );
    return () => {
      cancelAnimation(translate);
    };
  }, [isDeterminate, isActive, reducedMotion, translate]);

  const indeterminateFillStyle = useAnimatedStyle(() => {
    'worklet';
    return {
      transform: [{ translateX: `${translate.value}%` }] };
  });

  const determinatePct = isDeterminate
    ? Math.min(100, Math.max(0, (readyCount / discoveredCount) * 100))
    : 0;

  const caption = isTerminal
    ? null
    : isDeterminate
      ? `${readyCount} of ${discoveredCount} prepared`
      : phase;

  return (
    <View style={styles.container}>
      <View style={styles.track}>
        {isDeterminate ? (
          <View
            style={[styles.fill, { width: `${determinatePct}%` }]}
          />
        ) : isActive ? (
          reducedMotion ? (
            <View
              style={[
                styles.fill,
                { width: `${INDETERMINATE_FILL_WIDTH}%` },
              ]}
            />
          ) : (
            <Reanimated.View
              style={[
                styles.indeterminateFill,
                indeterminateFillStyle,
              ]}
            />
          )
        ) : null}
      </View>

      {caption ? (
        <Text style={styles.caption} numberOfLines={1}>
          {caption}
        </Text>
      ) : null}
    </View>
  );
}

const createStyles = (colors: ReturnType<typeof useAppTheme>['colors']) =>
  StyleSheet.create({
    container: {
      width: '100%',
      gap: Space.xs },
    track: {
      width: '100%',
      height: BAR_HEIGHT,
      borderRadius: Radius.full,
      backgroundColor: colors.brandSubtle,
      overflow: 'hidden' },
    fill: {
      height: '100%',
      borderRadius: Radius.full,
      backgroundColor: colors.brand },
    indeterminateFill: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      width: `${INDETERMINATE_FILL_WIDTH}%`,
      borderRadius: Radius.full,
      backgroundColor: colors.brand },
    caption: {
      fontFamily: FontFamily.regular,
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
      letterSpacing: TypographyV2.meta.letterSpacing,
      color: colors.textSecondary } });
