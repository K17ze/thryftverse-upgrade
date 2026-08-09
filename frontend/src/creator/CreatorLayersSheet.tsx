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
  Easing,
  type SharedValue,
} from 'react-native-reanimated';
import { Space, Radius, Type, Typography } from '../theme/designTokens';
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
  weather: 'partly-sunny-outline',
};

const TOUCH = 44;
const THUMB = 40;
const ROW_HEIGHT = 56;
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
  const dragStartIndex = useRef(-1);

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
    dragStartIndex.current = idx;
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
        duration: 300,
        update: { type: LayoutAnimation.Types.easeInEaseOut },
      });
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
        duration: 250,
        update: { type: LayoutAnimation.Types.easeInEaseOut },
        delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
      });
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
          duration: 300,
          update: { type: LayoutAnimation.Types.easeInEaseOut },
          delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
        });
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
        if (deltaRows !== 0 && dragStartIndex.current >= 0) {
          const startIdx = dragStartIndex.current;
          const targetIdx = Math.max(0, Math.min(layers.length - 1, startIdx + deltaRows));
          let dir: 'forward' | 'backward' | null = null;
          if (targetIdx > startIdx) {
            dir = 'forward';
          } else if (targetIdx < startIdx) {
            dir = 'backward';
          }
          if (dir) {
            const steps = Math.abs(targetIdx - startIdx);
            const layerId = layers[startIdx].id;
            runOnJS((() => {
              let count = 0;
              const doStep = () => {
                if (count >= steps) return;
                count += 1;
                if (!reduceMotion) {
                  LayoutAnimation.configureNext({
                    duration: 200,
                    update: { type: LayoutAnimation.Types.easeInEaseOut },
                  });
                }
                reorderLayer(layerId, dir as 'forward' | 'backward');
                if (count < steps) {
                  setTimeout(doStep, 16);
                }
              };
              doStep();
            }))();
          }
        }
        dragStartIndex.current = -1;
      })
  ).current;

  return (
    <SheetContainer visible={visible} onClose={handleClose} maxHeight={0.7}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>{reorderMode ? 'Reorder Layers' : 'Layers'}</Text>
        {reorderMode ? (
          <PressScale onPress={handleExitReorder} style={styles.doneBtn} accessibilityLabel="Done reordering" accessibilityRole="button">
            <Text style={[styles.doneBtnText, { color: colors.brand }]}>Done</Text>
          </PressScale>
        ) : (
          <PressScale onPress={handleClose} style={styles.closeBtn} accessibilityLabel="Close layers" accessibilityRole="button">
            <Ionicons name="close" size={22} color={colors.textSecondary} />
          </PressScale>
        )}
      </View>

      <ScrollView style={styles.scrollBody} contentContainerStyle={styles.scrollContent}>
        {layers.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="layers-outline" size={36} color={colors.textMuted} />
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No layers yet</Text>
            <Text style={[styles.emptySubtext, { color: colors.textMuted }]}>Add content from the dock below</Text>
          </View>
        ) : (
          <>
            {reorderMode && (
              <Text style={[styles.reorderHint, { color: colors.textMuted }]}>
                Long-press a layer to drag, or use the arrows to reorder
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
  onLock,
  onQuickDelete,
  onQuickLock,
  onOverflow,
  panGesture,
}: LayerRowProps) {
  // Thumbnail spring scale on appearance
  const thumbScale = useSharedValue(reduceMotion ? 1 : 0.8);
  useEffect(() => {
    if (!reduceMotion) {
      thumbScale.value = withSpring(1, Motion.spring.tap);
    }
  }, [thumbScale, reduceMotion]);

  const thumbAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: thumbScale.value }],
  }));

  const rowAnimatedStyle = useAnimatedStyle(() => {
    if (!dragY || reduceMotion) {
      return { transform: [{ translateY: 0 }], opacity: 1, zIndex: 0, elevation: 0 };
    }
    return {
      transform: [{ translateY: dragY.value }],
      opacity: 0.92,
      zIndex: 100,
      elevation: 8,
    };
  });

  const rowContent = (
    <View
      style={[
        styles.layerRow,
        {
          backgroundColor: colors.surface,
          borderColor: isSelected && !reorderMode ? colors.brand : colors.borderSubtle,
          opacity: layer.locked ? 0.5 : (layer.hidden ? 0.3 : 1),
        },
        isDragging && styles.layerRowDragging,
      ]}
    >
      {isSelected && !reorderMode && <View style={[styles.selectionAccent, { backgroundColor: colors.brand }]} />}

      {/* Drag handle */}
      <PressScale
        onLongPress={() => onLongPressRow(layer.id)}
        style={styles.dragHandle}
        accessibilityLabel="Drag handle, long press to reorder"
        accessibilityHint="Long press then use arrows to move this layer"
        accessibilityRole="button"
        hitSlop={4}
      >
        <Ionicons
          name="menu-outline"
          size={22}
          color={reorderMode ? colors.brand : colors.textMuted}
        />
      </PressScale>

      <PressScale
        onPress={() => { if (!reorderMode) onSelect(layer.id); }}
        onLongPress={() => onLongPressRow(layer.id)}
        style={styles.rowMain}
        accessibilityLabel={`Layer ${getLayerDisplayName(layer)}${layer.locked ? ', locked' : ''}${layer.hidden ? ', hidden' : ''}${isSelected ? ', selected' : ''}`}
        accessibilityHint={reorderMode ? 'Use arrows to reorder this layer' : 'Double tap to select, long press to reorder'}
        accessibilityRole="button"
        hitSlop={8}
      >
        <Reanimated.View style={[styles.thumbnail, { backgroundColor: `${getLayerColor(layer.type, colors)}20` }, layer.hidden && styles.thumbnailHidden, thumbAnimatedStyle]}>
          {thumbSource ? (
            <ExpoImage source={thumbSource} style={styles.thumbnailImage} contentFit="cover" cachePolicy="memory-disk" recyclingKey={thumbSource.uri} enforceEarlyResizing />
          ) : (
            <Ionicons name={LAYER_ICONS[layer.type]} size={20} color={layer.hidden ? colors.textMuted : getLayerAccentColor(layer.type)} />
          )}
          {layer.type === 'media' && layer.payload.mediaType === 'video' && (
            <View style={[styles.videoBadge, { backgroundColor: colors.overlay }]}>
              <Ionicons name="play" size={10} color={colors.textInverse} />
            </View>
          )}
          {layer.locked && (
            <View style={[styles.lockBadge, { backgroundColor: colors.surfaceElevated }]}>
              <Ionicons name="lock-closed" size={10} color={colors.warning} />
            </View>
          )}
        </Reanimated.View>
        <View style={styles.layerInfo}>
          <View style={styles.layerNameRow}>
            <Ionicons name={LAYER_ICONS[layer.type]} size={16} color={getLayerAccentColor(layer.type)} />
            <Text
              style={[styles.layerName, { color: colors.textPrimary }, layer.hidden && { textDecorationLine: 'line-through', color: colors.textMuted }]}
              numberOfLines={1}
            >
              {getLayerDisplayName(layer)}
            </Text>
          </View>
          <Text style={[styles.layerType, { color: colors.textMuted }]} numberOfLines={1}>
            {layer.type}
          </Text>
        </View>
      </PressScale>

      <View style={styles.rowActions}>
        {reorderMode ? (
          <>
            <PressScale
              onPress={() => onReorder(layer.id, 'forward')}
              style={styles.actionBtnLarge}
              accessibilityLabel="Move layer up"
              accessibilityRole="button"
              hitSlop={8}
            >
              <Ionicons name="chevron-up" size={26} color={colors.brand} />
            </PressScale>
            <PressScale
              onPress={() => onReorder(layer.id, 'backward')}
              style={styles.actionBtnLarge}
              accessibilityLabel="Move layer down"
              accessibilityRole="button"
              hitSlop={8}
            >
              <Ionicons name="chevron-down" size={26} color={colors.brand} />
            </PressScale>
          </>
        ) : (
          <>
            <PressScale
              onPress={() => onReorder(layer.id, 'forward')}
              style={styles.actionBtn}
              accessibilityLabel="Move layer up"
              accessibilityRole="button"
              hitSlop={8}
            >
              <Ionicons name="chevron-up" size={22} color={colors.textSecondary} />
            </PressScale>
            <PressScale
              onPress={() => onReorder(layer.id, 'backward')}
              style={styles.actionBtn}
              accessibilityLabel="Move layer down"
              accessibilityRole="button"
              hitSlop={8}
            >
              <Ionicons name="chevron-down" size={22} color={colors.textSecondary} />
            </PressScale>
            <PressScale
              onPress={() => onVisibility(layer.id)}
              style={styles.actionBtn}
              accessibilityLabel={layer.hidden ? 'Show layer' : 'Hide layer'}
              accessibilityRole="button"
              hitSlop={8}
            >
              <Ionicons name={layer.hidden ? 'eye-off-outline' : 'eye-outline'} size={22} color={colors.textSecondary} />
            </PressScale>
            <PressScale
              onPress={() => onLock(layer.id)}
              style={styles.actionBtn}
              accessibilityLabel={layer.locked ? 'Unlock layer' : 'Lock layer'}
              accessibilityRole="button"
              hitSlop={8}
            >
              <Ionicons
                name={layer.locked ? 'lock-closed' : 'lock-open-outline'}
                size={22}
                color={layer.locked ? colors.warning : colors.textSecondary}
              />
            </PressScale>
            <PressScale
              onPress={() => onOverflow(layer)}
              style={styles.actionBtn}
              accessibilityLabel="More layer actions"
              accessibilityHint="Opens duplicate, delete and reorder options"
              accessibilityRole="button"
              hitSlop={8}
            >
              <Ionicons name="ellipsis-horizontal" size={22} color={colors.textSecondary} />
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
          color: colors.commerceTrust,
        }}
        rightAction={{
          icon: 'trash-outline',
          label: 'Delete',
          onPress: () => onQuickDelete(layer.id),
          color: colors.danger,
        }}
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
  onAction,
}: LayerOverflowActionSheetProps) {
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
        backdropOpacity.value = withTiming(1, { duration: 160, easing: Easing.out(Easing.ease) });
      }
    } else if (mounted.current) {
      if (reduceMotion) {
        translateY.value = 400;
        backdropOpacity.value = 0;
      } else {
        translateY.value = withTiming(400, { duration: 180, easing: Easing.in(Easing.ease) });
        backdropOpacity.value = withTiming(0, { duration: 160 });
      }
    }
  }, [layer, reduceMotion, translateY, backdropOpacity]);

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

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
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close actions" accessibilityRole="button" />
      </Reanimated.View>
      <Reanimated.View
        style={[
          overflowStyles.sheet,
          {
            backgroundColor: colors.surface,
            borderTopLeftRadius: Radius.xl,
            borderTopRightRadius: Radius.xl,
          },
          sheetStyle,
        ]}
      >
        <View style={overflowStyles.handleContainer}>
          <View style={[overflowStyles.handle, { backgroundColor: colors.borderSubtle }]} />
        </View>
        <Text style={[overflowStyles.title, { color: colors.textPrimary }]} numberOfLines={1}>
          {layer ? getLayerDisplayName(layer) : ''}
        </Text>
        <Text style={[overflowStyles.subtitle, { color: colors.textMuted }]}>
          {layer ? layer.type : ''}
        </Text>
        {options.map((opt) => (
          <Pressable
            key={opt.key}
            onPress={() => onAction(opt.key)}
            style={({ pressed }) => [
              overflowStyles.optionRow,
              { backgroundColor: pressed ? colors.surfaceAlt : 'transparent' },
            ]}
            accessibilityLabel={opt.label}
            accessibilityRole="button"
          >
            <Ionicons name={opt.icon} size={22} color={opt.danger ? colors.danger : colors.textPrimary} />
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
          accessibilityLabel="Cancel"
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
    paddingHorizontal: Space.md,
  },
  handleContainer: {
    alignItems: 'center',
    paddingVertical: Space.xs,
  },
  handle: {
    width: 32,
    height: 4,
    borderRadius: Radius.sm,
  },
  title: {
    fontFamily: Typography.family.semibold,
    fontSize: Type.subtitle.size,
    marginTop: Space.sm,
  },
  subtitle: {
    fontFamily: Typography.family.regular,
    fontSize: Type.caption.size,
    textTransform: 'capitalize',
    marginBottom: Space.sm,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingVertical: Space.md,
    borderRadius: Radius.md,
    paddingHorizontal: Space.sm,
  },
  optionText: {
    fontFamily: Typography.family.medium,
    fontSize: Type.body.size,
  },
  cancelRow: {
    alignItems: 'center',
    paddingVertical: Space.md,
    borderRadius: Radius.md,
    marginTop: Space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'transparent',
  },
  cancelText: {
    fontFamily: Typography.family.semibold,
    fontSize: Type.body.size,
  },
});

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
    case 'text': return colors.antiqueGold;
    case 'product': return colors.bronze;
    case 'mention': return colors.social;
    case 'look': return colors.discovery;
    case 'vote': return colors.success;
    case 'quiz': return colors.brand;
    case 'question': return colors.social;
    case 'emojiSlider': return colors.antiqueGold;
    case 'countdown': return colors.bronze;
    case 'decorative': return colors.coownUp;
    case 'draw': return colors.brand;
    case 'gif': return colors.social;
    case 'music': return colors.antiqueGold;
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
    paddingVertical: Space.sm,
  },
  title: {
    fontFamily: Typography.family.semibold,
    fontSize: Type.subtitle.size,
  },
  closeBtn: {
    width: TOUCH,
    height: TOUCH,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: Radius.sm,
  },
  doneBtn: {
    height: TOUCH,
    paddingHorizontal: Space.sm,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: Radius.sm,
  },
  doneBtnText: {
    fontFamily: Typography.family.semibold,
    fontSize: Type.body.size,
  },
  reorderHint: {
    fontFamily: Typography.family.regular,
    fontSize: Type.caption.size,
    textAlign: 'center',
    paddingVertical: Space.xs,
  },
  scrollBody: {
    paddingHorizontal: Space.md,
  },
  scrollContent: {
    paddingBottom: Space.lg,
    gap: Space.sm,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: Space.xl,
    gap: Space.sm,
  },
  emptyText: {
    fontFamily: Typography.family.semibold,
    fontSize: Type.bodyEmphasis.size,
  },
  emptySubtext: {
    fontFamily: Typography.family.regular,
    fontSize: Type.caption.size,
  },
  layerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    paddingVertical: Space.sm,
    paddingHorizontal: 12,
    borderRadius: Radius.lg,
    borderWidth: 1,
    minHeight: 56,
  },
  layerRowDragging: {
    opacity: 0.7,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  dragHandle: {
    width: TOUCH,
    height: TOUCH,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: Radius.sm,
  },
  selectionAccent: {
    position: 'absolute',
    left: 0,
    top: Space.xs,
    bottom: Space.xs,
    width: 3,
    borderRadius: Radius.sm,
  },
  rowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    minHeight: TOUCH,
  },
  thumbnail: {
    width: THUMB,
    height: THUMB,
    borderRadius: Radius.sm,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  thumbnailHidden: {
    opacity: 0.5,
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
  },
  videoBadge: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 14,
    height: 14,
    borderRadius: Radius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  lockBadge: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 14,
    height: 14,
    borderRadius: Radius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  layerInfo: {
    flex: 1,
    justifyContent: 'center',
    gap: 2,
  },
  layerNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  layerName: {
    fontFamily: Typography.family.semibold,
    fontSize: Type.body.size,
    flex: 1,
  },
  layerType: {
    fontFamily: Typography.family.regular,
    fontSize: Type.caption.size,
    textTransform: 'capitalize',
  },
  rowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  actionBtn: {
    width: TOUCH,
    height: TOUCH,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: Radius.sm,
  },
  actionBtnLarge: {
    width: 48,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: Radius.md,
  },
});
