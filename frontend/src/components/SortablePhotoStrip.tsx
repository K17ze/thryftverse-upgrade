import React, { useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { Video, ResizeMode } from './compat/Video';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedReaction,
  runOnJS,
  withSpring } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useAppTheme } from '../theme/ThemeContext';
import { AppIcon } from './common/AppIcon';
import { AnimatedPressable } from './AnimatedPressable';
import { FocalImage } from './media/FocalImage';
import { isVideoUri } from '../utils/media';
import { haptics } from '../utils/haptics';
import { Radius, Space, Stroke } from '../theme/designTokens';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useMotionConfig } from '../hooks/useMotionConfig';
import { REDUCED_SPRING } from '../theme/motionTokens';

const ITEM_SIZE = 80;
const SPACING = 12;
const TOTAL_SIZE = ITEM_SIZE + SPACING;

interface Props {
  photos: string[];
  onReorder: (newOrder: string[]) => void;
  onAddPhoto?: () => void;
  /** Stable item IDs — when provided, keys and onReorder use IDs instead of URIs */
  itemIds?: string[];
  /** Custom content for each item — when provided, replaces default Image/Video rendering */
  renderItem?: (index: number) => React.ReactNode;
  /** Focal points keyed by item id — anchors default thumbnails on the user-set subject */
  focalPoints?: Record<string, { x: number; y: number }>;
  /** Whether to show the trailing add button — default true */
  showAddButton?: boolean;
  /** Whether drag reorder is enabled — default true */
  reorderEnabled?: boolean;
}

export function SortablePhotoStrip({ photos, onReorder, onAddPhoto, itemIds, renderItem, focalPoints, showAddButton = true, reorderEnabled = true }: Props) {
  const ids = itemIds ?? photos;
  const { colors } = useAppTheme();
  const reducedMotion = useReducedMotion();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.container}>
      <Reanimated.ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: Space.md }}
      >
        <View style={{ flexDirection: 'row', position: 'relative', height: ITEM_SIZE }}>
          {photos.map((photo, index) => (
            <SortableItem
              key={ids[index] ?? photo}
              id={photo}
              itemId={ids[index]}
              index={index}
              total={photos.length}
              photos={photos}
              itemIds={ids}
              onReorder={onReorder}
              renderItem={renderItem}
              focalPoint={focalPoints?.[ids[index] ?? photo]}
              reorderEnabled={reorderEnabled}
              reducedMotion={reducedMotion}
            />
          ))}
          {showAddButton && onAddPhoto && (
            <AnimatedPressable
              style={[styles.addBtn, { left: photos.length * TOTAL_SIZE }]}
              onPress={() => {
                haptics.tap();
                onAddPhoto();
              }}
              hapticFeedback="light"
              accessibilityRole="button"
              accessibilityLabel="Add more photos"
            >
              <AppIcon name="add" size={28} color="textMuted" accessible={false} />
            </AnimatedPressable>
          )}
        </View>
      </Reanimated.ScrollView>
    </View>
  );
}

interface ItemProps {
  id: string;
  itemId?: string;
  index: number;
  total: number;
  photos: string[];
  itemIds?: string[];
  onReorder: (newOrder: string[]) => void;
  renderItem?: (index: number) => React.ReactNode;
  focalPoint?: { x: number; y: number };
  reorderEnabled?: boolean;
  reducedMotion?: boolean;
}

function SortableItem({ id, itemId, index, total, photos, itemIds, onReorder, renderItem, focalPoint, reorderEnabled = true, reducedMotion = false }: ItemProps) {
  const isVideo = isVideoUri(id);
  const { colors } = useAppTheme();
  const { spring } = useMotionConfig();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const isDragging = useSharedValue(false);
  const position = useSharedValue(index * TOTAL_SIZE);
  const zIndex = useSharedValue(0);
  const scaleSV = useSharedValue(1);
  const orderArray = itemIds ?? photos;

  // When props update (like after drop), update position gently
  useAnimatedReaction(
    () => index,
    (currIndex) => {
      if (!isDragging.value) {
        position.value = withSpring(currIndex * TOTAL_SIZE, reducedMotion ? REDUCED_SPRING : spring.press);
      }
    },
    [index, reducedMotion, spring]
  );

  const panGesture = Gesture.Pan()
    .enabled(reorderEnabled)
    .minDistance(8)
    .activeOffsetX([-10, 10])
    .activeOffsetY([-10, 10])
    .onStart(() => {
      isDragging.value = true;
      zIndex.value = 100;
      scaleSV.value = withSpring(1.1, reducedMotion ? REDUCED_SPRING : spring.press);
    })
    .onUpdate((e) => {
      position.value = index * TOTAL_SIZE + e.translationX;
    })
    .onEnd((e) => {
      const newIndex = Math.max(0, Math.min(total - 1, Math.round(position.value / TOTAL_SIZE)));
      isDragging.value = false;
      scaleSV.value = withSpring(1, reducedMotion ? REDUCED_SPRING : spring.press);
      position.value = withSpring(newIndex * TOTAL_SIZE, reducedMotion ? REDUCED_SPRING : spring.press, () => {
        zIndex.value = 0;
      });

      if (newIndex !== index) {
        runOnJS(haptics.selection)();
        const newOrder = [...orderArray];
        const [moved] = newOrder.splice(index, 1);
        newOrder.splice(newIndex, 0, moved);
        runOnJS(onReorder)(newOrder);
      }
    });

  const animatedStyle = useAnimatedStyle(() => {
    return {
      position: 'absolute',
      left: 0,
      top: 0,
      zIndex: zIndex.value,
      transform: [
        { translateX: position.value },
        { scale: scaleSV.value }
      ] };
  });

  const accessibilityActions = reorderEnabled ? [
    { name: 'moveEarlier', label: 'Move earlier' },
    { name: 'moveLater', label: 'Move later' },
  ] : undefined;

  const handleAccessibilityAction = useCallback((event: { nativeEvent: { actionName: string } }) => {
    const { actionName } = event.nativeEvent;
    if (actionName === 'moveEarlier' && index > 0) {
      const newOrder = [...orderArray];
      const [moved] = newOrder.splice(index, 1);
      newOrder.splice(index - 1, 0, moved);
      onReorder(newOrder);
    } else if (actionName === 'moveLater' && index < total - 1) {
      const newOrder = [...orderArray];
      const [moved] = newOrder.splice(index, 1);
      newOrder.splice(index + 1, 0, moved);
      onReorder(newOrder);
    }
  }, [index, total, orderArray, onReorder]);

  return (
    <GestureDetector gesture={panGesture}>
      <Reanimated.View
        style={[styles.itemWrap, animatedStyle]}
        accessibilityRole={reorderEnabled ? "adjustable" : "image"}
        accessibilityLabel={`Media item ${index + 1} of ${total}${index === 0 ? ', cover' : ''}${isVideo ? ', video' : ''}`}
        accessibilityActions={accessibilityActions}
        onAccessibilityAction={handleAccessibilityAction}
      >
        {renderItem ? (
          renderItem(index)
        ) : (
          <>
            {isVideo ? (
              <Video
                source={{ uri: id }}
                style={styles.image}
                resizeMode={ResizeMode.COVER}
                shouldPlay={false}
                isMuted
                isLooping={false}
              />
            ) : (
              <FocalImage uri={id} focalPoint={focalPoint} style={styles.image} />
            )}

            {isVideo && (
              <View style={styles.playBadge} pointerEvents="none">
                <AppIcon name="play" variant="filled" size={11} color="scrimTextPrimary" accessible={false} />
              </View>
            )}
          </>
        )}
      </Reanimated.View>
    </GestureDetector>
  );
}

const createStyles = (colors: ReturnType<typeof useAppTheme>['colors']) => StyleSheet.create({
  container: {
    paddingVertical: Space.md },
  itemWrap: {
    width: ITEM_SIZE,
    height: ITEM_SIZE,
    borderRadius: Radius.md,
    overflow: 'hidden' },
  image: {
    width: '100%',
    height: '100%',
    borderRadius: Radius.md },
  addBtn: {
    position: 'absolute',
    width: ITEM_SIZE,
    height: ITEM_SIZE,
    borderRadius: Radius.lg,
    borderWidth: Stroke.standard,
    borderColor: colors.border,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center' },
  /* Play glyph over the paused frame — same scrim-circle grammar as the
     poster thumbs (decorative; aria-hidden). */
  playBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: Radius.full,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center' } });
