import React, { useCallback, useMemo, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, type ViewStyle, type TextStyle } from 'react-native';
import { CachedImage } from '../components/CachedImage';
import { Ionicons } from '@expo/vector-icons';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedReaction,
  runOnJS,
  withTiming,
  withSpring,
  withRepeat,
  cancelAnimation,
  Easing,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Canvas as SkiaCanvas, Path as SkiaPath, Skia } from '@shopify/react-native-skia';
import { Image as ExpoImage } from 'expo-image';
import { Space, Radius, Type, Typography } from '../theme/designTokens';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useHaptic } from '../hooks/useHaptic';
import { useMotionConfig } from '../hooks/useMotionConfig';
import { Video, ResizeMode } from '../components/compat/Video';
import type { CreatorLayer, CreatorDocument, CreatorPage } from './composition';
import { getVisibleLayersSorted } from './composition';
// Shared layer primitives — single source of truth for accent colours,
// context menus, and gesture handling across poster + creator surfaces.
import {
  getLayerAccentColor,
  getLayerCategoryLabel,
} from '../components/poster/shared/layerAccents';
import { ContextMenu, type ContextMenuAction } from '../components/poster/shared/ContextMenu';

const RAD_TO_DEG = 180 / Math.PI;

function normaliseDegrees(deg: number): number {
  let result = deg % 360;
  if (result < 0) result += 360;
  return result;
}

// ── Layer type accent colors ───────────────────────────────────────
// Premium selection visuals use distinct accent colors per layer category.
// Now imported from shared/layerAccents.ts so the poster composition
// surface, the creator canvas, and the layers sheet share one source of
// truth for layer-type accent colouring.

export interface CreatorCanvasProps {
  document: CreatorDocument;
  page: CreatorPage;
  canvasWidth: number;
  canvasHeight: number;
  mode: 'edit' | 'preview' | 'view';
  selectedLayerId?: string | null;
  onLayerPress?: (layerId: string) => void;
  onCanvasPress?: () => void;
  onLayerPositionChange?: (layerId: string, x: number, y: number) => void;
  onLayerTransformChange?: (layerId: string, updates: Partial<CreatorLayer>) => void;
  onLayerDoubleTap?: (layerId: string) => void;
  onLayerLongPress?: (layerId: string) => void;
  // Context menu actions (long-press). Optional — when omitted the context
  // menu shows only the actions that can be served by onLayerTransformChange.
  onLayerDuplicate?: (layerId: string) => void;
  onLayerDelete?: (layerId: string) => void;
  onLayerReorder?: (layerId: string, direction: 'front' | 'back') => void;
  onLayerToggleLock?: (layerId: string) => void;
}

export function CreatorCanvas({
  document,
  page,
  canvasWidth,
  canvasHeight,
  mode,
  selectedLayerId,
  onLayerPress,
  onCanvasPress,
  onLayerTransformChange,
  onLayerDoubleTap,
  onLayerLongPress,
  onLayerDuplicate,
  onLayerDelete,
  onLayerReorder,
  onLayerToggleLock,
}: CreatorCanvasProps) {
  const { canvas } = document;
  const visibleLayers = getVisibleLayersSorted(page);
  const { colors } = useAppTheme();
  const isEmpty = visibleLayers.length === 0;

  // Context menu state — long-press opens an ActionSheet with layer actions.
  // The per-layer gesture composition calls onContextMenu(layer) to set this;
  // the shared <ContextMenu> sheet is then driven by `visible`.
  const [contextMenuLayer, setContextMenuLayer] = useState<CreatorLayer | null>(null);

  // Build the context-menu action list from the active layer + callbacks.
  // Mirrors the previous inline LayerContextMenu action set (duplicate,
  // front/back, lock/unlock, flip, delete) but via the shared ContextMenu API.
  const contextMenuActions = useMemo<ContextMenuAction[]>(() => {
    if (!contextMenuLayer) return [];
    const id = contextMenuLayer.id;
    const isLocked = !!contextMenuLayer.locked;
    const actions: ContextMenuAction[] = [];
    if (onLayerDuplicate) {
      actions.push({ id: 'duplicate', label: 'Duplicate', icon: 'copy-outline', onPress: () => onLayerDuplicate(id) });
    }
    if (onLayerReorder) {
      actions.push({ id: 'front', label: 'Front', icon: 'arrow-up-circle-outline', onPress: () => onLayerReorder(id, 'front') });
      actions.push({ id: 'back', label: 'Back', icon: 'arrow-down-circle-outline', onPress: () => onLayerReorder(id, 'back') });
    }
    if (onLayerToggleLock) {
      actions.push({
        id: 'lock',
        label: isLocked ? 'Unlock' : 'Lock',
        icon: isLocked ? 'lock-open-outline' : 'lock-closed-outline',
        onPress: () => onLayerToggleLock(id),
      });
    }
    // Flip: reset rotation to 0 (2D flip equivalent)
    actions.push({
      id: 'flip',
      label: 'Flip',
      icon: 'swap-horizontal-outline',
      onPress: () => onLayerTransformChange?.(id, { rotation: 0 }),
    });
    if (onLayerDelete) {
      actions.push({ id: 'delete', label: 'Delete', icon: 'trash-outline', danger: true, onPress: () => onLayerDelete(id) });
    }
    return actions;
  }, [contextMenuLayer, onLayerDuplicate, onLayerDelete, onLayerReorder, onLayerToggleLock, onLayerTransformChange]);

  const contextMenuTitle = contextMenuLayer ? getLayerCategoryLabel(contextMenuLayer.type) : 'Options';
  const contextMenuAccent = contextMenuLayer ? getLayerAccentColor(contextMenuLayer.type) : undefined;

  const renderBackground = () => {
    if (canvas.background.type === 'color') {
      return <View style={[StyleSheet.absoluteFill, { backgroundColor: canvas.background.value }]} />;
    }
    if (canvas.background.type === 'gradient' && canvas.background.secondaryValue) {
      return (
        <LinearGradient
          colors={[canvas.background.value, canvas.background.secondaryValue]}
          style={StyleSheet.absoluteFill}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
        />
      );
    }
    if (canvas.background.type === 'image' && canvas.background.value) {
      return (
        <CachedImage
          uri={canvas.background.value}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
        />
      );
    }
    return <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.surfaceAlt }]} />;
  };

  // Canvas borderRadius: Radius.none in edit mode (the canvas IS the stage),
  // rounded in view/preview mode (thumbnails, publish preview).
  const canvasRadius = mode === 'edit' ? 0 : Radius.lg;

  return (
    <GestureHandlerRootView
      style={[
        styles.canvas,
        {
          width: canvasWidth,
          height: canvasHeight,
          borderRadius: canvasRadius,
        },
      ]}
    >
      {renderBackground()}

      {mode === 'edit' && (
        <Pressable style={styles.backgroundPressLayer} onPress={onCanvasPress} accessibilityLabel="Canvas background, tap to deselect" accessibilityRole="button" />
      )}

      {visibleLayers.map((layer) => (
        <LayerRenderer
          key={layer.id}
          layer={layer}
          siblingLayers={visibleLayers.filter((l) => l.id !== layer.id)}
          canvasWidth={canvasWidth}
          canvasHeight={canvasHeight}
          mode={mode}
          isSelected={selectedLayerId === layer.id}
          onPress={onLayerPress}
          onTransformChange={onLayerTransformChange}
          onDoubleTap={onLayerDoubleTap}
          onLongPress={onLayerLongPress}
          onContextMenu={(l) => setContextMenuLayer(l)}
          onDuplicate={onLayerDuplicate}
          onDelete={onLayerDelete}
          onReorder={onLayerReorder}
          onToggleLock={onLayerToggleLock}
        />
      ))}

      {/* Empty canvas state — guides the user to start creating */}
      {mode === 'edit' && isEmpty && (
        <EmptyCanvasState colors={colors} />
      )}

      {/* Long-press context menu — shared ContextMenu sheet with layer actions.
          The per-layer gesture composition sets contextMenuLayer on long-press;
          the shared <ContextMenu> renders the spring-entrance sheet driven by
          `visible`. `enabled={false}` disables the wrapper's own long-press
          (each LayerRenderer manages its own long-press inside its gesture race). */}
      {mode === 'edit' && (
        <ContextMenu
          actions={contextMenuActions}
          visible={!!contextMenuLayer}
          onDismiss={() => setContextMenuLayer(null)}
          onOpen={() => setContextMenuLayer(contextMenuLayer)}
          enabled={false}
          title={contextMenuTitle}
          accentColor={contextMenuAccent}
        >
          <View />
        </ContextMenu>
      )}
    </GestureHandlerRootView>
  );
}

// ── Empty canvas state ─────────────────────────────────────────────
// Premium empty state with layered icon, title, and guidance.
// Not just a pulsing icon — a proper designed empty surface.
function EmptyCanvasState({ colors }: { colors: ReturnType<typeof useAppTheme>['colors'] }) {
  const reducedMotion = useReducedMotion();
  const scaleSV = useSharedValue(1);

  useEffect(() => {
    if (reducedMotion) {
      // WCAG 2.2 §2.3.3 — no repeating pulse animation when Reduce Motion is on
      cancelAnimation(scaleSV);
      scaleSV.value = 1;
      return;
    }
    scaleSV.value = withRepeat(
      withTiming(1.06, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
    return () => cancelAnimation(scaleSV);
  }, [scaleSV, reducedMotion]);

  const animatedIconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scaleSV.value }],
  }));

  return (
    <View style={styles.emptyState} pointerEvents="none" accessibilityLabel="Empty canvas, tap a tool to start" accessibilityRole="text">
      <View style={styles.emptyStateIconWrap}>
        <Reanimated.View style={animatedIconStyle}>
          <Ionicons name="add-circle-outline" size={64} color="rgba(255,255,255,0.4)" />
        </Reanimated.View>
      </View>
      <Text style={styles.emptyStateTitle}>
        Tap a tool to start
      </Text>
      <Text style={styles.emptyStateSubtitle}>
        Media · Text · Product · Elements · Layout
      </Text>
    </View>
  );
}

interface LayerRendererProps {
  layer: CreatorLayer;
  siblingLayers: CreatorLayer[];
  canvasWidth: number;
  canvasHeight: number;
  mode: 'edit' | 'preview' | 'view';
  isSelected: boolean;
  onPress?: (layerId: string) => void;
  onTransformChange?: (layerId: string, updates: Partial<CreatorLayer>) => void;
  onDoubleTap?: (layerId: string) => void;
  onLongPress?: (layerId: string) => void;
  onContextMenu?: (layer: CreatorLayer) => void;
  onDuplicate?: (layerId: string) => void;
  onDelete?: (layerId: string) => void;
  onReorder?: (layerId: string, direction: 'front' | 'back') => void;
  onToggleLock?: (layerId: string) => void;
}

const SNAP_THRESHOLD = 0.02;
const SAFE_MARGIN = 0.05;
const ROTATION_SNAP_DEG = 15;

const LayerRenderer = React.memo(function LayerRenderer({
  layer,
  siblingLayers,
  canvasWidth,
  canvasHeight,
  mode,
  isSelected,
  onPress,
  onTransformChange,
  onDoubleTap,
  onLongPress,
  onContextMenu,
}: LayerRendererProps) {
  const { colors } = useAppTheme();
  const reducedMotion = useReducedMotion();
  const haptic = useHaptic();
  const { spring } = useMotionConfig();
  const accentColor = getLayerAccentColor(layer.type);
  const translateX = useSharedValue(layer.x * canvasWidth);
  const translateY = useSharedValue(layer.y * canvasHeight);
  const scaleSV = useSharedValue(layer.scale);
  const rotationSV = useSharedValue(layer.rotation);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const startScale = useSharedValue(1);
  const startRotation = useSharedValue(0);
  // During-drag: show basic center guides only. On drag end: compute smart guides.
  const [showGuides, setShowGuides] = useState(false);
  // Smart alignment guides — vertical/horizontal pixel positions where the
  // dragged layer's edges/centre align with a sibling's edges/centre.
  const [smartGuides, setSmartGuides] = useState<{ vertical: number[]; horizontal: number[] }>({ vertical: [], horizontal: [] });
  // Guide appearance animation — spring scale + fade
  const guideOpacity = useSharedValue(0);
  // Throttle: last position at which smart guides were computed, to avoid
  // running the O(n²) computation + JS bridge hop on every animation frame.
  const lastGuideX = useSharedValue(0);
  const lastGuideY = useSharedValue(0);
  const GUIDE_THROTTLE_PX = 2;

  // Selection animation: border + handles fade/scale in with spring
  // Premium: scale 0.8→1.0 on appearance, 1.0→0.8 + fade on disappearance
  const selectionOpacity = useSharedValue(0);
  const handleScale = useSharedValue(0.8);
  // Gesture lift shadow — increases during active gesture
  const liftSV = useSharedValue(0);

  useEffect(() => {
    if (isSelected) {
      selectionOpacity.value = reducedMotion ? withTiming(1, { duration: 0 }) : withSpring(1, spring.entrance);
      handleScale.value = reducedMotion ? withTiming(1, { duration: 0 }) : withSpring(1, spring.success);
      if (!reducedMotion) haptic.light();
    } else {
      selectionOpacity.value = reducedMotion ? withTiming(0, { duration: 0 }) : withSpring(0, spring.entrance);
      handleScale.value = reducedMotion ? withTiming(0.8, { duration: 0 }) : withSpring(0.8, spring.entrance);
      if (!reducedMotion) haptic.light();
    }
  }, [isSelected, selectionOpacity, handleScale, reducedMotion, spring, haptic]);

  // Gesture feedback badges (scale % and rotation angle)
  const [gestureBadge, setGestureBadge] = useState<string | null>(null);

  // Sync shared values when document state changes (undo/redo/draft load/page change)
  useEffect(() => {
    if (reducedMotion) {
      // WCAG 2.2 §2.3.3 — instant snap, no spring bounce
      translateX.value = withTiming(layer.x * canvasWidth, { duration: 0 });
      translateY.value = withTiming(layer.y * canvasHeight, { duration: 0 });
      scaleSV.value = withTiming(layer.scale, { duration: 0 });
      rotationSV.value = withTiming(normaliseDegrees(layer.rotation), { duration: 0 });
    } else {
      translateX.value = withSpring(layer.x * canvasWidth, spring.entrance);
      translateY.value = withSpring(layer.y * canvasHeight, spring.entrance);
      scaleSV.value = withSpring(layer.scale, spring.entrance);
      rotationSV.value = withSpring(normaliseDegrees(layer.rotation), spring.entrance);
    }
  }, [layer.x, layer.y, layer.scale, layer.rotation, canvasWidth, canvasHeight, reducedMotion, spring]);

  const handlePress = useCallback(() => {
    if (mode === 'edit' && onPress) {
      onPress(layer.id);
    }
  }, [mode, onPress, layer.id]);

  const handleDoubleTap = useCallback(() => {
    if (mode === 'edit' && onDoubleTap) {
      onDoubleTap(layer.id);
    }
  }, [mode, onDoubleTap, layer.id]);

  const handleLongPress = useCallback(() => {
    if (mode === 'edit') {
      if (onContextMenu) {
        onContextMenu(layer);
      }
      if (onLongPress) {
        onLongPress(layer.id);
      }
    }
  }, [mode, onLongPress, onContextMenu, layer]);

  const handlePositionCommit = useCallback((finalX: number, finalY: number) => {
    let normX = finalX / canvasWidth;
    let normY = finalY / canvasHeight;
    let snappedX = false;
    let snappedY = false;

    // Snapping to center
    if (Math.abs(normX - 0.5) < SNAP_THRESHOLD) { normX = 0.5; snappedX = true; }
    if (Math.abs(normY - 0.5) < SNAP_THRESHOLD) { normY = 0.5; snappedY = true; }

    // Safe-zone clamping accounting for layer width, height and scale
    const halfW = (layer.width * layer.scale) / 2;
    const halfH = (layer.height * layer.scale) / 2;
    const minX = Math.max(SAFE_MARGIN, halfW);
    const maxX = Math.min(1 - SAFE_MARGIN, 1 - halfW);
    const minY = Math.max(SAFE_MARGIN, halfH);
    const maxY = Math.min(1 - SAFE_MARGIN, 1 - halfH);
    normX = Math.max(minX, Math.min(maxX, normX));
    normY = Math.max(minY, Math.min(maxY, normY));

    translateX.value = withTiming(normX * canvasWidth, { duration: reducedMotion ? 0 : 100 });
    translateY.value = withTiming(normY * canvasHeight, { duration: reducedMotion ? 0 : 100 });

    if (snappedX || snappedY) haptic.light();
    setShowGuides(false);
    setSmartGuides({ vertical: [], horizontal: [] });
    setSmartGuides({ vertical: [], horizontal: [] });

    onTransformChange?.(layer.id, { x: normX, y: normY });
  }, [canvasWidth, canvasHeight, layer.id, layer.width, layer.height, layer.scale, onTransformChange, translateX, translateY, reducedMotion, haptic]);

  const handleTransformCommit = useCallback((finalScale: number, finalRotation: number) => {
    const clampedScale = Math.max(0.2, Math.min(5, finalScale));
    const normalisedRotation = normaliseDegrees(finalRotation);

    // Snap rotation to 15-degree increments if close
    let snappedRotation = normalisedRotation;
    const nearestSnap = Math.round(normalisedRotation / ROTATION_SNAP_DEG) * ROTATION_SNAP_DEG;
    if (Math.abs(normalisedRotation - nearestSnap) < 5) {
      snappedRotation = nearestSnap % 360;
      haptic.light();
    }

    scaleSV.value = withTiming(clampedScale, { duration: reducedMotion ? 0 : 100 });
    rotationSV.value = withTiming(snappedRotation, { duration: reducedMotion ? 0 : 100 });
    onTransformChange?.(layer.id, { scale: clampedScale, rotation: snappedRotation });
  }, [layer.id, onTransformChange, scaleSV, rotationSV, reducedMotion, haptic]);

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(mode === 'edit' && !layer.locked)
        .minDistance(5)
        .onStart(() => {
          startX.value = translateX.value;
          startY.value = translateY.value;
          runOnJS(handlePress)();
          runOnJS(setShowGuides)(true);
        })
        .onUpdate((e) => {
          translateX.value = startX.value + e.translationX;
          translateY.value = startY.value + e.translationY;
        })
        .onEnd((e) => {
          const finalX = startX.value + e.translationX;
          const finalY = startY.value + e.translationY;
          runOnJS(handlePositionCommit)(finalX, finalY);
        }),
    [mode, layer.locked, layer.id, translateX, translateY, startX, startY, onPress, handlePositionCommit]
  );

  const pinchGesture = useMemo(
    () =>
      Gesture.Pinch()
        .enabled(mode === 'edit' && !layer.locked)
        .onStart(() => {
          startScale.value = scaleSV.value;
        })
        .onUpdate((e) => {
          scaleSV.value = startScale.value * e.scale;
          runOnJS(setGestureBadge)(`${Math.round(startScale.value * e.scale * 100)}%`);
        })
        .onEnd(() => {
          runOnJS(setGestureBadge)(null);
          runOnJS(handleTransformCommit)(scaleSV.value, rotationSV.value);
        }),
    [mode, layer.locked, scaleSV, startScale, rotationSV, handleTransformCommit]
  );

  const rotationGesture = useMemo(
    () =>
      Gesture.Rotation()
        .enabled(mode === 'edit' && !layer.locked)
        .onStart(() => {
          startRotation.value = rotationSV.value;
        })
        .onUpdate((e) => {
          // Convert gesture radians to degrees at the boundary
          rotationSV.value = startRotation.value + e.rotation * RAD_TO_DEG;
          const deg = Math.round(normaliseDegrees(startRotation.value + e.rotation * RAD_TO_DEG));
          runOnJS(setGestureBadge)(`${deg}°`);
        })
        .onEnd(() => {
          runOnJS(setGestureBadge)(null);
          runOnJS(handleTransformCommit)(scaleSV.value, rotationSV.value);
        }),
    [mode, layer.locked, rotationSV, startRotation, scaleSV, handleTransformCommit]
  );

  const tapGesture = useMemo(
    () =>
      Gesture.Tap()
        .enabled(mode === 'edit')
        .onEnd(() => {
          runOnJS(handlePress)();
        }),
    [mode, handlePress]
  );

  const doubleTapGesture = useMemo(
    () =>
      Gesture.Tap()
        .enabled(mode === 'edit' && !layer.locked)
        .numberOfTaps(2)
        .onEnd(() => {
          runOnJS(handleDoubleTap)();
        }),
    [mode, layer.locked, handleDoubleTap]
  );

  const longPressGesture = useMemo(
    () =>
      Gesture.LongPress()
        .enabled(mode === 'edit')
        .minDuration(400)
        .onEnd(() => {
          runOnJS(handleLongPress)();
        }),
    [mode, handleLongPress]
  );

  const composedGesture = useMemo(
    () => Gesture.Race(
      Gesture.Simultaneous(pinchGesture, rotationGesture),
      panGesture,
      doubleTapGesture,
      longPressGesture,
      tapGesture,
    ),
    [panGesture, pinchGesture, rotationGesture, tapGesture, doubleTapGesture, longPressGesture]
  );

  const animatedStyle = useAnimatedStyle(() => {
    const baseWidth = layer.width * canvasWidth;
    const baseHeight = layer.height * canvasHeight;
    const w = baseWidth * scaleSV.value;
    const h = baseHeight * scaleSV.value;
    return {
      position: 'absolute' as const,
      left: translateX.value - w / 2,
      top: translateY.value - h / 2,
      width: w,
      height: h,
      transform: [
        { rotate: `${rotationSV.value}deg` },
      ],
      opacity: layer.opacity,
      zIndex: layer.zIndex,
    };
  });

  const content = renderLayerContent(layer, layer.width * canvasWidth, layer.height * canvasHeight);

  // Smart alignment guides: while dragging, detect when this layer's
  // left/right/centre aligns with a sibling's left/right/centre (vertical
  // guide) or top/bottom/centre (horizontal guide). Computed on the UI
  // thread from the live translate shared values and committed sibling
  // geometry, then mirrored to JS state for rendering.
  const SMART_GUIDE_THRESHOLD_PX = 4;
  const computeSmartGuides = useCallback(
    (cx: number, cy: number) => {
      const halfW = (layer.width * layer.scale * canvasWidth) / 2;
      const halfH = (layer.height * layer.scale * canvasHeight) / 2;
      const myLeft = cx - halfW;
      const myRight = cx + halfW;
      const myCenterX = cx;
      const myTop = cy - halfH;
      const myBottom = cy + halfH;
      const myCenterY = cy;
      const vertical = new Set<number>();
      const horizontal = new Set<number>();
      for (const sib of siblingLayers) {
        const sHalfW = (sib.width * sib.scale * canvasWidth) / 2;
        const sHalfH = (sib.height * sib.scale * canvasHeight) / 2;
        const sCx = sib.x * canvasWidth;
        const sCy = sib.y * canvasHeight;
        const sLeft = sCx - sHalfW;
        const sRight = sCx + sHalfW;
        const sCenterX = sCx;
        const sTop = sCy - sHalfH;
        const sBottom = sCy + sHalfH;
        const sCenterY = sCy;
        const xCandidates = [myLeft, myRight, myCenterX];
        const xTargets = [sLeft, sRight, sCenterX];
        for (const mc of xCandidates) {
          for (const st of xTargets) {
            if (Math.abs(mc - st) < SMART_GUIDE_THRESHOLD_PX) vertical.add(st);
          }
        }
        const yCandidates = [myTop, myBottom, myCenterY];
        const yTargets = [sTop, sBottom, sCenterY];
        for (const mc of yCandidates) {
          for (const st of yTargets) {
            if (Math.abs(mc - st) < SMART_GUIDE_THRESHOLD_PX) horizontal.add(st);
          }
        }
      }
      setSmartGuides({ vertical: Array.from(vertical), horizontal: Array.from(horizontal) });
    },
    [layer.width, layer.height, layer.scale, canvasWidth, canvasHeight, siblingLayers],
  );

  useAnimatedReaction(
    () => ({ x: translateX.value, y: translateY.value }),
    (pos) => {
      if (showGuides) {
        // Throttle: only recompute when the layer has moved more than
        // GUIDE_THROTTLE_PX since the last computation. This avoids running
        // the O(n²) alignment check + JS bridge hop on every animation frame.
        const dx = Math.abs(pos.x - lastGuideX.value);
        const dy = Math.abs(pos.y - lastGuideY.value);
        if (dx >= GUIDE_THROTTLE_PX || dy >= GUIDE_THROTTLE_PX) {
          lastGuideX.value = pos.x;
          lastGuideY.value = pos.y;
          runOnJS(computeSmartGuides)(pos.x, pos.y);
        }
      }
    },
    [showGuides, computeSmartGuides],
  );

  // Per-type corner radius: media = 0 (full-bleed), text = conditional,
  // product/mention/look/vote = 8px (pill content), decorative = 0
  const layerRadius = getLayerRadius(layer);

  // Animated selection border style
  const selectionBorderStyle = useAnimatedStyle(() => ({
    borderWidth: 2,
    borderColor: layer.locked
      ? colors.warning
      : colors.brand,
    borderRadius: layerRadius,
    opacity: selectionOpacity.value,
    borderStyle: layer.locked ? 'dashed' as const : 'solid' as const,
  }));

  if (mode === 'edit') {
    return (
      <GestureDetector gesture={composedGesture}>
        <Reanimated.View
          style={animatedStyle}
          accessibilityLabel={`${getLayerCategoryLabel(layer.type)} layer${layer.locked ? ', locked' : ''}${layer.hidden ? ', hidden' : ''}${isSelected ? ', selected' : ''}`}
          accessibilityRole="adjustable"
          accessibilityHint="Drag to move, pinch to resize, rotate to rotate, double-tap to edit, long-press for options"
        >
          <View style={[styles.layerInner, { borderRadius: layerRadius }]}>
            {content}
          </View>
          {/* Animated selection border — fades in with spring */}
          {isSelected && (
            <Reanimated.View style={[StyleSheet.absoluteFill, selectionBorderStyle]} pointerEvents="none" />
          )}
          {/* Selection handles — draggable corner + rotation handles */}
          {isSelected && (
            <SelectionHandles
              handleScaleSV={handleScale}
              colors={colors}
              layerLocked={layer.locked}
              scaleSV={scaleSV}
              rotationSV={rotationSV}
              onScaleChange={(s) => setGestureBadge(`${Math.round(s * 100)}%`)}
              onRotationChange={(r) => setGestureBadge(`${r}°`)}
              onCommit={() => {
                setGestureBadge(null);
                handleTransformCommit(scaleSV.value, rotationSV.value);
              }}
            />
          )}
          {/* Locked badge */}
          {isSelected && layer.locked && (
            <View style={[styles.lockedBadge, { backgroundColor: colors.warning }]} pointerEvents="none" accessibilityLabel="Layer locked" accessibilityRole="image">
              <Ionicons name="lock-closed" size={10} color="#fff" />
            </View>
          )}
          {/* Gesture feedback badge */}
          {gestureBadge && (
            <View style={[styles.gestureBadge, { backgroundColor: colors.surfaceElevated }]} pointerEvents="none" accessibilityLabel={`Transform ${gestureBadge}`} accessibilityRole="text">
              <Text style={[styles.gestureBadgeText, { color: colors.textPrimary }]}>{gestureBadge}</Text>
            </View>
          )}
          {showGuides && <AlignmentGuides canvasWidth={canvasWidth} canvasHeight={canvasHeight} colors={colors} smartGuides={smartGuides} />}
        </Reanimated.View>
      </GestureDetector>
    );
  }

  const left = layer.x * canvasWidth;
  const top = layer.y * canvasHeight;
  const width = layer.width * canvasWidth * layer.scale;
  const height = layer.height * canvasHeight * layer.scale;

  return (
    <View
      style={{
        position: 'absolute',
        left: left - width / 2,
        top: top - height / 2,
        width,
        height,
        transform: [{ rotate: `${layer.rotation}deg` }],
        opacity: layer.opacity,
        zIndex: layer.zIndex,
      }}
      pointerEvents="none"
      accessibilityLabel={`${getLayerCategoryLabel(layer.type)} layer${layer.locked ? ', locked' : ''}${layer.hidden ? ', hidden' : ''}`}
      accessibilityRole="image"
    >
      <View style={[styles.layerInner, { borderRadius: getLayerRadius(layer) }]}>
        {content}
      </View>
    </View>
  );
});

// ── Per-type layer corner radius ───────────────────────────────────
// Media: 0 (full-bleed), text: conditional on background, pill content: 8px, decorative: 0
function getLayerRadius(layer: CreatorLayer): number {
  switch (layer.type) {
    case 'media':
      return 0;
    case 'text':
      return layer.payload.backgroundColor ? Radius.md : 0;
    case 'product':
    case 'mention':
    case 'look':
    case 'vote':
      return Radius.md;
    case 'quiz':
      return Radius.md;
    case 'question':
      return Radius.md;
    case 'emojiSlider':
      return Radius.lg;
    case 'countdown':
      return Radius.md;
    case 'decorative':
      return 0;
    case 'draw':
      return 0;
    case 'gif':
      return Radius.sm;
    case 'music':
      return Radius.md;
    case 'link':
    case 'location':
    case 'hashtag':
    case 'time':
    case 'weather':
      return Radius.md;
    default:
      return 0;
  }
}

function renderLayerContent(layer: CreatorLayer, width: number, height: number): React.ReactNode {
  switch (layer.type) {
    case 'media':
      return <MediaLayerContent layer={layer} width={width} height={height} />;
    case 'text':
      return <TextLayerContent layer={layer} />;
    case 'product':
      return <ProductLayerContent layer={layer} />;
    case 'mention':
      return <MentionLayerContent layer={layer} />;
    case 'look':
      return <LookLayerContent layer={layer} />;
    case 'vote':
      return <VoteLayerContent layer={layer} />;
    case 'quiz':
      return <QuizLayerContent layer={layer} />;
    case 'question':
      return <QuestionLayerContent layer={layer} />;
    case 'emojiSlider':
      return <EmojiSliderLayerContent layer={layer} />;
    case 'countdown':
      return <CountdownLayerContent layer={layer} />;
    case 'decorative':
      return <DecorativeLayerContent layer={layer} width={width} height={height} />;
    case 'draw':
      return <DrawLayerContent layer={layer} width={width} height={height} />;
    case 'gif':
      return <GifLayerContent layer={layer} />;
    case 'music':
      return <MusicLayerContent layer={layer} />;
    case 'link':
      return <LinkLayerContent layer={layer} />;
    case 'location':
      return <LocationLayerContent layer={layer} />;
    case 'hashtag':
      return <HashtagLayerContent layer={layer} />;
    case 'time':
      return <TimeLayerContent layer={layer} />;
    case 'weather':
      return <WeatherLayerContent layer={layer} />;
    default:
      return null;
  }
}

function MediaLayerContent({ layer, width, height }: { layer: Extract<CreatorLayer, { type: 'media' }>; width: number; height: number }) {
  const { payload } = layer;
  const { colors } = useAppTheme();
  const [videoError, setVideoError] = React.useState(false);
  const [imageLoaded, setImageLoaded] = React.useState(false);
  const [imageError, setImageError] = React.useState(false);

  if (payload.mediaType === 'video' && !videoError) {
    return (
      <>
        {payload.thumbnailUri && (
          <ExpoImage source={{ uri: payload.thumbnailUri }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" recyclingKey={payload.thumbnailUri} enforceEarlyResizing />
        )}
        <Video
          key={`${layer.id}-${payload.mediaUri}`}
          source={{ uri: payload.mediaUri }}
          style={StyleSheet.absoluteFill}
          resizeMode={ResizeMode.COVER}
          shouldPlay
          isMuted
          isLooping
          onError={() => setVideoError(true)}
        />
        <View style={mediaStyles.videoBadge} pointerEvents="none" accessibilityLabel="Video media layer" accessibilityRole="image">
          <Ionicons name="videocam" size={12} color="#fff" />
        </View>
      </>
    );
  }

  if (imageError) {
    return (
      <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.surfaceAlt, justifyContent: 'center', alignItems: 'center' }]} accessibilityLabel="Image unavailable" accessibilityRole="image">
        <Ionicons name="image-outline" size={28} color={colors.textMuted} />
      </View>
    );
  }

  return (
    <>
      {/* Placeholder while loading */}
      {!imageLoaded && (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.surfaceAlt }]} />
      )}
      <Reanimated.Image
        source={{ uri: payload.mediaUri }}
        style={[StyleSheet.absoluteFill, { opacity: imageLoaded ? 1 : 0 }]}
        resizeMode={payload.contentFit === 'contain' ? 'contain' : payload.contentFit === 'fill' ? 'stretch' : 'cover'}
        onLoadEnd={() => setImageLoaded(true)}
        onError={() => setImageError(true)}
      />
    </>
  );
}

function TextLayerContent({ layer }: { layer: Extract<CreatorLayer, { type: 'text' }> }) {
  const { payload } = layer;
  const reducedMotion = useReducedMotion();
  const { spring } = useMotionConfig();

  // Text entrance animation (Instagram 2025-2026: typewriter, bounce, fade, slide)
  const animProgress = useSharedValue(0);
  const animOpacity = useSharedValue(0);
  const animTranslateY = useSharedValue(0);
  const [typewriterText, setTypewriterText] = useState(payload.text);

  useEffect(() => {
    const animation = payload.textAnimation ?? 'none';
    animProgress.value = 0;
    animOpacity.value = 0;
    animTranslateY.value = 0;
    if (animation === 'none' || reducedMotion) {
      // WCAG 2.2 §2.3.3 — show text immediately with no animation when Reduce Motion is on
      animOpacity.value = 1;
      animProgress.value = 1;
      animTranslateY.value = 0;
      setTypewriterText(payload.text);
      return;
    }
    if (animation === 'fade') {
      animOpacity.value = withTiming(1, { duration: 600, easing: Easing.out(Easing.ease) });
      setTypewriterText(payload.text);
    } else if (animation === 'slide') {
      animTranslateY.value = 24;
      animOpacity.value = 0;
      animOpacity.value = withTiming(1, { duration: 500, easing: Easing.out(Easing.ease) });
      animTranslateY.value = withTiming(0, { duration: 500, easing: Easing.out(Easing.exp) });
      setTypewriterText(payload.text);
    } else if (animation === 'bounce') {
      animOpacity.value = 1;
      animTranslateY.value = -16;
      animTranslateY.value = withSpring(0, spring.success);
      setTypewriterText(payload.text);
    } else if (animation === 'typewriter') {
      animOpacity.value = 1;
      setTypewriterText('');
      animProgress.value = withTiming(1, { duration: Math.max(800, (payload.text?.length ?? 0) * 60), easing: Easing.linear });
    }
  }, [payload.textAnimation, payload.text, animProgress, animOpacity, animTranslateY, reducedMotion, spring]);

  // Typewriter: react to progress shared value and update visible substring on JS thread
  useAnimatedReaction(
    () => animProgress.value,
    (progress) => {
      const full = payload.text ?? '';
      runOnJS(setTypewriterText)(full.substring(0, Math.ceil(progress * full.length)));
    },
    [payload.text],
  );

  const animStyle = useAnimatedStyle(() => ({
    opacity: animOpacity.value,
    transform: [{ translateY: animTranslateY.value }],
  }));

  // Per-style typography — real visual distinction, not just font size
  // Instagram 2025-2026: 10 fonts with distinct visual character
  const styleMap: Record<string, any> = {
    headline: {
      fontFamily: Typography.family.bold,
      fontSize: Type.title.size + 4,
      lineHeight: (Type.title.size + 4) * 1.15,
      textShadowColor: 'rgba(0,0,0,0.4)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 4,
    },
    editorial: {
      fontFamily: Typography.family.bold,
      fontSize: Type.title.size + 1,
      lineHeight: (Type.title.size + 1) * 1.2,
      textShadowColor: 'rgba(0,0,0,0.35)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 3,
    },
    clean: {
      fontFamily: Typography.family.medium,
      fontSize: Type.body.size + 1,
      lineHeight: (Type.body.size + 1) * 1.35,
      textShadowColor: 'rgba(0,0,0,0.3)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 2,
    },
    compact: {
      fontFamily: Typography.family.semibold,
      fontSize: Type.caption.size,
      lineHeight: Type.caption.size * 1.3,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
    },
    handwritten: {
      fontFamily: Typography.family.medium,
      fontSize: Type.body.size + 2,
      lineHeight: (Type.body.size + 2) * 1.3,
      fontStyle: 'italic',
    },
    bubble: {
      fontFamily: Typography.family.bold,
      fontSize: Type.bodyEmphasis.size + 6,
      lineHeight: (Type.bodyEmphasis.size + 6) * 1.2,
      letterSpacing: 0.5,
    },
    deco: {
      fontFamily: Typography.family.bold,
      fontSize: Type.bodyEmphasis.size + 2,
      lineHeight: (Type.bodyEmphasis.size + 2) * 1.3,
      letterSpacing: 1.5,
    },
    poster: {
      fontFamily: Typography.family.bold,
      fontSize: Type.title.size - 2,
      lineHeight: (Type.title.size - 2) * 1.1,
      letterSpacing: -0.5,
    },
    squeeze: {
      fontFamily: Typography.family.semibold,
      fontSize: Type.body.size,
      lineHeight: Type.body.size * 1.1,
      letterSpacing: -0.3,
    },
    signature: {
      fontFamily: Typography.family.regular,
      fontSize: Type.bodyEmphasis.size + 2,
      lineHeight: (Type.bodyEmphasis.size + 2) * 1.4,
      fontStyle: 'italic',
    },
  };

  // Text effect styles (Instagram 2025-2026)
  const effectStyle: TextStyle = {};
  if (payload.textEffect === 'shadow') {
    effectStyle.textShadowColor = 'rgba(0,0,0,0.6)';
    effectStyle.textShadowOffset = { width: 2, height: 2 };
    effectStyle.textShadowRadius = 4;
  } else if (payload.textEffect === 'neon') {
    effectStyle.textShadowColor = payload.textColor;
    effectStyle.textShadowOffset = { width: 0, height: 0 };
    effectStyle.textShadowRadius = 8;
  } else if (payload.textEffect === 'glow') {
    effectStyle.textShadowColor = payload.textColor;
    effectStyle.textShadowOffset = { width: 0, height: 0 };
    effectStyle.textShadowRadius = 12;
  } else if (payload.textEffect === 'outline') {
    effectStyle.textShadowColor = '#000';
    effectStyle.textShadowOffset = { width: 0, height: 0 };
    effectStyle.textShadowRadius = 1;
  }

  return (
    <View
      style={[
        textStyles.container,
        payload.backgroundColor ? { backgroundColor: payload.backgroundColor } : null,
        payload.alignment === 'left' && { alignItems: 'flex-start' },
        payload.alignment === 'right' && { alignItems: 'flex-end' },
      ]}
      accessibilityLabel={`Text, ${payload.text}`}
      accessibilityRole="text"
    >
      <Reanimated.View style={animStyle}>
        <Text
          style={[
            textStyles.text,
            { color: payload.textColor },
            styleMap[payload.textStyle] ?? styleMap.clean,
            effectStyle,
          ]}
          numberOfLines={undefined}
        >
          {typewriterText}
        </Text>
      </Reanimated.View>
    </View>
  );
}

function ProductLayerContent({ layer }: { layer: Extract<CreatorLayer, { type: 'product' }> }) {
  const { payload } = layer;
  const { colors } = useAppTheme();
  const productStyles = React.useMemo(() => createProductStyles(colors), [colors]);
  const isSold = payload.availability === 'sold';
  const isDeleted = payload.availability === 'deleted';
  const hasImage = !!payload.snapshotImageUrl;
  const hasHotspot = !!payload.hotspotLabel;

  if (hasImage) {
    return (
      <View
        style={productStyles.imageContainer}
        accessibilityLabel={`Product layer, ${payload.snapshotTitle || 'Listing'}${payload.snapshotPriceGbp !== undefined ? `, £${payload.snapshotPriceGbp.toFixed(0)}` : ''}${isSold ? ', sold' : ''}`}
        accessibilityRole="link"
      >
        <ExpoImage
          source={{ uri: payload.snapshotImageUrl! }}
          style={productStyles.thumbnail}
          contentFit="cover"
          cachePolicy="memory-disk"
          recyclingKey={payload.snapshotImageUrl!}
          enforceEarlyResizing
        />
        <View style={productStyles.imageOverlay}>
          <Text style={productStyles.imageTitle} numberOfLines={1}>
            {payload.snapshotTitle || 'Listing'}
          </Text>
          {payload.snapshotPriceGbp !== undefined && (
            <Text style={[productStyles.imagePrice, isSold && productStyles.soldPrice]}>
              {isSold ? 'SOLD' : `£${payload.snapshotPriceGbp.toFixed(0)}`}
            </Text>
          )}
        </View>
        {isSold && (
          <View style={productStyles.soldBadge}>
            <Text style={productStyles.soldBadgeText}>SOLD</Text>
          </View>
        )}
      </View>
    );
  }

  if (hasHotspot) {
    return (
      <View
        style={productStyles.hotspotContainer}
        accessibilityLabel={`Product hotspot, ${payload.hotspotLabel}${payload.snapshotPriceGbp !== undefined ? `, £${payload.snapshotPriceGbp.toFixed(0)}` : ''}`}
        accessibilityRole="link"
      >
        <View style={productStyles.hotspotDot} />
        <Text style={productStyles.hotspotLabel} numberOfLines={1}>
          {payload.hotspotLabel}
        </Text>
        {payload.snapshotPriceGbp !== undefined && !isSold && (
          <Text style={productStyles.hotspotPrice}>
            £{payload.snapshotPriceGbp.toFixed(0)}
          </Text>
        )}
      </View>
    );
  }

  // Fallback: compact tag with icon — premium shoppable pin style

  return (
    <View
      style={productStyles.container}
      accessibilityLabel={`Product layer, ${payload.snapshotTitle || 'Listing'}${payload.snapshotPriceGbp !== undefined ? `, £${payload.snapshotPriceGbp.toFixed(0)}` : ''}${isSold ? ', sold' : ''}${isDeleted ? ', unavailable' : ''}`}
      accessibilityRole="link"
    >
      <View style={productStyles.row}>
        <Ionicons name="pricetag" size={12} color="#fff" />
        <Text style={productStyles.title} numberOfLines={1}>{payload.snapshotTitle || 'Listing'}</Text>
      </View>
      {payload.snapshotPriceGbp !== undefined && (
        <Text style={[productStyles.price, isSold && productStyles.soldPrice, isDeleted && productStyles.deletedPrice]}>
          {isSold ? 'SOLD' : isDeleted ? 'UNAVAILABLE' : `£${payload.snapshotPriceGbp.toFixed(0)}`}
        </Text>
      )}
    </View>
  );
}

function MentionLayerContent({ layer }: { layer: Extract<CreatorLayer, { type: 'mention' }> }) {
  const { payload } = layer;
  return (
    <View style={mentionStyles.container} accessibilityLabel={`Mention @${payload.username}`} accessibilityRole="link">
      <Text style={mentionStyles.text}>@{payload.username}</Text>
    </View>
  );
}

function LookLayerContent({ layer }: { layer: Extract<CreatorLayer, { type: 'look' }> }) {
  const { payload } = layer;
  return (
    <View style={lookStyles.container} accessibilityLabel={`Look, ${payload.snapshotCaption || 'View look'}`} accessibilityRole="link">
      <Ionicons name="shirt-outline" size={12} color="#fff" />
      <Text style={lookStyles.text} numberOfLines={1}>{payload.snapshotCaption || 'View look'}</Text>
    </View>
  );
}

function VoteLayerContent({ layer }: { layer: Extract<CreatorLayer, { type: 'vote' }> }) {
  const { payload } = layer;
  const hasTimer = payload.timerMs !== undefined && payload.timerMs > 0;
  const timerSeconds = hasTimer ? Math.round(payload.timerMs! / 1000) : 0;
  const timerLabel = timerSeconds >= 3600
    ? `${Math.floor(timerSeconds / 3600)}h`
    : timerSeconds >= 60
      ? `${Math.floor(timerSeconds / 60)}m`
      : `${timerSeconds}s`;

  return (
    <View
      style={[voteStyles.container, payload.backgroundColor && { backgroundColor: payload.backgroundColor }]}
      accessibilityLabel={`Poll, ${payload.question}${hasTimer ? `, ${timerLabel} timer` : ''}`}
      accessibilityRole="summary"
    >
      <View style={voteStyles.headerRow}>
        <Text style={voteStyles.question}>{payload.question}</Text>
        {hasTimer && (
          <View style={voteStyles.timerBadge}>
            <Ionicons name="timer-outline" size={10} color="#fff" />
            <Text style={voteStyles.timerText}>{timerLabel}</Text>
          </View>
        )}
      </View>
      <View style={voteStyles.optionsRow}>
        {payload.options.map((opt) => (
          <View key={opt.id} style={voteStyles.option}>
            <Text style={voteStyles.optionText} numberOfLines={1}>{opt.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ── Quiz layer content ─────────────────────────────────────────────
// Instagram 2026: multiple-choice quiz with emoji and correct answer indicator.
// Premium rendering: gradient surface, proper button styling, filled correct badge.
function QuizLayerContent({ layer }: { layer: Extract<CreatorLayer, { type: 'quiz' }> }) {
  const { payload } = layer;
  return (
    <View style={quizStyles.container} accessibilityLabel={`Quiz, ${payload.emoji} ${payload.question}`} accessibilityRole="summary">
      <View style={quizStyles.header}>
        <Text style={quizStyles.emoji}>{payload.emoji}</Text>
        <Text style={quizStyles.question}>{payload.question}</Text>
      </View>
      <View style={quizStyles.optionsCol}>
        {payload.options.map((opt, i) => {
          const isCorrect = opt.id === payload.correctOptionId;
          return (
            <View key={opt.id} style={[
              quizStyles.option,
              isCorrect && quizStyles.optionCorrect,
            ]}>
              <Text style={[quizStyles.optionText, isCorrect && quizStyles.optionTextCorrect]}>
                {opt.label}
              </Text>
              {isCorrect && (
                <View style={quizStyles.correctBadge}>
                  <Ionicons name="checkmark" size={12} color="#1a1a1a" />
                </View>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}

// ── Question box layer content ─────────────────────────────────────
// Instagram 2026: open-ended question box sticker.
// Premium rendering: gradient background, input affordance with cursor hint.
function QuestionLayerContent({ layer }: { layer: Extract<CreatorLayer, { type: 'question' }> }) {
  const { payload } = layer;
  return (
    <View style={[questionStyles.container, { backgroundColor: payload.backgroundColor }]} accessibilityLabel={`Question box, ${payload.prompt}`} accessibilityRole="search">
      <Text style={questionStyles.prompt}>{payload.prompt}</Text>
      <View style={questionStyles.inputAffordance}>
        <Ionicons name="chatbubbles-outline" size={14} color="rgba(255,255,255,0.5)" />
        <Text style={questionStyles.placeholder}>{payload.placeholder}</Text>
        <View style={questionStyles.sendHint}>
          <Ionicons name="arrow-up" size={10} color="rgba(255,255,255,0.4)" />
        </View>
      </View>
    </View>
  );
}

// ── Emoji slider layer content ─────────────────────────────────────
// Instagram 2026: emoji slider for intensity measurement.
// Premium rendering: dark glass surface, proper slider track with thumb.
function EmojiSliderLayerContent({ layer }: { layer: Extract<CreatorLayer, { type: 'emojiSlider' }> }) {
  const { payload } = layer;
  return (
    <View style={sliderStyles.container} accessibilityLabel={`Emoji slider, ${payload.emoji} ${payload.question}`} accessibilityRole="adjustable">
      <Text style={sliderStyles.question}>{payload.question}</Text>
      <View style={sliderStyles.sliderRow}>
        <Text style={sliderStyles.emoji}>{payload.emoji}</Text>
        <View style={sliderStyles.track}>
          <View style={[sliderStyles.trackFill, { backgroundColor: payload.sliderColor }]} />
          <View style={[sliderStyles.thumb, { borderColor: payload.sliderColor }]} />
        </View>
        {payload.endLabel ? (
          <Text style={sliderStyles.endLabel}>{payload.endLabel}</Text>
        ) : null}
      </View>
    </View>
  );
}

// ── Countdown layer content ────────────────────────────────────────
// Instagram 2026: countdown to a date/time with live timer.
// Premium rendering: card with depth, gradient surface, tabular time display.
function CountdownLayerContent({ layer }: { layer: Extract<CreatorLayer, { type: 'countdown' }> }) {
  const { payload } = layer;
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const endMs = new Date(payload.endDateTime).getTime();
  const remaining = Math.max(0, endMs - now);
  const hours = Math.floor(remaining / 3600000);
  const mins = Math.floor((remaining % 3600000) / 60000);
  const secs = Math.floor((remaining % 60000) / 1000);
  const days = Math.floor(hours / 24);
  const displayHours = hours % 24;

  const timeStr = days > 0
    ? `${days}d ${displayHours}h ${mins}m`
    : `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

  return (
    <View style={[countdownStyles.container, { backgroundColor: payload.color }]} accessibilityLabel={`Countdown, ${payload.label}, ${timeStr}`} accessibilityRole="timer">
      <View style={countdownStyles.iconRow}>
        <Ionicons name="time-outline" size={12} color={payload.textColor} />
        <Text style={countdownStyles.label}>{payload.label}</Text>
      </View>
      <Text style={countdownStyles.time}>{timeStr}</Text>
    </View>
  );
}

function DecorativeLayerContent({ layer, width, height }: { layer: Extract<CreatorLayer, { type: 'decorative' }>; width: number; height: number }) {
  const { colors } = useAppTheme();
  const { payload } = layer;
  const fillColor = payload.fillColor ?? colors.brand;
  const subtleShadow = {
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  };
  const iconSize = Math.min(width, height);

  switch (payload.shape) {
    case 'circle':
      return (
        <View
          style={{
            width: '100%',
            height: '100%',
            borderRadius: width / 2,
            backgroundColor: fillColor,
            opacity: payload.opacity,
            ...subtleShadow,
          }}
          accessibilityLabel="Decorative circle shape"
          accessibilityRole="image"
        />
      );
    case 'square':
      return (
        <View
          style={{
            width: '100%',
            height: '100%',
            borderRadius: Radius.md,
            backgroundColor: fillColor,
            opacity: payload.opacity,
            ...subtleShadow,
          }}
          accessibilityLabel="Decorative square shape"
          accessibilityRole="image"
        />
      );
    case 'line':
      return (
        <View
          style={{
            width: '100%',
            height: 4,
            borderRadius: Radius.sm,
            backgroundColor: fillColor,
            opacity: payload.opacity,
            marginTop: height / 2 - 2,
          }}
        />
      );
    case 'arrow':
      return (
        <View style={{ width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center', opacity: payload.opacity }}>
          <Ionicons
            name="arrow-up"
            size={iconSize}
            color={fillColor}
            style={{ transform: [{ rotate: `${layer.rotation}deg` }] }}
          />
        </View>
      );
    case 'star':
      return (
        <View style={{ width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center', opacity: payload.opacity, ...subtleShadow }} accessibilityLabel="Decorative star shape" accessibilityRole="image">
          <Ionicons name="star" size={iconSize} color={fillColor} />
        </View>
      );
    case 'heart':
      return (
        <View style={{ width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center', opacity: payload.opacity, ...subtleShadow }} accessibilityLabel="Decorative heart shape" accessibilityRole="image">
          <Ionicons name="heart" size={iconSize} color={fillColor} />
        </View>
      );
    case 'triangle':
      return (
        <View
          style={{
            width: 0,
            height: 0,
            borderLeftWidth: width / 2,
            borderRightWidth: width / 2,
            borderBottomWidth: height,
            borderLeftColor: 'transparent',
            borderRightColor: 'transparent',
            borderBottomColor: fillColor,
            opacity: payload.opacity,
            alignSelf: 'center',
          }}
        />
      );
    case 'hexagon':
      return (
        <View style={{ width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center', opacity: payload.opacity, ...subtleShadow }}>
          <Ionicons name="stop" size={iconSize} color={fillColor} style={{ transform: [{ rotate: '45deg' }] }} />
        </View>
      );
    default:
      return null;
  }
}

// ── Draw layer content ─────────────────────────────────────────────
// Renders freehand strokes using Skia. Points are normalized 0-1
// relative to the layer bounds; scaled to the rendered pixel size.
function DrawLayerContent({ layer, width, height }: { layer: Extract<CreatorLayer, { type: 'draw' }>; width: number; height: number }) {
  const { payload } = layer;

  const strokePaths = useMemo(() => {
    return payload.strokes.map((stroke, i) => {
      if (stroke.points.length === 0) return null;
      const path = Skia.Path.Make();
      const first = stroke.points[0];
      path.moveTo(first.x * width, first.y * height);
      for (let j = 1; j < stroke.points.length; j++) {
        const prev = stroke.points[j - 1];
        const curr = stroke.points[j];
        const midX = ((prev.x + curr.x) / 2) * width;
        const midY = ((prev.y + curr.y) / 2) * height;
        path.quadTo(prev.x * width, prev.y * height, midX, midY);
      }
      const last = stroke.points[stroke.points.length - 1];
      path.lineTo(last.x * width, last.y * height);
      return { key: i, path, stroke };
    }).filter(Boolean);
  }, [payload.strokes, width, height]);

  return (
    <SkiaCanvas style={{ width, height }} accessibilityLabel="Drawing layer" accessibilityRole="image">
      {strokePaths.map((sp: any) => {
        const isEraser = sp.stroke.tool === 'eraser';
        const isMarker = sp.stroke.tool === 'marker';
        const isHighlighter = sp.stroke.tool === 'highlighter';
        const isNeon = sp.stroke.tool === 'neon';
        return (
          <SkiaPath
            key={sp.key}
            path={sp.path}
            style="stroke"
            strokeWidth={sp.stroke.width}
            color={sp.stroke.color}
            strokeCap="round"
            strokeJoin="round"
            opacity={isHighlighter ? 0.35 : isMarker ? 0.6 : 1}
            blendMode={isEraser ? "clear" : isNeon ? "screen" : "srcOver"}
          />
        );
      })}
    </SkiaCanvas>
  );
}

// ── GIF layer content ──────────────────────────────────────────────
// Renders animated GIF using expo-image (supports animated GIF playback).
function GifLayerContent({ layer }: { layer: Extract<CreatorLayer, { type: 'gif' }> }) {
  const { payload } = layer;
  return (
    <ExpoImage
      source={{ uri: payload.gifUrl }}
      style={{ width: '100%', height: '100%' }}
      contentFit="contain"
      cachePolicy="memory-disk"
      recyclingKey={payload.gifUrl}
      transition={300}
      enforceEarlyResizing
      accessible
      accessibilityLabel={payload.altText || 'GIF sticker'}
    />
  );
}

// ── Music layer content ────────────────────────────────────────────
// Instagram-style music sticker: album art + track name + artist.
// Premium rendering: darker glass surface, proper album art with shadow.
function MusicLayerContent({ layer }: { layer: Extract<CreatorLayer, { type: 'music' }> }) {
  const { payload } = layer;
  const { colors } = useAppTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: Radius.lg,
        backgroundColor: 'rgba(0,0,0,0.75)',
        minWidth: 160,
        maxWidth: '100%',
      }}
      accessibilityLabel={`Music, ${payload.trackName}${payload.artistName ? ` by ${payload.artistName}` : ''}`}
      accessibilityRole="button"
    >
      {payload.artworkUrl ? (
        <ExpoImage
          source={{ uri: payload.artworkUrl }}
          style={{
            width: 40,
            height: 40,
            borderRadius: Radius.sm,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.3,
            shadowRadius: 3,
          }}
          contentFit="cover"
          cachePolicy="memory-disk"
          recyclingKey={payload.artworkUrl}
          enforceEarlyResizing
        />
      ) : (
        <View style={{
          width: 40,
          height: 40,
          borderRadius: Radius.sm,
          backgroundColor: 'rgba(201,164,106,0.2)',
          justifyContent: 'center',
          alignItems: 'center',
        }}>
          <Ionicons name="musical-notes" size={18} color="rgba(201,164,106,0.8)" />
        </View>
      )}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontFamily: Typography.family.semibold, fontSize: Type.caption.size + 1, color: '#fff' }} numberOfLines={1}>
          {payload.trackName}
        </Text>
        {payload.artistName ? (
          <Text style={{ fontFamily: Typography.family.regular, fontSize: Type.meta.size, color: 'rgba(255,255,255,0.6)' }} numberOfLines={1}>
            {payload.artistName}
          </Text>
        ) : null}
      </View>
      <View style={{
        width: 22,
        height: 22,
        borderRadius: Radius.full,
        backgroundColor: 'rgba(255,255,255,0.12)',
        justifyContent: 'center',
        alignItems: 'center',
      }}>
        <Ionicons name="play" size={10} color="#fff" />
      </View>
    </View>
  );
}

// ── Link layer content ─────────────────────────────────────────────
function LinkLayerContent({ layer }: { layer: Extract<CreatorLayer, { type: 'link' }> }) {
  const { payload } = layer;
  return (
    <View style={{
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: Radius.md,
      backgroundColor: payload.backgroundColor,
      minWidth: 120,
    }} accessibilityLabel={`Link, ${payload.ctaText}`} accessibilityRole="link">
      <Ionicons name="link-outline" size={16} color={payload.textColor} />
      <Text style={{ fontFamily: Typography.family.semibold, fontSize: Type.caption.size + 1, color: payload.textColor }} numberOfLines={1}>
        {payload.ctaText}
      </Text>
    </View>
  );
}

// ── Location layer content ─────────────────────────────────────────
function LocationLayerContent({ layer }: { layer: Extract<CreatorLayer, { type: 'location' }> }) {
  const { payload } = layer;
  return (
    <View style={{
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: Space.sm,
      borderRadius: Radius.md,
      backgroundColor: 'rgba(0,0,0,0.6)',
      minWidth: 100,
    }} accessibilityLabel={`Location, ${payload.placeName}`} accessibilityRole="link">
      <Ionicons name="location-outline" size={16} color="#fff" />
      <Text style={{ fontFamily: Typography.family.semibold, fontSize: Type.caption.size + 1, color: '#fff' }} numberOfLines={1}>
        {payload.placeName}
      </Text>
    </View>
  );
}

// ── Hashtag layer content ──────────────────────────────────────────
function HashtagLayerContent({ layer }: { layer: Extract<CreatorLayer, { type: 'hashtag' }> }) {
  const { payload } = layer;
  return (
    <View style={{
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: Space.sm,
      borderRadius: Radius.md,
      backgroundColor: payload.backgroundColor,
      minWidth: 80,
    }} accessibilityLabel={`Hashtag, ${payload.tag}`} accessibilityRole="link">
      <Text style={{ fontFamily: Typography.family.semibold, fontSize: Type.caption.size + 1, color: payload.textColor }} numberOfLines={1}>
        #{payload.tag}
      </Text>
    </View>
  );
}

// ── Time layer content ─────────────────────────────────────────────
function TimeLayerContent({ layer }: { layer: Extract<CreatorLayer, { type: 'time' }> }) {
  const { payload } = layer;
  const date = new Date(payload.displayTime);
  const timeStr = payload.format === 'time'
    ? date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    : payload.format === 'date'
    ? date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    : date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  return (
    <View style={{
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: Space.sm,
      borderRadius: Radius.md,
      backgroundColor: payload.backgroundColor ?? 'rgba(0,0,0,0.6)',
      minWidth: 80,
    }} accessibilityLabel={`Time, ${timeStr}`} accessibilityRole="text">
      <Ionicons name="time-outline" size={16} color={payload.textColor} />
      <Text style={{ fontFamily: Typography.family.semibold, fontSize: Type.caption.size + 1, color: payload.textColor }} numberOfLines={1}>
        {timeStr}
      </Text>
    </View>
  );
}

// ── Weather layer content ──────────────────────────────────────────
function WeatherLayerContent({ layer }: { layer: Extract<CreatorLayer, { type: 'weather' }> }) {
  const { payload } = layer;
  return (
    <View style={{
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: Radius.md,
      backgroundColor: payload.backgroundColor ?? 'rgba(0,0,0,0.6)',
      minWidth: 120,
    }} accessibilityLabel={`Weather, ${payload.temperature}° ${payload.condition}${payload.locationName ? `, ${payload.locationName}` : ''}`} accessibilityRole="text">
      <Text style={{ fontSize: Type.priceList.size }}>{payload.emoji}</Text>
      <View style={{ gap: 1 }}>
        <Text style={{ fontFamily: Typography.family.semibold, fontSize: Type.caption.size + 1, color: payload.textColor }} numberOfLines={1}>
          {payload.temperature}° {payload.condition}
        </Text>
        {payload.locationName ? (
          <Text style={{ fontFamily: Typography.family.regular, fontSize: 10, color: payload.textColor, opacity: 0.7 }} numberOfLines={1}>
            {payload.locationName}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

// ── Selection handles ──────────────────────────────────────────────
// 20px visible handles with shadow, 44pt invisible touch targets,
// spring scale-in animation, and a rotation handle above top-center.
function SelectionHandles({
  handleScaleSV,
  colors,
  layerLocked,
  scaleSV,
  rotationSV,
  onScaleChange,
  onRotationChange,
  onCommit,
}: {
  handleScaleSV: ReturnType<typeof useSharedValue<number>>;
  colors: ReturnType<typeof useAppTheme>['colors'];
  layerLocked: boolean;
  scaleSV: ReturnType<typeof useSharedValue<number>>;
  rotationSV: ReturnType<typeof useSharedValue<number>>;
  onScaleChange: (scale: number) => void;
  onRotationChange: (rotation: number) => void;
  onCommit: () => void;
}) {
  const handleColor = layerLocked ? colors.warning : colors.brand;
  const startScale = useSharedValue(1);
  const startRotation = useSharedValue(0);

  const animatedHandleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: handleScaleSV.value }],
  }));

  // ── Corner handle: drag to resize (scale) ──
  // The handle is at a corner. Dragging away from center = scale up,
  // dragging toward center = scale down. We use the Y component of
  // the drag (in the layer's rotated space) as the primary axis.
  const cornerPan = useMemo(
    () =>
      Gesture.Pan()
        .enabled(!layerLocked)
        .minDistance(3)
        .onStart(() => {
          startScale.value = scaleSV.value;
        })
        .onUpdate((e) => {
          // Use absolute translation distance for scale change
          // Positive Y (drag down/away) = scale up
          const scaleDelta = 1 + (e.translationY * 0.005);
          const newScale = Math.max(0.2, Math.min(5, startScale.value * scaleDelta));
          scaleSV.value = newScale;
          runOnJS(onScaleChange)(Math.round(newScale * 100) / 100);
        })
        .onEnd(() => {
          runOnJS(onCommit)();
        }),
    [layerLocked, scaleSV, startScale, onScaleChange, onCommit]
  );

  // ── Rotation handle: drag to rotate ──
  // The handle is above the top-center. Dragging left/right rotates.
  const rotationPan = useMemo(
    () =>
      Gesture.Pan()
        .enabled(!layerLocked)
        .minDistance(3)
        .onStart(() => {
          startRotation.value = rotationSV.value;
        })
        .onUpdate((e) => {
          // Convert drag translation to rotation degrees
          // 1px of horizontal drag = ~0.5 degrees
          const rotationDelta = e.translationX * 0.5;
          const newRotation = normaliseDegrees(startRotation.value + rotationDelta);
          rotationSV.value = newRotation;
          runOnJS(onRotationChange)(Math.round(newRotation));
        })
        .onEnd(() => {
          runOnJS(onCommit)();
        }),
    [layerLocked, rotationSV, startRotation, onRotationChange, onCommit]
  );

  const handleBase: ViewStyle = {
    position: 'absolute',
    width: 20,
    height: 20,
    borderRadius: Radius.full,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: handleColor,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  };

  // Invisible hit zone — 44pt for touch compliance
  const hitZone: ViewStyle = {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: Radius.full,
  };

  return (
    <Reanimated.View style={[StyleSheet.absoluteFill, animatedHandleStyle]} accessibilityLabel="Layer selection handles" accessibilityRole="adjustable">
      {/* Corner handles — 20px visible, 44pt hit zone, draggable */}
      {/* Top-left */}
      <GestureDetector gesture={cornerPan}>
        <Reanimated.View style={[hitZone, { top: -22, left: -22 }]} accessibilityLabel="Resize handle, top left" accessibilityRole="adjustable" accessibilityHint="Drag to resize the layer">
          <View style={[handleBase, { top: 12, left: 12 }]} pointerEvents="none" />
        </Reanimated.View>
      </GestureDetector>
      {/* Top-right */}
      <GestureDetector gesture={cornerPan}>
        <Reanimated.View style={[hitZone, { top: -22, right: -22 }]} accessibilityLabel="Resize handle, top right" accessibilityRole="adjustable" accessibilityHint="Drag to resize the layer">
          <View style={[handleBase, { top: 12, right: 12 }]} pointerEvents="none" />
        </Reanimated.View>
      </GestureDetector>
      {/* Bottom-left */}
      <GestureDetector gesture={cornerPan}>
        <Reanimated.View style={[hitZone, { bottom: -22, left: -22 }]} accessibilityLabel="Resize handle, bottom left" accessibilityRole="adjustable" accessibilityHint="Drag to resize the layer">
          <View style={[handleBase, { bottom: 12, left: 12 }]} pointerEvents="none" />
        </Reanimated.View>
      </GestureDetector>
      {/* Bottom-right */}
      <GestureDetector gesture={cornerPan}>
        <Reanimated.View style={[hitZone, { bottom: -22, right: -22 }]} accessibilityLabel="Resize handle, bottom right" accessibilityRole="adjustable" accessibilityHint="Drag to resize the layer">
          <View style={[handleBase, { bottom: 12, right: 12 }]} pointerEvents="none" />
        </Reanimated.View>
      </GestureDetector>

      {/* Rotation handle — above top-center, connected by a line */}
      <View
        style={{
          position: 'absolute',
          top: -28,
          left: '50%',
          marginLeft: -1,
          width: 2,
          height: 18,
          backgroundColor: handleColor,
        }}
        pointerEvents="none"
      />
      <GestureDetector gesture={rotationPan}>
        <Reanimated.View style={[hitZone, { top: -50, left: '50%', marginLeft: -22 }]} accessibilityLabel="Rotation handle" accessibilityRole="adjustable" accessibilityHint="Drag to rotate the layer">
          <View style={[handleBase, { top: 12, left: 12 }]} pointerEvents="none">
            <Ionicons name="refresh" size={10} color={handleColor} style={{ textAlign: 'center', lineHeight: 16 }} />
          </View>
        </Reanimated.View>
      </GestureDetector>
    </Reanimated.View>
  );
}

function AlignmentGuides({
  canvasWidth,
  canvasHeight,
  colors,
  smartGuides,
}: {
  canvasWidth: number;
  canvasHeight: number;
  colors: ReturnType<typeof useAppTheme>['colors'];
  smartGuides?: { vertical: number[]; horizontal: number[] };
}) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* Horizontal centre line — 1.5px, brand color at 50% opacity */}
      <View style={{
        position: 'absolute',
        left: 0,
        right: 0,
        top: canvasHeight / 2 - 0.75,
        height: 1.5,
        backgroundColor: colors.brand,
        opacity: 0.5,
      }} />
      {/* Vertical centre line */}
      <View style={{
        position: 'absolute',
        top: 0,
        bottom: 0,
        left: canvasWidth / 2 - 0.75,
        width: 1.5,
        backgroundColor: colors.brand,
        opacity: 0.5,
      }} />
      {/* Center dot at intersection */}
      <View style={{
        position: 'absolute',
        left: canvasWidth / 2 - 3,
        top: canvasHeight / 2 - 3,
        width: 6,
        height: 6,
        borderRadius: Radius.full,
        backgroundColor: colors.brand,
        opacity: 0.6,
      }} />
      {/* Safe-zone edges — 1px dashed, muted at 25% opacity */}
      <View style={{ position: 'absolute', left: 0, right: 0, top: canvasHeight * SAFE_MARGIN, height: 1, backgroundColor: colors.textMuted, opacity: 0.25 }} />
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: canvasHeight * SAFE_MARGIN, height: 1, backgroundColor: colors.textMuted, opacity: 0.25 }} />
      <View style={{ position: 'absolute', top: 0, bottom: 0, left: canvasWidth * SAFE_MARGIN, width: 1, backgroundColor: colors.textMuted, opacity: 0.25 }} />
      <View style={{ position: 'absolute', top: 0, bottom: 0, right: canvasWidth * SAFE_MARGIN, width: 1, backgroundColor: colors.textMuted, opacity: 0.25 }} />
      {/* Smart guides — vertical */}
      {(smartGuides?.vertical ?? []).map((x, i) => (
        <View key={`v${i}`} style={{ position: 'absolute', top: 0, bottom: 0, left: x, width: 1, backgroundColor: colors.brand, opacity: 0.7 }} />
      ))}
      {/* Smart guides — horizontal */}
      {(smartGuides?.horizontal ?? []).map((y, i) => (
        <View key={`h${i}`} style={{ position: 'absolute', left: 0, right: 0, top: y, height: 1, backgroundColor: colors.brand, opacity: 0.7 }} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: {
    overflow: 'hidden',
    position: 'relative',
  },
  backgroundPressLayer: {
    ...StyleSheet.absoluteFill,
    zIndex: 0,
  },
  layerInner: {
    width: '100%',
    height: '100%',
    overflow: 'hidden',
  },
  // Empty state — premium designed surface
  emptyState: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Space.sm,
  },
  emptyStateIconWrap: {
    marginBottom: Space.xs,
  },
  emptyStateTitle: {
    fontFamily: Typography.family.semibold,
    fontSize: Type.title.size,
    color: 'rgba(255,255,255,0.85)',
  },
  emptyStateSubtitle: {
    fontFamily: Typography.family.regular,
    fontSize: Type.body.size,
    color: 'rgba(255,255,255,0.4)',
    textAlign: 'center',
  },
  // Gesture feedback badge
  gestureBadge: {
    position: 'absolute',
    top: -32,
    left: '50%',
    marginLeft: -32,
    width: 64,
    height: 24,
    borderRadius: Radius.full,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  gestureBadgeText: {
    fontFamily: Typography.family.semibold,
    fontSize: Type.caption.size,
  },
  // Locked badge
  lockedBadge: {
    position: 'absolute',
    top: -10,
    left: -10,
    width: 20,
    height: 20,
    borderRadius: Radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

const mediaStyles = StyleSheet.create({
  videoBadge: {
    position: 'absolute',
    top: Space.xs,
    left: Space.xs,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: Radius.sm,
    paddingHorizontal: Space.xs,
    paddingVertical: 2,
  },
});

const textStyles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Space.sm + 2,
    paddingVertical: Space.xs + 2,
    borderRadius: Radius.sm,
  },
  text: {
    fontFamily: Typography.family.medium,
    fontSize: Type.body.size + 1,
    textAlign: 'center',
    flexWrap: 'wrap',
  },
});

function createProductStyles(colors: ThemeColors) {
  return StyleSheet.create({
  container: {
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: Radius.md,
    paddingHorizontal: Space.sm,
    paddingVertical: Space.sm,
    gap: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  title: {
    color: '#fff',
    fontFamily: Typography.family.semibold,
    fontSize: Type.caption.size,
  },
  price: {
    color: colors.brand,
    fontFamily: Typography.family.bold,
    fontSize: Type.body.size,
  },
  soldPrice: {
    color: colors.danger,
  },
  deletedPrice: {
    color: '#888',
  },
  imageContainer: {
    borderRadius: Radius.md,
    overflow: 'hidden',
    width: '100%',
    height: '100%',
  },
  thumbnail: {
    width: '100%',
    height: '100%',
    position: 'absolute',
  },
  imageOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: Space.xs,
    paddingVertical: Space.xs,
    gap: 1,
  },
  imageTitle: {
    color: '#fff',
    fontFamily: Typography.family.semibold,
    fontSize: 10,
  },
  imagePrice: {
    color: colors.brand,
    fontFamily: Typography.family.bold,
    fontSize: Type.caption.size,
  },
  soldBadge: {
    position: 'absolute',
    top: Space.sm,
    right: Space.sm,
    backgroundColor: colors.danger,
    borderRadius: Radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  soldBadgeText: {
    color: '#fff',
    fontFamily: Typography.family.bold,
    fontSize: 9,
  },
  hotspotContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: Radius.full,
    paddingHorizontal: Space.smMd,
    paddingVertical: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  hotspotDot: {
    width: 7,
    height: 7,
    borderRadius: Radius.full,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: colors.brand,
  },
  hotspotLabel: {
    color: '#fff',
    fontFamily: Typography.family.semibold,
    fontSize: Type.meta.size,
    flex: 1,
  },
  hotspotPrice: {
    color: colors.brand,
    fontFamily: Typography.family.bold,
    fontSize: Type.meta.size,
  },
  });
}

const mentionStyles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: Radius.full,
    paddingHorizontal: Space.smMd,
    paddingVertical: Space.xs,
    justifyContent: 'center',
    alignItems: 'center',
  },
  text: {
    color: '#fff',
    fontFamily: Typography.family.semibold,
    fontSize: Type.body.size,
  },
});

const lookStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: Radius.full,
    paddingHorizontal: Space.sm + 2,
    paddingVertical: Space.xs,
    justifyContent: 'center',
  },
  text: {
    color: '#fff',
    fontFamily: Typography.family.medium,
    fontSize: Type.caption.size,
  },
});

const voteStyles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(0,0,0,0.75)',
    borderRadius: Radius.lg,
    paddingHorizontal: Space.md + 2,
    paddingVertical: Space.sm + 2,
    gap: 8,
    minWidth: 160,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  question: {
    color: '#fff',
    fontFamily: Typography.family.semibold,
    fontSize: Type.body.size,
    textAlign: 'center',
    flexShrink: 1,
  },
  timerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: Radius.md,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  timerText: {
    color: '#fff',
    fontFamily: Typography.family.medium,
    fontSize: 10,
  },
  optionsRow: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  option: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: Radius.sm,
    paddingVertical: Space.sm,
    paddingHorizontal: Space.md,
    alignItems: 'center',
    minWidth: 60,
    flex: 1,
    maxWidth: '48%',
  },
  optionFirst: {
    // Both options equal weight — no visual hierarchy difference
  },
  optionText: {
    color: '#fff',
    fontFamily: Typography.family.medium,
    fontSize: Type.caption.size + 1,
  },
});

const quizStyles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(0,0,0,0.78)',
    borderRadius: Radius.lg,
    paddingHorizontal: Space.md + 2,
    paddingVertical: Space.sm + 2,
    gap: 10,
    minWidth: 180,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  emoji: {
    fontSize: 18,
  },
  question: {
    color: '#fff',
    fontFamily: Typography.family.semibold,
    fontSize: Type.body.size,
    flex: 1,
  },
  optionsCol: {
    gap: 6,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: Radius.sm,
    paddingVertical: Space.sm,
    paddingHorizontal: Space.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  optionCorrect: {
    backgroundColor: 'rgba(201,164,106,0.25)',
    borderColor: 'rgba(201,164,106,0.6)',
  },
  optionText: {
    color: '#fff',
    fontFamily: Typography.family.medium,
    fontSize: Type.caption.size + 1,
    flex: 1,
  },
  optionTextCorrect: {
    color: '#C9A46A',
    fontFamily: Typography.family.semibold,
  },
  correctBadge: {
    width: 18,
    height: 18,
    borderRadius: Radius.full,
    backgroundColor: '#C9A46A',
    justifyContent: 'center',
    alignItems: 'center',
  },
});

const questionStyles = StyleSheet.create({
  container: {
    borderRadius: Radius.lg,
    paddingHorizontal: Space.md + 2,
    paddingVertical: Space.sm + 2,
    minWidth: 180,
    maxWidth: '100%',
  },
  prompt: {
    color: '#fff',
    fontFamily: Typography.family.semibold,
    fontSize: Type.bodyEmphasis.size,
    marginBottom: Space.sm,
  },
  inputAffordance: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: Radius.md,
    paddingHorizontal: Space.sm + 2,
    paddingVertical: Space.sm,
  },
  placeholder: {
    flex: 1,
    color: 'rgba(255,255,255,0.55)',
    fontFamily: Typography.family.regular,
    fontSize: Type.caption.size,
  },
  sendHint: {
    width: 18,
    height: 18,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});

const sliderStyles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(0,0,0,0.78)',
    borderRadius: Radius.lg,
    paddingHorizontal: Space.md + 2,
    paddingVertical: Space.sm + 2,
    minWidth: 200,
    maxWidth: '100%',
  },
  question: {
    color: '#fff',
    fontFamily: Typography.family.semibold,
    fontSize: Type.body.size,
    marginBottom: 10,
    textAlign: 'center',
  },
  sliderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  emoji: {
    fontSize: 26,
  },
  track: {
    flex: 1,
    height: 6,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
  },
  trackFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: '50%',
    borderRadius: Radius.full,
  },
  thumb: {
    width: 14,
    height: 14,
    borderRadius: Radius.full,
    backgroundColor: '#fff',
    borderWidth: 2,
    position: 'absolute',
    left: '50%',
    marginLeft: -7,
  },
  endLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontFamily: Typography.family.medium,
    fontSize: Type.meta.size,
  },
});

const countdownStyles = StyleSheet.create({
  container: {
    borderRadius: Radius.lg,
    paddingHorizontal: Space.md + 2,
    paddingVertical: Space.sm + 2,
    minWidth: 150,
    maxWidth: '100%',
    alignItems: 'center',
  },
  iconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 2,
  },
  label: {
    fontFamily: Typography.family.semibold,
    fontSize: Type.caption.size - 1,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  time: {
    fontFamily: Typography.family.bold,
    fontSize: Type.title.size,
    fontVariant: ['tabular-nums'],
    letterSpacing: 0.5,
  },
});
