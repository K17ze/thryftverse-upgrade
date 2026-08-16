/**
 * EffectPreviewThumb — a small thumbnail showing a filter preset applied to
 * the actual media being edited.
 *
 * Replaces abstract filter names with real-media previews so creators can
 * see the effect before committing (reconstruction spec).
 *
 * Per AGENTS.md §4: authored composition, clear hierarchy, restraint.
 * Per AGENTS.md §13/§18: light haptic on press, suppressed under reduced
 * motion.
 */
import React, { useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, type ImageStyle } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { Space, FontSize, FontFamily, Radius, Stroke, Control } from '../../../theme/designTokens';
import { useAppTheme } from '../../../theme/ThemeContext';
import { useHaptic } from '../../../hooks/useHaptic';
import { useReducedMotion } from '../../../hooks/useReducedMotion';
import type { EffectPreset } from './EffectTypes';

export interface EffectPreviewThumbProps {
  sourceUri: string;
  preset: EffectPreset;
  selected: boolean;
  onPress: () => void;
  /** Thumbnail edge length in pt. Default 64. */
  size?: number;
}

/**
 * Render a 64×64pt (default) media thumbnail with the preset's CSS filter
 * applied. Selected state shows a 2pt brand border; unselected is borderless.
 * The 44pt touch target is enforced via the Pressable wrapper.
 */
export function EffectPreviewThumb({
  sourceUri,
  preset,
  selected,
  onPress,
  size = 64,
}: EffectPreviewThumbProps) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const reducedMotion = useReducedMotion();

  const handlePress = useCallback(() => {
    if (!reducedMotion) haptic.light();
    onPress();
  }, [haptic, onPress, reducedMotion]);

  const hasFilter = Boolean(preset.cssFilter) && preset.cssFilter !== 'none';

  // expo-image accepts CSS filter strings via the style `filter` property on
  // web; on native the property is ignored gracefully. RN's ImageStyle type
  // does not declare `filter`, so we cast through unknown.
  const imageStyle = {
    width: size,
    height: size,
    borderRadius: Radius.md,
    ...(hasFilter ? { filter: preset.cssFilter } : {}),
  } as unknown as ImageStyle;

  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${preset.name} filter preview`}
      style={({ pressed }) => [
        styles.touch,
        { opacity: pressed ? 0.85 : 1 },
      ]}
    >
      <View
        style={[
          styles.thumbWrap,
          {
            width: size,
            height: size,
            borderRadius: Radius.md,
            borderColor: selected ? colors.brand : 'transparent',
            borderWidth: selected ? Stroke.emphasis : 0,
          },
        ]}
      >
        <ExpoImage
          source={sourceUri}
          style={imageStyle}
          contentFit="cover"
          recyclingKey={preset.id}
          transition={0}
        />
      </View>
      <Text
        style={[
          styles.label,
          {
            color: selected ? colors.textPrimary : colors.textMuted,
            fontFamily: FontFamily.regular,
          },
        ]}
        numberOfLines={1}
      >
        {preset.name}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  touch: {
    alignItems: 'center',
    minWidth: Control.hit,
    minHeight: Control.hit,
    justifyContent: 'center',
  },
  thumbWrap: {
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
  image: {
    backgroundColor: 'transparent',
  },
  label: {
    fontSize: FontSize.micro,
    lineHeight: FontSize.micro + 4,
    textAlign: 'center',
    marginTop: Space.xs,
  },
});
