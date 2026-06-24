import React, { useCallback, useMemo } from 'react';
import { View, Text, Image, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  runOnJS,
  withTiming,
} from 'react-native-reanimated';
import { Space, Radius, Type, Typography } from '../theme/designTokens';
import { Colors } from '../constants/colors';
import { Video, ResizeMode } from '../components/compat/Video';
import type { CreatorLayer, CreatorDocument, CreatorPage } from './composition';
import { getVisibleLayersSorted } from './composition';

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
}: CreatorCanvasProps) {
  const { canvas } = document;
  const visibleLayers = getVisibleLayersSorted(page);

  const renderBackground = () => {
    if (canvas.background.type === 'color') {
      return <View style={[StyleSheet.absoluteFill, { backgroundColor: canvas.background.value }]} />;
    }
    if (canvas.background.type === 'gradient' && canvas.background.secondaryValue) {
      return (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: canvas.background.value }]} />
      );
    }
    if (canvas.background.type === 'image' && canvas.background.value) {
      return <Image source={{ uri: canvas.background.value }} style={StyleSheet.absoluteFill} resizeMode="cover" />;
    }
    return <View style={[StyleSheet.absoluteFill, { backgroundColor: '#1a1a1a' }]} />;
  };

  return (
    <GestureHandlerRootView
      style={[
        styles.canvas,
        {
          width: canvasWidth,
          height: canvasHeight,
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
        />
      ))}
    </GestureHandlerRootView>
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
}

const SNAP_THRESHOLD = 0.02;
const SAFE_MARGIN = 0.05;

function LayerRenderer({
  layer,
  canvasWidth,
  canvasHeight,
  mode,
  isSelected,
  onPress,
  onTransformChange,
}: LayerRendererProps) {
  const translateX = useSharedValue(layer.x * canvasWidth);
  const translateY = useSharedValue(layer.y * canvasHeight);
  const scaleSV = useSharedValue(layer.scale);
  const rotationSV = useSharedValue(layer.rotation);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const startScale = useSharedValue(1);
  const startRotation = useSharedValue(0);

  const handlePress = useCallback(() => {
    if (mode === 'edit' && onPress && !layer.locked) {
      onPress(layer.id);
    }
  }, [mode, onPress, layer.id, layer.locked]);

  const handlePositionCommit = useCallback((finalX: number, finalY: number) => {
    let normX = finalX / canvasWidth;
    let normY = finalY / canvasHeight;
    // Snapping to center
    if (Math.abs(normX - 0.5) < SNAP_THRESHOLD) normX = 0.5;
    if (Math.abs(normY - 0.5) < SNAP_THRESHOLD) normY = 0.5;
    // Clamp to safe area
    normX = Math.max(SAFE_MARGIN, Math.min(1 - SAFE_MARGIN, normX));
    normY = Math.max(SAFE_MARGIN, Math.min(1 - SAFE_MARGIN, normY));
    translateX.value = withTiming(normX * canvasWidth, { duration: 0 });
    translateY.value = withTiming(normY * canvasHeight, { duration: 0 });
    onTransformChange?.(layer.id, { x: normX, y: normY });
  }, [canvasWidth, canvasHeight, layer.id, onTransformChange, translateX, translateY]);

  const handleTransformCommit = useCallback((finalScale: number, finalRotation: number) => {
    const clampedScale = Math.max(0.2, Math.min(5, finalScale));
    scaleSV.value = withTiming(clampedScale, { duration: 0 });
    rotationSV.value = withTiming(finalRotation, { duration: 0 });
    onTransformChange?.(layer.id, { scale: clampedScale, rotation: finalRotation });
  }, [layer.id, onTransformChange, scaleSV, rotationSV]);

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(mode === 'edit' && !layer.locked)
        .minDistance(3)
        .onStart(() => {
          startX.value = translateX.value;
          startY.value = translateY.value;
          runOnJS(onPress)?.(layer.id);
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
        })
        .onEnd(() => {
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
          rotationSV.value = startRotation.value + e.rotation;
        })
        .onEnd(() => {
          runOnJS(handleTransformCommit)(scaleSV.value, rotationSV.value);
        }),
    [mode, layer.locked, rotationSV, startRotation, scaleSV, handleTransformCommit]
  );

  const tapGesture = useMemo(
    () =>
      Gesture.Tap()
        .enabled(mode === 'edit' && !layer.locked)
        .onEnd(() => {
          runOnJS(handlePress)();
        }),
    [mode, layer.locked, handlePress]
  );

  const composedGesture = useMemo(
    () => Gesture.Race(Gesture.Simultaneous(pinchGesture, rotationGesture), panGesture, tapGesture),
    [panGesture, pinchGesture, rotationGesture, tapGesture]
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

  if (mode === 'edit' && !layer.locked) {
    return (
      <GestureDetector gesture={composedGesture}>
        <Reanimated.View style={animatedStyle}>
          <View style={[styles.layerInner, isSelected && styles.layerSelected]}>
            {content}
          </View>
          {isSelected && <SelectionHandles />}
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
      <View style={styles.layerInner}>
        {content}
      </View>
    </View>
  );
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
  const [videoError, setVideoError] = React.useState(false);

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
          <Ionicons name="videocam" size={10} color="#fff" />
        </View>
      </>
    );
  }

  return (
    <Image
      source={{ uri: payload.mediaUri }}
      style={StyleSheet.absoluteFill}
      resizeMode={payload.contentFit === 'contain' ? 'contain' : payload.contentFit === 'fill' ? 'stretch' : 'cover'}
    />
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
  return (
    <View style={productStyles.container}>
      <View style={productStyles.row}>
        <Ionicons name="pricetag" size={12} color="#fff" />
        <Text style={productStyles.title} numberOfLines={1}>{payload.snapshotTitle || 'Listing'}</Text>
      </View>
      {payload.snapshotPriceGbp !== undefined && (
        <Text style={[productStyles.price, isSold && productStyles.soldPrice]}>
          {isSold ? 'SOLD' : `£${payload.snapshotPriceGbp.toFixed(0)}`}
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

function SelectionHandles() {
  return (
    <View style={styles.selectionOverlay} pointerEvents="none">
      <View style={[styles.handle, styles.handleTL]} />
      <View style={[styles.handle, styles.handleTR]} />
      <View style={[styles.handle, styles.handleBL]} />
      <View style={[styles.handle, styles.handleBR]} />
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: {
    borderRadius: Radius.lg,
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
    borderRadius: Radius.xs,
  },
  layerSelected: {
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.8)',
    borderRadius: Radius.sm,
  },
  selectionOverlay: {
    ...StyleSheet.absoluteFill,
  },
  handle: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.brand,
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  handleTL: { top: -6, left: -6 },
  handleTR: { top: -6, right: -6 },
  handleBL: { bottom: -6, left: -6 },
  handleBR: { bottom: -6, right: -6 },
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
    color: '#ff6b6b',
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
