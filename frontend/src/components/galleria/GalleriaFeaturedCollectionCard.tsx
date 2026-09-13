import React from 'react';
import { View, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { AnimatedPressable } from '../AnimatedPressable';
import { CachedImage } from '../CachedImage';
import { useGalleriaStyles } from '../../hooks/galleria';
import { useAppTranslation } from '../../i18n/useAppTranslation';
import type { GalleriaCollection } from '../../services/galleriaApi';

// ---------------------------------------------------------------------------
// Featured collection card — full-width, large art-directed media object
// ---------------------------------------------------------------------------
export const GalleriaFeaturedCollectionCard = React.memo(function GalleriaFeaturedCollectionCard({
  collection,
  onPress }: {
  collection: GalleriaCollection;
  onPress: () => void;
}) {
  const styles = useGalleriaStyles();
  const { t } = useAppTranslation('galleria');

  return (
    <AnimatedPressable
      style={styles.featuredCollectionContainer}
      onPress={onPress}
      activeOpacity={0.94}
      scaleValue={0.99}
      accessibilityRole="button"
      accessibilityLabel={t('accessibility.featuredCollection', { title: collection.title })}
      accessibilityHint={t('accessibility.collectionHint')}
    >
      <CachedImage
        uri={collection.coverImage}
        style={styles.featuredCollectionImage}
        contentFit="cover"
        priority="high"
      />
      <LinearGradient
        colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.75)']}
        style={styles.featuredCollectionGradient}
      />
      <View style={styles.featuredCollectionOverlay} pointerEvents="none">
        <Text style={styles.featuredCollectionTheme}>{collection.theme}</Text>
        <Text style={styles.featuredCollectionTitle} numberOfLines={3}>
          {collection.title}
        </Text>
        <View style={styles.featuredCollectionCuratorRow}>
          <CachedImage
            uri={collection.curatorAvatar}
            style={styles.featuredCollectionAvatar}
            contentFit="cover"
          />
          <Text style={styles.featuredCollectionCurator} numberOfLines={1}>
            {t('collections.curatedBy', { curator: collection.curator })}
          </Text>
        </View>
      </View>
    </AnimatedPressable>
  );
});
