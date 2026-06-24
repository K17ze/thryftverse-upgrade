import React, { useCallback } from 'react';
import { View, Text, Image, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
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
    <View
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
        />
      ))}
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
}

function LayerRenderer({
  layer,
  canvasWidth,
  canvasHeight,
  mode,
  isSelected,
  onPress,
}: LayerRendererProps) {
  const handlePress = useCallback(() => {
    if (mode === 'edit' && onPress && !layer.locked) {
      onPress(layer.id);
    }
  }, [mode, onPress, layer.id, layer.locked]);

  const left = layer.x * canvasWidth;
  const top = layer.y * canvasHeight;
  const width = layer.width * canvasWidth * layer.scale;
  const height = layer.height * canvasHeight * layer.scale;

  const layerStyle: any = {
    position: 'absolute',
    left: left - width / 2,
    top: top - height / 2,
    width,
    height,
    transform: [{ rotate: `${layer.rotation}deg` }],
    opacity: layer.opacity,
    zIndex: layer.zIndex,
  };

  const content = renderLayerContent(layer, width, height);

  if (mode === 'edit' && !layer.locked) {
    return (
      <Pressable style={layerStyle} onPress={handlePress}>
        <View style={[styles.layerInner, isSelected && styles.layerSelected]}>
          {content}
        </View>
        {isSelected && <SelectionHandles />}
      </Pressable>
    );
  }

  return (
    <View style={layerStyle} pointerEvents="none">
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
