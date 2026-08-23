import React, { useState, useCallback, useEffect, Component, ErrorInfo, ReactNode } from 'react';
import {
  View,
  Text,
  StyleSheet,
  useWindowDimensions,
  StatusBar,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
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
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { Space, Radius, Type, Typography } from '../theme/designTokens';
import { IconGrammar } from '../theme/designTokens';
import { useCreator } from './CreatorContext';
import { CreatorCanvas } from './CreatorCanvas';
import { PressScale } from './CreatorAnimations';
import { useHaptic } from '../hooks/useHaptic';
import { useMotionConfig } from '../hooks/useMotionConfig';
import { useConnectivity } from '../hooks/useConnectivity';


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
 * double-tap to reset zoom. Page position is communicated by a minimal
 * "1 / 3" indicator in the top bar — no dots, no chevrons; swipe is the
 * native navigation gesture, matching Instagram Stories.
 *
 * State coverage: loading (composition still initialising), error (canvas
 * render failure), offline (publish gated), empty (no layers yet), and the
 * populated happy path.
 */

// ── Local error boundary for the canvas render ──────────────────────────
// A full-screen preview is a transient surface; if the canvas throws, the
// right recovery is to return to the composer, not to retry in place. This
// boundary renders a quiet error state with a single "Go back" action that
// delegates to the overlay's onClose.

interface BoundaryProps {
  children: ReactNode;
  onClose: () => void;
  colors: ThemeColors;
}

interface BoundaryState {
  hasError: boolean;
}

class PreviewCanvasBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { hasError: false };

  static getDerivedStateFromError(): BoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Intentionally quiet — preview is ephemeral; the composer owns the
    // document. Surfacing telemetry here would double-report against the
    // global AppErrorBoundary that already wraps the app.
    void error;
    void info;
  }

  handleGoBack = () => {
    this.setState({ hasError: false });
    this.props.onClose();
  };

  render() {
    if (this.state.hasError) {
      const { colors } = this.props;
      return (
        <View style={[styles.stateWrap, { backgroundColor: colors.background }]}>
          <Ionicons name="alert-circle-outline" size={48} color={colors.textSecondary} />
          <Text style={[styles.stateTitle, { color: colors.textPrimary }]}>
            Couldn't render preview
          </Text>
          <Pressable
            onPress={this.handleGoBack}
            style={({ pressed }) => [
              styles.stateAction,
              { backgroundColor: colors.brand, opacity: pressed ? 0.85 : 1 },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Text style={[styles.stateActionText, { color: colors.textInverse }]}>
              Go back
            </Text>
          </Pressable>
        </View>
      );
    }
    return this.props.children;
  }
}

export function CreatorPreviewOverlay({ visible, onClose, onPublish }: CreatorPreviewOverlayProps) {
  const { document } = useCreator();
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const { spring } = useMotionConfig();
  const reduceMotion = useReducedMotion();
  const { isOffline } = useConnectivity();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const [pageIndex, setPageIndex] = useState(0);

  const pageCount = document.pages.length;
  const page = document.pages[pageIndex];
  const isPoster = document.type === 'poster';

  // A composition is "empty" when every page has no layers — the canvas
  // would render a blank surface, so we surface a hint instead.
  const isEmptyComposition =
    pageCount > 0 && document.pages.every((p) => p.layers.length === 0);

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

  // Keep pageIndex in range if the document's pages change underneath us.
  useEffect(() => {
    if (pageIndex > pageCount - 1) {
      setPageIndex(Math.max(0, pageCount - 1));
    }
  }, [pageIndex, pageCount]);

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
    if (isOffline) return;
    haptic.medium();
    onPublish();
  }, [haptic, onPublish, isOffline]);

  // Animated style for page transition (slide + fade)
  const pageTransitionStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: pageTranslateX.value }],
    opacity: pageOpacity.value,
  }));

  // Animated style for zoom
  const zoomStyle = useAnimatedStyle(() => ({
    transform: [{ scale: zoomScale.value }],
  }));

  if (!visible) return null;

  // ── Loading: composition still initialising (no pages yet) ──
  if (pageCount === 0) {
    return (
      <View style={[styles.container, styles.stateWrap, { backgroundColor: colors.background }]}>
        <StatusBar barStyle="light-content" />
        <ActivityIndicator size="large" color={colors.brand} />
        <Text style={[styles.stateTitle, { color: colors.textSecondary }]}>
          Preparing preview…
        </Text>
      </View>
    );
  }

  // Compute canvas dimensions to fill the screen while preserving aspect ratio
  const ratio = document.canvas.aspectRatio;
  let canvasW = screenWidth;
  let canvasH = Math.floor(screenWidth / ratio);
  if (canvasH > screenHeight) {
    canvasH = screenHeight;
    canvasW = Math.floor(screenHeight * ratio);
  }

  // Combined gesture: pinch + double tap + swipe
  const combinedGesture = Gesture.Race(pinchGesture, doubleTapGesture, swipeGesture);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" />

      {/* Full-screen canonical composition render with gestures.
          Wrapped in a local error boundary so a canvas render failure
          recovers to the composer instead of crashing the preview. */}
      <GestureDetector gesture={combinedGesture}>
        <View style={styles.canvasWrap}>
          <Reanimated.View style={zoomStyle}>
            <Reanimated.View style={pageTransitionStyle}>
              <PreviewCanvasBoundary onClose={onClose} colors={colors}>
                <CreatorCanvas
                  document={document}
                  page={page}
                  canvasWidth={canvasW}
                  canvasHeight={canvasH}
                  mode="view"
                />
              </PreviewCanvasBoundary>
            </Reanimated.View>
          </Reanimated.View>
        </View>
      </GestureDetector>

      {/* Top bar — minimal, transparent floating chrome over media */}
      <SafeAreaView style={styles.topBar} edges={['top']}>
        <PressScale
          onPress={onClose}
          style={styles.topBtn}
          accessibilityLabel="Close preview"
        >
          <Ionicons name="close" size={IconGrammar.hero} color={colors.textInverse} />
        </PressScale>

        <View style={styles.topCenter}>
          <Text style={[styles.topLabel, { color: colors.textInverse }]}>Preview</Text>
          {pageCount > 1 && (
            <Text style={[styles.pageIndicator, { color: colors.scrimTextSecondary }]}>
              {pageIndex + 1} / {pageCount}
            </Text>
          )}
        </View>

        {/* Publish — solid brand fill, scale feedback, no gradient chrome.
            Disabled while offline; opacity communicates the gated state. */}
        <PressScale
          onPress={handlePublish}
          style={[
            styles.publishBtnWrap,
            { backgroundColor: colors.brand },
            isOffline ? styles.publishBtnDisabled : {},
          ]}
          accessibilityLabel="Publish"
          accessibilityState={{ disabled: isOffline }}
          scale={0.95}
          disabled={isOffline}
        >
          <Text style={[styles.publishBtnText, { color: colors.textInverse }]}>
            Publish
          </Text>
        </PressScale>
      </SafeAreaView>

      {/* Empty composition hint — pages exist but nothing on them yet. */}
      {isEmptyComposition && (
        <View pointerEvents="none" style={styles.emptyHint}>
          <Text style={[styles.emptyHintText, { color: colors.textInverse }]}>
            Add content to see a preview.
          </Text>
        </View>
      )}

      {/* Offline banner — quiet, bottom-anchored. Publish is gated above. */}
      {isOffline && (
        <SafeAreaView style={styles.offlineBanner} edges={['bottom']}>
          <Ionicons name="cloud-offline-outline" size={14} color={colors.warning} />
          <Text style={[styles.offlineText, { color: colors.warning }]} numberOfLines={1}>
            Offline — preview only, publish when connected.
          </Text>
        </SafeAreaView>
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
  // ── Floating top bar ──
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
  // ── Publish floating action button ──
  publishBtnWrap: {
    paddingHorizontal: Space.md + 4,
    height: 36,
    borderRadius: Radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  publishBtnDisabled: {
    opacity: 0.4,
  },
  publishBtnText: {
    fontFamily: Typography.family.semibold,
    fontSize: Type.body.size,
  },
  // ── State surfaces (loading / error) ──
  stateWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Space.md,
  },
  stateTitle: {
    fontFamily: Typography.family.medium,
    fontSize: Type.body.size,
    textAlign: 'center',
  },
  stateAction: {
    paddingHorizontal: Space.lg,
    height: 44,
    borderRadius: Radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stateActionText: {
    fontFamily: Typography.family.semibold,
    fontSize: Type.body.size,
  },
  // ── Empty composition hint ──
  emptyHint: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyHintText: {
    fontFamily: Typography.family.medium,
    fontSize: Type.body.size,
    textAlign: 'center',
  },
  // ── Offline banner ──
  offlineBanner: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
  },
  offlineText: {
    fontFamily: Typography.family.medium,
    fontSize: Type.caption.size,
    flexShrink: 1,
  },
});
