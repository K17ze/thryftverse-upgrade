import React from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Radius, Space, Stroke} from '../../theme/designTokens';
import { IconGrammar } from '../../theme/designTokens';
import { useHaptic } from '../../hooks/useHaptic';
import { useAppTheme } from '../../theme/ThemeContext';

// 2026 Apple HIG: gallery thumbnail is a compact 44pt — large enough to
// read the last capture, small enough to keep the viewfinder dominant.
// Near-square corners (2px) for an editorial feel. The hit zone is 44pt
// (meets touch-target minimum).
const GALLERY_THUMB_SIZE = 44;
const RECENT_THUMB_SIZE = 40;

export interface GalleryCarouselProps {
  /** Most recent gallery image URI (shown as the 44×44 thumbnail). */
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
  /** Called when a specific recent photo is tapped. When provided, tapping
   * a recent photo opens that photo directly instead of the general gallery. */
  onRecentPhotoPress?: (uri: string) => void;
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
  onRecentPhotoPress,
}: GalleryCarouselProps) {
  const haptic = useHaptic();
  const { colors } = useAppTheme();

  return (
    <>
      {/* Recent photos carousel (long-press gallery) */}
      {showRecentCarousel && recentImages.length > 1 && (
        <View style={[styles.recentCarousel, { bottom: carouselBottom, backgroundColor: colors.mediaOverlayScrim }]} pointerEvents="box-none">
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
                  if (onRecentPhotoPress) {
                    onRecentPhotoPress(uri);
                  } else {
                    onGallery();
                  }
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

      {/* Gallery thumbnail — the thumbnail IS the label (Snapchat/Instagram
          pattern). No "Gallery" text below: a text label under an obvious
          gallery thumbnail is label-everything disease (AGENTS.md §4).
          44pt near-square thumbnail, flat — no border unless selected.
          The hit zone is 44pt (meets the touch-target minimum). When no
          recent image exists, a transparent 44pt target with a 24pt glyph
          — no bordered placeholder box (visible containment without
          meaning is banned). */}
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
          // Transparent 44pt target + glyph only. No fill, no bordered box.
          // The glyph reads as "gallery" on its own over the dark preview.
          <View style={styles.galleryGlyphTarget}>
            <Ionicons name="images-outline" size={IconGrammar.hero} color={colors.scrimTextPrimary} />
          </View>
        )}
      </Pressable>
    </>
  );
}

const styles = StyleSheet.create({
  // Camera overlay — thumbnails are flat (no card containers, no borders
  // unless selected). Selected thumbnail gets a 2pt brand border applied
  // inline; unselected thumbnails have no border.
  recentCarousel: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    // backgroundColor applied inline via colors.mediaOverlayScrim (theme token)
    borderRadius: 16,
    paddingVertical: Space.sm,
  },
  recentCarouselContent: {
    paddingHorizontal: Space.md,
    gap: Space.sm,
  },
  recentThumbWrap: {
    borderRadius: Radius.sm,
    overflow: 'hidden',
  },
  recentThumb: {
    width: RECENT_THUMB_SIZE,
    height: RECENT_THUMB_SIZE,
    borderRadius: Radius.sm,
  },
  galleryBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    width: GALLERY_THUMB_SIZE,
    minHeight: GALLERY_THUMB_SIZE,
  },
  // 44pt near-square thumbnail — flat, no border unless selected.
  // Selected: 2pt colors.brand border (applied inline). Unselected: no border.
  galleryThumb: {
    width: GALLERY_THUMB_SIZE,
    height: GALLERY_THUMB_SIZE,
    borderRadius: 2,
  },
  // Transparent 44pt target for the no-recent-image state. No fill, no border —
  // the glyph alone communicates "gallery" over the dark camera preview.
  // Visible containment without meaning is banned (AGENTS.md §4).
  galleryGlyphTarget: {
    width: GALLERY_THUMB_SIZE,
    height: GALLERY_THUMB_SIZE,
    borderRadius: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.97 }],
  },
});
