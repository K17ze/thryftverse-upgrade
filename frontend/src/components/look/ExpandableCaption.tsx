import React, { useState, useCallback, memo } from 'react';
import { Pressable, Text, StyleSheet } from 'react-native';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Type, Typography } from '../../theme/designTokens';
import { useHaptic } from '../../hooks/useHaptic';

export interface ExpandableCaptionProps {
  text: string;
  /** Character threshold for showing the More/Less toggle. */
  longThreshold?: number;
}

/**
 * Expandable caption with its own expanded state.
 * Tapping More/Less doesn't re-render the parent FlashList header.
 */
function ExpandableCaptionImpl({
  text,
  longThreshold = 140,
}: ExpandableCaptionProps) {
  const { colors } = useAppTheme();
  const styles = useCaptionStyles(colors);
  const haptic = useHaptic();
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > longThreshold;

  const handleToggle = useCallback(() => {
    if (!isLong) return;
    haptic.light();
    setExpanded((v) => !v);
  }, [isLong, haptic]);

  if (!text) return null;

  return (
    <Pressable
      onPress={handleToggle}
      disabled={!isLong}
      accessibilityRole={isLong ? 'button' : undefined}
      accessibilityLabel={expanded ? 'Collapse caption' : 'Expand caption'}
    >
      <Text
        style={styles.caption}
        numberOfLines={expanded || !isLong ? undefined : 3}
      >
        {text}
      </Text>
      {isLong && (
        <Text style={styles.captionToggle}>
          {expanded ? 'Less' : 'More'}
        </Text>
      )}
    </Pressable>
  );
}

export const ExpandableCaption = memo(ExpandableCaptionImpl);

const useCaptionStyles = (colors: ThemeColors) => {
  return StyleSheet.create({
    caption: {
      fontSize: Type.title.size,
      fontFamily: Typography.family.bold,
      color: colors.textPrimary,
      letterSpacing: Type.title.letterSpacing,
      lineHeight: Type.title.size + 6,
    },
    captionToggle: {
      fontSize: Type.meta.size,
      fontFamily: Typography.family.semibold,
      color: colors.textSecondary,
      marginTop: Space.xs,
    },
  });
};
