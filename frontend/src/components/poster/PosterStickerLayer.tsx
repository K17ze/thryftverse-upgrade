import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ViewStyle, AccessibilityInfo, Pressable } from 'react-native';
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
import { ContextMenu, type ContextMenuAction } from './shared/ContextMenu';
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
  /** Duplicate a sticker. When provided, appears in the long-press context menu. */
  onDuplicateSticker?: (id: string) => void;
  /** Reorder sticker z-index. When provided, appears in the long-press context menu. */
  onReorderSticker?: (id: string, direction: 'front' | 'back') => void;
  /** Toggle sticker lock state. When provided, appears in the long-press context menu. */
  onToggleStickerLock?: (id: string) => void;
  /** Flip sticker horizontally. When provided, appears in the long-press context menu. */
  onFlipSticker?: (id: string) => void;
  /** Toggle die-cut white border. When provided, appears in the long-press context menu. */
  onToggleBorder?: (id: string) => void;
  containerWidth: number;
  containerHeight: number;
  style?: ViewStyle;
}

const CLAMP_MARGIN = 0.05;
const STICKER_BASE_HALF_W = 22; // half of minWidth 44
const STICKER_BASE_HALF_H = 22; // half of minHeight 44

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
  onDuplicateSticker,
  onReorderSticker,
  onToggleStickerLock,
  onFlipSticker,
  onToggleBorder,
  containerWidth,
  containerHeight,
  style,
}: PosterStickerLayerProps) {
  const reducedMotion = useReducedMotion();
  const { colors } = useAppTheme();
  const knownIdsRef = React.useRef<Set<string>>(new Set());
  const mountedRef = React.useRef(false);

  // Context menu state — long-press opens an ActionSheet with sticker actions.
  // The per-sticker gesture composition calls onContextMenu(sticker) to set
  // this; the shared <ContextMenu> sheet is then driven by `visible`.
  const [contextMenuSticker, setContextMenuSticker] = useState<ApiPosterSticker | null>(null);

  // Build the context-menu action list from the active sticker + callbacks.
  // Mirrors the previous inline StickerContextMenu action set (duplicate,
  // front/back, lock, flip, border, delete) but via the shared ContextMenu API.
  const contextMenuActions = useMemo<ContextMenuAction[]>(() => {
    if (!contextMenuSticker) return [];
    const id = contextMenuSticker.id;
    const actions: ContextMenuAction[] = [];
    if (onDuplicateSticker) {
      actions.push({ id: 'duplicate', label: 'Duplicate', icon: 'copy-outline', onPress: () => onDuplicateSticker(id) });
    }
    if (onReorderSticker) {
      actions.push({ id: 'front', label: 'Front', icon: 'arrow-up-circle-outline', onPress: () => onReorderSticker(id, 'front') });
      actions.push({ id: 'back', label: 'Back', icon: 'arrow-down-circle-outline', onPress: () => onReorderSticker(id, 'back') });
    }
    if (onToggleStickerLock) {
      actions.push({ id: 'lock', label: 'Lock', icon: 'lock-closed-outline', onPress: () => onToggleStickerLock(id) });
    }
    if (onFlipSticker) {
      actions.push({ id: 'flip', label: 'Flip', icon: 'swap-horizontal-outline', onPress: () => onFlipSticker(id) });
    }
    if (onToggleBorder) {
      actions.push({ id: 'border', label: 'Border', icon: 'square-outline', onPress: () => onToggleBorder(id) });
    }
    if (onDeleteSticker) {
      actions.push({ id: 'delete', label: 'Delete', icon: 'trash-outline', onPress: () => onDeleteSticker(id), danger: true });
    }
    return actions;
  }, [contextMenuSticker, onDuplicateSticker, onReorderSticker, onToggleStickerLock, onFlipSticker, onToggleBorder, onDeleteSticker]);

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
          onDuplicate={onDuplicateSticker}
          onReorder={onReorderSticker}
          onToggleLock={onToggleStickerLock}
          onFlip={onFlipSticker}
          onToggleBorder={onToggleBorder}
          onContextMenu={(s) => setContextMenuSticker(s)}
          reducedMotion={reducedMotion}
          shouldSpawn={spawnSet.has(sticker.id)}
        />
      ))}

      {/* Long-press context menu — shared ContextMenu sheet with sticker actions.
          The per-sticker gesture composition sets contextMenuSticker on long-press;
          the shared <ContextMenu> renders the spring-entrance sheet driven by
          `visible`. `enabled={false}` disables the wrapper's own long-press
          (each DraggableSticker manages its own long-press inside its gesture race). */}
      {editable && (
        <ContextMenu
          actions={contextMenuActions}
          visible={!!contextMenuSticker}
          onDismiss={() => setContextMenuSticker(null)}
          onOpen={() => setContextMenuSticker(contextMenuSticker)}
          enabled={false}
          title="Sticker Options"
        >
          <View />
        </ContextMenu>
      )}
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
  onDuplicate?: (id: string) => void;
  onReorder?: (id: string, direction: 'front' | 'back') => void;
  onToggleLock?: (id: string) => void;
  onFlip?: (id: string) => void;
  onToggleBorder?: (id: string) => void;
  onContextMenu?: (sticker: ApiPosterSticker) => void;
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
  onDuplicate,
  onReorder,
  onToggleLock,
  onFlip,
  onToggleBorder,
  onContextMenu,
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

  // Selection visuals — spring appearance (scale 0.8→1.0)
  const selectionOpacity = useSharedValue(0);
  const handleScale = useSharedValue(0);

  // Spawn animation — scale 0.8→1.0 with bouncy spring, rotation wobble ±5°
  const spawnScale = useSharedValue(reducedMotion ? 1 : 0.8);
  const spawnRotation = useSharedValue(0);
  const spawnShadow = useSharedValue(reducedMotion ? 1 : 0);

  // Peel-off effect on grab — scale up to 1.1, shadow grows
  const grabScale = useSharedValue(1);
  const grabShadowOpacity = useSharedValue(0);
  const grabShadowRadius = useSharedValue(5);

  // Die-cut white border toggle
  const [hasBorder, setHasBorder] = useState(false);
  const borderOpacity = useSharedValue(0);

  const hapticLight = useCallback(() => haptic.light(), [haptic]);
  const hapticSelection = useCallback(() => haptic.selection(), [haptic]);
  const hapticMedium = useCallback(() => haptic.medium(), [haptic]);

  // ── Spring spawn animation ──────────────────────────────────────────
  // Scale 0.8→1.0 with bouncy spring, rotation wobble ±5°, shadow grows
  useEffect(() => {
    if (shouldSpawn) {
      if (reducedMotion) {
        spawnScale.value = 1;
        spawnRotation.value = 0;
        spawnShadow.value = 1;
      } else {
        spawnScale.value = 0.8;
        spawnRotation.value = 0;
        spawnShadow.value = 0;
        // Bouncy scale entrance
        spawnScale.value = withSpring(1, Motion.spring.lift);
        // Rotation wobble: +5° → -5° → 0°
        spawnRotation.value = withSequence(
          withSpring(5, Motion.spring.lift),
          withSpring(-5, Motion.spring.lift),
          withSpring(0, Motion.spring.entrance)
        );
        // Shadow grows during spawn then settles
        spawnShadow.value = withSequence(
          withSpring(1.3, Motion.spring.success),
          withSpring(1, Motion.spring.entrance)
        );
      }
      runOnJS(hapticMedium)();
    }
  }, [shouldSpawn, reducedMotion, spawnScale, spawnRotation, spawnShadow, hapticMedium]);

  // ── Selection spring appearance ─────────────────────────────────────
  useEffect(() => {
    if (reducedMotion) {
      selectionOpacity.value = isSelected ? 1 : 0;
      handleScale.value = isSelected ? 1 : 0;
    } else if (isSelected) {
      selectionOpacity.value = withSpring(1, Motion.spring.entrance);
      // Spring appearance scale 0.8→1.0
      handleScale.value = 0.8;
      handleScale.value = withSpring(1, Motion.spring.success);
    } else {
      selectionOpacity.value = withSpring(0, Motion.spring.entrance);
      handleScale.value = withSpring(0, Motion.spring.entrance);
    }
    if (isSelected) {
      runOnJS(hapticLight)();
      AccessibilityInfo.announceForAccessibility('Sticker selected');
    }
  }, [isSelected, reducedMotion, selectionOpacity, handleScale, hapticLight]);

  // ── Die-cut border toggle ───────────────────────────────────────────
  useEffect(() => {
    if (reducedMotion) {
      borderOpacity.value = hasBorder ? 1 : 0;
    } else {
      borderOpacity.value = withSpring(hasBorder ? 1 : 0, Motion.spring.tap);
    }
  }, [hasBorder, reducedMotion, borderOpacity]);

  const selectionBorderStyle = useAnimatedStyle(() => ({
    opacity: selectionOpacity.value,
  }));

  const handleAnimatedStyle = useAnimatedStyle(() => ({
    opacity: selectionOpacity.value,
    transform: [{ scale: handleScale.value }],
  }));

  // Combined animated style: spawn + grab + user transforms
  const animatedStyle = useAnimatedStyle(() => {
    const combinedScale = scale.value * spawnScale.value * grabScale.value;
    const combinedRotation = rotation.value + spawnRotation.value;
    return {
      transform: [
        { translateX: translateX.value },
        { translateY: translateY.value },
        { scale: combinedScale },
        { rotate: `${combinedRotation}deg` },
      ],
      shadowOpacity: 0.25 * spawnShadow.value + grabShadowOpacity.value,
      shadowRadius: 6 * spawnShadow.value + grabShadowRadius.value,
    };
  });

  const borderAnimatedStyle = useAnimatedStyle(() => ({
    opacity: borderOpacity.value,
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

  // ── Pan gesture with peel-off effect on grab ────────────────────────
  // On grab: scale up to 1.1, shadow opacity 0→0.3, radius 5→15, haptic medium
  // On release: scale back to 1.0, shadow fades
  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(editable)
        .minDistance(3)
        .onStart(() => {
          startX.value = translateX.value;
          startY.value = translateY.value;
          if (!reducedMotion) {
            grabScale.value = withSpring(1.1, Motion.spring.press);
            grabShadowOpacity.value = withSpring(0.3, Motion.spring.press);
            grabShadowRadius.value = withSpring(15, Motion.spring.press);
          }
          runOnJS(hapticMedium)();
        })
        .onUpdate((e) => {
          translateX.value = startX.value + e.translationX;
          translateY.value = startY.value + e.translationY;
        })
        .onEnd((e) => {
          const finalX = startX.value + e.translationX;
          const finalY = startY.value + e.translationY;
          if (!reducedMotion) {
            grabScale.value = withSpring(1, Motion.spring.press);
            grabShadowOpacity.value = withSpring(0, Motion.spring.press);
            grabShadowRadius.value = withSpring(5, Motion.spring.press);
          }
          runOnJS(handlePositionCommit)(finalX, finalY);
        }),
    [editable, translateX, translateY, startX, startY, handlePositionCommit, hapticMedium, reducedMotion, grabScale, grabShadowOpacity, grabShadowRadius]
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

  // ── Double-tap to reset ─────────────────────────────────────────────
  // Resets position to center, scale to 1.0, rotation to 0 with spring
  const doubleTapGesture = useMemo(
    () =>
      Gesture.Tap()
        .enabled(editable)
        .numberOfTaps(2)
        .onEnd(() => {
          if (reducedMotion) {
            translateX.value = 0.5 * containerWidth;
            translateY.value = 0.5 * containerHeight;
            scale.value = 1;
            rotation.value = 0;
          } else {
            translateX.value = withSpring(0.5 * containerWidth, Motion.spring.entrance);
            translateY.value = withSpring(0.5 * containerHeight, Motion.spring.entrance);
            scale.value = withSpring(1, Motion.spring.success);
            rotation.value = withSpring(0, Motion.spring.entrance);
          }
          if (onPositionChange) {
            runOnJS(onPositionChange)(sticker.id, 0.5, 0.5);
          }
          if (onTransformChange) {
            runOnJS(onTransformChange)(sticker.id, { scale: 1, rotation: 0 });
          }
          runOnJS(hapticMedium)();
          AccessibilityInfo.announceForAccessibility('Sticker reset to center');
        }),
    [editable, containerWidth, containerHeight, translateX, translateY, scale, rotation, onPositionChange, onTransformChange, sticker.id, hapticMedium, reducedMotion]
  );

  // ── Long-press context menu ─────────────────────────────────────────
  // Opens ActionSheet with sticker actions. Haptic: medium on long-press.
  const longPressGesture = useMemo(
    () =>
      Gesture.LongPress()
        .enabled(editable && !!onContextMenu)
        .minDuration(400)
        .onStart(() => {
          runOnJS(hapticMedium)();
          if (onContextMenu) {
            runOnJS(onContextMenu)(sticker);
          }
        }),
    [editable, onContextMenu, sticker, hapticMedium]
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

  // Compose pan + pinch + rotation + tap + double-tap + long-press
  // Tap and double-tap are exclusive; long-press runs simultaneous with pan.
  const composedGesture = useMemo(
    () =>
      Gesture.Simultaneous(
        Gesture.Exclusive(doubleTapGesture, tapGesture),
        panGesture,
        pinchGesture,
        rotationGesture,
        longPressGesture
      ),
    [panGesture, pinchGesture, rotationGesture, tapGesture, doubleTapGesture, longPressGesture]
  );

  // ── Context menu border toggle handler ──────────────────────────────
  const handleToggleBorder = useCallback(() => {
    haptic.light();
    setHasBorder((prev) => {
      const next = !prev;
      if (onToggleBorder) onToggleBorder(sticker.id);
      return next;
    });
  }, [haptic, onToggleBorder, sticker.id]);

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
          accessibilityHint="Drag to move, pinch to resize, rotate to rotate, double-tap to reset, long-press for options"
          accessibilityRole="adjustable"
        >
          <View style={styles.stickerInner}>
            <StickerContent sticker={sticker} />
          </View>

          {/* Die-cut white border — 2pt white stroke, spring toggle */}
          <Reanimated.View
            style={[StyleSheet.absoluteFill, styles.dieCutBorder, borderAnimatedStyle]}
            pointerEvents="none"
          />

          {isSelected && (
            <>
              {/* Bounding box — 1pt blue dashed border */}
              <Reanimated.View
                style={[StyleSheet.absoluteFill, styles.selectedWrap, selectionBorderStyle]}
                pointerEvents="none"
              />

              {/* Corner handles — blue accent dots at 4 corners (8pt circles) */}
              <Reanimated.View style={[styles.selectionHandle, styles.handleTopLeft, handleAnimatedStyle]} pointerEvents="none">
                <View style={styles.cornerDot} />
              </Reanimated.View>
              <Reanimated.View style={[styles.selectionHandle, styles.handleTopRight, handleAnimatedStyle]} pointerEvents="none">
                <View style={styles.cornerDot} />
              </Reanimated.View>
              <Reanimated.View style={[styles.selectionHandle, styles.handleBottomLeft, handleAnimatedStyle]} pointerEvents="none">
                <View style={styles.cornerDot} />
              </Reanimated.View>
              <Reanimated.View style={[styles.selectionHandle, styles.handleBottomRight, handleAnimatedStyle]} pointerEvents="none">
                <View style={styles.cornerDot} />
              </Reanimated.View>

              {/* Rotation handle above top-center (24pt with connecting line) */}
              <Reanimated.View style={[styles.rotationHandleWrap, handleAnimatedStyle]} pointerEvents="none">
                <View style={styles.rotationConnectLine} />
                <View style={styles.rotationHandleDot}>
                  <Ionicons name="refresh" size={12} color={colors.textInverse} />
                </View>
              </Reanimated.View>

              {/* Delete handle below bottom-center (24pt trash icon) */}
              {onDelete && (
                <AnimatedPressable
                  style={styles.deleteHandle}
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
                  <Ionicons name="trash" size={12} color={colors.textInverse} />
                </AnimatedPressable>
              )}
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
      {/* Die-cut white border in view mode too */}
      <Reanimated.View
        style={[StyleSheet.absoluteFill, styles.dieCutBorder, borderAnimatedStyle]}
        pointerEvents="none"
      />
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
  // Bounding box — 1pt blue dashed border (enhanced selection visual)
  selectedWrap: {
    borderWidth: Stroke.standard,
    borderColor: '#3B82F6',
    borderRadius: Radius.sm,
    borderStyle: 'dashed',
  },
  // Die-cut white border — 2pt white stroke around sticker
  dieCutBorder: {
    borderWidth: Stroke.emphasis,
    borderColor: '#FFFFFF',
    borderRadius: Radius.sm,
  },
  selectionHandle: {
    position: 'absolute',
    width: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  handleTopLeft: {
    top: -8,
    left: -8,
  },
  handleTopRight: {
    top: -8,
    right: -8,
  },
  handleBottomLeft: {
    bottom: -8,
    left: -8,
  },
  handleBottomRight: {
    bottom: -8,
    right: -8,
  },
  // Corner dots — 8pt blue accent circles
  cornerDot: {
    width: 8,
    height: 8,
    borderRadius: Radius.full,
    backgroundColor: '#3B82F6',
    borderWidth: Stroke.standard,
    borderColor: '#FFFFFF',
  },
  // Rotation handle above top-center (24pt with connecting line)
  rotationHandleWrap: {
    position: 'absolute',
    top: -32,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  rotationConnectLine: {
    width: Stroke.standard,
    height: 12,
    backgroundColor: '#3B82F6',
  },
  rotationHandleDot: {
    width: 24,
    height: 24,
    borderRadius: Radius.full,
    backgroundColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: Stroke.standard,
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  // Delete handle below bottom-center (24pt trash icon)
  deleteHandle: {
    position: 'absolute',
    bottom: -32,
    left: 0,
    right: 0,
    width: 24,
    height: 24,
    borderRadius: Radius.full,
    backgroundColor: colors.danger,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    marginLeft: 'auto',
    marginRight: 'auto',
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
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight,
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  mentionWrap: {
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: Radius.full,
    paddingHorizontal: Space.smMd,
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
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight,
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
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight,
  },
});
}
