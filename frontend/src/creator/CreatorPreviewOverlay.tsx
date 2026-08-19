import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  useWindowDimensions,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
  useReducedMotion,
  Easing,
} from 'react-native-reanimated';
import { useAppTheme } from '../theme/ThemeContext';
import { Space, Radius, Type, Typography } from '../theme/designTokens';
import { useCreator } from './CreatorContext';
import { CreatorCanvas } from './CreatorCanvas';
import { PressScale } from './CreatorAnimations';
import { useHaptic } from '../hooks/useHaptic';
import { useMotionConfig } from '../hooks/useMotionConfig';


export interface CreatorPreviewOverlayProps {
  visible: boolean;
  onClose: () => void;
  onPublish: () => void;
}

/**
 * Full-screen, chrome-free preview that renders the composition exactly
 * as the viewer will see it. Uses CreatorCanvas in "view" mode — the same
 * renderer used by LookDetailScreen and PosterViewerScreen — so what the
 * user sees here is what gets published.
 *
 * For Poster (multi-page), the user can swipe horizontally to navigate
 * between pages with spring transitions. Pinch to zoom into the preview,
 * double-tap to reset zoom.
 */
export function CreatorPreviewOverlay({ visible, onClose, onPublish }: CreatorPreviewOverlayProps) {
  const { document } = useCreator();
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const { spring } = useMotionConfig();
  const reduceMotion = useReducedMotion();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const [pageIndex, setPageIndex] = useState(0);

  const page = document.pages[pageIndex];
  const pageCount = document.pages.length;
  const isPoster = document.type === 'poster';

  // ── Swipe navigation shared values ──
  const pageTranslateX = useSharedValue(0);
  const pageOpacity = useSharedValue(1);

  // ── Pinch zoom shared values ──
  const zoomScale = useSharedValue(1);
  const pinchStartScale = useSharedValue(1);

  // Reset page index when overlay becomes visible
  useEffect(() => {
    if (visible) {
      setPageIndex(0);
      zoomScale.value = 1;
      pageTranslateX.value = 0;
      pageOpacity.value = 1;
    }
  }, [visible, zoomScale, pageTranslateX, pageOpacity]);

  const goToPage = useCallback((newIndex: number) => {
    setPageIndex(newIndex);
    // Spring transition: slide + fade
    if (!reduceMotion) {
      pageOpacity.value = 0;
      pageTranslateX.value = withSpring(0, spring.entrance);
      pageOpacity.value = withTiming(1, { duration: 200, easing: Easing.out(Easing.ease) });
    }
    haptic.light();
  }, [haptic, reduceMotion, spring.entrance, pageOpacity, pageTranslateX]);

  const goNextPage = useCallback(() => {
    setPageIndex((i) => {
      const next = i < pageCount - 1 ? i + 1 : 0;
      if (!reduceMotion) {
        pageOpacity.value = 0;
        pageTranslateX.value = withSpring(0, spring.entrance);
        pageOpacity.value = withTiming(1, { duration: 200, easing: Easing.out(Easing.ease) });
      }
      haptic.light();
      return next;
    });
  }, [pageCount, haptic, reduceMotion, spring.entrance, pageOpacity, pageTranslateX]);

  const goPrevPage = useCallback(() => {
    setPageIndex((i) => {
      const prev = i > 0 ? i - 1 : pageCount - 1;
      if (!reduceMotion) {
        pageOpacity.value = 0;
        pageTranslateX.value = withSpring(0, spring.entrance);
        pageOpacity.value = withTiming(1, { duration: 200, easing: Easing.out(Easing.ease) });
      }
      haptic.light();
      return prev;
    });
  }, [pageCount, haptic, reduceMotion, spring.entrance, pageOpacity, pageTranslateX]);

  // ── Horizontal swipe gesture for page navigation ──
  const swipeGesture = React.useRef(
    Gesture.Pan()
      .activeOffsetX([-30, 30])
      .failOffsetY([-20, 20])
      .onEnd((e) => {
        if (Math.abs(e.translationX) < 50) return;
        if (e.translationX < 0) {
          runOnJS(goNextPage)();
        } else {
          runOnJS(goPrevPage)();
        }
      })
  ).current;

  // ── Pinch gesture for zoom ──
  const pinchGesture = React.useRef(
    Gesture.Pinch()
      .onStart(() => {
        pinchStartScale.value = zoomScale.value;
      })
      .onUpdate((e) => {
        zoomScale.value = Math.max(1, Math.min(4, pinchStartScale.value * e.scale));
      })
      .onEnd(() => {
        if (zoomScale.value < 1.1) {
          zoomScale.value = withSpring(1, spring.press);
        } else {
          // Spring settle to nearest 0.25 step
          const settled = Math.round(zoomScale.value * 4) / 4;
          zoomScale.value = withSpring(Math.max(1, Math.min(4, settled)), spring.press);
        }
        runOnJS(haptic.light)();
      })
  ).current;

  // ── Double-tap to reset zoom ──
  const doubleTapGesture = React.useRef(
    Gesture.Tap()
      .numberOfTaps(2)
      .onEnd(() => {
        if (zoomScale.value > 1.1) {
          zoomScale.value = withSpring(1, spring.entrance);
          runOnJS(haptic.medium)();
        }
      })
  ).current;

  const handlePublish = useCallback(() => {
    haptic.medium();
    onPublish();
  }, [haptic, onPublish]);

  if (!visible || !page) return null;

  // Compute canvas dimensions to fill the screen while preserving aspect ratio
  const ratio = document.canvas.aspectRatio;
  let canvasW = screenWidth;
  let canvasH = Math.floor(screenWidth / ratio);
  if (canvasH > screenHeight) {
    canvasH = screenHeight;
    canvasW = Math.floor(screenHeight * ratio);
  }

  // Animated style for page transition (slide + fade)
  const pageTransitionStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: pageTranslateX.value }],
    opacity: pageOpacity.value,
  }));

  // Animated style for zoom
  const zoomStyle = useAnimatedStyle(() => ({
    transform: [{ scale: zoomScale.value }],
  }));

  // Combined gesture: pinch + double tap + swipe
  const combinedGesture = Gesture.Race(pinchGesture, doubleTapGesture, swipeGesture);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" />

      {/* Full-screen canonical composition render with gestures */}
      <GestureDetector gesture={combinedGesture}>
        <View style={styles.canvasWrap}>
          <Reanimated.View style={zoomStyle}>
            <Reanimated.View style={pageTransitionStyle}>
              <CreatorCanvas
                document={document}
                page={page}
                canvasWidth={canvasW}
                canvasHeight={canvasH}
                mode="view"
              />
            </Reanimated.View>
          </Reanimated.View>
        </View>
      </GestureDetector>

      {/* Top bar — minimal, transparent over media */}
      <SafeAreaView style={styles.topBar} edges={['top']}>
        <PressScale
          onPress={onClose}
          style={styles.topBtn}
          accessibilityLabel="Close preview"
        >
          <Ionicons name="close" size={28} color={colors.textInverse} />
        </PressScale>

        <View style={styles.topCenter}>
          <Text style={[styles.topLabel, { color: colors.textInverse }]}>Preview</Text>
          {pageCount > 1 && (
            <Text style={[styles.pageIndicator, { color: colors.scrimTextSecondary }]}>
              {pageIndex + 1} / {pageCount}
            </Text>
          )}
        </View>

        {/* Enhanced publish button with gradient */}
        <PressScale
          onPress={handlePublish}
          style={styles.publishBtnWrap}
          accessibilityLabel="Publish"
          scale={0.95}
        >
          <LinearGradient
            colors={[colors.brand, colors.brandPressed]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.publishBtn}
          >
            <Text style={[styles.publishBtnText, { color: colors.textPrimary }]}>Publish</Text>
          </LinearGradient>
        </PressScale>
      </SafeAreaView>

      {/* Page navigation for multi-page posters */}
      {isPoster && pageCount > 1 && (
        <View style={styles.pageNavRow}>
          <PressScale
            onPress={goPrevPage}
            style={styles.pageNavBtn}
            accessibilityLabel="Previous page"
          >
            <Ionicons name="chevron-back" size={24} color={colors.textInverse} />
          </PressScale>
          <View style={styles.pageDots}>
            {document.pages.map((p, i) => (
              <View
                key={p.id}
                style={[
                  styles.pageDot,
                  { backgroundColor: colors.scrimTextTertiary },
                  i === pageIndex && styles.pageDotActive,
                  i === pageIndex && { backgroundColor: colors.textInverse },
                ]}
              />
            ))}
          </View>
          <PressScale
            onPress={goNextPage}
            style={styles.pageNavBtn}
            accessibilityLabel="Next page"
          >
            <Ionicons name="chevron-forward" size={24} color={colors.textInverse} />
          </PressScale>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    zIndex: 9999,
  },
  canvasWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs,
  },
  topBtn: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: Radius.full,
  },
  topCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  topLabel: {
    fontFamily: Typography.family.semibold,
    fontSize: Type.body.size,
    color: '#fff',
  },
  pageIndicator: {
    fontFamily: Typography.family.medium,
    fontSize: Type.caption.size,
    color: 'rgba(255,255,255,0.7)',
  },
  publishBtnWrap: {
    borderRadius: Radius.full,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  publishBtn: {
    paddingHorizontal: Space.md + 4,
    height: 36,
    borderRadius: Radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  publishBtnText: {
    fontFamily: Typography.family.semibold,
    fontSize: Type.body.size,
  },
  pageNavRow: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    paddingBottom: Space.xl,
  },
  pageNavBtn: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: Radius.full,
  },
  pageDots: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  pageDot: {
    width: 6,
    height: 6,
    borderRadius: Radius.sm,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  pageDotActive: {
    width: 8,
    height: 8,
  },
});
