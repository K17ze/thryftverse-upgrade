import React from 'react';
import { View, Text, useWindowDimensions } from 'react-native';

import { AnimatedPressable } from '../AnimatedPressable';
import { CachedImage } from '../CachedImage';
import { useGalleriaStyles } from '../../hooks/galleria';
import { useFormattedPrice } from '../../hooks/useFormattedPrice';
import { useAppTranslation } from '../../i18n/useAppTranslation';
import type { GalleriaFeaturedAsset } from '../../services/galleriaApi';
import { getMasonryColumnWidth } from './galleriaLayout';

// ---------------------------------------------------------------------------
// Featured asset card — masonry tile with image, title, valuation, collection
// ---------------------------------------------------------------------------
export const GalleriaFeaturedAssetCard = React.memo(function GalleriaFeaturedAssetCard({
  asset,
  onPress,
  testID }: {
  asset: GalleriaFeaturedAsset;
  onPress: () => void;
  testID?: string;
}) {
  const styles = useGalleriaStyles();
  const { t } = useAppTranslation('galleria');
  const { formatFromFiat } = useFormattedPrice();
  const { width: SCREEN_W } = useWindowDimensions();
  const MASONRY_COL_WIDTH = getMasonryColumnWidth(SCREEN_W);
  const imageHeight = Math.round(MASONRY_COL_WIDTH * asset.aspectRatio);

  return (
    <AnimatedPressable
      style={styles.assetCard}
      onPress={onPress}
      activeOpacity={0.92}
      scaleValue={0.98}
      accessibilityRole="button"
      accessibilityLabel={t('accessibility.asset', { title: asset.title, value: formatFromFiat(asset.valuation) })}
      accessibilityHint={t('accessibility.assetHint')}
      testID={testID}
    >
      <View style={[styles.assetImageWrap, { height: imageHeight }]}>
        <CachedImage
          uri={asset.image}
          style={styles.assetImage}
          contentFit="cover"
          priority="normal"
        />
      </View>
      <View style={styles.assetMeta}>
        <Text style={styles.assetCollection} numberOfLines={1}>
          {asset.collection}
        </Text>
        <Text style={styles.assetTitle} numberOfLines={2}>
          {asset.title}
        </Text>
        <Text style={styles.assetValuation} numberOfLines={1}>
          {formatFromFiat(asset.valuation)}
        </Text>
      </View>
    </AnimatedPressable>
  );
});
