import React, { useCallback, useState, useRef, useEffect } from 'react';
import { View, Text, ScrollView, LayoutAnimation, UIManager, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Gesture } from 'react-native-gesture-handler';
import {
  useSharedValue,
  withSpring,
  runOnJS } from 'react-native-reanimated';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { IconGrammar } from '../../theme/designTokens';
import { useAppTheme } from '../../theme/ThemeContext';
import { useCreator } from '../studio/CreatorContext';
import { getAllLayersSorted } from '../core/projectStore/composition';
import { SheetContainer, PressScale } from '../shared/CreatorAnimations';
import { useHaptic } from '../../hooks/useHaptic';
import { useMotionConfig } from '../../hooks/useMotionConfig';
import { Motion } from '../../theme/motionTokens';
import type { CreatorLayer } from '../core/projectStore/composition';
import {
  ROW_HEIGHT,
  ROW_GAP,
  type OverflowAction,
  getLayerThumbnailSource } from './layersSheet/layersSheetShared';
import { styles } from './layersSheet/layersSheetStyles';
import { LayerRow } from './layersSheet/LayerRow';
import { LayerOverflowActionSheet } from './layersSheet/LayerOverflowActionSheet';

export interface CreatorLayersSheetProps {
  visible: boolean;
  onClose: () => void;
}

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

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
  }, [haptic, layers, dragY, dragStartIndex]);

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
