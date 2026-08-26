import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Reanimated, {
  useAnimatedStyle,
  interpolate,
  Extrapolation,
  type SharedValue,
} from 'react-native-reanimated';
import { Space, FontFamily, LetterSpacing } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';

// ───────────────────────────────────────────────────────────────────────────
// Image pagination dots.
// A row of dots below the carousel; the active dot stretches into a pill.
// A single spring-driven SharedValue (activeIndex) interpolates each dot's
// width so the pill stretch feels physical, not snapped.
// ───────────────────────────────────────────────────────────────────────────
const DOT_INACTIVE = 6;
const DOT_ACTIVE = 20;
const DOT_HEIGHT = 6;

function PaginationDot({
  index,
  activeIndex,
  color,
}: {
  index: number;
  activeIndex: SharedValue<number>;
  color: string;
}) {
  const style = useAnimatedStyle(() => {
    const width = interpolate(
      activeIndex.value,
      [index - 0.5, index, index + 0.5],
      [DOT_INACTIVE, DOT_ACTIVE, DOT_INACTIVE],
      Extrapolation.CLAMP,
    );
    return {
      width,
      opacity: interpolate(
        activeIndex.value,
        [index - 0.5, index, index + 0.5],
        [0.35, 1, 0.35],
        Extrapolation.CLAMP,
      ),
    };
  });
  return (
    <Reanimated.View
      style={[paginationStyles.dot, { backgroundColor: color }, style]}
    />
  );
}

export function PaginationDots({
  count,
  activeIndex,
  counterText,
  color,
}: {
  count: number;
  activeIndex: SharedValue<number>;
  counterText?: string;
  color: string;
}) {
  return (
    <View style={paginationStyles.wrap}>
      <View style={paginationStyles.dotRow}>
        {Array.from({ length: count }, (_, i) => (
          <PaginationDot
            key={i}
            index={i}
            activeIndex={activeIndex}
            color={color}
          />
        ))}
      </View>
      {counterText ? (
        <Text style={[paginationStyles.counter, { color }]} numberOfLines={1}>
          {counterText}
        </Text>
      ) : null}
    </View>
  );
}

const paginationStyles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.sm,
    paddingVertical: Space.sm,
  },
  dotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },
  dot: {
    height: DOT_HEIGHT,
    borderRadius: DOT_HEIGHT / 2,
  },
  counter: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.medium,
    letterSpacing: LetterSpacing.wide,
    fontVariant: ['tabular-nums'],
  },
});
