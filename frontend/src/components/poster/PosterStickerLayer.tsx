import React, { useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { Space, Radius, Type, Typography } from '../../theme/designTokens';
import { Colors } from '../../constants/colors';
import type { PosterSticker as ApiPosterSticker } from '../../services/postersApi';

interface PosterStickerLayerProps {
  stickers: ApiPosterSticker[];
  onStickerPress?: (sticker: ApiPosterSticker) => void;
  editable?: boolean;
  selectedStickerId?: string | null;
  onStickerPositionChange?: (id: string, x: number, y: number) => void;
  containerWidth: number;
  containerHeight: number;
  style?: ViewStyle;
}

const CLAMP_MARGIN = 0.05;

function clampNormalized(value: number): number {
  return Math.max(CLAMP_MARGIN, Math.min(1 - CLAMP_MARGIN, value));
}

export function PosterStickerLayer({
  stickers,
  onStickerPress,
  editable = false,
  selectedStickerId,
  onStickerPositionChange,
  containerWidth,
  containerHeight,
  style,
}: PosterStickerLayerProps) {
  return (
    <View style={[StyleSheet.absoluteFill, style]} pointerEvents="box-none">
      {stickers.map((sticker) => (
        <DraggableSticker
          key={sticker.id}
          sticker={sticker}
          editable={editable}
          isSelected={selectedStickerId === sticker.id}
          containerWidth={containerWidth}
          containerHeight={containerHeight}
          onPress={onStickerPress}
          onPositionChange={onStickerPositionChange}
        />
      ))}
    </View>
  );
}

interface DraggableStickerProps {
  sticker: ApiPosterSticker;
  editable: boolean;
  isSelected: boolean;
  containerWidth: number;
  containerHeight: number;
  onPress?: (sticker: ApiPosterSticker) => void;
  onPositionChange?: (id: string, x: number, y: number) => void;
}

function DraggableSticker({
  sticker,
  editable,
  isSelected,
  containerWidth,
  containerHeight,
  onPress,
  onPositionChange,
}: DraggableStickerProps) {
  const translateX = useSharedValue(sticker.x * containerWidth);
  const translateY = useSharedValue(sticker.y * containerHeight);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);

  const handlePositionCommit = useCallback(
    (finalX: number, finalY: number) => {
      const normX = clampNormalized(finalX / containerWidth);
      const normY = clampNormalized(finalY / containerHeight);
      translateX.value = withTiming(normX * containerWidth, { duration: 0 });
      translateY.value = withTiming(normY * containerHeight, { duration: 0 });
      onPositionChange?.(sticker.id, normX, normY);
    },
    [containerWidth, containerHeight, onPositionChange, sticker.id, translateX, translateY]
  );

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(editable)
        .minDistance(3)
        .onStart(() => {
          startX.value = translateX.value;
          startY.value = translateY.value;
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
    [editable, translateX, translateY, startX, startY, handlePositionCommit]
  );

  const tapGesture = useMemo(
    () =>
      Gesture.Tap()
        .enabled(editable && !!onPress)
        .onEnd(() => {
          if (onPress) {
            runOnJS(onPress)(sticker);
          }
        }),
    [editable, onPress, sticker]
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: sticker.scale },
      { rotate: `${sticker.rotation}deg` },
    ],
  }));

  const composedGesture = useMemo(
    () => Gesture.Race(panGesture, tapGesture),
    [panGesture, tapGesture]
  );

  if (editable) {
    return (
      <GestureDetector gesture={composedGesture}>
        <Reanimated.View
          style={[styles.stickerBase, { left: 0, top: 0 }, animatedStyle]}
          pointerEvents="auto"
        >
          <View style={[styles.stickerInner, isSelected && styles.selectedWrap]}>
            <StickerContent sticker={sticker} />
          </View>
          {isSelected && (
            <View style={styles.selectionHandle} pointerEvents="none">
              <View style={styles.handleDot} />
            </View>
          )}
        </Reanimated.View>
      </GestureDetector>
    );
  }

  return (
    <Reanimated.View
      style={[styles.stickerBase, { left: 0, top: 0 }, animatedStyle]}
      pointerEvents="none"
    >
      <View style={styles.stickerInner}>
        <StickerContent sticker={sticker} />
      </View>
    </Reanimated.View>
  );
}

function StickerContent({ sticker }: { sticker: ApiPosterSticker }) {
  switch (sticker.type) {
    case 'text':
      return (
        <View
          style={[
            styles.textWrap,
            sticker.payload.backgroundColor ? { backgroundColor: sticker.payload.backgroundColor } : null,
            sticker.payload.alignment === 'left' && { alignItems: 'flex-start' },
            sticker.payload.alignment === 'right' && { alignItems: 'flex-end' },
          ]}
        >
          <Text
            style={[
              styles.textSticker,
              { color: sticker.payload.textColor ?? '#ffffff' },
              sticker.payload.textStyle === 'editorial' && { fontFamily: Typography.family.bold, fontSize: Type.title.size },
              sticker.payload.textStyle === 'minimal' && { fontFamily: Typography.family.light, fontSize: Type.body.size },
              sticker.payload.textStyle === 'label' && { fontFamily: Typography.family.semibold, fontSize: Type.caption.size, letterSpacing: 0.5 },
              sticker.payload.textStyle === 'outline' && { fontFamily: Typography.family.medium, fontSize: Type.body.size },
            ]}
          >
            {sticker.payload.text}
          </Text>
        </View>
      );

    case 'mention':
      return (
        <View style={styles.mentionWrap}>
          <Text style={styles.mentionText}>@{sticker.payload.username}</Text>
        </View>
      );

    case 'listing':
      return (
        <View style={styles.listingWrap}>
          {sticker.payload.snapshotImageUrl ? (
            <Text style={styles.listingTitle}>{sticker.payload.snapshotTitle ?? 'View listing'}</Text>
          ) : (
            <View style={styles.listingRow}>
              <Ionicons name="pricetag" size={14} color="#fff" />
              <Text style={styles.listingTitle}>{sticker.payload.snapshotTitle ?? 'Listing'}</Text>
            </View>
          )}
          {sticker.payload.snapshotPriceGbp !== undefined && (
            <Text style={styles.listingPrice}>£{sticker.payload.snapshotPriceGbp.toFixed(0)}</Text>
          )}
        </View>
      );

    case 'look':
      return (
        <View style={styles.lookWrap}>
          <Ionicons name="shirt-outline" size={14} color="#fff" />
          <Text style={styles.lookText}>{sticker.payload.snapshotCaption ?? 'View look'}</Text>
        </View>
      );

    case 'style_vote':
      return (
        <View style={styles.voteWrap}>
          <Text style={styles.voteQuestion}>{sticker.payload.question}</Text>
          {sticker.payload.options?.map((opt) => (
            <View key={opt.id} style={styles.voteOption}>
              <Text style={styles.voteOptionText}>{opt.label}</Text>
            </View>
          ))}
        </View>
      );

    default:
      return null;
  }
}

const styles = StyleSheet.create({
  stickerBase: {
    position: 'absolute',
  },
  stickerInner: {
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
  },
  selectedWrap: {
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.7)',
    borderRadius: Radius.sm,
  },
  selectionHandle: {
    position: 'absolute',
    top: -8,
    right: -8,
    width: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  handleDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.brand,
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  textWrap: {
    alignItems: 'center',
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs,
    borderRadius: Radius.sm,
  },
  textSticker: {
    fontFamily: Typography.family.semibold,
    fontSize: Type.body.size,
    textAlign: 'center',
  },
  mentionWrap: {
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: Radius.full,
    paddingHorizontal: Space.sm + 4,
    paddingVertical: 4,
  },
  mentionText: {
    color: '#fff',
    fontFamily: Typography.family.semibold,
    fontSize: Type.body.size,
  },
  listingWrap: {
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: Radius.md,
    paddingHorizontal: Space.sm + 2,
    paddingVertical: Space.sm,
    gap: 2,
  },
  listingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  listingTitle: {
    color: '#fff',
    fontFamily: Typography.family.semibold,
    fontSize: Type.caption.size,
  },
  listingPrice: {
    color: Colors.brand,
    fontFamily: Typography.family.bold,
    fontSize: Type.body.size,
  },
  lookWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: Radius.full,
    paddingHorizontal: Space.sm + 2,
    paddingVertical: 4,
  },
  lookText: {
    color: '#fff',
    fontFamily: Typography.family.medium,
    fontSize: Type.caption.size,
  },
  voteWrap: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: Radius.md,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    gap: 6,
    minWidth: 160,
  },
  voteQuestion: {
    color: '#fff',
    fontFamily: Typography.family.semibold,
    fontSize: Type.body.size,
    textAlign: 'center',
  },
  voteOption: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: Radius.sm,
    paddingVertical: 6,
    paddingHorizontal: Space.sm,
    alignItems: 'center',
  },
  voteOptionText: {
    color: '#fff',
    fontFamily: Typography.family.medium,
    fontSize: Type.caption.size,
  },
});
