import React, { useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
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

export function CreatorLayersSheet({ visible, onClose }: CreatorLayersSheetProps) {
  const { document, activePageIndex, selectedLayerId, selectLayer, removeLayer, duplicateLayer, reorderLayer, toggleLayerLock, toggleLayerVisibility } = useCreator();
  const { colors } = useAppTheme();

  const page = document.pages[activePageIndex];
  const layers = getAllLayersSorted(page).reverse();

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  return (
    <SheetContainer visible={visible} onClose={handleClose} maxHeight={0.7}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Layers</Text>
        <PressScale onPress={handleClose} style={styles.closeBtn} accessibilityLabel="Close layers">
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
            return (
              <PressScale
                key={layer.id}
                onPress={() => selectLayer(layer.id)}
                style={[
                  styles.layerRow,
                  { backgroundColor: colors.surfaceAlt },
                  isSelected ? { backgroundColor: `${colors.brand}15`, borderWidth: 1, borderColor: `${colors.brand}40` } : {},
                ]}
                accessibilityLabel={`Layer ${getLayerDisplayName(layer)}${layer.locked ? ', locked' : ''}${layer.hidden ? ', hidden' : ''}${isSelected ? ', selected' : ''}`}
                accessibilityHint="Double tap to select layer"
              >
                <View style={[styles.layerIcon, { backgroundColor: `${getLayerColor(layer.type)}20` }, layer.hidden && styles.layerIconHidden]}>
                  <Ionicons name={LAYER_ICONS[layer.type] as any} size={18} color={layer.hidden ? colors.textMuted : getLayerColor(layer.type)} />
                </View>
                <View style={styles.layerInfo}>
                  <Text style={[styles.layerName, { color: colors.textPrimary }, layer.hidden && { textDecorationLine: 'line-through', color: colors.textMuted }]} numberOfLines={1}>{getLayerDisplayName(layer)}</Text>
                  <Text style={[styles.layerType, { color: colors.textMuted }]}>{layer.type}{layer.locked ? ' · locked' : ''}{layer.hidden ? ' · hidden' : ''}</Text>
                </View>
                <View style={styles.layerActions}>
                  <PressScale onPress={() => reorderLayer(layer.id, 'front')} style={styles.layerActionBtn} accessibilityLabel="Bring to front">
                    <Ionicons name="arrow-up-circle-outline" size={18} color={colors.textSecondary} />
                  </PressScale>
                  <PressScale onPress={() => reorderLayer(layer.id, 'forward')} style={styles.layerActionBtn} accessibilityLabel="Move forward">
                    <Ionicons name="chevron-up" size={18} color={colors.textSecondary} />
                  </PressScale>
                  <PressScale onPress={() => reorderLayer(layer.id, 'backward')} style={styles.layerActionBtn} accessibilityLabel="Move backward">
                    <Ionicons name="chevron-down" size={18} color={colors.textSecondary} />
                  </PressScale>
                  <PressScale onPress={() => reorderLayer(layer.id, 'back')} style={styles.layerActionBtn} accessibilityLabel="Send to back">
                    <Ionicons name="arrow-down-circle-outline" size={18} color={colors.textSecondary} />
                  </PressScale>
                  <PressScale onPress={() => toggleLayerLock(layer.id)} style={styles.layerActionBtn} accessibilityLabel={layer.locked ? 'Unlock layer' : 'Lock layer'}>
                    <Ionicons name={layer.locked ? 'lock-closed' : 'lock-open-outline'} size={18} color={layer.locked ? colors.warning : colors.textSecondary} />
                  </PressScale>
                  <PressScale onPress={() => toggleLayerVisibility(layer.id)} style={styles.layerActionBtn} accessibilityLabel={layer.hidden ? 'Show layer' : 'Hide layer'}>
                    <Ionicons name={layer.hidden ? 'eye-off-outline' : 'eye-outline'} size={18} color={colors.textSecondary} />
                  </PressScale>
                  <PressScale onPress={() => duplicateLayer(layer.id)} style={styles.layerActionBtn} accessibilityLabel="Duplicate layer">
                    <Ionicons name="copy-outline" size={18} color={colors.textSecondary} />
                  </PressScale>
                  <PressScale onPress={() => removeLayer(layer.id)} style={styles.layerActionBtn} accessibilityLabel="Delete layer">
                    <Ionicons name="trash-outline" size={18} color={colors.danger} />
                  </PressScale>
                </View>
              </PressScale>
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
    width: 44,
    height: 44,
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
    gap: Space.sm,
    paddingVertical: Space.sm,
    paddingHorizontal: Space.md,
    borderRadius: Radius.md,
  },
  layerIcon: {
    width: 36,
    height: 36,
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
    fontSize: Type.bodyEmphasis.size,
  },
  layerType: {
    fontFamily: Typography.family.regular,
    fontSize: 12,
    textTransform: 'capitalize',
  },
  layerActions: {
    flexDirection: 'row',
    gap: 2,
    flexWrap: 'wrap',
    maxWidth: 200,
  },
  layerActionBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: Radius.sm,
  },
  layerIconHidden: {
    opacity: 0.4,
  },
});
