/**
 * LayerRow — a single layer row for CreatorLayersSheet: thumbnail,
 * name, visibility/overflow/drag actions in normal mode and reorder
 * chevrons in reorder mode. Extracted verbatim from
 * CreatorLayersSheet.tsx.
 */
import React, { useEffect } from 'react';
import { View, Text } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  type SharedValue } from 'react-native-reanimated';
import { IconGrammar } from '../../../theme/designTokens';
import type { ThemeColors } from '../../../theme/ThemeContext';
import { PressScale } from '../../shared/CreatorAnimations';
import { SwipeableRow } from '../../../components/SwipeableRow';
import { Motion } from '../../../theme/motionTokens';
import type { CreatorLayer } from '../../core/projectStore/composition';
import { getLayerAccentColor } from '../../../components/poster/shared/layerAccents';
import { LAYER_ICONS, getLayerColor, getLayerDisplayName } from './layersSheetShared';
import { styles } from './layersSheetStyles';

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

export function LayerRow({
  layer,
  isSelected,
  isDragging,
  reorderMode,
  colors,
  thumbSource,
  dragY,
  reduceMotion,
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
              <Ionicons name="lock-closed" size={IconGrammar.badge} color={colors.warningText} />
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
              accessibilityHint="Raises the layer one step"
              accessibilityRole="button"
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="chevron-up" size={IconGrammar.hero} color={colors.brand} />
            </PressScale>
            <PressScale
              onPress={() => onReorder(layer.id, 'backward')}
              style={styles.actionBtnLarge}
              accessibilityLabel="Move layer down"
              accessibilityHint="Lowers the layer one step"
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
              accessibilityHint="Toggles layer visibility"
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
        // Mirror the inner PressScale handlers so the accessible row exposes
        // truthful activate/longpress actions — touches still resolve to the
        // inner pressable first via responder negotiation (same pattern as
        // InboxScreen's conversation rows).
        onPress={() => onSelect(layer.id)}
        onLongPress={() => onLongPressRow(layer.id)}
        longPressActionLabel="Reorder layer"
        leftAction={{
          icon: layer.locked ? 'lock-open-outline' : 'lock-closed',
          label: layer.locked ? 'Unlock' : 'Lock',
          onPress: () => onQuickLock(layer.id),
          color: colors.commerceTrust }}
        rightAction={{
          icon: 'trash-outline',
          label: 'Delete',
          onPress: () => onQuickDelete(layer.id),
          color: colors.dangerText }}
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
