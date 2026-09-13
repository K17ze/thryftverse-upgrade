import React from 'react';
import { View, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { AnimatedPressable } from '../AnimatedPressable';
import { CachedImage } from '../CachedImage';
import { useGalleriaStyles } from '../../hooks/galleria';
import { useAppTranslation } from '../../i18n/useAppTranslation';
import type { GalleriaCollection } from '../../services/galleriaApi';
import { COLLECTION_CARD_WIDTH } from './galleriaLayout';

// ---------------------------------------------------------------------------
// Collection rail card — 200pt wide, cover image + title + curator
// ---------------------------------------------------------------------------
export const GalleriaCollectionRailCard = React.memo(function GalleriaCollectionRailCard({
  collection,
  onPress }: {
  collection: GalleriaCollection;
  onPress: () => void;
}) {
  const styles = useGalleriaStyles();
  const { t } = useAppTranslation('galleria');

  return (
    <AnimatedPressable
      style={[styles.collectionCard, { width: COLLECTION_CARD_WIDTH }]}
      onPress={onPress}
      activeOpacity={0.92}
      scaleValue={0.98}
      accessibilityRole="button"
      accessibilityLabel={t('accessibility.collection', { title: collection.title })}
      accessibilityHint={t('accessibility.collectionHint')}
    >
      <View style={styles.collectionImageWrap}>
        <CachedImage
          uri={collection.coverImage}
          style={styles.collectionImage}
          contentFit="cover"
          priority="normal"
        />
        <LinearGradient
          colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.55)']}
          style={styles.collectionGradient}
        />
        <View style={styles.collectionOverlay} pointerEvents="none">
          <Text style={styles.collectionTheme}>{collection.theme}</Text>
          <Text style={styles.collectionTitle} numberOfLines={2}>
            {collection.title}
          </Text>
        </View>
      </View>
      <View style={styles.collectionMeta}>
        <CachedImage
          uri={collection.curatorAvatar}
          style={styles.collectionAvatar}
          contentFit="cover"
        />
        <Text style={styles.collectionCurator} numberOfLines={1}>
          {collection.curator}
        </Text>
      </View>
    </AnimatedPressable>
  );
});
