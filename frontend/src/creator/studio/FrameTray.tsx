import React, { useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Space, FontFamily, Stroke } from '../../theme/designTokens';
import { IconGrammar } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { RadiusRoleValue } from '../../theme/surfaceRadiusRules';
import { useHaptic } from '../../hooks/useHaptic';
import type { CreatorPage } from '../composition';

// ── Poster Frame Tray ──────────────────────────────────────────────
// A compact horizontal filmstrip of 9:16 frame thumbnails that floats
// above the tool dock. Per doc 04:
//   - appears when document has >1 Poster page
//   - each frame thumbnail: 9:16 crop, video duration marker, active outline
//   - long-press for overflow (duplicate/delete/duration)
//   - collapsible to restore full-screen canvas
//
// The tray is media-dominant: thumbnails are the primary visual, chrome
// (active outline, duration badge) recedes. Transparent background with
// a subtle bottom gradient scrim for legibility.

const THUMB_WIDTH = 36;
const THUMB_HEIGHT = 64; // 9:16 ratio
const THUMB_GAP = 6;

export interface FrameTrayProps {
  pages: CreatorPage[];
  activePageIndex: number;
  onSelectPage: (index: number) => void;
  onLongPressPage: (index: number) => void;
  onAddPage: () => void;
  onCollapse: () => void;
  bottomOffset: number;
  onVideoBadgePress?: (index: number) => void;
  videoInfoFrameIndex?: number | null;
}

export function FrameTray({
  pages,
  activePageIndex,
  onSelectPage,
  onLongPressPage,
  onAddPage,
  onCollapse,
  bottomOffset,
  onVideoBadgePress,
  videoInfoFrameIndex }: FrameTrayProps) {
  const insets = useSafeAreaInsets();
  const haptic = useHaptic();

  const handleSelect = useCallback((index: number) => {
    if (index === activePageIndex) {
      haptic.light();
      onCollapse();
      return;
    }
    haptic.light();
    onSelectPage(index);
  }, [activePageIndex, haptic, onSelectPage, onCollapse]);

  const handleLongPress = useCallback((index: number) => {
    haptic.medium();
    onLongPressPage(index);
  }, [haptic, onLongPressPage]);

  return (
    <View style={[styles.container, { bottom: bottomOffset }]} pointerEvents="box-none">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        pointerEvents="box-none"
      >
        {pages.map((page, i) => {
          const mediaLayer = page.layers.find((l) => l.type === 'media');
          const isActive = i === activePageIndex;
          const isVideo = mediaLayer?.payload?.mediaType === 'video';
          const durationMs = page.durationMs ?? (mediaLayer?.payload?.videoDurationMs as number | undefined);

          return (
            <Pressable
              key={page.id}
              style={styles.thumbTarget}
              onPress={() => handleSelect(i)}
              onLongPress={() => handleLongPress(i)}
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
              accessibilityLabel={`Frame ${i + 1}${isActive ? ', active' : ''}`}
              accessibilityHint="Switches to this frame. Long press for frame options."
              accessibilityRole="button"
              accessibilityState={{ selected: isActive }}
            >
              <View
                style={[
                  styles.thumb,
                  isActive && styles.thumbActive,
                ]}
              >
                {mediaLayer?.payload?.mediaUri ? (
                  <Image
                    source={{ uri: mediaLayer.payload.mediaUri }}
                    style={styles.thumbImage}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={styles.thumbPlaceholder}>
                    <Ionicons name="image-outline" size={IconGrammar.metadata} color="rgba(255,255,255,0.4)" />
                  </View>
                )}
                {/* Video duration marker — tappable to show trim info */}
                {isVideo && durationMs != null && (
                  <Pressable
                    style={styles.durationBadge}
                    onPress={(e) => {
                      e.stopPropagation();
                      haptic.light();
                      onVideoBadgePress?.(i);
                    }}
                    accessibilityLabel={`Video frame ${i + 1}, ${Math.ceil(durationMs / 1000)} seconds`}
                    accessibilityHint="Video trim and mute will be available in a future update"
                    accessibilityRole="button"
                    hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                  >
                    <Ionicons name="play" size={8} color="#fff" />
                    <Text style={styles.durationText}>
                      {Math.ceil(durationMs / 1000)}s
                    </Text>
                  </Pressable>
                )}
                {/* Video trim info — inline text label on the frame */}
                {isVideo && videoInfoFrameIndex === i && (
                  <View style={styles.videoInfoLabel} pointerEvents="none">
                    <Text style={styles.videoInfoText}>
                      Video trim and mute will be available in a future update. The full clip will be used.
                    </Text>
                  </View>
                )}
              </View>
              {/* Frame number — subtle, below thumbnail */}
              <Text style={[styles.thumbLabel, isActive && styles.thumbLabelActive]}>
                {i + 1}
              </Text>
            </Pressable>
          );
        })}

        {/* Add frame button */}
        {pages.length < 10 && (
          <Pressable
            style={styles.addBtn}
            onPress={() => { haptic.light(); onAddPage(); }}
            hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
            accessibilityLabel="Add frame"
            accessibilityHint="Adds a new frame to the story"
            accessibilityRole="button"
          >
            <Ionicons name="add" size={IconGrammar.standard} color="rgba(255,255,255,0.7)" />
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 96 },
  scrollContent: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: THUMB_GAP,
    paddingHorizontal: Space.md,
    paddingVertical: Space.xs },
  thumbTarget: {
    alignItems: 'center',
    gap: 2 },
  thumb: {
    width: THUMB_WIDTH,
    height: THUMB_HEIGHT,
    borderRadius: RadiusRoleValue.compactControl,
    overflow: 'hidden',
    borderWidth: Stroke.emphasis,
    borderColor: 'transparent',
    backgroundColor: 'rgba(255,255,255,0.08)' },
  thumbActive: {
    borderColor: '#fff',
    borderWidth: 2 },
  thumbImage: {
    width: '100%',
    height: '100%' },
  thumbPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center' },
  durationBadge: {
    position: 'absolute',
    bottom: 2,
    left: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 3,
    paddingVertical: 1,
    borderRadius: RadiusRoleValue.compactControl },
  durationText: {
    color: '#fff',
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.medium },
  videoInfoLabel: {
    position: 'absolute',
    top: 2,
    left: 2,
    right: 2,
    backgroundColor: 'rgba(0,0,0,0.85)',
    borderRadius: RadiusRoleValue.compactControl,
    paddingHorizontal: 4,
    paddingVertical: 3 },
  videoInfoText: {
    color: '#fff',
    fontSize: 7,
    fontFamily: FontFamily.regular,
    lineHeight: 9,
    textAlign: 'center' },
  thumbLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.medium },
  thumbLabelActive: {
    color: '#fff',
    fontFamily: FontFamily.semibold },
  addBtn: {
    width: THUMB_WIDTH,
    height: THUMB_HEIGHT,
    borderRadius: RadiusRoleValue.compactControl,
    borderWidth: Stroke.standard,
    borderColor: 'rgba(255,255,255,0.2)',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center' } });
