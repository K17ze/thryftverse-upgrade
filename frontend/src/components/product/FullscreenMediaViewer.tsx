import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  useWindowDimensions,
  AccessibilityInfo,
  StatusBar,
} from 'react-native';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
  FadeIn,
  FadeOut,
} from 'react-native-reanimated';
import {
  GestureDetector,
  Gesture,
  FlatList,
} from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { Typography, Space, Radius } from '../../theme/designTokens';
import { isVideoUri } from '../../utils/media';
import { CachedImage } from '../CachedImage';
import { AnimatedPressable } from '../AnimatedPressable';
import { PressPresets } from '../../hooks/usePremiumPressFeedback';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { Video, ResizeMode } from '../compat/Video';
import type { ProductMediaItem } from '../../platform/product/productDetailViewModel';

const MAX_ZOOM = 5;
const MIN_ZOOM = 1;
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

interface FullscreenImagePageProps {
  item: ProductMediaItem;
  width: number;
  height: number;
  onClose?: () => void;
  onZoomStart?: () => void;
}

function FullscreenImagePage({
  item,
  width,
  height,
  onClose,
  onZoomStart,
}: FullscreenImagePageProps) {
  const reducedMotion = useReducedMotion();
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  const pinch = Gesture.Pinch()
    .onStart(() => {
      if (onZoomStart) runOnJS(onZoomStart)();
    })
    .onUpdate((e) => {
      scale.value = Math.min(Math.max(savedScale.value * e.scale, MIN_ZOOM), MAX_ZOOM);
    })
    .onEnd(() => {
      if (scale.value < MIN_ZOOM) {
        scale.value = withSpring(MIN_ZOOM);
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
        savedScale.value = MIN_ZOOM;
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      } else {
        savedScale.value = scale.value;
      }
    });

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      const zoom = Math.max(scale.value, savedScale.value);
      if (zoom > 1) {
        const maxX = (width * (zoom - 1)) / 2;
        const maxY = (height * (zoom - 1)) / 2;
        translateX.value = savedTranslateX.value + e.translationX;
        translateY.value = savedTranslateY.value + e.translationY;
      }
    })
    .onEnd((e) => {
      const zoom = Math.max(scale.value, savedScale.value);
      if (zoom <= 1) {
        if (Math.abs(e.translationY) > 100 && onClose) {
          runOnJS(onClose)();
        }
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
        return;
      }
      const maxX = (width * (zoom - 1)) / 2;
      const maxY = (height * (zoom - 1)) / 2;
      const tx = clamp(translateX.value + e.velocityX * 0.08, -maxX, maxX);
      const ty = clamp(translateY.value + e.velocityY * 0.08, -maxY, maxY);
      savedTranslateX.value = tx;
      savedTranslateY.value = ty;
      translateX.value = withSpring(tx, { damping: 17, stiffness: 200, velocity: reducedMotion ? 0 : e.velocityX });
      translateY.value = withSpring(ty, { damping: 17, stiffness: 200, velocity: reducedMotion ? 0 : e.velocityY });
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (scale.value > 1) {
        scale.value = withSpring(1, { damping: 15 });
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
        savedScale.value = 1;
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      } else {
        const target = reducedMotion ? 2 : 3;
        scale.value = withSpring(target, { damping: 12 });
        savedScale.value = target;
      }
    });

  const composed = Gesture.Simultaneous(Gesture.Race(doubleTap, pan), pinch);
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }, { translateY: translateY.value }, { scale: scale.value }],
  }));

  return (
    <GestureDetector gesture={composed}>
      <Reanimated.View style={[styles.page, { width, height }, animStyle]}>
        <CachedImage
          uri={item.uri}
          previewUri={item.posterUri ?? undefined}
          style={styles.image}
          containerStyle={{ width: '100%', height: '100%', backgroundColor: '#000' }}
          contentFit="contain"
          focalPoint={item.focalPoint ?? undefined}
        />
      </Reanimated.View>
    </GestureDetector>
  );
}

export interface FullscreenMediaViewerProps {
  images?: string[];
  media?: readonly ProductMediaItem[];
  /** Canonical video URLs supplied by the API. URL-suffix detection remains
   * as a compatibility fallback for older callers. */
  videoUris?: readonly string[];
  initialIndex: number;
  visible: boolean;
  onClose: () => void;
  onZoomStart?: () => void;
  onActiveIndexChange?: (index: number) => void;
}

export function FullscreenMediaViewer({
  images = [],
  media,
  videoUris = [],
  initialIndex,
  visible,
  onClose,
  onZoomStart,
  onActiveIndexChange,
}: FullscreenMediaViewerProps) {
  const { width, height } = useWindowDimensions();
  const listRef = useRef<FlatList<ProductMediaItem>>(null);
  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 50 });
  const mediaItems = useMemo<ProductMediaItem[]>(() => {
    if (media) return media.filter((item) => !!item.uri);
    const videoUriSet = new Set(videoUris);
    return images
      .filter(Boolean)
      .map((uri) => ({
        uri,
        kind: videoUriSet.has(uri) || isVideoUri(uri) ? 'video' : 'image',
        fit: 'contain',
      }));
  }, [images, media, videoUris]);
  const safeInitialIndex = mediaItems.length > 0
    ? Math.min(Math.max(initialIndex, 0), mediaItems.length - 1)
    : 0;
  const [activeIndex, setActiveIndex] = useState(safeInitialIndex);

  useEffect(() => {
    if (!visible) return;
    setActiveIndex(safeInitialIndex);
    requestAnimationFrame(() => {
      listRef.current?.scrollToIndex({
        index: safeInitialIndex,
        animated: false,
      });
    });
  }, [safeInitialIndex, visible]);

  const onViewableItemsChanged = useCallback(({ viewableItems }: any) => {
    if (viewableItems.length > 0) {
      const nextIndex = viewableItems[0].index ?? 0;
      setActiveIndex(nextIndex);
      onActiveIndexChange?.(nextIndex);
    }
  }, [onActiveIndexChange]);

  if (!visible) return null;

  return (
    <Reanimated.View
      style={styles.overlay}
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(200)}
      accessibilityViewIsModal
      importantForAccessibility="yes"
    >
      <StatusBar barStyle="light-content" backgroundColor="#000" translucent />

      <FlatList
        ref={listRef}
        data={mediaItems}
        keyExtractor={(item, i) => item.id ?? `${item.uri}-${i}`}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        initialScrollIndex={safeInitialIndex}
        getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig.current}
        renderItem={({ item, index }) =>
          item.kind === 'video' ? (
            <View
              style={[styles.page, { width, height }]}
              accessible
              accessibilityLabel={item.altText ?? 'Product video'}
            >
              <Video
                source={{ uri: item.uri }}
                style={styles.image}
                resizeMode={ResizeMode.CONTAIN}
                shouldPlay={false}
                isMuted
                isLooping={false}
                useNativeControls
                usePoster={!!item.posterUri}
                posterSource={item.posterUri ? { uri: item.posterUri } : undefined}
              />
            </View>
          ) : (
            <FullscreenImagePage
              item={item}
              width={width}
              height={height}
              onClose={onClose}
              onZoomStart={onZoomStart}
            />
          )
        }
        onScrollToIndexFailed={({ index }) => {
          listRef.current?.scrollToOffset({ offset: width * index, animated: false });
        }}
      />

      {/* Close button */}
      <View style={styles.closeButtonContainer}>
        <AnimatedPressable
          style={styles.closeButton}
          onPress={onClose}
          {...PressPresets.iconButton}
          accessibilityLabel="Close fullscreen viewer"
        >
          <Ionicons name="close" size={24} color="#fff" />
        </AnimatedPressable>
      </View>

      {/* Index indicator */}
      {mediaItems.length > 1 && (
        <View
          style={styles.indicatorContainer}
          accessible
          accessibilityLabel={`${mediaItems[activeIndex]?.kind === 'video' ? 'Video' : 'Image'} ${activeIndex + 1} of ${mediaItems.length}`}
        >
          <Text style={styles.indicatorText}>
            {activeIndex + 1} / {mediaItems.length}
          </Text>
        </View>
      )}
    </Reanimated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#000',
    zIndex: 999,
  },
  page: {
    backgroundColor: '#000',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  closeButtonContainer: {
    position: 'absolute',
    top: 50,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: Space.md,
    zIndex: 10,
    elevation: 10,
  },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  indicatorContainer: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 10,
    elevation: 10,
  },
  indicatorText: {
    color: '#fff',
    fontSize: 14,
    fontFamily: Typography.family.medium,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: Radius.full,
  },
});
