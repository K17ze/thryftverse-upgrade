import React, { useCallback } from 'react';
import { View, StyleSheet, Image, Dimensions, Text } from 'react-native';
import { Video, ResizeMode } from './compat/Video';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  useAnimatedReaction,
  runOnJS,
  withTiming,
  SharedValue,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Colors } from '../constants/colors';
import { Ionicons } from '@expo/vector-icons';
import { AnimatedPressable } from './AnimatedPressable';
import { isVideoUri } from '../utils/media';
import { haptics } from '../utils/haptics';
import { Typography } from '../theme/designTokens';

const { width } = Dimensions.get('window');
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
  /** Whether to show the trailing add button — default true */
  showAddButton?: boolean;
  /** Whether drag reorder is enabled — default true */
  reorderEnabled?: boolean;
}

// Helper to get object values sorted by key (not needed strictly if we map properly)
// We will just manage an array of IDs sorted.

export function SortablePhotoStrip({ photos, onReorder, onAddPhoto, itemIds, renderItem, showAddButton = true, reorderEnabled = true }: Props) {
  const ids = itemIds ?? photos;
  return (
    <View style={styles.container}>
      <Reanimated.ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20 }}
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
              reorderEnabled={reorderEnabled}
            />
          ))}
          {/* Add more button */}
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
              <Ionicons name="add" size={28} color={Colors.background} />
            </AnimatedPressable>
          )}
        </View>
      </Reanimated.ScrollView>
      {reorderEnabled && (
        <Text style={styles.hintText}>Drag to reorder. First media item is the cover.</Text>
      )}
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
  reorderEnabled?: boolean;
}

function SortableItem({ id, itemId, index, total, photos, itemIds, onReorder, renderItem, reorderEnabled = true }: ItemProps) {
  const isVideo = isVideoUri(id);
  const isDragging = useSharedValue(false);
  const position = useSharedValue(index * TOTAL_SIZE);
  const zIndex = useSharedValue(0);
  const orderArray = itemIds ?? photos;

  // When props update (like after drop), update position gently
  useAnimatedReaction(
    () => index,
    (currIndex) => {
      if (!isDragging.value) {
        position.value = withSpring(currIndex * TOTAL_SIZE, { damping: 20, stiffness: 200 });
      }
    },
    [index]
  );

  const panGesture = Gesture.Pan()
    .enabled(reorderEnabled)
    .onStart(() => {
      isDragging.value = true;
      zIndex.value = 100;
    })
    .onUpdate((e) => {
      position.value = index * TOTAL_SIZE + e.translationX;
    })
    .onEnd((e) => {
      const newIndex = Math.max(0, Math.min(total - 1, Math.round(position.value / TOTAL_SIZE)));
      isDragging.value = false;
      position.value = withSpring(newIndex * TOTAL_SIZE, { damping: 20, stiffness: 200 }, () => {
        zIndex.value = 0;
      });

      if (newIndex !== index) {
        // Trigger React re-order on JS thread
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
        { scale: withSpring(isDragging.value ? 1.05 : 1) }
      ],
      shadowOpacity: withTiming(isDragging.value ? 0.3 : 0),
    };
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
              <Image source={{ uri: id }} style={styles.image} />
            )}

            {isVideo && (
              <View style={styles.videoBadge}>
                <Ionicons name="videocam" size={11} color="#fff" />
              </View>
            )}

            {index === 0 && (
              <View style={styles.coverBadge}>
                <Text style={styles.coverText}>COVER</Text>
              </View>
            )}
          </>
        )}
      </Reanimated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 16,
    height: ITEM_SIZE + 60,
  },
  itemWrap: {
    width: ITEM_SIZE,
    height: ITEM_SIZE,
    borderRadius: 16,
    backgroundColor: Colors.surfaceAlt,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 15,
  },
  image: {
    width: '100%',
    height: '100%',
    borderRadius: 16,
  },
  addBtn: {
    position: 'absolute',
    width: ITEM_SIZE,
    height: ITEM_SIZE,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: Colors.border,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverBadge: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.brand,
    paddingVertical: 2,
    alignItems: 'center',
  },
  coverText: {
    color: Colors.background,
    fontSize: 10,
    fontFamily: Typography.family.bold,
  },
  hintText: {
    color: Colors.textMuted,
    fontSize: 12,
    fontFamily: Typography.family.medium,
    textAlign: 'center',
    marginTop: 16,
  },
});