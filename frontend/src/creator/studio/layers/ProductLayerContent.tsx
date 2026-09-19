import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Space, Radius, Stroke, IconGrammar } from '../../../theme/designTokens';
import { TypographyV2 } from '../../../theme/typography.v2';
import { useAppTheme } from '../../../theme/ThemeContext';
import { useFormattedPrice } from '../../../hooks/useFormattedPrice';
import type { CreatorLayer } from '../../core/projectStore/composition';
import { createOverlayStyles } from './layerContentShared';

export function ProductLayerContent({ layer }: { layer: Extract<CreatorLayer, { type: 'product' }> }) {
  const { payload } = layer;
  const { colors } = useAppTheme();
  const { currencySymbol } = useFormattedPrice();
  const o = React.useMemo(() => createOverlayStyles(colors), [colors]);
  const isSold = payload.availability === 'sold';
  const isDeleted = payload.availability === 'deleted';
  const hasImage = !!payload.snapshotImageUrl;
  const hasHotspot = !!payload.hotspotLabel;

  if (hasImage) {
    return (
      <View
        style={productImageStyles.imageContainer}
        accessibilityLabel={`Listing layer, ${payload.snapshotTitle || 'Listing'}${payload.snapshotPriceGbp !== undefined ? `, ${currencySymbol}${payload.snapshotPriceGbp.toFixed(0)}` : ''}${isSold ? ', sold' : ''}`}
        accessibilityHint="Opens the linked listing when published"
        accessibilityRole="link"
      >
        <ExpoImage
          source={{ uri: payload.snapshotImageUrl! }}
          style={productImageStyles.thumbnail}
          contentFit="cover"
          cachePolicy="memory-disk"
          recyclingKey={payload.snapshotImageUrl!}
          enforceEarlyResizing
        />
        <View style={productImageStyles.imageOverlay}>
          <Text style={o.overlayLabel} numberOfLines={1}>
            {payload.snapshotTitle || 'Listing'}
          </Text>
          {payload.snapshotPriceGbp !== undefined && (
            <Text style={[o.overlayAccent, { fontSize: TypographyV2.meta.size }, isSold && { color: colors.dangerText }]}>
              {isSold ? 'SOLD' : `${currencySymbol}${payload.snapshotPriceGbp.toFixed(0)}`}
            </Text>
          )}
        </View>
        {isSold && (
          <View style={[productImageStyles.soldBadge, { backgroundColor: colors.danger }]}>
            <Text style={{ color: colors.scrimTextPrimary, fontFamily: TypographyV2.meta.fontFamily, fontSize: TypographyV2.meta.size }}>SOLD</Text>
          </View>
        )}
      </View>
    );
  }

  if (hasHotspot) {
    return (
      <View
        style={[o.overlayPill, { borderRadius: Radius.full, paddingHorizontal: Space.smMd, paddingVertical: 6, gap: 6 }]}
        accessibilityLabel={`Listing hotspot, ${payload.hotspotLabel}${payload.snapshotPriceGbp !== undefined ? `, ${currencySymbol}${payload.snapshotPriceGbp.toFixed(0)}` : ''}`}
        accessibilityHint="Opens the linked listing when published"
        accessibilityRole="link"
      >
        <View style={{ width: 7, height: 7, borderRadius: Radius.full, backgroundColor: colors.textPrimary, borderWidth: Stroke.standard, borderColor: colors.brand }} />
        <Text style={[o.overlayLabel, { flex: 1 }]} numberOfLines={1}>
          {payload.hotspotLabel}
        </Text>
        {payload.snapshotPriceGbp !== undefined && !isSold && (
          <Text style={[o.overlayAccent, { fontSize: TypographyV2.meta.size }]}>
            {currencySymbol}{payload.snapshotPriceGbp.toFixed(0)}
          </Text>
        )}
      </View>
    );
  }

  return (
    <View
      style={o.overlayPill}
      accessibilityLabel={`Listing layer, ${payload.snapshotTitle || 'Listing'}${payload.snapshotPriceGbp !== undefined ? `, ${currencySymbol}${payload.snapshotPriceGbp.toFixed(0)}` : ''}${isSold ? ', sold' : ''}${isDeleted ? ', unavailable' : ''}`}
      accessibilityHint="Opens the linked listing when published"
      accessibilityRole="link"
    >
      <View style={o.overlayRow}>
        <Ionicons name="bag-handle-outline" size={IconGrammar.badge} color={colors.textPrimary} aria-hidden={true} />
        <Text style={[o.overlayLabel, { fontFamily: TypographyV2.body.fontFamily }]} numberOfLines={1}>{payload.snapshotTitle || 'Listing'}</Text>
      </View>
      {payload.snapshotPriceGbp !== undefined && (
        <Text style={[o.overlayAccent, isSold && { color: colors.dangerText }, isDeleted && o.overlayMuted]}>
          {isSold ? 'SOLD' : isDeleted ? 'UNAVAILABLE' : `${currencySymbol}${payload.snapshotPriceGbp.toFixed(0)}`}
        </Text>
      )}
    </View>
  );
}

const productImageStyles = StyleSheet.create({
  imageContainer: {
    borderRadius: Radius.md,
    overflow: 'hidden',
    width: '100%',
    height: '100%',
  },
  thumbnail: {
    width: '100%',
    height: '100%',
    position: 'absolute',
  },
  imageOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: Space.xs,
    paddingVertical: Space.xs,
    gap: 1,
  },
  soldBadge: {
    position: 'absolute',
    top: Space.sm,
    right: Space.sm,
    borderRadius: Radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
});
