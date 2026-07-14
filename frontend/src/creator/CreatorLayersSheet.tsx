import React, { useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Image, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Space, Radius, Type, Typography } from '../theme/designTokens';
import { useAppTheme } from '../theme/ThemeContext';
import { useCreator } from './CreatorContext';
import { getAllLayersSorted } from './composition';
import { SheetContainer, PressScale } from './CreatorAnimations';
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
  decorative: 'happy-outline',
};

const TOUCH = 44;
const THUMB = 40;

export function CreatorLayersSheet({ visible, onClose }: CreatorLayersSheetProps) {
  const { document, activePageIndex, selectedLayerId, selectLayer, removeLayer, duplicateLayer, reorderLayer, toggleLayerLock, toggleLayerVisibility } = useCreator();
  const { colors } = useAppTheme();

  const page = document.pages[activePageIndex];
  const layers = getAllLayersSorted(page).reverse();

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  const openOverflow = useCallback(
    (layer: CreatorLayer) => {
      const name = getLayerDisplayName(layer);
      Alert.alert(
        name,
        layer.type,
        [
          {
            text: 'Bring to front',
            onPress: () => reorderLayer(layer.id, 'front'),
          },
          {
            text: 'Send to back',
            onPress: () => reorderLayer(layer.id, 'back'),
          },
          {
            text: 'Duplicate',
            onPress: () => duplicateLayer(layer.id),
          },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: () => removeLayer(layer.id),
          },
          { text: 'Cancel', style: 'cancel' },
        ],
      );
    },
    [reorderLayer, duplicateLayer, removeLayer],
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
                  { backgroundColor: colors.surfaceAlt },
                  isSelected ? { backgroundColor: `${colors.brand}15`, borderWidth: 1, borderColor: `${colors.brand}40` } : {},
                ]}
              >
                <PressScale
                  onPress={() => selectLayer(layer.id)}
                  style={styles.rowMain}
                  accessibilityLabel={`Layer ${getLayerDisplayName(layer)}${layer.locked ? ', locked' : ''}${layer.hidden ? ', hidden' : ''}${isSelected ? ', selected' : ''}`}
                  accessibilityHint="Double tap to select layer"
                  accessibilityRole="button"
                >
                  <View style={[styles.thumbnail, { backgroundColor: `${getLayerColor(layer.type)}20` }, layer.hidden && styles.thumbnailHidden]}>
                    {thumbSource ? (
                      <Image source={thumbSource} style={styles.thumbnailImage} resizeMode="cover" />
                    ) : (
                      <Ionicons name={LAYER_ICONS[layer.type] as any} size={20} color={layer.hidden ? colors.textMuted : getLayerColor(layer.type)} />
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
                    onPress={() => reorderLayer(layer.id, 'forward')}
                    style={styles.actionBtn}
                    accessibilityLabel="Move layer up"
                    accessibilityRole="button"
                  >
                    <Ionicons name="chevron-up" size={22} color={colors.textSecondary} />
                  </PressScale>
                  <PressScale
                    onPress={() => reorderLayer(layer.id, 'backward')}
                    style={styles.actionBtn}
                    accessibilityLabel="Move layer down"
                    accessibilityRole="button"
                  >
                    <Ionicons name="chevron-down" size={22} color={colors.textSecondary} />
                  </PressScale>
                  <PressScale
                    onPress={() => toggleLayerVisibility(layer.id)}
                    style={styles.actionBtn}
                    accessibilityLabel={layer.hidden ? 'Show layer' : 'Hide layer'}
                    accessibilityRole="button"
                  >
                    <Ionicons name={layer.hidden ? 'eye-off-outline' : 'eye-outline'} size={22} color={colors.textSecondary} />
                  </PressScale>
                  <PressScale
                    onPress={() => toggleLayerLock(layer.id)}
                    style={styles.actionBtn}
                    accessibilityLabel={layer.locked ? 'Unlock layer' : 'Lock layer'}
                    accessibilityRole="button"
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
    case 'decorative':
      return layer.payload.shape;
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

function getLayerColor(type: CreatorLayer['type']): string {
  switch (type) {
    case 'media': return '#5ac8fa';
    case 'text': return '#ffcc00';
    case 'product': return '#ff9500';
    case 'mention': return '#ff2d55';
    case 'look': return '#5856d6';
    case 'vote': return '#34c759';
    case 'decorative': return '#4cd964';
    default: return '#aaa';
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
    borderRadius: Radius.md,
    minHeight: 56,
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
