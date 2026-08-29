import React, { useCallback } from 'react';
import {
  View,
  StyleSheet,
  Image,
  Pressable,
  Text,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import type * as MediaLibrary from 'expo-media-library/legacy';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
} from 'react-native-reanimated';
import { useHaptic } from '../../hooks/useHaptic';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { useMotionConfig } from '../../hooks/useMotionConfig';

import { Radius, Space, Typography, Type, Stroke, Control } from '../../theme/designTokens';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { AnimatedPressable } from '../AnimatedPressable';

interface BottomControlBarProps {
  onGalleryPress: () => void;
  onFlipCamera: () => void;
  recentPhotos: (MediaLibrary.Asset & { uri?: string })[];
  onRecentPhotoPress: (uri: string) => void;
  showCameraControls: boolean;
  onRotateCamera?: () => void;
}

export default function BottomControlBar({
  onGalleryPress,
  onFlipCamera,
  recentPhotos,
  onRecentPhotoPress,
  showCameraControls,
  onRotateCamera,
}: BottomControlBarProps) {
  const haptic = useHaptic();
  const reducedMotion = useReducedMotion();
  const { spring } = useMotionConfig();
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  // Gallery thumb spring scale for enhanced press feedback
  const galleryThumbScale = useSharedValue(1);
  const galleryThumbStyle = useAnimatedStyle(() => ({
    transform: [{ scale: galleryThumbScale.value }],
  }));

  const handleGalleryPressIn = () => {
    if (!reducedMotion) {
      galleryThumbScale.value = withSpring(0.95, spring.tap);
    }
  };
  const handleGalleryPressOut = () => {
    if (!reducedMotion) {
      galleryThumbScale.value = withSpring(1, spring.entrance);
    }
  };

  // FlashList v2 performance: memoized renderItem prevents full re-render of
  // all visible recent photo thumbnails on every parent state change.
  // (Audit §FlashList v2 / LIST_RENDERING_POLICY.md §3.1)
  const renderRecentPhotoItem = useCallback(
    ({ item, index }: { item: (typeof recentPhotos)[number]; index: number }) => (
      <AnimatedPressable
        style={styles.photoThumb}
        onPress={() => {
          haptic.light();
          onRecentPhotoPress(item.uri ?? '');
        }}
        scaleValue={0.92}
        activeOpacity={0.85}
        hapticFeedback="light"
        accessibilityLabel={`Recent photo ${index + 1}`}
        accessibilityHint="Selects this photo from your recent photos"
        accessibilityRole="button"
      >
        <Image source={{ uri: item.uri ?? '' }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      </AnimatedPressable>
    ),
    [styles, haptic, onRecentPhotoPress]
  );

  return (
    <View style={styles.container} pointerEvents="box-none">
      {/* Gallery strip + camera flip */}
      <View style={styles.bottomRow}>
        <Pressable
          onPress={onGalleryPress}
          onPressIn={handleGalleryPressIn}
          onPressOut={handleGalleryPressOut}
          accessibilityLabel="Open gallery"
          accessibilityHint="Opens the photo gallery to select media"
          accessibilityRole="button"
        >
          <Reanimated.View style={[styles.galleryThumb, galleryThumbStyle]}>
            {recentPhotos[0] ? (
              <Image
                source={{ uri: recentPhotos[0].uri ?? '' }}
                style={StyleSheet.absoluteFill}
                resizeMode="cover"
              />
            ) : (
              <Ionicons name="images-outline" size={20} color="#fff" />
            )}
            <View style={styles.galleryOverlay}>
              <Ionicons name="chevron-up" size={14} color="#fff" />
            </View>
          </Reanimated.View>
        </Pressable>

        {showCameraControls && (
          <AnimatedPressable
            style={styles.flipBtn}
            onPress={() => {
              haptic.medium();
              (onRotateCamera || onFlipCamera)();
            }}
            scaleValue={0.90}
            activeOpacity={0.85}
            hapticFeedback="medium"
            accessibilityLabel="Flip camera"
            accessibilityHint="Switches between front and back camera"
            accessibilityRole="button"
          >
            <Ionicons name="sync-outline" size={22} color="#fff" />
          </AnimatedPressable>
        )}
      </View>

      {/* Recent photos horizontal strip — spring snap-to-position */}
      {recentPhotos.length > 0 && (
        <FlashList
          horizontal
          data={recentPhotos.slice(0, 10)}
          keyExtractor={(item) => item.id}
          renderItem={renderRecentPhotoItem}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.photoStrip}
          decelerationRate="fast"
          snapToInterval={64}
          snapToAlignment="start"
          accessibilityRole="list"
          accessibilityLabel="Recent photos"
        />
      )}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: Space.lg,
    paddingHorizontal: Space.md,
    gap: Space.smMd,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: Space.sm,
  },
  galleryThumb: {
    width: Control.hit,
    height: Control.hit,
    borderRadius: Radius.lg,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: Stroke.standard,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  galleryOverlay: {
    position: 'absolute',
    bottom: Space.xxs,
    right: Space.xxs,
    width: 16,
    height: 16,
    borderRadius: Radius.md,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flipBtn: {
    width: Control.hit,
    height: Control.hit,
    borderRadius: Radius.xxl,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoStrip: {
    gap: Space.sm,
    paddingHorizontal: Space.md,
    paddingBottom: Space.xs,
  },
  photoThumb: {
    width: 56,
    height: 56,
    borderRadius: Radius.md,
    overflow: 'hidden',
    backgroundColor: colors.overlay,
  },
  });
}
