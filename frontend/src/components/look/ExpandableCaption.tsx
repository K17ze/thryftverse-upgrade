import React, { useState, useCallback, memo } from 'react';
import { Pressable, Text, StyleSheet } from 'react-native';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
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
  longThreshold = 140 }: ExpandableCaptionProps) {
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
      fontSize: TypographyV2.screenTitle.size,
      fontFamily: TypographyV2.screenTitle.fontFamily,
      color: colors.textPrimary,
      letterSpacing: TypographyV2.screenTitle.letterSpacing,
      lineHeight: TypographyV2.screenTitle.size + 6 },
    captionToggle: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textSecondary,
      marginTop: Space.xs } });
};
