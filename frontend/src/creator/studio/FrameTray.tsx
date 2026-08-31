import React, { useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Space, FontFamily, Stroke } from '../../theme/designTokens';
import { IconGrammar } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { RadiusRoleValue } from '../../theme/surfaceRadiusRules';
import { useHaptic } from '../../hooks/useHaptic';
import { useAppTheme } from '../../theme/ThemeContext';
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
  const { colors } = useAppTheme();

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
              accessibilityHint="Switch frame. Long press for options."
              accessibilityRole="button"
              accessibilityState={{ selected: isActive }}
            >
              <View
                style={[
                  styles.thumb,
                  { backgroundColor: colors.scrimTextTertiary },
                  isActive && { borderColor: colors.brand, borderWidth: 2 },
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
                    <Ionicons name="image-outline" size={IconGrammar.metadata} color={colors.scrimTextSecondary} />
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
                    accessibilityHint="Trim and mute coming soon"
                    accessibilityRole="button"
                    hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                  >
                    <Ionicons name="play" size={8} color={colors.scrimTextPrimary} />
                    <Text style={[styles.durationText, { color: colors.scrimTextPrimary }]}>
                      {Math.ceil(durationMs / 1000)}s
                    </Text>
                  </Pressable>
                )}
                {/* Video trim info — inline text label on the frame */}
                {isVideo && videoInfoFrameIndex === i && (
                  <View style={[styles.videoInfoLabel, { backgroundColor: colors.mediaOverlayScrim }]} pointerEvents="none">
                    <Text style={[styles.videoInfoText, { color: colors.scrimTextPrimary }]}>
                      Trim and mute coming soon.
                    </Text>
                  </View>
                )}
              </View>
              {/* Frame number — subtle, below thumbnail */}
              <Text style={[
                styles.thumbLabel,
                { color: isActive ? colors.scrimTextPrimary : colors.scrimTextSecondary },
                isActive && styles.thumbLabelActive,
              ]}>
                {i + 1}
              </Text>
            </Pressable>
          );
        })}

        {/* Add frame button */}
        {pages.length < 10 && (
          <Pressable
            style={[styles.addBtn, { borderColor: colors.scrimTextTertiary }]}
            onPress={() => { haptic.light(); onAddPage(); }}
            hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
            accessibilityLabel="Add frame"
            accessibilityHint="Adds a new frame to the story"
            accessibilityRole="button"
          >
            <Ionicons name="add" size={IconGrammar.standard} color={colors.scrimTextSecondary} />
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
    overflow: 'hidden' },
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
    paddingHorizontal: 3,
    paddingVertical: 1,
    borderRadius: RadiusRoleValue.compactControl },
  durationText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.medium },
  videoInfoLabel: {
    position: 'absolute',
    top: 2,
    left: 2,
    right: 2,
    borderRadius: RadiusRoleValue.compactControl,
    paddingHorizontal: 4,
    paddingVertical: 3 },
  videoInfoText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.regular,
    lineHeight: 9,
    textAlign: 'center' },
  thumbLabel: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.medium },
  thumbLabelActive: {
    fontFamily: FontFamily.semibold },
  addBtn: {
    width: THUMB_WIDTH,
    height: THUMB_HEIGHT,
    borderRadius: RadiusRoleValue.compactControl,
    borderWidth: Stroke.standard,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center' } });
