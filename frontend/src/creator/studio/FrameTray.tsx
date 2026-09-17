import React, { useCallback, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Image, AccessibilityInfo } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, runOnJS, type SharedValue } from 'react-native-reanimated';
import { Space, FontFamily, Stroke } from '../../theme/designTokens';
import { IconGrammar } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { RadiusRoleValue } from '../../theme/surfaceRadiusRules';
import { useHaptic } from '../../hooks/useHaptic';
import { useAppTheme } from '../../theme/ThemeContext';
import type { CreatorPage } from '../core/projectStore/composition';

// ── Poster Frame Tray ──────────────────────────────────────────────
// A compact horizontal filmstrip of 9:16 frame thumbnails that floats
// above the tool dock. Per doc 04:
//   - appears when document has >1 Poster page
//   - each frame thumbnail: 9:16 crop, video duration marker, active outline
//   - long-press for overflow (duplicate/delete/duration)
//   - collapsible to restore full-screen canvas
//
// Reorder grammar (Snapchat/IG): hold a thumb to lift it, drag to the
// target slot — neighbours shift live on the UI thread — release to
// commit a single reorderPages call. A hold that never moves still
// opens the frame overflow menu, so both gestures share the press.
//
// The tray is media-dominant: thumbnails are the primary visual, chrome
// (active outline, duration badge) recedes. Transparent background with
// a subtle bottom gradient scrim for legibility.

const THUMB_WIDTH = 36;
const THUMB_HEIGHT = 64; // 9:16 ratio
const THUMB_GAP = 6;
const STRIDE = THUMB_WIDTH + THUMB_GAP;
const DRAG_HOLD_MS = 300;
const MENU_HOLD_MS = 600;

export interface FrameTrayProps {
  pages: CreatorPage[];
  activePageIndex: number;
  onSelectPage: (index: number) => void;
  onLongPressPage: (index: number) => void;
  onAddPage: () => void;
  onCollapse: () => void;
  bottomOffset: number;
  onReorderPage?: (from: number, to: number) => void;
  onVideoBadgePress?: (index: number) => void;
  videoInfoFrameIndex?: number | null;
}

interface FrameThumbProps {
  index: number;
  pageCount: number;
  page: CreatorPage;
  isActive: boolean;
  videoInfoOpen: boolean;
  dragFrom: SharedValue<number>;
  dragTarget: SharedValue<number>;
  dragX: SharedValue<number>;
  dragMoved: SharedValue<number>;
  onSelect: (index: number) => void;
  onMenuPress: (index: number) => void;
  onDragStart: () => void;
  onDragMoved: () => void;
  onSlotChange: () => void;
  onDragCommit: (from: number, to: number) => void;
  onVideoBadgePress?: (index: number) => void;
}

function FrameThumb({
  index,
  pageCount,
  page,
  isActive,
  videoInfoOpen,
  dragFrom,
  dragTarget,
  dragX,
  dragMoved,
  onSelect,
  onMenuPress,
  onDragStart,
  onDragMoved,
  onSlotChange,
  onDragCommit,
  onVideoBadgePress }: FrameThumbProps) {
  const haptic = useHaptic();
  const { colors } = useAppTheme();

  const mediaLayer = page.layers.find((l) => l.type === 'media');
  const isVideo = mediaLayer?.payload?.mediaType === 'video';
  const durationMs = page.durationMs ?? (mediaLayer?.payload?.videoDurationMs as number | undefined);

  const pan = Gesture.Pan()
    .activateAfterLongPress(DRAG_HOLD_MS)
    .onStart(() => {
      'worklet';
      dragFrom.value = index;
      dragTarget.value = index;
      dragX.value = 0;
      dragMoved.value = 0;
      runOnJS(onDragStart)();
    })
    .onChange((e) => {
      'worklet';
      dragX.value = e.translationX;
      // Any deliberate horizontal travel marks this hold as a reorder
      // gesture — the overflow menu (600ms long-press) must not open
      // mid-drag, even before the first slot boundary is crossed.
      if (dragMoved.value === 0 && Math.abs(e.translationX) > 8) {
        dragMoved.value = 1;
        runOnJS(onDragMoved)();
      }
      const t = Math.max(0, Math.min(pageCount - 1, Math.round((index * STRIDE + e.translationX) / STRIDE)));
      if (t !== dragTarget.value) {
        dragTarget.value = t;
        runOnJS(onSlotChange)();
      }
    })
    .onEnd(() => {
      'worklet';
      const target = dragTarget.value;
      runOnJS(onDragCommit)(index, target);
    })
    .onFinalize(() => {
      'worklet';
      dragFrom.value = -1;
      dragX.value = 0;
    });

  const longPress = Gesture.LongPress()
    .minDuration(MENU_HOLD_MS)
    .onStart(() => {
      'worklet';
      runOnJS(onMenuPress)(index);
    });

  const gesture = Gesture.Simultaneous(pan, longPress);

  const animStyle = useAnimatedStyle(() => {
    'worklet';
    const f = dragFrom.value;
    if (f === -1) {
      return { transform: [{ translateX: 0 }, { scale: 1 }], zIndex: 0 };
    }
    if (f === index) {
      return { transform: [{ translateX: dragX.value }, { scale: 1.08 }], zIndex: 20 };
    }
    const t = dragTarget.value;
    const shift = f < t
      ? (index > f && index <= t ? -STRIDE : 0)
      : (index >= t && index < f ? STRIDE : 0);
    return {
      transform: [{ translateX: withTiming(shift, { duration: 140 }) }, { scale: 1 }],
      zIndex: 0 };
  });

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[styles.thumbTarget, animStyle]}>
        <Pressable
          onPress={() => onSelect(index)}
          hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
          accessibilityLabel={`Frame ${index + 1}${isActive ? ', active' : ''}`}
          accessibilityHint="Switch frame. Hold and drag to reorder, or hold for options."
          accessibilityRole="button"
          accessibilityState={{ selected: isActive }}
        >
          <View
            style={[
              styles.thumb,
              { backgroundColor: colors.surfaceAlt },
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
                style={[styles.durationBadge, { backgroundColor: colors.mediaOverlayScrim }]}
                onPress={(e) => {
                  e.stopPropagation();
                  haptic.light();
                  onVideoBadgePress?.(index);
                }}
                accessibilityLabel={`Video frame ${index + 1}, ${Math.ceil(durationMs / 1000)} seconds`}
                accessibilityHint={videoInfoOpen ? 'Hides trim info' : 'Shows trim info'}
                accessibilityRole="button"
                accessibilityState={{ expanded: videoInfoOpen }}
                hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
              >
                <Ionicons name="play" size={8} color={colors.scrimTextPrimary} />
                <Text style={[styles.durationText, { color: colors.scrimTextPrimary }]}>
                  {Math.ceil(durationMs / 1000)}s
                </Text>
              </Pressable>
            )}
          </View>
          {/* Frame number — subtle, below thumbnail */}
          <Text style={[
            styles.thumbLabel,
            { color: isActive ? colors.scrimTextPrimary : colors.scrimTextSecondary },
            isActive && styles.thumbLabelActive,
          ]}>
            {index + 1}
          </Text>
        </Pressable>
      </Animated.View>
    </GestureDetector>
  );
}

export function FrameTray({
  pages,
  activePageIndex,
  onSelectPage,
  onLongPressPage,
  onAddPage,
  onCollapse,
  bottomOffset,
  onReorderPage,
  onVideoBadgePress,
  videoInfoFrameIndex }: FrameTrayProps) {
  const haptic = useHaptic();
  const { colors } = useAppTheme();

  const dragFrom = useSharedValue(-1);
  const dragTarget = useSharedValue(-1);
  const dragX = useSharedValue(0);
  const dragMoved = useSharedValue(0);
  const dragMovedRef = useRef(false);
  const menuOpenRef = useRef(false);

  const handleSelect = useCallback((index: number) => {
    if (index === activePageIndex) {
      haptic.light();
      onCollapse();
      return;
    }
    haptic.light();
    onSelectPage(index);
  }, [activePageIndex, haptic, onSelectPage, onCollapse]);

  const handleDragStart = useCallback(() => {
    menuOpenRef.current = false;
    dragMovedRef.current = false;
    haptic.medium();
  }, [haptic]);

  const handleDragMoved = useCallback(() => {
    dragMovedRef.current = true;
    haptic.light();
  }, [haptic]);

  const handleSlotChange = useCallback(() => {
    haptic.selection();
  }, [haptic]);

  const handleMenuPress = useCallback((index: number) => {
    if (dragMovedRef.current) return;
    menuOpenRef.current = true;
    haptic.medium();
    onLongPressPage(index);
  }, [haptic, onLongPressPage]);

  const handleDragCommit = useCallback((from: number, to: number) => {
    const moved = dragMovedRef.current;
    dragMovedRef.current = false;
    if (menuOpenRef.current || !moved || from === to || !onReorderPage) return;
    haptic.medium();
    onReorderPage(from, to);
    AccessibilityInfo.announceForAccessibility(`Frame moved to position ${to + 1}`);
  }, [haptic, onReorderPage]);

  return (
    <View style={[styles.container, { bottom: bottomOffset }]} pointerEvents="box-none">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        pointerEvents="box-none"
        accessibilityLabel="Frame strip"
        accessibilityHint="Swipe horizontally to browse frames"
      >
        {pages.map((page, i) => (
          <FrameThumb
            key={page.id}
            index={i}
            pageCount={pages.length}
            page={page}
            isActive={i === activePageIndex}
            videoInfoOpen={videoInfoFrameIndex === i}
            dragFrom={dragFrom}
            dragTarget={dragTarget}
            dragX={dragX}
            dragMoved={dragMoved}
            onSelect={handleSelect}
            onMenuPress={handleMenuPress}
            onDragStart={handleDragStart}
            onDragMoved={handleDragMoved}
            onSlotChange={handleSlotChange}
            onDragCommit={handleDragCommit}
            onVideoBadgePress={onVideoBadgePress}
          />
        ))}

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
