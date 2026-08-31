import React, { useCallback, useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, LayoutAnimation, UIManager, Platform } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
  useReducedMotion,
  type SharedValue } from 'react-native-reanimated';
import { Space, Radius, Typography, Control, Stroke, Elevation } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { IconGrammar } from '../theme/designTokens';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { useCreator } from './CreatorContext';
import { getAllLayersSorted } from './composition';
import { SheetContainer, PressScale } from './CreatorAnimations';
import { SwipeableRow } from '../components/SwipeableRow';
import { useHaptic } from '../hooks/useHaptic';
import { useMotionConfig } from '../hooks/useMotionConfig';
import { Motion } from '../theme/motionTokens';
import type { CreatorLayer } from './composition';
import { getLayerAccentColor } from '../components/poster/shared/layerAccents';

export interface CreatorLayersSheetProps {
  visible: boolean;
  onClose: () => void;
}

const LAYER_ICONS: Record<CreatorLayer['type'], React.ComponentProps<typeof Ionicons>['name']> = {
  media: 'images-outline',
  text: 'text-outline',
  product: 'pricetag-outline',
  mention: 'at-outline',
  look: 'shirt-outline',
  vote: 'stats-chart-outline',
  adjustment: 'options-outline',
  quiz: 'help-circle-outline',
  question: 'chatbubble-outline',
  emojiSlider: 'happy-outline',
  countdown: 'time-outline',
  decorative: 'happy-outline',
  draw: 'brush-outline',
  gif: 'image-outline',
  music: 'musical-notes-outline',
  link: 'link-outline',
  location: 'location-outline',
  hashtag: 'pricetag-outline',
  time: 'time-outline',
  weather: 'partly-sunny-outline' };

const THUMB = 48;
const ROW_HEIGHT = 64;
const ROW_GAP = Space.sm;

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type OverflowAction = 'front' | 'back' | 'duplicate' | 'delete';

export function CreatorLayersSheet({ visible, onClose }: CreatorLayersSheetProps) {
  const { document, activePageIndex, selectedLayerId, selectLayer, removeLayer, duplicateLayer, reorderLayer, toggleLayerLock, toggleLayerVisibility } = useCreator();
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const reduceMotion = useReducedMotion();
  const { spring } = useMotionConfig();
  const [reorderMode, setReorderMode] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overflowLayer, setOverflowLayer] = useState<CreatorLayer | null>(null);

  const page = document.pages[activePageIndex];
  const layers = getAllLayersSorted(page).reverse();

  const dragY = useSharedValue(0);
  // Shared value (not useRef) so the worklet can read the drag start index
  // without triggering Reanimated's "Tried to modify key `current`" freeze
  // warning, which logs synchronously on the Android UI thread and causes
  // ANRs (input dispatch timeout).
  const dragStartIndex = useSharedValue(-1);

  // Haptic: light on sheet open
  useEffect(() => {
    if (visible) {
      haptic.light();
    }
  }, [visible, haptic]);

  const handleExitReorder = useCallback(() => {
    setDraggingId(null);
    setReorderMode(false);
  }, []);

  const handleLongPressRow = useCallback((id: string) => {
    haptic.light();
    setReorderMode(true);
    setDraggingId(id);
    const idx = layers.findIndex((l) => l.id === id);
    dragStartIndex.value = idx;
    dragY.value = 0;
  }, [haptic, layers, dragY]);

  const handleClose = useCallback(() => {
    haptic.selection();
    setReorderMode(false);
    setDraggingId(null);
    setOverflowLayer(null);
    onClose();
  }, [haptic, onClose]);

  const handleSelect = useCallback((id: string) => {
    haptic.selection();
    selectLayer(id);
  }, [haptic, selectLayer]);

  const handleReorder = useCallback((id: string, dir: 'forward' | 'backward') => {
    haptic.selection();
    setDraggingId(id);
    if (!reduceMotion) {
      LayoutAnimation.configureNext({
        duration: Motion.duration.slow,
        update: { type: LayoutAnimation.Types.easeInEaseOut } });
    }
    reorderLayer(id, dir);
  }, [haptic, reorderLayer, reduceMotion]);

  const handleVisibility = useCallback((id: string) => {
    haptic.light();
    toggleLayerVisibility(id);
  }, [haptic, toggleLayerVisibility]);

  const handleLock = useCallback((id: string) => {
    haptic.light();
    toggleLayerLock(id);
  }, [haptic, toggleLayerLock]);

  const handleQuickDelete = useCallback((id: string) => {
    haptic.warning();
    if (!reduceMotion) {
      LayoutAnimation.configureNext({
        duration: Motion.duration.slow,
        update: { type: LayoutAnimation.Types.easeInEaseOut },
        delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity } });
    }
    removeLayer(id);
  }, [haptic, reduceMotion, removeLayer]);

  const handleQuickLock = useCallback((id: string) => {
    haptic.light();
    toggleLayerLock(id);
  }, [haptic, toggleLayerLock]);

  const openOverflow = useCallback(
    (layer: CreatorLayer) => {
      haptic.selection();
      setOverflowLayer(layer);
    },
    [haptic],
  );

  const closeOverflow = useCallback(() => {
    haptic.light();
    setOverflowLayer(null);
  }, [haptic]);

  const runOverflowAction = useCallback(
    (action: OverflowAction) => {
      const layer = overflowLayer;
      if (!layer) return;
      setOverflowLayer(null);
      if (!reduceMotion) {
        LayoutAnimation.configureNext({
          duration: Motion.duration.slow,
          update: { type: LayoutAnimation.Types.easeInEaseOut },
          delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity } });
      }
      switch (action) {
        case 'front':
          haptic.selection();
          reorderLayer(layer.id, 'front');
          break;
        case 'back':
          haptic.selection();
          reorderLayer(layer.id, 'back');
          break;
        case 'duplicate':
          haptic.selection();
          duplicateLayer(layer.id);
          break;
        case 'delete':
          haptic.medium();
          removeLayer(layer.id);
          break;
      }
    },
    [overflowLayer, haptic, reorderLayer, duplicateLayer, removeLayer, reduceMotion],
  );

  const handleReorderFromDrag = useCallback(
    (startIdx: number, deltaRows: number) => {
      const count = layers.length;
      const targetIdx = Math.max(0, Math.min(count - 1, startIdx + deltaRows));
      if (targetIdx === startIdx) return;
      const dir: 'forward' | 'backward' = targetIdx > startIdx ? 'forward' : 'backward';
      const steps = Math.abs(targetIdx - startIdx);
      const layerId = layers[startIdx]?.id;
      if (!layerId) return;
      let stepCount = 0;
      const doStep = () => {
        if (stepCount >= steps) return;
        stepCount += 1;
        if (!reduceMotion) {
          LayoutAnimation.configureNext({
            duration: Motion.duration.normal,
            update: { type: LayoutAnimation.Types.easeInEaseOut } });
        }
        reorderLayer(layerId, dir);
        if (stepCount < steps) {
          setTimeout(doStep, 16);
        }
      };
      doStep();
    },
    [layers, reduceMotion, reorderLayer],
  );

  const panGesture = useRef(
    Gesture.Pan()
      .activateAfterLongPress(300)
      .onUpdate((e) => {
        dragY.value = e.translationY;
      })
      .onEnd((e) => {
        const step = ROW_HEIGHT + ROW_GAP;
        const deltaRows = Math.round(e.translationY / step);
        runOnJS(haptic.medium)();
        dragY.value = withSpring(0, spring.press);
        runOnJS(setDraggingId)(null);
        runOnJS(setReorderMode)(false);
        if (deltaRows !== 0 && dragStartIndex.value >= 0) {
          const startIdx = dragStartIndex.value;
          runOnJS(handleReorderFromDrag)(startIdx, deltaRows);
        }
        dragStartIndex.value = -1;
      })
  ).current;

  return (
    <SheetContainer visible={visible} onClose={handleClose} maxHeight={0.7}>
      <View style={styles.header}>
        <PressScale onPress={handleClose} style={styles.closeBtn} accessibilityLabel="Close layers" accessibilityHint="Closes the layers panel" accessibilityRole="button" hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="close" size={IconGrammar.standard} color={colors.textSecondary} />
        </PressScale>
        <Text style={[styles.title, { color: colors.textPrimary }]}>{reorderMode ? 'Reorder' : 'Layers'}</Text>
        <PressScale onPress={reorderMode ? handleExitReorder : handleClose} style={styles.doneBtn} accessibilityLabel={reorderMode ? 'Done reordering' : 'Done'} accessibilityHint={reorderMode ? 'Exits reorder mode' : 'Closes the layers panel'} accessibilityRole="button" hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={[styles.doneBtnText, { color: colors.brand }]}>Done</Text>
        </PressScale>
      </View>

      <ScrollView style={styles.scrollBody} contentContainerStyle={styles.scrollContent}>
        {layers.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>No layers yet</Text>
          </View>
        ) : (
          <>
            {reorderMode && (
              <Text style={[styles.reorderHint, { color: colors.textMuted }]}>
                Drag to reorder
              </Text>
            )}
            {layers.map((layer, index) => {
            const isSelected = layer.id === selectedLayerId;
            const thumbSource = getLayerThumbnailSource(layer);
            const isDragging = draggingId === layer.id;
            return (
              <LayerRow
                key={layer.id}
                layer={layer}
                index={index}
                isSelected={isSelected}
                isDragging={isDragging}
                reorderMode={reorderMode}
                colors={colors}
                thumbSource={thumbSource}
                dragY={isDragging ? dragY : undefined}
                reduceMotion={reduceMotion}
                springCfg={spring.press}
                onLongPressRow={handleLongPressRow}
                onSelect={handleSelect}
                onReorder={handleReorder}
                onVisibility={handleVisibility}
                onLock={handleLock}
                onQuickDelete={handleQuickDelete}
                onQuickLock={handleQuickLock}
                onOverflow={openOverflow}
                panGesture={panGesture}
              />
            );
          })}
          </>
        )}
      </ScrollView>

      <LayerOverflowActionSheet
        layer={overflowLayer}
        colors={colors}
        reduceMotion={reduceMotion}
        onClose={closeOverflow}
        onAction={runOverflowAction}
      />
    </SheetContainer>
  );
}

interface LayerRowProps {
  layer: CreatorLayer;
  index: number;
  isSelected: boolean;
  isDragging: boolean;
  reorderMode: boolean;
  colors: ThemeColors;
  thumbSource: { uri: string } | null;
  dragY?: SharedValue<number>;
  reduceMotion: boolean;
  springCfg: { damping: number; stiffness: number; mass: number };
  onLongPressRow: (id: string) => void;
  onSelect: (id: string) => void;
  onReorder: (id: string, dir: 'forward' | 'backward') => void;
  onVisibility: (id: string) => void;
  onLock: (id: string) => void;
  onQuickDelete: (id: string) => void;
  onQuickLock: (id: string) => void;
  onOverflow: (layer: CreatorLayer) => void;
  panGesture?: ReturnType<typeof Gesture.Pan>;
}

function LayerRow({
  layer,
  isSelected,
  isDragging,
  reorderMode,
  colors,
  thumbSource,
  dragY,
  reduceMotion,
  springCfg,
  onLongPressRow,
  onSelect,
  onReorder,
  onVisibility,
  onQuickDelete,
  onQuickLock,
  onOverflow,
  panGesture }: LayerRowProps) {
  const rowAnimatedStyle = useAnimatedStyle(() => {
    if (!dragY || reduceMotion) {
      return { transform: [{ translateY: 0 }], opacity: 1, zIndex: 0, elevation: 0 };
    }
    return {
      transform: [{ translateY: dragY.value }],
      opacity: 0.92,
      zIndex: 100,
      elevation: 8 };
  });

  // Refined thumbnail appearance: subtle opacity fade (0→1, 150ms, ease-out).
  // Replaces the old excessive spring scale. Respects reduceMotion.
  const thumbOpacity = useSharedValue(reduceMotion ? 1 : 0);
  useEffect(() => {
    if (reduceMotion) {
      thumbOpacity.value = 1;
    } else {
      thumbOpacity.value = withTiming(1, { duration: Motion.duration.deleteDismiss, easing: Motion.easing.entrance });
    }
  }, [reduceMotion, thumbOpacity]);
  const thumbAnimatedStyle = useAnimatedStyle(() => ({ opacity: thumbOpacity.value }));

  const rowContent = (
    <View
      style={[
        styles.layerRow,
        {
          borderBottomColor: colors.borderSubtle,
          opacity: layer.locked ? 0.5 : (layer.hidden ? 0.3 : 1) },
        isSelected && !reorderMode && { backgroundColor: colors.brandSubtle },
        isDragging && styles.layerRowDragging,
      ]}
    >
      <PressScale
        onPress={() => { if (!reorderMode) onSelect(layer.id); }}
        onLongPress={() => onLongPressRow(layer.id)}
        style={styles.rowMain}
        accessibilityLabel={`Layer ${getLayerDisplayName(layer)}${layer.locked ? ', locked' : ''}${layer.hidden ? ', hidden' : ''}${isSelected ? ', selected' : ''}`}
        accessibilityHint={reorderMode ? 'Use arrows to reorder this layer' : 'Double tap to select, long press to reorder'}
        accessibilityRole="button"
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      >
        <Reanimated.View style={[styles.thumbnail, { backgroundColor: `${getLayerColor(layer.type, colors)}20` }, layer.hidden && styles.thumbnailHidden, thumbAnimatedStyle]}>
          {thumbSource ? (
            <ExpoImage source={thumbSource} style={styles.thumbnailImage} contentFit="cover" cachePolicy="memory-disk" recyclingKey={thumbSource.uri} enforceEarlyResizing />
          ) : (
            <Ionicons name={LAYER_ICONS[layer.type]} size={IconGrammar.standard} color={layer.hidden ? colors.textMuted : getLayerAccentColor(layer.type)} />
          )}
          {layer.type === 'media' && layer.payload.mediaType === 'video' && (
            <View style={[styles.videoBadge, { backgroundColor: colors.overlay }]}>
              <Ionicons name="play" size={IconGrammar.badge} color={colors.textInverse} />
            </View>
          )}
          {layer.locked && (
            <View style={[styles.lockBadge, { backgroundColor: colors.surfaceElevated }]}>
              <Ionicons name="lock-closed" size={IconGrammar.badge} color={colors.warning} />
            </View>
          )}
        </Reanimated.View>
        <Text
          style={[styles.layerName, { color: colors.textPrimary }, layer.hidden && { textDecorationLine: 'line-through', color: colors.textMuted }]}
          numberOfLines={1}
        >
          {getLayerDisplayName(layer)}
        </Text>
      </PressScale>

      <View style={styles.rowActions}>
        {reorderMode ? (
          <>
            <PressScale
              onPress={() => onReorder(layer.id, 'forward')}
              style={styles.actionBtnLarge}
              accessibilityLabel="Move layer up"
              accessibilityRole="button"
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="chevron-up" size={IconGrammar.hero} color={colors.brand} />
            </PressScale>
            <PressScale
              onPress={() => onReorder(layer.id, 'backward')}
              style={styles.actionBtnLarge}
              accessibilityLabel="Move layer down"
              accessibilityRole="button"
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="chevron-down" size={IconGrammar.hero} color={colors.brand} />
            </PressScale>
          </>
        ) : (
          <>
            <PressScale
              onPress={() => onVisibility(layer.id)}
              style={styles.actionBtn}
              accessibilityLabel={layer.hidden ? 'Show layer' : 'Hide layer'}
              accessibilityRole="button"
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name={layer.hidden ? 'eye-off-outline' : 'eye-outline'} size={24} color={colors.textSecondary} />
            </PressScale>
            <PressScale
              onPress={() => onOverflow(layer)}
              style={styles.actionBtn}
              accessibilityLabel="More layer actions"
              accessibilityHint="Opens duplicate, delete and reorder options"
              accessibilityRole="button"
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="ellipsis-horizontal" size={20} color={colors.textMuted} />
            </PressScale>
            <PressScale
              onLongPress={() => onLongPressRow(layer.id)}
              style={styles.actionBtn}
              accessibilityLabel="Drag handle, long press to reorder"
              accessibilityHint="Long press then use arrows to move this layer"
              accessibilityRole="button"
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="reorder-three-outline" size={24} color={colors.textMuted} />
            </PressScale>
          </>
        )}
      </View>
    </View>
  );

  // In reorder mode: use GestureDetector for drag-to-reorder.
  // In normal mode: wrap in SwipeableRow for quick delete (left swipe)
  // and quick lock/unlock (right swipe).
  if (reorderMode && panGesture) {
    return (
      <GestureDetector gesture={panGesture}>
        <Reanimated.View style={[rowAnimatedStyle]}>
          {rowContent}
        </Reanimated.View>
      </GestureDetector>
    );
  }

  if (!reorderMode) {
    return (
      <SwipeableRow
        accessibilityLabel={`Layer ${getLayerDisplayName(layer)}${layer.locked ? ', locked' : ''}${layer.hidden ? ', hidden' : ''}${isSelected ? ', selected' : ''}`}
        accessibilityHint="Swipe left to delete, swipe right to lock. Double tap to select."
        leftAction={{
          icon: layer.locked ? 'lock-open-outline' : 'lock-closed',
          label: layer.locked ? 'Unlock' : 'Lock',
          onPress: () => onQuickLock(layer.id),
          color: colors.commerceTrust }}
        rightAction={{
          icon: 'trash-outline',
          label: 'Delete',
          onPress: () => onQuickDelete(layer.id),
          color: colors.danger }}
        swipeThreshold={80}
      >
        {rowContent}
      </SwipeableRow>
    );
  }

  return (
    <Reanimated.View style={[rowAnimatedStyle]}>
      {rowContent}
    </Reanimated.View>
  );
}

interface LayerOverflowActionSheetProps {
  layer: CreatorLayer | null;
  colors: ThemeColors;
  reduceMotion: boolean;
  onClose: () => void;
  onAction: (action: OverflowAction) => void;
}

function LayerOverflowActionSheet({
  layer,
  colors,
  reduceMotion,
  onClose,
  onAction }: LayerOverflowActionSheetProps) {
  const translateY = useSharedValue(400);
  const backdropOpacity = useSharedValue(0);
  const mounted = useRef(false);

  useEffect(() => {
    if (layer) {
      mounted.current = true;
      if (reduceMotion) {
        translateY.value = 0;
        backdropOpacity.value = 1;
      } else {
        translateY.value = withSpring(0, Motion.spring.entrance);
        backdropOpacity.value = withTiming(1, { duration: Motion.duration.normal, easing: Motion.easing.entrance });
      }
    } else if (mounted.current) {
      if (reduceMotion) {
        translateY.value = 400;
        backdropOpacity.value = 0;
      } else {
        translateY.value = withTiming(400, { duration: Motion.duration.normal, easing: Motion.easing.exit });
        backdropOpacity.value = withTiming(0, { duration: Motion.duration.normal });
      }
    }
  }, [layer, reduceMotion, translateY, backdropOpacity]);

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }] }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value }));

  if (!layer && !mounted.current) return null;

  const options: { key: OverflowAction; label: string; icon: React.ComponentProps<typeof Ionicons>['name']; danger?: boolean }[] = [
    { key: 'front', label: 'Bring to front', icon: 'arrow-up-circle-outline' },
    { key: 'back', label: 'Send to back', icon: 'arrow-down-circle-outline' },
    { key: 'duplicate', label: 'Duplicate', icon: 'copy-outline' },
    { key: 'delete', label: 'Delete', icon: 'trash-outline', danger: true },
  ];

  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 400 }]} pointerEvents={layer ? 'auto' : 'none'}>
      <Reanimated.View style={[StyleSheet.absoluteFill, backdropStyle, { backgroundColor: colors.overlay }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} accessibilityLabel="Close actions" accessibilityHint="Dismisses the layer actions sheet" accessibilityRole="button" />
      </Reanimated.View>
      <Reanimated.View
        style={[
          overflowStyles.sheet,
          {
            backgroundColor: colors.surface,
            borderTopLeftRadius: Radius.xl,
            borderTopRightRadius: Radius.xl },
          sheetStyle,
        ]}
      >
        <View style={overflowStyles.handleContainer}>
          <View style={[overflowStyles.handle, { backgroundColor: colors.borderSubtle }]} />
        </View>
        <Text style={[overflowStyles.title, { color: colors.textPrimary }]} numberOfLines={1}>
          {layer ? getLayerDisplayName(layer) : ''}
        </Text>
        {options.map((opt) => (
          <Pressable
            key={opt.key}
            onPress={() => onAction(opt.key)}
            style={({ pressed }) => [
              overflowStyles.optionRow,
              { backgroundColor: pressed ? colors.surfaceAlt : 'transparent' },
            ]}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityLabel={opt.label}
            accessibilityHint={opt.danger ? `Deletes the layer` : `Performs ${opt.label.toLowerCase()} on the layer`}
            accessibilityRole="button"
          >
            <Ionicons name={opt.icon} size={IconGrammar.standard} color={opt.danger ? colors.danger : colors.textPrimary} />
            <Text style={[overflowStyles.optionText, { color: opt.danger ? colors.danger : colors.textPrimary }]}>
              {opt.label}
            </Text>
          </Pressable>
        ))}
        <Pressable
          onPress={onClose}
          style={({ pressed }) => [
            overflowStyles.cancelRow,
            { backgroundColor: pressed ? colors.surfaceAlt : 'transparent' },
          ]}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityLabel="Cancel"
          accessibilityHint="Closes the layer actions sheet without taking action"
          accessibilityRole="button"
        >
          <Text style={[overflowStyles.cancelText, { color: colors.textSecondary }]}>Cancel</Text>
        </Pressable>
      </Reanimated.View>
    </View>
  );
}

const overflowStyles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingTop: Space.xs,
    paddingBottom: Space.lg,
    paddingHorizontal: Space.md },
  handleContainer: {
    alignItems: 'center',
    paddingVertical: Space.xs },
  handle: {
    width: 32,
    height: 4,
    borderRadius: Radius.md },
  title: {
    fontFamily: Typography.family.semibold,
    fontSize: TypographyV2.sectionTitle.size,
    marginTop: Space.sm },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingVertical: Space.md,
    borderRadius: Radius.md,
    paddingHorizontal: Space.sm },
  optionText: {
    fontFamily: Typography.family.medium,
    fontSize: TypographyV2.body.size },
  cancelRow: {
    alignItems: 'center',
    paddingVertical: Space.md,
    borderRadius: Radius.md,
    marginTop: Space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'transparent' },
  cancelText: {
    fontFamily: Typography.family.semibold,
    fontSize: TypographyV2.body.size } });

function getLayerDisplayName(layer: CreatorLayer): string {
  switch (layer.type) {
    case 'media':
      return layer.payload.mediaType === 'video' ? 'Video' : 'Photo';
    case 'text':
      return layer.payload.text.slice(0, 30) || 'Text';
    case 'product':
      return layer.payload.snapshotTitle || 'Product';
    case 'mention':
      return `@${layer.payload.username}`;
    case 'look':
      return layer.payload.snapshotCaption?.slice(0, 30) || 'Look';
    case 'vote':
      return layer.payload.question.slice(0, 30) || 'Vote';
    case 'quiz':
      return layer.payload.question.slice(0, 30) || 'Quiz';
    case 'question':
      return layer.payload.prompt.slice(0, 30) || 'Question';
    case 'emojiSlider':
      return layer.payload.question.slice(0, 30) || 'Slider';
    case 'countdown':
      return layer.payload.label.slice(0, 30) || 'Countdown';
    case 'decorative':
      return layer.payload.shape;
    case 'draw':
      return `Drawing (${layer.payload.strokes.length})`;
    case 'gif':
      return layer.payload.altText || 'GIF';
    case 'music':
      return `${layer.payload.trackName}${layer.payload.artistName ? ' — ' + layer.payload.artistName : ''}`;
    case 'link':
      return layer.payload.ctaText || 'Link';
    case 'location':
      return layer.payload.placeName || 'Location';
    case 'hashtag':
      return `#${layer.payload.tag}`;
    case 'time':
      return 'Time';
    case 'weather':
      return `${layer.payload.emoji} ${layer.payload.condition}`;
    default:
      return 'Layer';
  }
}

function getLayerThumbnailSource(layer: CreatorLayer): { uri: string } | null {
  switch (layer.type) {
    case 'media': {
      const uri = layer.payload.thumbnailUri || layer.payload.mediaUri;
      return uri ? { uri } : null;
    }
    case 'product': {
      const uri = layer.payload.snapshotImageUrl;
      return uri ? { uri } : null;
    }
    case 'look': {
      const uri = layer.payload.snapshotImageUrl;
      return uri ? { uri } : null;
    }
    default:
      return null;
  }
}

function getLayerColor(type: CreatorLayer['type'], colors: ThemeColors): string {
  switch (type) {
    case 'media': return colors.commerceTrust;
    case 'text': return colors.brand;
    case 'product': return colors.bronze;
    case 'mention': return colors.social;
    case 'look': return colors.discovery;
    case 'vote': return colors.success;
    case 'quiz': return colors.brand;
    case 'question': return colors.social;
    case 'emojiSlider': return colors.brand;
    case 'countdown': return colors.bronze;
    case 'decorative': return colors.coownUp;
    case 'draw': return colors.brand;
    case 'gif': return colors.social;
    case 'music': return colors.brand;
    case 'link': return colors.brand;
    case 'location': return colors.discovery;
    case 'hashtag': return colors.social;
    case 'time': return colors.bronze;
    case 'weather': return colors.discovery;
    default: return colors.textMuted;
  }
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm },
  title: {
    flex: 1,
    textAlign: 'center',
    fontFamily: Typography.family.semibold,
    fontSize: TypographyV2.sectionTitle.size },
  closeBtn: {
    width: Control.hit,
    height: Control.hit,
    justifyContent: 'center',
    alignItems: 'center' },
  doneBtn: {
    width: Control.hit,
    height: Control.hit,
    justifyContent: 'center',
    alignItems: 'center' },
  doneBtnText: {
    fontFamily: Typography.family.semibold,
    fontSize: TypographyV2.bodyStrong.size },
  reorderHint: {
    fontFamily: Typography.family.regular,
    fontSize: TypographyV2.meta.size,
    textAlign: 'center',
    paddingVertical: Space.xs,
    marginBottom: Space.sm },
  scrollBody: {
    paddingHorizontal: Space.md },
  scrollContent: {
    paddingBottom: Space.lg },
  emptyState: {
    alignItems: 'center',
    paddingVertical: Space.xl },
  emptyText: {
    fontFamily: Typography.family.regular,
    fontSize: TypographyV2.bodyStrong.size },
  layerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: Space.sm,
    paddingHorizontal: Space.smMd,
    borderBottomWidth: Stroke.hairline,
    minHeight: ROW_HEIGHT },
  layerRowDragging: {
    opacity: 0.7,
    ...Elevation.modal },
  rowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    minHeight: Control.hit },
  thumbnail: {
    width: THUMB,
    height: THUMB,
    borderRadius: Radius.md,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden' },
  thumbnailHidden: {
    opacity: 0.5 },
  thumbnailImage: {
    width: '100%',
    height: '100%' },
  videoBadge: {
    position: 'absolute',
    bottom: Space.xxs,
    right: Space.xxs,
    width: 14,
    height: 14,
    borderRadius: Radius.full,
    justifyContent: 'center',
    alignItems: 'center' },
  lockBadge: {
    position: 'absolute',
    top: Space.xxs,
    right: Space.xxs,
    width: 14,
    height: 14,
    borderRadius: Radius.full,
    justifyContent: 'center',
    alignItems: 'center' },
  layerName: {
    flex: 1,
    fontFamily: Typography.family.regular,
    fontSize: TypographyV2.body.size },
  rowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xxs },
  actionBtn: {
    width: Control.hit,
    height: Control.hit,
    justifyContent: 'center',
    alignItems: 'center' },
  actionBtnLarge: {
    width: 48,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: Radius.md } });
