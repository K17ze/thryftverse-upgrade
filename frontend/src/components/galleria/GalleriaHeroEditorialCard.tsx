import React from 'react';
import { View, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { CachedImage } from '../CachedImage';
import { useGalleriaStyles } from '../../hooks/galleria';
import { useAppTranslation } from '../../i18n/useAppTranslation';
import type { GalleriaEditorial } from '../../services/galleriaApi';

// ---------------------------------------------------------------------------
// Hero editorial card — full-width, 16:10, title overlaid on image
// ---------------------------------------------------------------------------
export const GalleriaHeroEditorialCard = React.memo(function GalleriaHeroEditorialCard({
  editorial }: {
  editorial: GalleriaEditorial;
}) {
  const styles = useGalleriaStyles();
  const { t } = useAppTranslation('galleria');

  return (
    <View
      style={styles.heroContainer}
      accessibilityRole="image"
      accessibilityLabel={t('accessibility.editorial', { title: editorial.title })}
    >
      <CachedImage
        uri={editorial.heroImage}
        style={styles.heroImage}
        contentFit="cover"
        priority="high"
      />
      <LinearGradient
        colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.65)']}
        style={styles.heroGradient}
      />
      <View style={styles.heroOverlay} pointerEvents="none">
        <View style={styles.heroEyebrowRow}>
          <View style={styles.heroEyebrowDot} />
          <Text style={styles.heroEyebrow}>{t('editorial.eyebrow')}</Text>
        </View>
        <Text style={styles.heroTitle} numberOfLines={3}>
          {editorial.title}
        </Text>
        <Text style={styles.heroMeta} numberOfLines={1}>
          {editorial.author} · {editorial.readTime}
        </Text>
      </View>
    </View>
  );
});
