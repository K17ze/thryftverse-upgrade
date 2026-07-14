import React, { useCallback, useMemo, useEffect, useState } from 'react';
import { View, Text, Image, StyleSheet, Pressable, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  runOnJS,
  withTiming,
  withSpring,
  withRepeat,
  cancelAnimation,
  Easing,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { Space, Radius, Type, Typography } from '../theme/designTokens';
import { useAppTheme } from '../theme/ThemeContext';
import { Colors } from '../constants/colors';
import { Video, ResizeMode } from '../components/compat/Video';
import type { CreatorLayer, CreatorDocument, CreatorPage } from './composition';
import { getVisibleLayersSorted } from './composition';

const RAD_TO_DEG = 180 / Math.PI;

function normaliseDegrees(deg: number): number {
  let result = deg % 360;
  if (result < 0) result += 360;
  return result;
}

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
}: CreatorCanvasProps) {
  const { canvas } = document;
  const visibleLayers = getVisibleLayersSorted(page);
  const { colors } = useAppTheme();
  const isEmpty = visibleLayers.length === 0;

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
        <Image
          source={{ uri: canvas.background.value }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
        />
      );
    }
    return <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.surfaceAlt }]} />;
  };

  // Canvas borderRadius: 0 in edit mode (the canvas IS the stage),
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
        <Pressable style={styles.backgroundPressLayer} onPress={onCanvasPress} />
      )}

      {visibleLayers.map((layer) => (
        <LayerRenderer
          key={layer.id}
          layer={layer}
          canvasWidth={canvasWidth}
          canvasHeight={canvasHeight}
          mode={mode}
          isSelected={selectedLayerId === layer.id}
          onPress={onLayerPress}
          onTransformChange={onLayerTransformChange}
          onDoubleTap={onLayerDoubleTap}
          onLongPress={onLayerLongPress}
        />
      ))}

      {/* Empty canvas state — guides the user to start creating */}
      {mode === 'edit' && isEmpty && (
        <EmptyCanvasState colors={colors} />
      )}
    </GestureHandlerRootView>
  );
}

// ── Empty canvas state ─────────────────────────────────────────────
// Subtle pulsing icon + guidance text. Respects reduced motion.
function EmptyCanvasState({ colors }: { colors: ReturnType<typeof useAppTheme>['colors'] }) {
  const scaleSV = useSharedValue(1);

  useEffect(() => {
    scaleSV.value = withRepeat(
      withTiming(1.05, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
    return () => cancelAnimation(scaleSV);
  }, [scaleSV]);

  const animatedIconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scaleSV.value }],
  }));

  return (
    <View style={styles.emptyState} pointerEvents="none">
      <Reanimated.View style={animatedIconStyle}>
        <Ionicons name="images-outline" size={48} color={colors.textMuted} />
      </Reanimated.View>
      <Text style={[styles.emptyStateText, { color: colors.textSecondary }]}>
        Tap Media to start
      </Text>
    </View>
  );
}

interface LayerRendererProps {
  layer: CreatorLayer;
  canvasWidth: number;
  canvasHeight: number;
  mode: 'edit' | 'preview' | 'view';
  isSelected: boolean;
  onPress?: (layerId: string) => void;
  onTransformChange?: (layerId: string, updates: Partial<CreatorLayer>) => void;
  onDoubleTap?: (layerId: string) => void;
  onLongPress?: (layerId: string) => void;
}

const SNAP_THRESHOLD = 0.02;
const SAFE_MARGIN = 0.05;
const ROTATION_SNAP_DEG = 15;

function triggerHaptic() {
  try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
}

function LayerRenderer({
  layer,
  canvasWidth,
  canvasHeight,
  mode,
  isSelected,
  onPress,
  onTransformChange,
  onDoubleTap,
  onLongPress,
}: LayerRendererProps) {
  const { colors } = useAppTheme();
  const translateX = useSharedValue(layer.x * canvasWidth);
  const translateY = useSharedValue(layer.y * canvasHeight);
  const scaleSV = useSharedValue(layer.scale);
  const rotationSV = useSharedValue(layer.rotation);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const startScale = useSharedValue(1);
  const startRotation = useSharedValue(0);
  const [showGuides, setShowGuides] = useState(false);

  // Selection animation: border + handles fade/scale in with spring
  const selectionOpacity = useSharedValue(0);
  const handleScale = useSharedValue(0.5);

  useEffect(() => {
    if (isSelected) {
      selectionOpacity.value = withSpring(1, { damping: 25, stiffness: 400 });
      handleScale.value = withSpring(1, { damping: 25, stiffness: 400 });
    } else {
      selectionOpacity.value = withTiming(0, { duration: 120 });
      handleScale.value = withTiming(0.5, { duration: 120 });
    }
  }, [isSelected, selectionOpacity, handleScale]);

  // Gesture feedback badges (scale % and rotation angle)
  const [gestureBadge, setGestureBadge] = useState<string | null>(null);

  // Sync shared values when document state changes (undo/redo/draft load/page change)
  useEffect(() => {
    translateX.value = withTiming(layer.x * canvasWidth, { duration: 150 });
    translateY.value = withTiming(layer.y * canvasHeight, { duration: 150 });
    scaleSV.value = withTiming(layer.scale, { duration: 150 });
    rotationSV.value = withTiming(normaliseDegrees(layer.rotation), { duration: 150 });
  }, [layer.x, layer.y, layer.scale, layer.rotation, canvasWidth, canvasHeight]);

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
    if (mode === 'edit' && onLongPress) {
      onLongPress(layer.id);
    }
  }, [mode, onLongPress, layer.id]);

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

    translateX.value = withTiming(normX * canvasWidth, { duration: 100 });
    translateY.value = withTiming(normY * canvasHeight, { duration: 100 });

    if (snappedX || snappedY) triggerHaptic();
    setShowGuides(false);

    onTransformChange?.(layer.id, { x: normX, y: normY });
  }, [canvasWidth, canvasHeight, layer.id, layer.width, layer.height, layer.scale, onTransformChange, translateX, translateY]);

  const handleTransformCommit = useCallback((finalScale: number, finalRotation: number) => {
    const clampedScale = Math.max(0.2, Math.min(5, finalScale));
    const normalisedRotation = normaliseDegrees(finalRotation);

    // Snap rotation to 15-degree increments if close
    let snappedRotation = normalisedRotation;
    const nearestSnap = Math.round(normalisedRotation / ROTATION_SNAP_DEG) * ROTATION_SNAP_DEG;
    if (Math.abs(normalisedRotation - nearestSnap) < 5) {
      snappedRotation = nearestSnap % 360;
      triggerHaptic();
    }

    scaleSV.value = withTiming(clampedScale, { duration: 100 });
    rotationSV.value = withTiming(snappedRotation, { duration: 100 });
    onTransformChange?.(layer.id, { scale: clampedScale, rotation: snappedRotation });
  }, [layer.id, onTransformChange, scaleSV, rotationSV]);

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
        <Reanimated.View style={animatedStyle} accessibilityLabel={`${layer.type} layer${layer.locked ? ', locked' : ''}${layer.hidden ? ', hidden' : ''}${isSelected ? ', selected' : ''}`} accessibilityRole="image">
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
            <View style={[styles.lockedBadge, { backgroundColor: colors.warning }]} pointerEvents="none">
              <Ionicons name="lock-closed" size={10} color="#fff" />
            </View>
          )}
          {/* Gesture feedback badge */}
          {gestureBadge && (
            <View style={[styles.gestureBadge, { backgroundColor: colors.surfaceElevated }]} pointerEvents="none">
              <Text style={[styles.gestureBadgeText, { color: colors.textPrimary }]}>{gestureBadge}</Text>
            </View>
          )}
          {showGuides && <AlignmentGuides canvasWidth={canvasWidth} canvasHeight={canvasHeight} colors={colors} />}
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
    >
      <View style={[styles.layerInner, { borderRadius: getLayerRadius(layer) }]}>
        {content}
      </View>
    </View>
  );
}

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
    case 'decorative':
      return 0;
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
    case 'decorative':
      return <DecorativeLayerContent layer={layer} />;
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
          <Image source={{ uri: payload.thumbnailUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
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
        <View style={mediaStyles.videoBadge} pointerEvents="none">
          <Ionicons name="videocam" size={12} color="#fff" />
        </View>
      </>
    );
  }

  if (imageError) {
    return (
      <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.surfaceAlt, justifyContent: 'center', alignItems: 'center' }]}>
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
  return (
    <View
      style={[
        textStyles.container,
        payload.backgroundColor ? { backgroundColor: payload.backgroundColor } : null,
        payload.alignment === 'left' && { alignItems: 'flex-start' },
        payload.alignment === 'right' && { alignItems: 'flex-end' },
      ]}
    >
      <Text
        style={[
          textStyles.text,
          { color: payload.textColor },
          payload.textStyle === 'headline' && { fontFamily: Typography.family.bold, fontSize: Type.title.size + 2 },
          payload.textStyle === 'editorial' && { fontFamily: Typography.family.bold, fontSize: Type.title.size },
          payload.textStyle === 'clean' && { fontFamily: Typography.family.light, fontSize: Type.body.size },
          payload.textStyle === 'compact' && { fontFamily: Typography.family.semibold, fontSize: Type.caption.size, letterSpacing: 0.5 },
          payload.textStyle === 'handwritten' && { fontFamily: Typography.family.medium, fontSize: Type.body.size, fontStyle: 'italic' },
        ]}
      >
        {payload.text}
      </Text>
    </View>
  );
}

function ProductLayerContent({ layer }: { layer: Extract<CreatorLayer, { type: 'product' }> }) {
  const { payload } = layer;
  const isSold = payload.availability === 'sold';
  const isDeleted = payload.availability === 'deleted';
  const hasImage = !!payload.snapshotImageUrl;
  const hasHotspot = !!payload.hotspotLabel;

  if (hasImage) {
    return (
      <View style={productStyles.imageContainer}>
        <Image
          source={{ uri: payload.snapshotImageUrl! }}
          style={productStyles.thumbnail}
          resizeMode="cover"
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
      <View style={productStyles.hotspotContainer}>
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

  return (
    <View style={productStyles.container}>
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
    <View style={mentionStyles.container}>
      <Text style={mentionStyles.text}>@{payload.username}</Text>
    </View>
  );
}

function LookLayerContent({ layer }: { layer: Extract<CreatorLayer, { type: 'look' }> }) {
  const { payload } = layer;
  return (
    <View style={lookStyles.container}>
      <Ionicons name="shirt-outline" size={12} color="#fff" />
      <Text style={lookStyles.text} numberOfLines={1}>{payload.snapshotCaption || 'View look'}</Text>
    </View>
  );
}

function VoteLayerContent({ layer }: { layer: Extract<CreatorLayer, { type: 'vote' }> }) {
  const { payload } = layer;
  return (
    <View style={voteStyles.container}>
      <Text style={voteStyles.question}>{payload.question}</Text>
      {payload.options.map((opt) => (
        <View key={opt.id} style={voteStyles.option}>
          <Text style={voteStyles.optionText}>{opt.label}</Text>
        </View>
      ))}
    </View>
  );
}

function DecorativeLayerContent({ layer }: { layer: Extract<CreatorLayer, { type: 'decorative' }> }) {
  const { payload } = layer;
  const baseStyle: any = {
    width: '100%',
    height: '100%',
    backgroundColor: payload.color,
    opacity: payload.opacity,
  };
  switch (payload.shape) {
    case 'circle':
      return <View style={[baseStyle, { borderRadius: 999 }]} />;
    case 'square':
      return <View style={[baseStyle, { borderRadius: Radius.sm }]} />;
    case 'line':
      return <View style={[baseStyle, { height: 2, marginTop: '50%' }]} />;
    case 'arrow':
      return <Ionicons name="arrow-forward" size={24} color={payload.color} style={{ opacity: payload.opacity }} />;
    case 'star':
      return <Ionicons name="star" size={24} color={payload.color} style={{ opacity: payload.opacity }} />;
    case 'heart':
      return <Ionicons name="heart" size={24} color={payload.color} style={{ opacity: payload.opacity }} />;
    default:
      return null;
  }
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

  const handleBase: any = {
    position: 'absolute',
    width: 20,
    height: 20,
    borderRadius: 10,
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
  const hitZone: any = {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 22,
  };

  return (
    <Reanimated.View style={[StyleSheet.absoluteFill, animatedHandleStyle]}>
      {/* Corner handles — 20px visible, 44pt hit zone, draggable */}
      {/* Top-left */}
      <GestureDetector gesture={cornerPan}>
        <Reanimated.View style={[hitZone, { top: -22, left: -22 }]}>
          <View style={[handleBase, { top: 12, left: 12 }]} pointerEvents="none" />
        </Reanimated.View>
      </GestureDetector>
      {/* Top-right */}
      <GestureDetector gesture={cornerPan}>
        <Reanimated.View style={[hitZone, { top: -22, right: -22 }]}>
          <View style={[handleBase, { top: 12, right: 12 }]} pointerEvents="none" />
        </Reanimated.View>
      </GestureDetector>
      {/* Bottom-left */}
      <GestureDetector gesture={cornerPan}>
        <Reanimated.View style={[hitZone, { bottom: -22, left: -22 }]}>
          <View style={[handleBase, { bottom: 12, left: 12 }]} pointerEvents="none" />
        </Reanimated.View>
      </GestureDetector>
      {/* Bottom-right */}
      <GestureDetector gesture={cornerPan}>
        <Reanimated.View style={[hitZone, { bottom: -22, right: -22 }]}>
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
        <Reanimated.View style={[hitZone, { top: -50, left: '50%', marginLeft: -22 }]}>
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
}: {
  canvasWidth: number;
  canvasHeight: number;
  colors: ReturnType<typeof useAppTheme>['colors'];
}) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* Horizontal centre line — 1.5px, brand color at 40% opacity */}
      <View style={{
        position: 'absolute',
        left: 0,
        right: 0,
        top: canvasHeight / 2 - 0.75,
        height: 1.5,
        backgroundColor: colors.brand,
        opacity: 0.4,
      }} />
      {/* Vertical centre line */}
      <View style={{
        position: 'absolute',
        top: 0,
        bottom: 0,
        left: canvasWidth / 2 - 0.75,
        width: 1.5,
        backgroundColor: colors.brand,
        opacity: 0.4,
      }} />
      {/* Safe-zone edges — 1px dashed, muted at 30% opacity */}
      <View style={{ position: 'absolute', left: 0, right: 0, top: canvasHeight * SAFE_MARGIN, height: 1, backgroundColor: colors.textMuted, opacity: 0.3 }} />
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: canvasHeight * SAFE_MARGIN, height: 1, backgroundColor: colors.textMuted, opacity: 0.3 }} />
      <View style={{ position: 'absolute', top: 0, bottom: 0, left: canvasWidth * SAFE_MARGIN, width: 1, backgroundColor: colors.textMuted, opacity: 0.3 }} />
      <View style={{ position: 'absolute', top: 0, bottom: 0, right: canvasWidth * SAFE_MARGIN, width: 1, backgroundColor: colors.textMuted, opacity: 0.3 }} />
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
  // Empty state
  emptyState: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Space.md,
  },
  emptyStateText: {
    fontFamily: Typography.family.medium,
    fontSize: Type.body.size,
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
    fontSize: 12,
  },
  // Locked badge
  lockedBadge: {
    position: 'absolute',
    top: -10,
    left: -10,
    width: 20,
    height: 20,
    borderRadius: 10,
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
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
});

const textStyles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs,
    borderRadius: Radius.sm,
  },
  text: {
    fontFamily: Typography.family.semibold,
    fontSize: Type.body.size,
    textAlign: 'center',
  },
});

const productStyles = StyleSheet.create({
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
    color: Colors.brand,
    fontFamily: Typography.family.bold,
    fontSize: Type.body.size,
  },
  soldPrice: {
    color: Colors.danger,
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
    color: Colors.brand,
    fontFamily: Typography.family.bold,
    fontSize: Type.caption.size,
  },
  soldBadge: {
    position: 'absolute',
    top: Space.sm,
    right: Space.sm,
    backgroundColor: Colors.danger,
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
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderRadius: Radius.full,
    paddingHorizontal: Space.sm + 2,
    paddingVertical: 5,
  },
  hotspotDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.brand,
  },
  hotspotLabel: {
    color: '#fff',
    fontFamily: Typography.family.medium,
    fontSize: 10,
    flex: 1,
  },
  hotspotPrice: {
    color: Colors.brand,
    fontFamily: Typography.family.bold,
    fontSize: 10,
  },
});

const mentionStyles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: Radius.full,
    paddingHorizontal: Space.sm + 4,
    paddingVertical: 4,
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
    paddingVertical: 4,
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
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: Radius.md,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    gap: 6,
    minWidth: 140,
    justifyContent: 'center',
    alignItems: 'center',
  },
  question: {
    color: '#fff',
    fontFamily: Typography.family.semibold,
    fontSize: Type.body.size,
    textAlign: 'center',
  },
  option: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: Radius.sm,
    paddingVertical: 6,
    paddingHorizontal: Space.sm,
    alignItems: 'center',
  },
  optionText: {
    color: '#fff',
    fontFamily: Typography.family.medium,
    fontSize: Type.caption.size,
  },
});
