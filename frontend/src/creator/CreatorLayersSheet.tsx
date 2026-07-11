import React, { useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Space, Radius, Type, Typography } from '../theme/designTokens';
import { Colors } from '../constants/colors';
import { useCreator } from './CreatorContext';
import { getAllLayersSorted } from './composition';
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

export function CreatorLayersSheet({ visible, onClose }: CreatorLayersSheetProps) {
  const { document, activePageIndex, selectedLayerId, selectLayer, removeLayer, duplicateLayer, reorderLayer, toggleLayerLock, toggleLayerVisibility } = useCreator();

  if (!visible) return null;

  const page = document.pages[activePageIndex];
  const layers = getAllLayersSorted(page).reverse();

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  return (
    <View style={styles.overlay}>
      <Pressable style={styles.backdrop} onPress={handleClose} />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <View style={styles.header}>
          <Text style={styles.title}>Layers</Text>
          <Pressable onPress={handleClose} style={styles.closeBtn} accessibilityLabel="Close layers" accessibilityRole="button">
            <Ionicons name="close" size={20} color={Colors.textSecondary} />
          </Pressable>
        </View>

        <ScrollView style={styles.scrollBody} contentContainerStyle={styles.scrollContent}>
          {layers.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="layers-outline" size={32} color={Colors.textMuted} />
              <Text style={styles.emptyText}>No layers yet</Text>
              <Text style={styles.emptySubtext}>Add content from the dock below</Text>
            </View>
          ) : (
            layers.map((layer) => {
              const isSelected = layer.id === selectedLayerId;
              return (
                <Pressable
                  key={layer.id}
                  onPress={() => selectLayer(layer.id)}
                  style={[styles.layerRow, isSelected && styles.layerRowSelected]}
                  accessibilityLabel={`Layer ${getLayerDisplayName(layer)}${layer.locked ? ', locked' : ''}${layer.hidden ? ', hidden' : ''}${isSelected ? ', selected' : ''}`}
                  accessibilityRole="button"
                  accessibilityHint="Double tap to select layer"
                >
                  <View style={[styles.layerIcon, { backgroundColor: `${getLayerColor(layer.type)}20` }, layer.hidden && styles.layerIconHidden]}>
                    <Ionicons name={LAYER_ICONS[layer.type] as any} size={16} color={layer.hidden ? Colors.textMuted : getLayerColor(layer.type)} />
                  </View>
                  <View style={styles.layerInfo}>
                    <Text style={[styles.layerName, layer.hidden && styles.layerNameHidden]} numberOfLines={1}>{getLayerDisplayName(layer)}</Text>
                    <Text style={styles.layerType}>{layer.type}{layer.locked ? ' · locked' : ''}{layer.hidden ? ' · hidden' : ''}</Text>
                  </View>
                  <View style={styles.layerActions}>
                    <Pressable
                      onPress={() => reorderLayer(layer.id, 'front')}
                      style={styles.layerActionBtn}
                      accessibilityLabel="Bring to front"
                      accessibilityRole="button"
                    >
                      <Ionicons name="arrow-up-circle-outline" size={16} color={Colors.textSecondary} />
                    </Pressable>
                    <Pressable
                      onPress={() => reorderLayer(layer.id, 'forward')}
                      style={styles.layerActionBtn}
                      accessibilityLabel="Move forward"
                      accessibilityRole="button"
                    >
                      <Ionicons name="chevron-up" size={16} color={Colors.textSecondary} />
                    </Pressable>
                    <Pressable
                      onPress={() => reorderLayer(layer.id, 'backward')}
                      style={styles.layerActionBtn}
                      accessibilityLabel="Move backward"
                      accessibilityRole="button"
                    >
                      <Ionicons name="chevron-down" size={16} color={Colors.textSecondary} />
                    </Pressable>
                    <Pressable
                      onPress={() => reorderLayer(layer.id, 'back')}
                      style={styles.layerActionBtn}
                      accessibilityLabel="Send to back"
                      accessibilityRole="button"
                    >
                      <Ionicons name="arrow-down-circle-outline" size={16} color={Colors.textSecondary} />
                    </Pressable>
                    <Pressable
                      onPress={() => toggleLayerLock(layer.id)}
                      style={styles.layerActionBtn}
                      accessibilityLabel={layer.locked ? 'Unlock layer' : 'Lock layer'}
                      accessibilityRole="button"
                    >
                      <Ionicons name={layer.locked ? 'lock-closed' : 'lock-open-outline'} size={16} color={layer.locked ? '#ffc107' : Colors.textSecondary} />
                    </Pressable>
                    <Pressable
                      onPress={() => toggleLayerVisibility(layer.id)}
                      style={styles.layerActionBtn}
                      accessibilityLabel={layer.hidden ? 'Show layer' : 'Hide layer'}
                      accessibilityRole="button"
                    >
                      <Ionicons name={layer.hidden ? 'eye-off-outline' : 'eye-outline'} size={16} color={Colors.textSecondary} />
                    </Pressable>
                    <Pressable
                      onPress={() => duplicateLayer(layer.id)}
                      style={styles.layerActionBtn}
                      accessibilityLabel="Duplicate layer"
                      accessibilityRole="button"
                    >
                      <Ionicons name="copy-outline" size={16} color={Colors.textSecondary} />
                    </Pressable>
                    <Pressable
                      onPress={() => removeLayer(layer.id)}
                      style={styles.layerActionBtn}
                      accessibilityLabel="Delete layer"
                      accessibilityRole="button"
                    >
                      <Ionicons name="trash-outline" size={16} color={Colors.danger} />
                    </Pressable>
                  </View>
                </Pressable>
              );
            })
          )}
        </ScrollView>
      </View>
    </View>
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

function getLayerColor(type: CreatorLayer['type']): string {
  switch (type) {
    case 'media': return '#5ac8fa';
    case 'text': return '#ffcc00';
    case 'product': return '#ff9500';
    case 'mention': return '#ff2d55';
    case 'look': return '#5856d6';
    case 'vote': return '#34c759';
    case 'decorative': return '#4cd964';
    default: return Colors.brand;
  }
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 1000,
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    maxHeight: '70%',
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
    overflow: 'hidden',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    alignSelf: 'center',
    marginTop: Space.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
  },
  title: {
    fontFamily: Typography.family.semibold,
    fontSize: Type.title.size,
    color: Colors.textPrimary,
  },
  closeBtn: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: Radius.sm,
  },
  scrollBody: {
    paddingHorizontal: Space.md,
  },
  scrollContent: {
    paddingBottom: Space.lg,
    gap: Space.xs,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: Space.xl,
    gap: Space.xs,
  },
  emptyText: {
    fontFamily: Typography.family.semibold,
    fontSize: Type.body.size,
    color: Colors.textSecondary,
  },
  emptySubtext: {
    fontFamily: Typography.family.regular,
    fontSize: Type.caption.size,
    color: Colors.textMuted,
  },
  layerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: Space.sm,
    paddingHorizontal: Space.sm,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceAlt,
  },
  layerRowSelected: {
    backgroundColor: `${Colors.brand}15`,
    borderWidth: 1,
    borderColor: `${Colors.brand}40`,
  },
  layerIcon: {
    width: 32,
    height: 32,
    borderRadius: Radius.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  layerInfo: {
    flex: 1,
    gap: 2,
  },
  layerName: {
    fontFamily: Typography.family.medium,
    fontSize: Type.body.size,
    color: Colors.textPrimary,
  },
  layerType: {
    fontFamily: Typography.family.regular,
    fontSize: 10,
    color: Colors.textMuted,
    textTransform: 'capitalize',
  },
  layerActions: {
    flexDirection: 'row',
    gap: 2,
    flexWrap: 'wrap',
    maxWidth: 180,
  },
  layerActionBtn: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: Radius.sm,
  },
  layerIconHidden: {
    opacity: 0.4,
  },
  layerNameHidden: {
    textDecorationLine: 'line-through' as const,
    color: Colors.textMuted,
  },
});
