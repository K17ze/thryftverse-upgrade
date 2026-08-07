import React from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type * as MediaLibrary from 'expo-media-library/legacy';

import { Radius, Space } from '../../theme/designTokens';
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
  return (
    <View style={styles.container} pointerEvents="box-none">
      {/* Gallery strip + camera flip */}
      <View style={styles.bottomRow}>
        <AnimatedPressable
          style={styles.galleryThumb}
          onPress={onGalleryPress}
          scaleValue={0.95}
          activeOpacity={0.85}
          hapticFeedback="light"
          accessibilityLabel="Open gallery"
          accessibilityHint="Opens the photo gallery to select media"
          accessibilityRole="button"
        >
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
        </AnimatedPressable>

        {showCameraControls && (
          <AnimatedPressable
            style={styles.flipBtn}
            onPress={onRotateCamera || onFlipCamera}
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

      {/* Recent photos horizontal strip */}
      {recentPhotos.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.photoStrip}
          accessibilityRole="list"
          accessibilityLabel="Recent photos"
        >
          {recentPhotos.slice(0, 10).map((photo) => (
            <AnimatedPressable
              key={photo.id}
              style={styles.photoThumb}
              onPress={() => onRecentPhotoPress(photo.uri ?? '')}
              scaleValue={0.92}
              activeOpacity={0.85}
              hapticFeedback="light"
              accessibilityLabel="Recent photo"
              accessibilityHint="Selects this photo from your recent photos"
              accessibilityRole="button"
            >
              <Image source={{ uri: photo.uri ?? '' }} style={StyleSheet.absoluteFill} resizeMode="cover" />
            </AnimatedPressable>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: Space.lg,
    paddingHorizontal: Space.md,
    gap: 12,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: Space.sm,
  },
  galleryThumb: {
    width: 44,
    height: 44,
    borderRadius: Radius.lg,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  galleryOverlay: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 16,
    height: 16,
    borderRadius: Radius.md,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  flipBtn: {
    width: 44,
    height: 44,
    borderRadius: Radius.xxl,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoStrip: {
    gap: 8,
    paddingHorizontal: Space.md,
    paddingBottom: Space.xs,
  },
  photoThumb: {
    width: 56,
    height: 56,
    borderRadius: Radius.md,
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
});
