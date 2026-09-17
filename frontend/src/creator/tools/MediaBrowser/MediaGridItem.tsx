/**
 * Grid cells for the MediaBrowser sheet: MediaGridItem (asset thumbnail
 * with spring press feedback + selection badge) and CameraTile (the
 * first-position camera shortcut).
 *
 * Extracted from MediaBrowserSheet — pure extraction, no behavior change.
 */
import React, { useEffect } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Image } from 'expo-image';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  interpolate,
  Extrapolation } from 'react-native-reanimated';
import { Stroke } from '../../../theme/designTokens';
import type { ThemeColors } from '../../../theme/ThemeContext';
import { PressScale } from '../../shared/CreatorAnimations';
import { useMotionConfig } from '../../../hooks/useMotionConfig';
import { useReducedMotion } from '../../../hooks/useReducedMotion';
import { AppIcon } from '../../../components/common/AppIcon';
import { IconSize } from '../../../theme/iconTokens';
import { formatDuration, type MediaAsset } from './mediaBrowserTypes';
import type { MediaBrowserStyles } from './mediaBrowserStyles';

// ── MediaGridItem — spring press feedback + selection badge ─────────

interface MediaGridItemProps {
  asset: MediaAsset;
  isSelected: boolean;
  selectionOrder: number;
  onPress: () => void;
  onLongPress: () => void;
  colors: ThemeColors;
  styles: MediaBrowserStyles;
}

export function MediaGridItem({
  asset,
  isSelected,
  selectionOrder,
  onPress,
  onLongPress,
  colors,
  styles }: MediaGridItemProps) {
  const reduceMotion = useReducedMotion();
  const { spring } = useMotionConfig();
  const pressedSV = useSharedValue(0);
  const badgeScaleSV = useSharedValue(isSelected ? 1 : 0);

  useEffect(() => {
    if (isSelected) {
      badgeScaleSV.value = reduceMotion ? 1 : withSpring(1, spring.success);
    } else {
      badgeScaleSV.value = reduceMotion ? 0 : withSpring(0, spring.tap);
    }
  }, [isSelected, reduceMotion, spring, badgeScaleSV]);

  const pressStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: interpolate(pressedSV.value, [0, 1], [1, 0.95], Extrapolation.CLAMP) },
    ] }));

  const badgeStyle = useAnimatedStyle(() => ({
    transform: [{ scale: badgeScaleSV.value }],
    opacity: badgeScaleSV.value }));

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={() => { pressedSV.value = withSpring(1, spring.tap); }}
      onPressOut={() => { pressedSV.value = withSpring(0, spring.tap); }}
      accessibilityLabel={`Select ${asset.mediaType}${isSelected ? `, selected ${selectionOrder}` : ''}`}
      accessibilityHint="Selects this item; long-press to preview"
      accessibilityRole="button"
      accessibilityState={{ selected: isSelected }}
      hitSlop={{ top: 2, bottom: 2, left: 2, right: 2 }}
    >
      <Reanimated.View
        style={[
          styles.mediaGridCell,
          isSelected && { borderColor: colors.brand, borderWidth: Stroke.emphasis },
          pressStyle,
        ]}
      >
        <Image
          source={{ uri: asset.uri }}
          style={styles.mediaGridThumb}
          contentFit="cover"
          transition={120}
          recyclingKey={asset.id}
        />
        {asset.mediaType === 'video' && (
          <View style={styles.mediaGridVideoBadge}>
            <AppIcon name="play" size={IconSize.xs} color="textInverse" opticalCenter={true} accessible={false} />
            {asset.durationMs != null && (
              <Text style={styles.mediaGridDuration}>
                {formatDuration(asset.durationMs)}
              </Text>
            )}
          </View>
        )}
        {isSelected && (
          <Reanimated.View
            style={[styles.mediaGridSelectionBadge, { backgroundColor: colors.brand }, badgeStyle]}
          >
            <Text style={[styles.mediaGridSelectionText, { color: colors.textInverse }]}>
              {selectionOrder}
            </Text>
          </Reanimated.View>
        )}
      </Reanimated.View>
    </Pressable>
  );
}

// ── CameraTile — first grid position, opens camera ──────────────────

interface CameraTileProps {
  onPress: () => void;
  colors: ThemeColors;
  styles: MediaBrowserStyles;
}

export function CameraTile({ onPress, colors, styles }: CameraTileProps) {
  return (
    <PressScale
      onPress={onPress}
      style={[styles.mediaGridCell, styles.cameraTile, { backgroundColor: colors.brandSubtle }]}
      accessibilityLabel="Take photo with camera"
      accessibilityHint="Opens the camera to capture a new photo"
      hitSlop={{ top: 2, bottom: 2, left: 2, right: 2 }}
    >
      <AppIcon name="camera-outline" size={IconSize.hero} color="brand" opticalCenter={true} accessible={false} />
    </PressScale>
  );
}
