import React from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Typography, Radius, Type, Space } from '../../theme/designTokens';
import { useHaptic } from '../../hooks/useHaptic';

// 2026 Apple HIG: gallery thumbnail is a compact 44pt — large enough to
// read the last capture, small enough to keep the viewfinder dominant.
// Rounded corners (Radius.md) instead of a full circle for a calmer,
// more editorial feel. The hit zone is 44pt (meets touch-target minimum).
const GALLERY_THUMB_SIZE = 44;

export interface GalleryCarouselProps {
  /** Most recent gallery image URI (shown as the 64×64 thumbnail). */
  lastImageUri: string | null;
  /** Recent gallery image URIs for the long-press carousel. */
  recentImages: string[];
  /** Whether the recent-photos carousel is currently expanded. */
  showRecentCarousel: boolean;
  /** Bottom offset (safe-area + bottom-bar clearance) for the carousel. */
  carouselBottom: number;
  /** Called when the thumbnail is tapped. */
  onGallery: () => void;
  /** Called when the thumbnail is long-pressed (toggles the carousel). */
  onLongPress: () => void;
}

/**
 * Gallery thumbnail (64×64) with an expandable recent-photos carousel.
 *
 * The thumbnail is the canonical gallery entry point in the bottom bar. A
 * long-press expands a horizontal carousel of the most recent photos so the
 * user can jump straight to a recent capture. When no recent image is
 * available a restrained placeholder (images-outline) is shown.
 */
export function GalleryCarousel({
  lastImageUri,
  recentImages,
  showRecentCarousel,
  carouselBottom,
  onGallery,
  onLongPress,
}: GalleryCarouselProps) {
  const haptic = useHaptic();

  return (
    <>
      {/* Recent photos carousel (long-press gallery) */}
      {showRecentCarousel && recentImages.length > 1 && (
        <View style={[styles.recentCarousel, { bottom: carouselBottom }]} pointerEvents="box-none">
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.recentCarouselContent}
          >
            {recentImages.map((uri, i) => (
              <Pressable
                key={`${uri}-${i}`}
                style={({ pressed }) => [styles.recentThumbWrap, pressed && styles.btnPressed]}
                onPress={() => {
                  haptic.selection();
                  onGallery();
                }}
                hitSlop={12}
                accessibilityLabel={`Recent photo ${i + 1}`}
                accessibilityRole="button"
              >
                <Image source={{ uri }} style={styles.recentThumb} />
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Gallery thumbnail — 64×64 with long-press for recent carousel */}
      <Pressable
        style={styles.galleryBtn}
        onPress={onGallery}
        onLongPress={onLongPress}
        hitSlop={16}
        accessibilityLabel="Choose photos from gallery"
        accessibilityRole="button"
      >
        {lastImageUri ? (
          <Image source={{ uri: lastImageUri }} style={styles.galleryThumb} />
        ) : (
          <View style={styles.galleryThumbPlaceholder}>
            {/* Camera overlay — always high contrast on dark preview */}
            <Ionicons name="images-outline" size={24} color="rgba(255,255,255,0.6)" />
          </View>
        )}
        <Text style={styles.bottomLabel}>Gallery</Text>
      </Pressable>
    </>
  );
}

const styles = StyleSheet.create({
  // Camera overlay — always high contrast on dark preview. The theme has no
  // `textOnMedia` token; textPrimary/border resolve to black in light mode
  // (invisible on the dark camera preview), so overlay whites are retained.
  recentCarousel: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  recentCarouselContent: {
    paddingHorizontal: Space.md,
    gap: Space.sm,
  },
  recentThumbWrap: {
    borderRadius: Radius.lg,
    overflow: 'hidden',
  },
  recentThumb: {
    width: 48,
    height: 48,
    borderRadius: Radius.md,
  },
  galleryBtn: {
    alignItems: 'center',
    gap: Space.xs,
    width: 56,
    minHeight: 56,
    justifyContent: 'center',
  },
  // 44pt rounded-rect thumbnail — calmer than a circle, still clearly tappable.
  galleryThumb: {
    width: GALLERY_THUMB_SIZE,
    height: GALLERY_THUMB_SIZE,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.9)',
  },
  galleryThumbPlaceholder: {
    width: GALLERY_THUMB_SIZE,
    height: GALLERY_THUMB_SIZE,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomLabel: {
    fontFamily: Typography.family.medium,
    fontSize: 10.5,
    color: 'rgba(255,255,255,0.7)',
  },
  btnPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.97 }],
  },
});
