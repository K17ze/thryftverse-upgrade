import React, { useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Image, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Space, Radius, Type, Typography } from '../theme/designTokens';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { useCreator } from './CreatorContext';
import { getAllLayersSorted } from './composition';
import { SheetContainer, PressScale } from './CreatorAnimations';
import { useHaptic } from '../hooks/useHaptic';
import type { CreatorLayer } from './composition';

export interface CreatorLayersSheetProps {
  visible: boolean;
  onClose: () => void;
}

const LAYER_ICONS: Record<CreatorLayer['type'], string> = {
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

export function CreatorLayersSheet({ visible, onClose }: CreatorLayersSheetProps) {
  const { document, activePageIndex, selectedLayerId, selectLayer, removeLayer, duplicateLayer, reorderLayer, toggleLayerLock, toggleLayerVisibility } = useCreator();
  const { colors } = useAppTheme();
  const haptic = useHaptic();

  const page = document.pages[activePageIndex];
  const layers = getAllLayersSorted(page).reverse();

  const handleClose = useCallback(() => {
    haptic.selection();
    onClose();
  }, [haptic, onClose]);

  const handleSelect = useCallback((id: string) => {
    haptic.selection();
    selectLayer(id);
  }, [haptic, selectLayer]);

  const handleReorder = useCallback((id: string, dir: 'forward' | 'backward') => {
    haptic.selection();
    reorderLayer(id, dir);
  }, [haptic, reorderLayer]);

  const handleVisibility = useCallback((id: string) => {
    haptic.light();
    toggleLayerVisibility(id);
  }, [haptic, toggleLayerVisibility]);

  const handleLock = useCallback((id: string) => {
    haptic.light();
    toggleLayerLock(id);
  }, [haptic, toggleLayerLock]);

  const openOverflow = useCallback(
    (layer: CreatorLayer) => {
      haptic.selection();
      const name = getLayerDisplayName(layer);
      Alert.alert(
        name,
        layer.type,
        [
          {
            text: 'Bring to front',
            onPress: () => { haptic.selection(); reorderLayer(layer.id, 'front'); },
          },
          {
            text: 'Send to back',
            onPress: () => { haptic.selection(); reorderLayer(layer.id, 'back'); },
          },
          {
            text: 'Duplicate',
            onPress: () => { haptic.selection(); duplicateLayer(layer.id); },
          },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: () => { haptic.medium(); removeLayer(layer.id); },
          },
          { text: 'Cancel', style: 'cancel' },
        ],
      );
    },
    [haptic, reorderLayer, duplicateLayer, removeLayer],
  );

  return (
    <SheetContainer visible={visible} onClose={handleClose} maxHeight={0.7}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Layers</Text>
        <PressScale onPress={handleClose} style={styles.closeBtn} accessibilityLabel="Close layers" accessibilityRole="button">
          <Ionicons name="close" size={22} color={colors.textSecondary} />
        </PressScale>
      </View>

      <ScrollView style={styles.scrollBody} contentContainerStyle={styles.scrollContent}>
        {layers.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="layers-outline" size={36} color={colors.textMuted} />
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No layers yet</Text>
            <Text style={[styles.emptySubtext, { color: colors.textMuted }]}>Add content from the dock below</Text>
          </View>
        ) : (
          layers.map((layer) => {
            const isSelected = layer.id === selectedLayerId;
            const thumbSource = getLayerThumbnailSource(layer);
            return (
              <View
                key={layer.id}
                style={[
                  styles.layerRow,
                  { borderBottomColor: colors.border },
                  isSelected ? { backgroundColor: `${colors.brand}10` } : {},
                ]}
              >
                {isSelected && <View style={[styles.selectionAccent, { backgroundColor: colors.brand }]} />}
                <PressScale
                  onPress={() => handleSelect(layer.id)}
                  style={styles.rowMain}
                  accessibilityLabel={`Layer ${getLayerDisplayName(layer)}${layer.locked ? ', locked' : ''}${layer.hidden ? ', hidden' : ''}${isSelected ? ', selected' : ''}`}
                  accessibilityHint="Double tap to select layer"
                  accessibilityRole="button"
                  hitSlop={8}
                >
                  <View style={[styles.thumbnail, { backgroundColor: `${getLayerColor(layer.type, colors)}20` }, layer.hidden && styles.thumbnailHidden]}>
                    {thumbSource ? (
                      <Image source={thumbSource} style={styles.thumbnailImage} resizeMode="cover" />
                    ) : (
                      <Ionicons name={LAYER_ICONS[layer.type] as any} size={20} color={layer.hidden ? colors.textMuted : getLayerColor(layer.type, colors)} />
                    )}
                    {layer.type === 'media' && layer.payload.mediaType === 'video' && (
                      <View style={styles.videoBadge}>
                        <Ionicons name="play" size={10} color="#ffffff" />
                      </View>
                    )}
                  </View>
                  <View style={styles.layerInfo}>
                    <Text
                      style={[styles.layerName, { color: colors.textPrimary }, layer.hidden && { textDecorationLine: 'line-through', color: colors.textMuted }]}
                      numberOfLines={1}
                    >
                      {getLayerDisplayName(layer)}
                    </Text>
                    <Text style={[styles.layerType, { color: colors.textMuted }]} numberOfLines={1}>
                      {layer.type}
                    </Text>
                  </View>
                </PressScale>

                <View style={styles.rowActions}>
                  <PressScale
                    onPress={() => handleReorder(layer.id, 'forward')}
                    style={styles.actionBtn}
                    accessibilityLabel="Move layer up"
                    accessibilityRole="button"
                    hitSlop={8}
                  >
                    <Ionicons name="chevron-up" size={22} color={colors.textSecondary} />
                  </PressScale>
                  <PressScale
                    onPress={() => handleReorder(layer.id, 'backward')}
                    style={styles.actionBtn}
                    accessibilityLabel="Move layer down"
                    accessibilityRole="button"
                    hitSlop={8}
                  >
                    <Ionicons name="chevron-down" size={22} color={colors.textSecondary} />
                  </PressScale>
                  <PressScale
                    onPress={() => handleVisibility(layer.id)}
                    style={styles.actionBtn}
                    accessibilityLabel={layer.hidden ? 'Show layer' : 'Hide layer'}
                    accessibilityRole="button"
                    hitSlop={8}
                  >
                    <Ionicons name={layer.hidden ? 'eye-off-outline' : 'eye-outline'} size={22} color={colors.textSecondary} />
                  </PressScale>
                  <PressScale
                    onPress={() => handleLock(layer.id)}
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
                    onPress={() => openOverflow(layer)}
                    style={styles.actionBtn}
                    accessibilityLabel="More layer actions"
                    accessibilityHint="Opens duplicate, delete and reorder options"
                    accessibilityRole="button"
                    hitSlop={8}
                  >
                    <Ionicons name="ellipsis-horizontal" size={22} color={colors.textSecondary} />
                  </PressScale>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </SheetContainer>
  );
}

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
    paddingVertical: Space.xs,
    paddingHorizontal: Space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: 56,
  },
  selectionAccent: {
    position: 'absolute',
    left: 0,
    top: Space.xs,
    bottom: Space.xs,
    width: 3,
    borderRadius: 2,
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
    borderRadius: 7,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  layerInfo: {
    flex: 1,
    justifyContent: 'center',
    gap: 2,
  },
  layerName: {
    fontFamily: Typography.family.semibold,
    fontSize: Type.body.size,
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
});
