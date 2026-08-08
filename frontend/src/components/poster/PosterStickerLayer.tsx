import React, { useCallback, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, ViewStyle, AccessibilityInfo } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
  runOnJS,
} from 'react-native-reanimated';
import { Space, Radius, Type, Typography, Stroke, Control } from '../../theme/designTokens';
import { Motion } from '../../theme/motionTokens';
import { useAppTheme } from '../../theme/ThemeContext';
import type { PosterSticker as ApiPosterSticker } from '../../services/postersApi';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { useHaptic } from '../../hooks/useHaptic';
import { AnimatedPressable } from '../AnimatedPressable';
import { formatFullDate } from '../../utils/dateFormat';

interface PosterStickerLayerProps {
  stickers: ApiPosterSticker[];
  onStickerPress?: (sticker: ApiPosterSticker) => void;
  editable?: boolean;
  selectedStickerId?: string | null;
  onStickerPositionChange?: (id: string, x: number, y: number) => void;
  onStickerTransformChange?: (id: string, updates: { scale?: number; rotation?: number }) => void;
  /** Delete the selected sticker. When provided, a delete button appears on selection. */
  onDeleteSticker?: (id: string) => void;
  containerWidth: number;
  containerHeight: number;
  style?: ViewStyle;
}

const CLAMP_MARGIN = 0.05;
const STICKER_BASE_HALF_W = 22; // half of minWidth 44
const STICKER_BASE_HALF_H = 22; // half of minHeight 44
// Offset for the selection handle relative to the sticker base — matches
// the half-width/half-height so the handle sits at the corner.
const STICKER_HANDLE_OFFSET = 22;
const HANDLE_SIZE = 12;

function clampNormalizedScaled(
  value: number,
  scale: number,
  containerSize: number,
  stickerHalfSize: number,
): number {
  // Compute the sticker's half-size in pixels accounting for scale
  const halfPx = stickerHalfSize * scale;
  // Convert to normalized fraction of container
  const halfNorm = halfPx / containerSize;
  // Ensure at least CLAMP_MARGIN of the sticker remains visible on each side
  const minVisible = Math.max(CLAMP_MARGIN, halfNorm);
  return Math.max(minVisible, Math.min(1 - minVisible, value));
}

export function PosterStickerLayer({
  stickers,
  onStickerPress,
  editable = false,
  selectedStickerId,
  onStickerPositionChange,
  onStickerTransformChange,
  onDeleteSticker,
  containerWidth,
  containerHeight,
  style,
}: PosterStickerLayerProps) {
  const reducedMotion = useReducedMotion();
  const knownIdsRef = React.useRef<Set<string>>(new Set());
  const mountedRef = React.useRef(false);

  const isFirstRender = !mountedRef.current;
  const spawnSet = React.useMemo(() => {
    const set = new Set<string>();
    if (isFirstRender) return set;
    for (const s of stickers) {
      if (!knownIdsRef.current.has(s.id)) set.add(s.id);
    }
    return set;
  }, [stickers, isFirstRender]);

  useEffect(() => {
    stickers.forEach((s) => knownIdsRef.current.add(s.id));
    mountedRef.current = true;
  }, [stickers]);

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
          onTransformChange={onStickerTransformChange}
          onDelete={onDeleteSticker}
          reducedMotion={reducedMotion}
          shouldSpawn={spawnSet.has(sticker.id)}
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
  onTransformChange?: (id: string, updates: { scale?: number; rotation?: number }) => void;
  onDelete?: (id: string) => void;
  reducedMotion?: boolean;
  shouldSpawn?: boolean;
}

const SCALE_MIN = 0.4;
const SCALE_MAX = 3.0;

function DraggableSticker({
  sticker,
  editable,
  isSelected,
  containerWidth,
  containerHeight,
  onPress,
  onPositionChange,
  onTransformChange,
  onDelete,
  reducedMotion = false,
  shouldSpawn = false,
}: DraggableStickerProps) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const translateX = useSharedValue(sticker.x * containerWidth);
  const translateY = useSharedValue(sticker.y * containerHeight);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const scale = useSharedValue(sticker.scale);
  const rotation = useSharedValue(sticker.rotation);
  const startScale = useSharedValue(sticker.scale);
  const startRotation = useSharedValue(sticker.rotation);

  const selectionOpacity = useSharedValue(0);
  const handleScale = useSharedValue(0);

  const hapticLight = useCallback(() => haptic.light(), [haptic]);
  const hapticSelection = useCallback(() => haptic.selection(), [haptic]);
  const hapticMedium = useCallback(() => haptic.medium(), [haptic]);

  useEffect(() => {
    if (shouldSpawn) {
      if (reducedMotion) {
        scale.value = sticker.scale;
      } else {
        scale.value = 0;
        scale.value = withSequence(
          withSpring(sticker.scale * 1.1, Motion.spring.success),
          withSpring(sticker.scale, Motion.spring.entrance)
        );
      }
    }
  }, [shouldSpawn, reducedMotion, scale, sticker.scale]);

  useEffect(() => {
    if (reducedMotion) {
      selectionOpacity.value = isSelected ? 1 : 0;
      handleScale.value = isSelected ? 1 : 0;
    } else if (isSelected) {
      selectionOpacity.value = withSpring(1, Motion.spring.entrance);
      handleScale.value = withSpring(1, Motion.spring.entrance);
    } else {
      selectionOpacity.value = withSpring(0, Motion.spring.entrance);
      handleScale.value = withSpring(0, Motion.spring.entrance);
    }
    if (isSelected) {
      hapticSelection();
      AccessibilityInfo.announceForAccessibility('Sticker selected');
    }
  }, [isSelected, reducedMotion, selectionOpacity, handleScale, hapticSelection]);

  const selectionBorderStyle = useAnimatedStyle(() => ({
    opacity: selectionOpacity.value,
  }));

  const handleAnimatedStyle = useAnimatedStyle(() => ({
    opacity: selectionOpacity.value,
    transform: [{ scale: handleScale.value }],
  }));

  const handlePositionCommit = useCallback(
    (finalX: number, finalY: number) => {
      const normX = clampNormalizedScaled(finalX / containerWidth, sticker.scale, containerWidth, STICKER_BASE_HALF_W);
      const normY = clampNormalizedScaled(finalY / containerHeight, sticker.scale, containerHeight, STICKER_BASE_HALF_H);
      if (reducedMotion) {
        translateX.value = normX * containerWidth;
        translateY.value = normY * containerHeight;
      } else {
        translateX.value = withSpring(normX * containerWidth, Motion.spring.entrance);
        translateY.value = withSpring(normY * containerHeight, Motion.spring.entrance);
      }
      onPositionChange?.(sticker.id, normX, normY);
    },
    [containerWidth, containerHeight, onPositionChange, sticker.id, translateX, translateY, reducedMotion]
  );

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(editable)
        .minDistance(3)
        .onStart(() => {
          startX.value = translateX.value;
          startY.value = translateY.value;
          runOnJS(hapticLight)();
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
    [editable, translateX, translateY, startX, startY, handlePositionCommit, hapticLight]
  );

  const tapGesture = useMemo(
    () =>
      Gesture.Tap()
        .enabled(editable && !!onPress)
        .onEnd(() => {
          if (onPress) {
            runOnJS(hapticLight)();
            runOnJS(onPress)(sticker);
          }
        }),
    [editable, onPress, sticker, hapticLight]
  );

  // Pinch-to-resize gesture — Instagram/Snapchat core sticker manipulation.
  // Two-finger pinch scales the sticker between SCALE_MIN and SCALE_MAX.
  const pinchGesture = useMemo(
    () =>
      Gesture.Pinch()
        .enabled(editable)
        .onStart(() => {
          startScale.value = scale.value;
          runOnJS(hapticLight)();
        })
        .onUpdate((e) => {
          const newScale = startScale.value * e.scale;
          scale.value = Math.max(SCALE_MIN, Math.min(SCALE_MAX, newScale));
        })
        .onEnd(() => {
          if (onTransformChange) {
            runOnJS(onTransformChange)(sticker.id, { scale: scale.value });
          }
        }),
    [editable, scale, startScale, onTransformChange, sticker.id, hapticLight]
  );

  // Two-finger rotation gesture — Instagram/Snapchat core sticker manipulation.
  // Rotates the sticker freely; snaps to nearest 15° on end for precision.
  const rotationGesture = useMemo(
    () =>
      Gesture.Rotation()
        .enabled(editable)
        .onStart(() => {
          startRotation.value = rotation.value;
        })
        .onUpdate((e) => {
          rotation.value = startRotation.value + (e.rotation * 180 / Math.PI);
        })
        .onEnd(() => {
          // Snap to nearest 15° for precision
          const snapped = Math.round(rotation.value / 15) * 15;
          rotation.value = snapped;
          runOnJS(hapticSelection)();
          if (onTransformChange) {
            runOnJS(onTransformChange)(sticker.id, { rotation: snapped });
          }
        }),
    [editable, rotation, startRotation, onTransformChange, sticker.id, hapticSelection]
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
      { rotate: `${rotation.value}deg` },
    ],
  }));

  // Compose pan + pinch + rotation + tap — all simultaneous for natural manipulation.
  const composedGesture = useMemo(
    () => Gesture.Simultaneous(panGesture, pinchGesture, rotationGesture, tapGesture),
    [panGesture, pinchGesture, rotationGesture, tapGesture]
  );

  if (editable) {
    return (
      <GestureDetector gesture={composedGesture}>
        <Reanimated.View
          style={[
            styles.stickerBase,
            // Offset by half the sticker base size so that (x, y) represents
            // the CENTER of the sticker, matching the creator's layer model.
            { left: -STICKER_BASE_HALF_W, top: -STICKER_BASE_HALF_H },
            animatedStyle,
          ]}
          pointerEvents="auto"
          accessibilityLabel="Sticker"
          accessibilityHint="Drag to move, pinch to resize, rotate to rotate"
          accessibilityRole="adjustable"
        >
          <View style={styles.stickerInner}>
            <StickerContent sticker={sticker} />
          </View>
          {isSelected && (
            <>
              <Reanimated.View
                style={[StyleSheet.absoluteFill, styles.selectedWrap, selectionBorderStyle]}
                pointerEvents="none"
              />
              <Reanimated.View style={[styles.selectionHandle, styles.handleTopRight, handleAnimatedStyle]} pointerEvents="none">
                <View style={styles.handleDot} />
              </Reanimated.View>
              <Reanimated.View style={[styles.selectionHandle, styles.handleBottomLeft, handleAnimatedStyle]} pointerEvents="none">
                <View style={styles.handleDot} />
              </Reanimated.View>
              {onDelete && (
                <AnimatedPressable
                  style={styles.deleteButton}
                  scaleValue={0.97}
                  activeOpacity={0.85}
                  hapticFeedback="medium"
                  onPress={() => {
                    hapticMedium();
                    onDelete(sticker.id);
                    AccessibilityInfo.announceForAccessibility('Sticker deleted');
                  }}
                  accessibilityLabel="Delete sticker"
                  accessibilityHint="Removes this sticker from the frame"
                  accessibilityRole="button"
                >
                  <Ionicons name="close" size={Control.iconCompact} color={colors.textInverse} />
                </AnimatedPressable>
              )}
              <Reanimated.View style={[styles.rotateHandle, handleAnimatedStyle]} pointerEvents="none">
                <View style={styles.rotateHandleDot}>
                  <Ionicons name="refresh" size={10} color={colors.textInverse} />
                </View>
              </Reanimated.View>
            </>
          )}
        </Reanimated.View>
      </GestureDetector>
    );
  }

  return (
    <Reanimated.View
      style={[
        styles.stickerBase,
        // Offset by half the sticker base size so that (x, y) represents
        // the CENTER of the sticker, matching the creator's layer model.
        { left: -STICKER_BASE_HALF_W, top: -STICKER_BASE_HALF_H },
        animatedStyle,
      ]}
      pointerEvents="none"
    >
      <View style={styles.stickerInner}>
        <StickerContent sticker={sticker} />
      </View>
    </Reanimated.View>
  );
}

function StickerContent({ sticker }: { sticker: ApiPosterSticker }) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
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

    case 'poll':
      return (
        <View
          style={styles.pollWrap}
          accessibilityLabel="Poll sticker"
          accessibilityHint="Tap to vote on this poll"
          accessibilityRole="button"
        >
          <Text style={styles.pollQuestion}>{sticker.payload.question}</Text>
          {sticker.payload.options?.map((opt) => (
            <View key={opt.id} style={styles.voteOption}>
              <Text style={styles.voteOptionText}>{opt.label}</Text>
            </View>
          ))}
        </View>
      );

    case 'quiz':
      return (
        <View
          style={styles.quizWrap}
          accessibilityLabel="Quiz sticker"
          accessibilityHint="Tap to answer this quiz"
          accessibilityRole="button"
        >
          <Text style={styles.quizQuestion}>{sticker.payload.question}</Text>
          {sticker.payload.options?.map((opt) => (
            <View key={opt.id} style={styles.voteOption}>
              <Text style={styles.voteOptionText}>{opt.label}</Text>
            </View>
          ))}
        </View>
      );

    case 'question':
      return (
        <View
          style={styles.questionWrap}
          accessibilityLabel="Question sticker"
          accessibilityHint="Tap to reply to this question"
          accessibilityRole="button"
        >
          <Text style={styles.questionText}>{sticker.payload.question}</Text>
        </View>
      );

    case 'countdown':
      return (
        <View
          style={styles.countdownWrap}
          accessibilityLabel="Countdown sticker"
          accessibilityHint="Shows time remaining until the countdown ends"
        >
          <Text style={styles.countdownLabel}>{sticker.payload.endLabel ?? 'Countdown'}</Text>
          {sticker.payload.targetDate && (
            <Text style={styles.countdownTime}>
              {formatFullDate(sticker.payload.targetDate)}
            </Text>
          )}
        </View>
      );

    default:
      return null;
  }
}

function createStyles(colors: any) {
  return StyleSheet.create({
  stickerBase: {
    position: 'absolute',
  },
  stickerInner: {
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    // Subtle drop shadow so stickers feel like they're floating above the
    // media, not pasted on — Instagram-style sticker depth.
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  selectedWrap: {
    borderWidth: Stroke.standard,
    borderColor: 'rgba(255,255,255,0.9)',
    borderRadius: Radius.sm,
    borderStyle: 'dashed',
  },
  selectionHandle: {
    position: 'absolute',
    width: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  handleTopRight: {
    top: -8,
    right: -8,
  },
  handleBottomLeft: {
    bottom: -8,
    left: -8,
  },
  handleDot: {
    width: HANDLE_SIZE,
    height: HANDLE_SIZE,
    borderRadius: HANDLE_SIZE / 2,
    backgroundColor: '#fff',
    borderWidth: Stroke.standard,
    borderColor: colors.border,
  },
  deleteButton: {
    position: 'absolute',
    top: -8,
    left: -8,
    width: 28,
    height: 28,
    borderRadius: Radius.full,
    backgroundColor: colors.danger,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Space.xs,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  rotateHandle: {
    position: 'absolute',
    bottom: -10,
    right: -10,
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rotateHandleDot: {
    width: 20,
    height: 20,
    borderRadius: Radius.full,
    backgroundColor: colors.brand,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: Stroke.standard,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  textWrap: {
    alignItems: 'center',
    paddingHorizontal: Space.sm + Space.xs,
    paddingVertical: Space.xs,
    borderRadius: Radius.sm,
  },
  textSticker: {
    color: '#fff',
    fontFamily: Typography.family.semibold,
    fontSize: Type.bodyLarge.size,
    lineHeight: Type.bodyLarge.lineHeight,
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  mentionWrap: {
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: Radius.full,
    paddingHorizontal: Space.sm + 4,
    paddingVertical: Space.xs,
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
    color: colors.brand,
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
    paddingVertical: Space.xs,
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
    borderRadius: Radius.full,
    paddingVertical: 6,
    paddingHorizontal: Space.sm,
    alignItems: 'center',
  },
  voteOptionText: {
    color: '#fff',
    fontFamily: Typography.family.medium,
    fontSize: Type.caption.size,
  },
  // Poll sticker — tokenized padding/radius/typography per flagship spec
  pollWrap: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: Radius.lg,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    gap: 6,
    minWidth: 160,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  pollQuestion: {
    color: '#fff',
    fontFamily: Typography.family.semibold,
    fontSize: Type.body.size,
    textAlign: 'center',
  },
  // Quiz sticker — tokenized padding/radius/typography per flagship spec
  quizWrap: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: Radius.lg,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    gap: 6,
    minWidth: 160,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  quizQuestion: {
    color: '#fff',
    fontFamily: Typography.family.semibold,
    fontSize: Type.body.size,
    textAlign: 'center',
  },
  // Question sticker — tokenized padding/typography per flagship spec
  questionWrap: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: Radius.lg,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  questionText: {
    color: '#fff',
    fontFamily: Typography.family.semibold,
    fontSize: Type.bodyLarge.size,
    lineHeight: Type.bodyLarge.lineHeight,
    textAlign: 'center',
  },
  // Countdown sticker — tokenized padding/typography per flagship spec
  countdownWrap: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: Radius.lg,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    alignItems: 'center',
    gap: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  countdownLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontFamily: Typography.family.semibold,
    fontSize: Type.body.size,
    textAlign: 'center',
  },
  countdownTime: {
    color: '#fff',
    fontFamily: Typography.family.bold,
    fontSize: Type.bodyLarge.size,
    lineHeight: Type.bodyLarge.lineHeight,
  },
});
}
