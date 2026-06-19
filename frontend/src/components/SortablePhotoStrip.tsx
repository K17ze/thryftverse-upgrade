import React from 'react';
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

export type MediaItemStatus =
  | 'draft'
  | 'pending'
  | 'preparing'
  | 'uploading'
  | 'uploaded'
  | 'failed'
  | 'cancelled';

export interface MediaStripItem {
  id: string;
  uri: string;
  kind?: 'image' | 'video';
  status?: MediaItemStatus;
  error?: string | null;
}

interface Props {
  items: MediaStripItem[];
  onReorder: (newOrder: MediaStripItem[]) => void;
  onAddPhoto: () => void;
  onRemoveItem?: (id: string) => void;
  onRetryItem?: (id: string) => void;
}

export function SortablePhotoStrip({ items, onReorder, onAddPhoto, onRemoveItem, onRetryItem }: Props) {
  return (
    <View style={styles.container}>
      <Reanimated.ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20 }}
      >
        <View style={{ flexDirection: 'row', position: 'relative', height: ITEM_SIZE }}>
          {items.map((item, index) => (
            <SortableItem
              key={item.id}
              item={item}
              index={index}
              total={items.length}
              items={items}
              onReorder={onReorder}
              onRemoveItem={onRemoveItem}
              onRetryItem={onRetryItem}
            />
          ))}
          {/* Add more button */}
          <AnimatedPressable
            style={[styles.addBtn, { left: items.length * TOTAL_SIZE }]}
            onPress={() => {
              haptics.tap();
              onAddPhoto();
            }}
            hapticFeedback="light"
          >
            <Ionicons name="add" size={28} color={Colors.background} />
          </AnimatedPressable>
        </View>
      </Reanimated.ScrollView>
      <Text style={styles.hintText}>Drag to reorder. First media item is the cover.</Text>
    </View>
  );
}

interface ItemProps {
  item: MediaStripItem;
  index: number;
  total: number;
  items: MediaStripItem[];
  onReorder: (newOrder: MediaStripItem[]) => void;
  onRemoveItem?: (id: string) => void;
  onRetryItem?: (id: string) => void;
}

function StatusBadge({ status }: { status?: MediaItemStatus }) {
  if (!status || status === 'draft' || status === 'uploaded') return null;
  const label =
    status === 'pending' ? 'Pending'
    : status === 'preparing' ? 'Preparing'
    : status === 'uploading' ? 'Uploading'
    : status === 'failed' ? 'Failed'
    : status === 'cancelled' ? 'Cancelled'
    : '';
  const bg =
    status === 'failed' ? Colors.danger
    : status === 'cancelled' ? Colors.textMuted
    : Colors.brand;
  return (
    <View style={[styles.statusBadge, { backgroundColor: bg }]}>
      <Text style={styles.statusText}>{label}</Text>
    </View>
  );
}

function SortableItem({ item, index, total, items, onReorder, onRemoveItem, onRetryItem }: ItemProps) {
  const isVideo = item.kind === 'video' || isVideoUri(item.uri);
  const isDragging = useSharedValue(false);
  const position = useSharedValue(index * TOTAL_SIZE);
  const zIndex = useSharedValue(0);

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
        const newOrder = [...items];
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

  return (
    <GestureDetector gesture={panGesture}>
      <Reanimated.View style={[styles.itemWrap, animatedStyle]}>
        {isVideo ? (
          <Video
            source={{ uri: item.uri }}
            style={styles.image}
            resizeMode={ResizeMode.COVER}
            shouldPlay={false}
            isMuted
            isLooping={false}
          />
        ) : (
          <Image source={{ uri: item.uri }} style={styles.image} />
        )}

        {isVideo && (
          <View style={styles.videoBadge}>
            <Ionicons name="videocam" size={11} color="#fff" />
          </View>
        )}

        <StatusBadge status={item.status} />

        {item.status === 'failed' && onRetryItem && (
          <AnimatedPressable
            style={styles.retryBtn}
            onPress={() => onRetryItem(item.id)}
            activeOpacity={0.8}
          >
            <Ionicons name="refresh" size={14} color="#fff" />
          </AnimatedPressable>
        )}

        {onRemoveItem && (
          <AnimatedPressable
            style={styles.removeBtn}
            onPress={() => onRemoveItem(item.id)}
            activeOpacity={0.8}
          >
            <Ionicons name="close-circle" size={18} color="#fff" />
          </AnimatedPressable>
        )}

        {index === 0 && (
          <View style={styles.coverBadge}>
            <Text style={styles.coverText}>COVER</Text>
          </View>
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
  statusBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    borderRadius: 8,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  statusText: {
    color: '#fff',
    fontSize: 9,
    fontFamily: Typography.family.bold,
  },
  retryBtn: {
    position: 'absolute',
    top: 6,
    right: 28,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeBtn: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hintText: {
    color: Colors.textMuted,
    fontSize: 12,
    fontFamily: Typography.family.medium,
    textAlign: 'center',
    marginTop: 16,
  },
});